# LLM-TRACE Implementation Summary

## Goal

Emit structured log entries (`LLM-TRACE-good`, `LLM-TRACE-bad`) from opencode that capture
OpenAI Codex rate-limit headers (`x-codex-*`, `x-rate-limit-*`) from every LLM API call.
These entries feed `grep-ratelimits.js` for real-time shard-level rate-limit monitoring.

## What upstream has

**Nothing.** Upstream `dev` has zero LLM-TRACE logging. The files are also structured
completely differently:

- **`llm.ts`** upstream: plain `async function stream()` returning `StreamTextResult` (283 lines, no Effect)
- **`llm.ts`** our branch: `Effect.Service` wrapping `streamText`, returns an Effect `Stream` (484 lines)
- **`processor.ts`** upstream: `namespace SessionProcessor` with plain async functions (410 lines)
- **`processor.ts`** our branch: Effect services with `Effect.fn`, `Effect.gen` (640 lines)

The Effect rewrite is from upstream (not our change), but it means our patches apply to a
fundamentally different codebase than what `dev` currently shows. Rebase conflicts are severe
and recurrent — the primary motivation for isolating our additions.

## What grep-ratelimits.js expects

Log lines matching this pattern:

```
INFO 2026-04-30T22:40:25 +9ms service=session.processor LLM-TRACE-good provider=openai model=gpt-4.1 hasHeaders=true x-codex-primary-remaining=50 x-codex-primary-reset-at=1746048000 ...
INFO 2026-04-30T22:40:33 +508ms service=session.processor LLM-TRACE-bad provider=openai model=gpt-4.1 status=429 hasHeaders=true x-codex-primary-remaining=0 x-codex-primary-reset-at=1746048000 message=Rate limit exceeded ...
```

The `pairs()` parser extracts `key=value` and `key={json}` pairs from the rest of the line
after `service=session.processor`. The fields that matter for rate-limit tracking:

- `provider` — provider identifier (e.g. `openai`)
- `model` — model identifier
- `status` — HTTP status code (200 for good, 4xx/5xx for bad)
- `hasHeaders` — whether response headers were present
- `x-codex-primary-*`, `x-codex-secondary-*` — Codex rate limit headers
- `x-rate-limit-*` — standard rate limit headers
- `message` — error message (bad only, truncated to 200 chars)
- `responseHeaders` — full headers when `LOG_HEADERS=true|response`

## Required changes (3 touch points)

### 1. New file: `src/session/llm-trace.ts`

Isolated helper with two exports. This file should survive rebases unchanged since it
has no upstream equivalent and no Effect dependencies.

```ts
// Self-export pattern per AGENTS.md
import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session.processor" })
const RATE_LIMIT_RE = /^(x-)?(rate-?limit|codex)/
const LOG_HEADERS = (process.env.LOG_HEADERS as ...) ?? false

function extractRateLimits(headers) {
  // Filter headers matching RATE_LIMIT_RE
  // Optionally capture all headers when LOG_HEADERS is true|"response"
}

export function traceGood(headers, provider, model) {
  log.info("LLM-TRACE-good", { provider, model, status: 200, hasHeaders, ...rateLimitInfo, ...optionalResponseHeaders })
}

export function traceBad(errorHeaders, provider, model, status, message) {
  log.info("LLM-TRACE-bad", { provider, model, status, hasHeaders, message, ...rateLimitInfo, ...optionalResponseHeaders })
}

export * as LlmTrace from "./llm-trace"
```

Key design: uses `service: "session.processor"` logger (same as processor.ts) so all
LLM-TRACE entries come from a consistent service name that grep-ratelimits can find.

### 2. Touch point in `src/session/llm.ts`: emit LLM-TRACE-good

After the stream completes, call `LlmTrace.traceGood()` with the response headers.

**Where**: Inside the `stream` function, after `streamText()` returns. The response
promise must be awaited after stream drain.

**Current approach** (in our branch's Effect-based `llm.ts`):
```ts
// At the end of the stream function, inside Stream.ensuring:
Stream.ensuring(eventStream, Effect.sync(() => {
  Promise.resolve(result.response).then((r) => {
    LlmTrace.traceGood(r.headers, input.model.providerID, input.model.id)
  }).catch(() => {})
}))
```

This uses a detached Promise — `Effect.sync` runs synchronously, the `.then()` is fire-and-forget.
Works in practice because the response Promise resolves quickly after stream drain, but
it's not tracked by the Effect runtime.

**For upstream (plain async)**: much simpler — just read `result.response.headers` after
stream completion or in a `.then()` callback. No Effect complications.

**Rebase surface**: small. One import line + one `Stream.ensuring` block (3-4 lines)
added to the `stream` function. The surrounding code changes drastically between
upstream versions, but the addition is localized.

### 3. Touch point in `src/session/processor.ts`: emit LLM-TRACE-bad

When a stream errors and retries exhaust, `halt()` fires. Inside `halt()`, call
`LlmTrace.traceBad()` with the error's response headers.

**The `traceError` helper** inside processor's `create()` function:
```ts
const traceError = (e: unknown) => {
  const parsed = MessageV2.fromError(e, { providerID: input.model.providerID, aborted })
  const errorOutput = MessageV2.APIError.isInstance(parsed)
    ? { message: parsed.data.message, statusCode: parsed.data.statusCode, responseHeaders: parsed.data.responseHeaders }
    : { message: "name" in parsed ? parsed.name : "Unknown error" }
  LlmTrace.traceBad(errorOutput.responseHeaders, input.model.providerID, input.model.id, errorOutput.statusCode, errorOutput.message)
}
```

This calls `fromError()` to get typed error data, then passes headers/status/message
to `traceBad`. Called from `halt()` which is the final error handler after retry exhaustion.

**Rebase surface**: medium. The `halt` function exists in both upstream and our branch
but its structure differs. The `traceError` helper is ~10 lines that can be pasted in
as a block. The call site is a single line inside `halt()`.

### 4. Touch point in `src/session/message-v2.ts`: handle AI_RetryError

**Critical fix.** When AI SDK exhausts its internal retries, it throws `AI_RetryError`
wrapping an array of `AI_APICallError`s. The existing `fromError()` function has no case
for `RetryError`, so it falls through to `case e instanceof Error` → `NamedError.Unknown`
with no `statusCode`, no `responseHeaders`.

**The fix**: add a `RetryError.isInstance(e)` case before `APICallError.isInstance(e)`:

```ts
case RetryError.isInstance(e):
  const lastError = e.errors?.[e.errors.length - 1]
  if (APICallError.isInstance(lastError)) {
    const parsed = ProviderError.parseAPICallError({
      providerID: ctx.providerID,
      error: lastError,
    })
    if (parsed.type === "context_overflow") {
      return new ContextOverflowError({ message: parsed.message, responseBody: parsed.responseBody }, { cause: e }).toObject()
    }
    return new APIError({
      message: parsed.message,
      statusCode: parsed.statusCode,
      isRetryable: false,  // retries already exhausted
      responseHeaders: parsed.responseHeaders,
      responseBody: parsed.responseBody,
      metadata: parsed.metadata,
    }, { cause: e }).toObject()
  }
  return new APIError({ message: e.message ?? "Retry exhausted", isRetryable: false }, { cause: e }).toObject()
```

This extracts the last `APICallError` from the retry chain (the one with the most recent
response headers) and surfaces it as a proper `APIError` with `responseHeaders`.

**Side effects**: `RetryError` now produces `APIError` instead of `NamedError.Unknown`.
`SessionRetry.retryable()` returns `undefined` for both (not retryable), so retry behavior
is unchanged. The `halt()` handler now sees `APIError` with real headers instead of
`Unknown` with nothing — strictly more informative.

**Rebase surface**: low. `fromError()` is a `switch(true)` chain; adding a case is
insertion of ~25 lines before the existing `APICallError` case. One import addition
(`RetryError` from `"ai"`).

## Implementation order for clean start

1. Create `llm-trace.ts` — zero dependencies on other changes, survives rebases
2. Add `RetryError` case to `message-v2.ts` `fromError()` — bugfix independent of logging
3. Add `traceGood` call to `llm.ts` — one import + 3-line `Stream.ensuring` block
4. Add `traceError` helper + call in `processor.ts` — one import + ~10-line helper + 1-line call in `halt()`

## Environment variable: LOG_HEADERS

- `LOG_HEADERS=true` — include full request AND response headers in trace entries
- `LOG_HEADERS="request"` — include full request headers in `LLM-TRACE-request` entries
- `LOG_HEADERS="response"` — include full response headers in trace entries
- `LOG_HEADERS` unset/false — only include rate-limit filtered headers

## grep-ratelimits.js contract

Separate from the opencode changes. 481-line standalone CLI that:
- Scans opencode log files for LLM-TRACE entries
- Supports `--proc` flag to read via `/proc/PID/fd` for running processes
- Groups results by provider prefix and shard key (reset-at epoch)
- `recent()` mode shows latest rate-limit state per shard
- `dump` mode shows all entries chronologically

Can be copied as-is. The only contract is that LLM-TRACE log lines exist with the
field names described above.

## What we learned the hard way

- **traceGood works.** Successful calls emit `LLM-TRACE-good` with headers in recent sessions.
  The detached Promise approach is fine in practice — the response resolves quickly after drain.

- **traceBad was broken for `AI_RetryError`.** This is the real bug. Without the `fromError`
  fix, `traceBad` gets called but with `undefined` headers/status because the error was
  classified as `Unknown`. The RetryError fix is the essential change.

- **Isolating to `llm-trace.ts` matters.** Both `llm.ts` and `processor.ts` get heavily
  rewritten as upstream refactors between plain async and Effect. A standalone helper
  with no Effect imports can be re-wired after each rebase with just import+call changes.

- **The `service: "session.processor"` logger is correct.** Both traceGood and traceBad
  use this service name so grep-ratelimits finds them consistently. The llm.ts `stream`
  function uses `service: "llm"` for its own logs (`stream`, `stream error`) which are
  separate from the LLM-TRACE entries.
