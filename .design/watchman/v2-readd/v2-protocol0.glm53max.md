---
type: Research
title: Watchman v2 re-add protocol journal (round 0, W3-W5 focus)
description: W3-W5 implementation research — fb-watchman-esm transport API verified from source, typed schema boundary, deterministic scripted actor design, exact-root command transcript, callback/unilateral-PDU semantics, timeout/cancellation/late-callback fencing, and the minimal Effect-v4 generation state machine compatible with the current v2 Native contract; donor adapt/reject classification with file:line references and proposed module APIs.
resource: /.design/watchman/v2-readd/v2-protocol0.glm53max.md
tags: [opencode, watchman, v2, protocol, transport, effect, w3, w4, w5, research-journal]
status: stable
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - id: work-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan (v2-readd3)
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: donor-workspace
    resource: file:///home/rektide/src/opencode-watchman-old
    title: Donor implementation (working copy parent 1b95fb3b, bookmark watchman-20260905)
  - id: transport-source
    resource: https://unpkg.com/@superbfowle/fb-watchman-esm@3.0.0/index.js
    title: "@superbfowle/fb-watchman-esm@3.0.0 full source (fetched 2026-09-05)"
  - id: effect-smol
    resource: file:///home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol
    title: Effect v4 rc.112 reference checkout (Effect.callback internals)
  - id: round0-journal
    resource: /.design/watchman/v2-readd/v2-research0.glm53max.md
    title: Round-0 architecture journal (R1-R7 corrections) — lives in the rebuild workspace
    author: model:zai/glm-5.3-max
    last_modified: 2026-09-05
---

# Watchman v2 re-add protocol journal — round 0 (W3-W5)

Focused research/discovery journal for the protocol slice of the
[`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) work plan:
W3 (deterministic protocol actor), W4 (exact-root backend), W5 (delivery
generation supervisor). Everything else (W6-W10, README, production code,
commits) is out of scope here.

> **Location note (2026-09-05 coordination update):** agent journals live in
> the OLD repo. This journal was authored directly here; nothing was ever
> written to the rebuild workspace's `.test-agent/` by this agent. Later
> findings append dated addenda at the bottom; nothing above is rewritten.

Worktree state observed while researching (rebuild workspace
`opencode-watchman-v2-readd`): W0 recorded, W1 committed
(`ornkqwlk` "make watcher readiness generation-aware"), `@` empty. W2+ not
started. So W4/W5 below build against the **post-W1** Native contract, which
already carries `invalidate?()` and `NativeSignal` — verified at
[`watcher.ts:46-62`](/packages/core/src/filesystem/watcher.ts) in the rebuild
workspace.

## 1. Transport API — `@superbfowle/fb-watchman-esm@3.0.0`, verified from source

Pinned in donor [`packages/core/package.json:130`](/packages/core/package.json)
as `3.0.0` with transitive `@superbfowle/bser-esm@^3.0.0` (donor
`bun.lock:2949`, integrity `sha512-s7jS…`). Full `index.js` (single-file ESM,
`engines.node >= 20.19`) fetched from unpkg and read in full. The local bun
cache holds only the CJS ancestor `fb-watchman@2.0.2` — the ESM fork is
*not* locally cached, so W4's `pnpm/bun add` pulls from the registry exactly
as the donor lockfile records. Behavior facts that W3/W4/W5 depend on:

### 1.1 Construction and connection lifecycle

- `new Client({ watchmanBinaryPath?: string })` **does not connect**. It only
  stores the binary path (default `"watchman"`, trimmed) and an empty command
  queue. Connection is established lazily by the first `command()` call.
  Consequence: the donor's `loadFactory` validation (construct + duck-type
  check, donor [`client.ts:38-55`](/packages/core/src/filesystem/watcher/watchman/client.ts))
  can never observe a connection failure — construction is offline and
  infallible apart from throwing on a bad options object. "Client
  construction" as a W3 actor control is about *factory bookkeeping*, not
  connectivity.
- Socket discovery: `process.env.WATCHMAN_SOCK` short-circuits discovery;
  otherwise the client spawns `<binary> --no-pretty get-sockname` and parses
  `sockname` from stdout (spawning also *starts* the daemon if absent).
- `client.end()` cancels all queued+current commands with
  `Error("The watchman client was ended")`, half-closes the socket, and nulls
  `bunser`. Our own `end()` does **not** emit `end` by itself; the `end`
  event fires when the remote sends FIN.

### 1.2 Command admission — strictly serialized, FIFO, one socket

- `command(args, done)` pushes `{cmd, cb}` and connects if needed. Dispatch
  is `sendNextCommand()`: exactly one `currentCommand` in flight; the next
  queued command is sent only after the previous response's `value` event is
  processed. Commands are **never concurrent** on one client.
- Consequence for the controller: per-command timeouts guard each PDU-sized
  round trip; there is no transport-level pipelining to exploit or fear. The
  donor's per-generation `Semaphore.makeUnsafe(1)`
  ([`client.ts:61`](/packages/core/src/filesystem/watcher/watchman/client.ts))
  mirrors this serialization at the Effect level so permit order is explicit
  and testable — keep it.
- If `socket` is null when `sendNextCommand` runs (socket dropped between
  queueing and send), the client emits `error` with
  `"socket is null attempting to send command"` — the queued callback does
  *not* fire.

### 1.3 Response and unilateral dispatch

- Decoded BSER values are dispatched by tag sniff: any object containing key
  `subscription` or `log` is **unilateral** (`unilateralTags`) and emitted as
  an event; everything else resolves `currentCommand` (error key present →
  `WatchmanError` with `.watchmanResponse` attached; else success).
- **Unilateral PDUs bypass the command queue entirely**: a `subscription` PDU
  can be delivered while a command is pending, before a command's response,
  or with no command in flight. In particular, `subscribe` initial results
  may arrive as PDUs *around* the ack — the controller cannot assume
  response-then-PDU ordering. (Matches Watchman docs: subscribe is
  connection-scoped and may send initial results unilaterally.)
- Socket `end` (remote close): `cancelCommands("The watchman connection was
  closed")` — all queued + current callbacks receive that Error — then
  `emit('end')`.

### 1.4 Failure modes that never reach the callback

Two paths leave a submitted command's callback **permanently hanging**:

1. **Daemon discovery failure.** Spawn `ENOENT`/`EACCES` or nonzero
   `get-sockname` exit emits `error` (with a friendly rewritten message) and
   returns; queued command callbacks are *not* invoked and `cancelCommands`
   is *not* called. Only the `error` listener or a command timeout rescues
   the caller.
2. **Socket `error` before response.** Emits `error`; the in-flight
   `currentCommand` is not explicitly canceled (it dies later with socket
   `end`'s cancelCommands, or hangs if `end` never follows).

This is *the* reason the donor races every command against the generation
`closed` Deferred (see §5) and why W5's loss-trigger list must include the
`error`/`end` events as first-class, not rely on callback errors.

### 1.5 `capabilityCheck`

`capabilityCheck({optional, required}, done)` issues
`["version", {optional, required}]` through the normal command queue and
post-processes: response lacking `capabilities` (very old servers) gets
synthesized capability booleans from `version`; a missing *required*
capability fails `done` with `WatchmanError` carrying `.watchmanResponse`.
So a capability rejection arrives as a command error, not an `error` event —
it is root-local, not connection loss. Wire-visible shape is exactly the
`version` command; the actor should reproduce that (§6).

## 2. Typed schema boundary (W4)

Donor [`schema.ts`](/packages/core/src/filesystem/watcher/watchman/schema.ts)
is already the right shape: small `Schema.Struct`s per command response, one
union for PDUs, `WatchmanError` with a `stage` union used for disposition,
`GenerationClosed` carrying `submitted`. Recommended carry with deltas:

| Member | Donor lines | Verdict | Delta for the carrier |
| --- | --- | --- | --- |
| `CapabilityResponse` | 8-11 | keep | unchanged |
| `WatchResponse` | 13-16 | keep | **add** `relative_path: Schema.optional(Schema.String)` — the daemon sets it when the exact root was coalesced into an existing ancestor watch; recording it makes R1's ancestor case observable in tests instead of silent |
| `ClockResponse` | 18-21 | keep | unchanged |
| `SubscribeResponse` | 23-26 | keep | unchanged |
| `UnsubscribeResponse` | 28-32 | keep | unchanged |
| `SubscriptionChanges` | 34-48 | keep | unchanged (fields `name/exists/new/type` are what we request) |
| `SubscriptionCanceled` | 50-55 | keep | required by R2 (canceled PDU = reported loss) |
| `SubscriptionPdu` union | 57-58 | keep | unchanged |
| `WatchmanError` | 60-70 | keep stages | stages stay `connect\|command\|decode\|route\|subscribe\|reconnect`; they classify loss vs root-local vs fatal for W5/W6 without inventing structured codes |
| `GenerationClosed` | 72-76 | keep | `submitted` flag stays — it distinguishes "lost while waiting for admission" (permit not consumed) from "lost after submit" |

Optional-but-cheap addition: the transport's `WatchmanError` carries
`.watchmanResponse`; when rewrapping error messages in `admitted()`, preserve
the original error as `cause` (donor already does via `new WatchmanError(stage,
error.message, error)`) — enough for W9 live diagnosis, no structured-code
policy (plan W5 explicitly defers that).

**Decode = fatal policy survives:** donor `acquireRoot` treats
`error.stage === "decode"` as connection-fatal
([`root.ts:306-310`](/packages/core/src/filesystem/watcher/watchman/root.ts)).
The plan softens this ("remote/protocol errors retry under bounded backoff
rather than selecting permanent policy from prose"). Since v2's Native has no
error channel (§7), a permanently failing decode would silently spin retry.
Recommendation: retry decode failures like everything else, but log at
`error` level with the ParseError tree — the bounded backoff caps the spin
rate and live evidence (W9) will surface it. No synthetic terminal policy.

## 3. Exact-root command transcript (W4)

The single happy-path transcript one exact recursive target must produce
(full payloads, in order, per generation):

```text
① capabilityCheck
   → wire: ["version", { optional: [], required: <expression caps actually used> }]
   ← { version: "<daemon>", capabilities: { ... } }

② ["watch", "<canonicalTarget>"]                        # NEVER watch-project
   ← { watch: "<reportedRoot>", relative_path?: "<rel>" }  # may be an ANCESTOR (R1)

③ ["clock", "<reportedRoot>"]
   ← { clock: "c:<ticks>:<counter>" }                   # fresh, every attach

④ ["subscribe", "<reportedRoot>", "opencode-<generation>-<n>", {
     since: "<clock from ③>",
     expression: <built from ignore>,                   # no relative_root, ever
     fields: ["name", "exists", "new", "type"],
   }]
   ← { subscribe: "opencode-<generation>-<n>" }
   ⟸ unilateral PDUs may interleave here (§1.3): map, never assume ack-first

⑤ release: remove local route FIRST, then best-effort
   ["unsubscribe", "<reportedRoot>", "opencode-<generation>-<n>"]
   ← { unsubscribe: "<name>", deleted: <bool> }          # ignored result
```

Rules pinned by plan + corpus:

- **No `watch-project`** — watchwoman's marker climb selected and crawled
  `$HOME` (~12 min, 29 GB tree; `watchwoman0` incident, lines 203-232). The
  daemon is never asked to discover a root; plain `watch` on the canonical
  target only.
- **No `relative_root`** in subscribe options and no `relative_root` in the
  capability requirement — placement/project-root routing is deleted with
  `route.ts`. The donor's `subscription()` relative-root computation
  ([`route.ts:26-40`](/packages/core/src/filesystem/watcher/watchman/route.ts))
  is rejected wholesale.
- **No `watch-del`** — daemon root retention is daemon policy.
- **Fresh clock every attach** (③) — W5: replacement generations never send
  an old cursor; the donor's `compatible`/`item.clock` reuse
  ([`root.ts:206-217`](/packages/core/src/filesystem/watcher/watchman/root.ts))
  and its resubscribe-since-cursor test
  ([`watchman-root.test.ts:614-652`](/packages/core/test/filesystem/watchman-root.test.ts))
  are the anti-pattern. The replacement transcript is *identical* to
  ①-④ (this is the "initial and replacement attachment call the same
  function" invariant — `review-simplification0` lines 98-136).
- Capability list is derived from the expression actually built: literal
  `name`/`dirname`/`not`/`anyof` terms need nothing; glob (`wildmatch`) terms
  — if W7 adds them — become `required: ["wildmatch"]`. An empty required
  list is valid and still produces the `version` round trip (daemon identity
  for logs, W9 evidence).
- Subscription naming stays connection-scoped and generation-stamped
  (donor `opencode-${generation.id}-${item.id}`,
  [`root.ts:218`](/packages/core/src/filesystem/watcher/watchman/root.ts))
  so a replacement can never collide with a zombie daemon-side subscription
  from the dead generation.
- Event-namespace root = `response.watch` (②), **not** the requested target:
  PDU `name` fields resolve against it, then map back beneath the logical
  target and drop non-contained paths (R1 containment filter). Without this,
  an ancestor-coalesced watch spams owner reloads from unrelated subtrees.
- Cookie exclusion (`.watchman-cookie-*` basename) is W7 scope; W4's
  client-side filter should already have the seam (a predicate function)
  even if the cookie rule lands later.

## 4. Callback and unilateral-PDU behavior the controller must implement

Consolidated from transport source + donor
[`root.ts:159-197`](/packages/core/src/filesystem/watcher/watchman/root.ts):

1. **Register listeners before any command** — donor `create()` registers
   `subscription`, `log`, `connect`, `error`, `end` synchronously right after
   the factory returns (lines 170-180). `connect` on an already-closed
   generation immediately `end()`s the client (line 176-178): a replacement
   race where a zombie socket connects after close must kill itself.
2. **`subscription` PDUs** route by `subscription` name through the
   generation's `subscriptions: Map<string, handler>` (line 170-174). A PDU
   for an unknown name is dropped silently — mandatory fencing: PDUs from a
   dead generation whose route was removed can never reach the queue.
3. **`error` and `end` both map to one `close(generation)`** (lines 179-180 →
   134-152): idempotent via `Deferred.isDoneUnsafe` guard, ends the client,
   clears the subscription map, unlinks from `state.active`. Socket
   `error`+`end` frequently arrive as a pair — coalescing is required, not
   optional (W5 test: "Socket error and end coalesce into one
   close/replacement").
4. **Command callback errors are not automatically loss**: a `watch`
   rejection (`root dir is not watchable`, etc.) or capability rejection
   arrives as a callback error with `stage` context. The donor's
   `recoverable()` classifier
   ([`root.ts:292-297`](/packages/core/src/filesystem/watcher/watchman/root.ts))
   — `GenerationClosed` always, `connect`/`command`/`reconnect` always,
   `subscribe` only when the generation actually closed — is the right
   transport-level split and carries over; W6 then separates root-local
   (`watch` rejection) from shared-circuit (`connect`) at the acquisition
   layer.
5. **`cancelCommands` errors**: on remote `end`, in-flight commands fail with
   `Error("The watchman connection was closed")` *before/without* the
   generation `closed` Deferred necessarily being observed — the race in
   `admitted()` means either the callback error or `GenerationClosed` wins;
   both classify as loss (rule 4). Tests must accept either failure value
   (assert on effect, not on which of the two raced).
6. **Ordering guarantee available to the controller**: the socket is one
   ordered BSER stream. PDUs and responses interleave arbitrarily *relative
   to commands*, but the controller's own publish path (generation queue →
   publish) can be strictly ordered. W5's "PDUs cannot precede invalidation
   on recovery" is therefore implementable by withholding queue drain until
   the post-ack `invalidate()` has been issued (§7, step 7).

## 5. Timeout, cancellation, late-callback fencing (W5)

### 5.1 The donor's `admitted()` — what to keep and why it is correct

Donor [`client.ts:102-149`](/packages/core/src/filesystem/watcher/watchman/client.ts)
is the load-bearing piece; walk-through with the invariants each piece buys:

```ts
// pre-check: refuse admission into an already-closed generation
if (Deferred.isDoneUnsafe(generation.closed)) return fail(new GenerationClosed(false))   // L115

const response = Effect.callback<unknown, WatchmanError>((resume) => {
  submit((error, value) => { ...; resume(...) })                                          // L116-126
}).pipe(
  Effect.timeoutOrElse({ duration: options.timeout ?? COMMAND_TIMEOUT,
    orElse: () => close(generation, label) *> fail(WatchmanError timeout) }),              // L127-133
  decode-against-schema,                                                                  // L134-138
)
Effect.raceFirst(response, closed(true))                                                  // L140
```

- **Permit-wait does not consume the deadline**: the timeout lives *inside*
  `execute`, which runs *inside* `generation.command.withPermit(...)`
  (L148). W5's "permit waiting does not consume the response deadline" is
  already satisfied by this nesting — keep the nesting, pin it with a test.
- **Submitted commands are uninterruptible**
  (L142-147: `Effect.uninterruptible(fork(startImmediately) *> join)`): a
  caller interrupted mid-command holds admission until response/timeout so
  the transport's FIFO order is never observed to skip. Pinned by donor test
  [`watchman-root.test.ts:707-740`](/packages/core/test/filesystem/watchman-root.test.ts)
  — re-author deterministically (§6.4). Cost: release waits at most one
  command timeout — acceptable and explicit.
- **Timeout closes the generation once** (idempotent `close` via the
  Deferred guard) *and* fails — so a hung daemon (§1.4) both surfaces and
  triggers recovery through one path.
- **Late-callback fencing is real, verified**: `Effect.callback`'s `resume`
  is guarded by a `resumed` flag — effect-smol
  `packages/effect/src/internal/effect.ts:1063-1071`
  (`if (resumed) return; resumed = true`), and interruption marks `resumed`
  via `fiber._yielded` / the async finalizer (`:1074-1085`). Once
  `raceFirst(response, closed(true))` settles for `closed`, the response
  fiber is interrupted and any later raw-client callback invoking `resume` is
  a silent no-op. **A late response cannot resurrect a closed generation's
  command.** The W3 actor's "late response after generation close" control
  exercises exactly this plus the generation's `subscriptions.clear()`
  (PDUs) — dual fencing: callbacks by interruption, PDUs by route removal.
- **`closed(false)` outside the permit** (L148): a generation that closes
  while the caller still waits for the permit fails fast without consuming a
  permit or a deadline.

### 5.2 Deltas for the carrier

- Drop `metrics?.*` calls (L110-131 sprinkles) — module deleted.
- `capabilities()` (L85-100) hardcodes `required: ["relative_root"]` —
  parameterize: `capabilities(generation, required: readonly string[], options)`
  with the caller passing the expression-derived list (§3).
- `COMMAND_TIMEOUT = 60_000` (L9) becomes the `commandTimeoutMs` option with
  60000 default per the W8 options table; the constant's comment (loaded
  host / cold crawl rationale) is worth carrying into the option's doc.
- Keep `Generation` exactly: `{ id, client, command semaphore, closed
  Deferred, subscriptions Map }` minus `metrics?`.

## 6. W3 — deterministic scripted actor

### 6.1 Placement and shape

One file, `packages/core/test/filesystem/fixture/watchman/client.ts`,
producing `RawClient`-shaped fakes (same duck type the production
`isRawClient` guards — donor [`client.ts:151-160`](/packages/core/src/filesystem/watcher/watchman/client.ts)).
No production module is imported except the `RawClient`/`RawClientFactory`
*types* (type-only import keeps W3 commit production-free per its
acceptance).

```ts
export type ScriptedCommand = {
  readonly index: number
  readonly args: readonly unknown[]
  readonly respond: (response: unknown) => Effect.Effect<void>
  readonly fail: (error: Error) => Effect.Effect<void>
  readonly hold: () => void  // explicit: never resolve (timeout tests)
}

export type ScriptedClient = {
  // RawClient surface (duck-typed)
  readonly end: () => void
  readonly command: (args: readonly unknown[], cb: (e: Error | null, r?: unknown) => void) => void
  readonly capabilityCheck: (caps: { required: readonly string[] }, cb: ...) => void
  readonly on: (event: string, listener: (v?: unknown) => void) => unknown
  // named controls
  readonly awaitCommand: (index?: number) => Effect.Effect<ScriptedCommand>   // Deferred barrier
  readonly listeners: (event: string) => number                              // registration assert
  readonly emitSubscription: (pdu: unknown) => void                          // unilateral
  readonly emitError: (error?: Error) => void
  readonly emitEnd: () => void
  readonly emitConnect: () => void
  readonly ended: () => number
  readonly transcript: () => readonly (readonly unknown[])[]                 // full args, ordered
  readonly expectTranscript: (expected: readonly (readonly unknown[])[]) => void // fail w/ diff
}

export type ScriptedHarness = {
  readonly factory: RawClientFactory
  readonly clients: () => readonly ScriptedClient[]   // one per construction
  readonly constructions: () => number
}

export const makeHarness = (options?: {
  /** When set, an arriving command that mismatches expected[index] fails the test immediately. */
  readonly script?: readonly (readonly unknown[])[]
  /** Factory behavior: throw (daemon unavailable) instead of returning a client. */
  readonly failConstructions?: (index: number) => Error | undefined
}): Effect.Effect<ScriptedHarness>
```

Design rules (the plan's W3 acceptance, made concrete):

1. **Stop before/after each command**: every `command()`/`capabilityCheck()`
   call records the args and completes `arrivals[index]` (a `Deferred`).
   `awaitCommand(i)` yields the barrier; the test inspects the *complete*
   payload, then calls `respond`/`fail`. Nothing time-based anywhere.
2. **Ordered-reply fidelity**: `capabilityCheck` dispatches through the same
   queue as the real client — it records `["version", {optional: [], required}]`
   and resolves the capability callback from that command's response
   (mirroring transport source, minus old-server synthesis). Unlike the
   donor's `TestClient` shortcut
   ([`watchman-root.test.ts:37`](/packages/core/test/filesystem/watchman-root.test.ts)),
   the `version` round trip stays visible in transcripts — W4's
   "complete command sequence" assertions must see it.
3. **Unexpected/duplicate/missing commands**: with `script` set, arrival-time
   deep-equal against `script[index]` fails fast with a bun `expect` diff;
   without it, `expectTranscript` at test end catches drift; `awaitCommand`
   settling an index that never arrives is caught by the test's own
   `Effect.timeout` on the barrier (or by final transcript length).
4. **Held response + timeout**: `hold()` (or simply not responding), then
   `TestClock.adjust(commandTimeoutMs + 1ms)` under `it.effect` — the
   donor's real-clock version
   ([`watchman-root.test.ts:586-612`](/packages/core/test/filesystem/watchman-root.test.ts),
   `commandTimeoutMs: 20` + `Effect.sleep("2 millis")`) becomes fully
   deterministic.
5. **Late response after generation close**: `hold()`, drive the controller
   to loss via `emitEnd()`, assert the command effect failed with
   `GenerationClosed`/timeout, *then* `respond` — assert no publish, no
   route re-entry, `ended()` unchanged after the fence (the resume is a
   verified no-op, §5.1).
6. **Event-listener registration**: `listeners("subscription")` etc. let W4
   tests assert registration happened before the first command (§4.1).
7. **Unilateral PDU**: `emitSubscription` dispatches by name through the
   registered listener — the actor does not filter; filtering is the
   controller's job under test.

Self-tests: a small `watchman-actor.test.ts` beside the W4 suite (or inside
it) pinning barrier ordering, transcript equality failure messages, and the
late-respond no-op. Cheap; recommended.

### 6.2 Donor test inventory → W3/W4/W5 disposition

| Donor test (watchman-root.test.ts) | Lines | Disposition |
| --- | --- | --- |
| `client()` fixture + `standard()` responder | 11-52 | **adapt** → actor internals; keep the shape, add barriers |
| `input()` with `placement`/`fail` | 66-75 | **reject** — v2 Target has neither (§7); re-author inputs |
| shares one route/client across nested interests | 77-100 | **re-author** — project-root sharing is gone; exact-root equivalent: two logical targets under one canonical root produce two `watch`es (daemon dedups) — decide and pin the actual behavior |
| pending route doesn't block another root | 102-132 | adapt scenario; deterministic via held command barriers (no `it.live`) |
| retries initial acquisition until available | 134-153 | W6 scope; re-author with TestClock backoff |
| shares retries across interests | 155-182 | W6; re-author |
| bounds acquisition across roots | 184-238 | W6; barrier-driven (already `it.effect`) |
| half-open probe sequence | 240-280 | W6 |
| circuit shared during capability check | 282-320 | W6 |
| drains waiters through bounded admission | 322-388 | W6 |
| root-specific watch failure stays out of circuit | 390-420 | W6 (but the *transcript* part — `watch` rejection as callback error — is W4/W5) |
| structural decode failure stays out of circuit | 422-446 | W6; see §2 decode-policy note |
| waiter removed on final-demand cancel | 448-488 | W6 |
| no probe after final-demand cancel | 490-513 | W6 |
| never falls back a selected Watchman directory | 515-538 | **re-author** for W4/W8 (fallback Native is upstream's, no `placement`) |
| keeps selected Watchman files on Node | 540-561 | **adapt** for W4 adapter test (drop `placement`) |
| surfaces terminal acquisition failure without Parcel | 563-584 | **re-author** — v2 has no error channel; "terminal" now means retry-forever + log, assert no fallback and no crash |
| submitted timeout closes only its root generation | 586-612 | **adapt, determinize** (TestClock) — core W5 |
| resumes each subscription from its cursor | 614-652 | **reject** — inverted: replacement must send a *fresh* clock and never `since: <old>`; keep the test skeleton asserting the new transcript |
| does not resurrect a subscription removed during outage | 654-673 | **adapt, determinize** — core W5 release fencing |
| one reconnect sequence per root | 675-705 | adapt, determinize; exact-root variant |
| holds command admission after caller interrupted | 707-740 | **adapt** — pins §5.1 uninterruptible window; direct client-level test ports almost verbatim |
| recovers a canceled subscription without disturbing sibling | 742-782 | **adapt** — R2 canceled-PDU trigger; re-author expectations: synthetic publishes → `invalidate()` calls, fresh clock |
| live gate convention | watchman-live.test.ts:10 | **adapt** — `OPENCODE_WATCHMAN_LIVE === "1" ? describe : describe.skip` |

## 7. W4/W5 — simplest Effect-v4 state machine on the current Native

### 7.1 The contract the controller must satisfy (post-W1 v2, verified)

[`watcher.ts`](/packages/core/src/filesystem/watcher.ts) in the rebuild
workspace (post-W1):

- `NativeInterface.subscribe(input) → Effect<Subscription | undefined>` —
  **no error channel, no `Scope`, no `fail` callback** (lines 54-58). The
  donor's `Input` carried `placement` and `fail`
  ([donor test input, old watchman-root.test.ts:66-75]; donor watcher fork) —
  both are gone. Everything failing must stay *inside* the controller:
  retry under bounded backoff, keep the logical stream alive, let
  `invalidate()` keep owners converging. Returning `undefined` is reserved
  for "backend unsupported" (stream ends) — Watchman uses it never after
  layer construction succeeds.
- The Watcher service supplies `publish` (→ PubSub, FIFO per publisher) and
  `invalidate` (W1) and calls `onReady` after RcMap acquisition +
  subscription attachment (lines 98-162). **Pre-attachment publishes are
  dropped** (PubSub is not replay — `review-failure-paths0` lines 180-200;
  upstream test at v2 `watcher.test.ts:56-95` pins the buffering path only
  for onReady-time publishes). Therefore W4's initial-attach window needs no
  PDU special-casing: anything before readiness is covered by the owner's
  authoritative reread (plan W4 wording, confirmed).
- `Watcher.Subscription = { unsubscribe(): Promise<void>, backend?: string }`
  (lines 40-44) — the donor's unsubscribe pattern (resolve stop-Deferred →
  join fiber, [`root.ts:422-428`](/packages/core/src/filesystem/watcher/watchman/root.ts))
  fits verbatim and keeps the interface Promise-based.
- RcMap keys directory watches by `{type, target, ignore}` — one controller
  per exact logical target; canonical dedup is the daemon's problem (multiple
  watches of one root are cheap references server-side).

### 7.2 State machine (per exact root controller)

```text
        ┌──────────────────────────────────────────┐
        ▼                                          │ reported loss (any §7.3 trigger)
Idle → Acquiring → Attached ───────────────────────┘
          ↑            │
          └── release ─┴── release → Released (final)
```

One internal operation owns every transition — initial attach *is*
replacement attach (`review-simplification0` lines 98-136; plan W5):

```ts
type Attach = (resumed: boolean) => Effect.Effect<Established, WatchmanError>

type Established = {
  readonly generation: Generation          // client + closed fence + routes
  readonly name: string                    // opencode-<generation>-<seq>
  readonly watchedRoot: string             // response.watch (event namespace, R1)
}
```

`Acquiring` covers first contact and recovery; `Released` is terminal and
absorbs every later callback/PDU attempt (the generation-fence already makes
those no-ops). No acknowledgement-dependent policy branch, no Parcel state,
no cursor state. The v2-trimmed module set:

| Module (under `src/filesystem/watcher/watchman/`) | Owns | From donor |
| --- | --- | --- |
| `schema.ts` | §2 boundary | near-verbatim |
| `client.ts` | `loadFactory`, `RawClient` types, `Generation`, `command`, `capabilities`, `admitted` | near-verbatim minus metrics, parameterized caps (§5.2) |
| `directory.ts` | the §7.2 controller: attach/loop/detach, PDU mapping, containment filter, expression builder, `publishFiles` | re-authored from donor `root.ts` 199-492 (fresh clock, invalidate-not-synthesize, no cursor/placement/metrics) |
| `backend.ts` | composite Native: `file`/`entries` → inherited fallback Native; `directory` → controller | re-authored (donor 7-26 minus placement/metrics) |
| `acquisition.ts` (W6, later) | shared admission+circuit | donor 1-199 mostly carries |

Proposed public seams (production):

```ts
// client.ts
export type RawClientFactory = () => RawClient
export const loadFactory = (binary?: string) => Effect<RawClientFactory, WatchmanError>
export function makeGeneration(id: number, client: RawClient): Generation
export function command<A>(generation, args, schema: Schema.Codec<A, unknown>, stage, options): Effect<A, WatchmanError | GenerationClosed>
export function capabilities(generation, required: readonly string[], options): Effect<CapabilityResponse, WatchmanError>

// directory.ts
export type Options = { commandTimeoutMs?: number; binary?: string }   // W6 adds maxConcurrentAcquisitions
export const makeDirectoryNative = (options?: Options, injectedFactory?: RawClientFactory) =>
  Effect<Watcher.NativeInterface>   // used by backend.ts composite; factory injectable for tests

// backend.ts
export const make = (fallback: Watcher.NativeInterface, options?: Options, injectedFactory?: RawClientFactory) =>
  Effect<Watcher.NativeInterface>
```

Keeping `injectedFactory` on the production modules (donor pattern,
[`backend.ts:7`](/packages/core/src/filesystem/watcher/watchman/backend.ts))
means the W3 actor drives W4/W5 suites through the *real* `backend.make`
seam with zero production special-casing — the actor is just another
factory.

### 7.3 Loss triggers (W5, with R2 folded in)

Close the generation once, fence, retain demand, reacquire, fresh clock,
attach, `invalidate()`, resume — on any of:

1. socket `error` event;
2. socket `end` event (coalesced with 1 by the idempotent close);
3. submitted command timeout (§5.1);
4. malformed response (schema decode failure at command level) or malformed
   PDU (decode failure in the loop) — retried per §2, not fatal;
5. `SubscriptionCanceled` PDU (R2) — daemon canceled the subscription
   (e.g. `watch-del` of the root by another client, or subscription TTL):
   detach route, treat as reported loss;
6. `is_fresh_instance: true` PDU (R2) — daemon recrawled: **invalidate and
   continue on the same generation** (not loss; the subscription survives a
   recrawl), but if it arrives during recovery attach it counts as the
   "compatible rows" window — process after the post-ack invalidation.

External cancellation (subscriber `unsubscribe`) is *not* loss: resolve the
stop Deferred → loop exits → detach local route → best-effort daemon
`unsubscribe` → join fiber → `Released`.

### 7.4 Recovery ordering invariant (the subtle one)

`Idle/loss → attach → ④ ack → invalidate() → drain withheld PDUs/rows →
exact updates`. Implementation: the generation's PDU queue is not drained
between subscribe-submit and post-ack `input.invalidate()` — one flag/phase
in the loop. `input.invalidate()` publishes one `NativeSignal.invalidation`
to the PubSub *before* any subsequent `input.publish` — PubSub FIFO plus
W1's per-subscriber `Stream.mapEffect`
([watcher.ts:151-158](/packages/core/src/filesystem/watcher.ts)) gives
"invalidation completes before later updates reach the stream", already
pinned by the W1 test
([watcher.test.ts:205-300](/packages/core/test/filesystem/watcher.test.ts)).
Tests must still pin the controller-side half (no PDU published to the
PubSub before the invalidation signal), because only the two halves together
give the W5 acceptance ordering.

## 8. Donor files/tests — adapt vs reject (consolidated)

**Adapt (behavior/logic references):**
- [`client.ts:38-55`](/packages/core/src/filesystem/watcher/watchman/client.ts) `loadFactory` (dynamic import + duck-typed validation) — keep, minus nothing (it has no metrics).
- [`client.ts:57-66`](/packages/core/src/filesystem/watcher/watchman/client.ts) `makeGeneration` — minus `metrics?`.
- [`client.ts:68-160`](/packages/core/src/filesystem/watcher/watchman/client.ts) `command`/`capabilities`/`admitted`/`isRawClient` — keep structure (§5), parameterize caps, drop metrics calls.
- [`schema.ts`](/packages/core/src/filesystem/watcher/watchman/schema.ts) whole file (§2 table).
- [`root.ts:159-197`](/packages/core/src/filesystem/watcher/watchman/root.ts) `create` (listener registration order, connect-after-close self-kill).
- [`root.ts:199-273`](/packages/core/src/filesystem/watcher/watchman/root.ts) `establish` skeleton → attach (delete `compatible`/clock-reuse 206-217, synthetic publishes 217/248, `relative_root` 228-229; add response.watch anchoring + fresh clock always).
- [`root.ts:275-290`](/packages/core/src/filesystem/watcher/watchman/root.ts) `detach` (local-first, best-effort unsubscribe, skip-if-closed).
- [`root.ts:292-297, 347-360`](/packages/core/src/filesystem/watcher/watchman/root.ts) `recoverable` classifier + attach/wait loop shape.
- [`root.ts:362-397`](/packages/core/src/filesystem/watcher/watchman/root.ts) `loop` → supervisor body (replace clock persistence 387-388 and synthetic publishes 381/390 with `invalidate()`; canceled-PDU handling becomes loss per R2/§7.3-5).
- [`root.ts:399-437`](/packages/core/src/filesystem/watcher/watchman/root.ts) `subscribe` entry + unsubscribe-join pattern (drop `fail` usage at 413 — v2 has no fail channel; the loop's caught error becomes log + retry instead).
- [`root.ts:453-492`](/packages/core/src/filesystem/watcher/watchman/root.ts) `expression` + `publishFiles` (type mapping `create/update/delete/drop` at 480-487 is the "directory rows don't masquerade" logic — keep exactly; re-anchor resolution per R1).
- [`watchman-root.test.ts:17-52, 707-740`](/packages/core/test/filesystem/watchman-root.test.ts) TestClient seed + admission-hold test.
- [`watchman-live.test.ts:10`](/packages/core/test/filesystem/watchman-live.test.ts) live-gating convention (W9).

**Reject:**
- [`route.ts`](/packages/core/src/filesystem/watcher/watchman/route.ts) entire file — project intents, `relative_root`, project containment.
- [`root.ts:71-108`](/packages/core/src/filesystem/watcher/watchman/root.ts) `makeRegistry` — RcMap-per-project-intent registry, metrics interval loop/finalizer, `Registry` type.
- [`root.ts:46-58`](/packages/core/src/filesystem/watcher/watchman/root.ts) `Options` retry/metrics knobs — only `commandTimeoutMs` (+ W6's `maxConcurrentAcquisitions`) survive per the W8 table.
- [`root.ts:206-217, 248`](/packages/core/src/filesystem/watcher/watchman/root.ts) cursor reuse + synthetic target publish — fresh-clock/cursor-deletion decision (vision0 lines 907-929).
- [`root.ts:447-451`](/packages/core/src/filesystem/watcher/watchman/root.ts) `subTarget` (project-relative metric label).
- [`metrics.ts`](/packages/core/src/filesystem/watcher/watchman/metrics.ts) entire file + [`watchman-metrics.test.ts`](/packages/core/test/filesystem/watchman-metrics.test.ts) + `ChannelMetrics`/`SubMetrics` couplings in client/root.
- [`backend.ts:16-25`](/packages/core/src/filesystem/watcher/watchman/backend.ts) placement routing — re-authored composite.
- [`watcher-interests.test.ts`](/packages/core/test/filesystem/watcher-interests.test.ts) — donor-only `WatchInterests` concept, absent in v2.
- Donor `watcher.ts` substrate fork in general — v2's post-W1 watcher is the substrate; nothing else from the donor fork should enter U1/U2-class files.
- `micromatch`/`is-glob` imports ([`root.ts:1-2`](/packages/core/src/filesystem/watcher/watchman/root.ts)) — R4: W4's dep commit adds only `@superbfowle/fb-watchman-esm`; glob handling decision is W7's.

## 9. Top hazards (ranked)

1. **PDU-before-ack and around-ack delivery** (§1.3): subscribe results are
   unilateral and unordered relative to the response. Mitigations: initial
   window covered by owner reread; recovery window ordered by the §7.4
   withhold-then-invalidate phase; never assert ack-then-PDU in tests.
2. **Callback-hang failure modes** (§1.4): daemon-discovery failures and
   pre-response socket errors never invoke command callbacks. Every command
   must race the generation fence; every generation must own `error`/`end`
   listeners registered before the first command.
3. **Ancestor-root coalescing** (R1): `watch` may report an ancestor.
   Without the containment filter, unrelated subtree activity floods owner
   reloads. Land the filter in W4, not W7 (the mapping code is the same
   seam; W7 only adds symlink topology).
4. **v2 Native has no error/fail surface** (§7.1): any temptation to
   propagate Watchman terminal failure through `native.subscribe` must be
   refused — retry inside, invalidate for convergence, `undefined` never
   (it would silently end Config/Skill streams).
5. **Late-callback/PDU resurrection**: safe only because of the verified
   `Effect.callback` resume guard + `subscriptions.clear()` on close. Keep
   `admitted()`'s structure intact; a "simplification" that removes the
   race or the uninterruptible window reopens either lost callbacks or
   transport FIFO violation.
6. **`error`+`end` double-fire**: both must coalesce into one close/one
   replacement (idempotent Deferred close). Donor already correct; the W5
   test list pins it — keep it.
7. **Release during in-flight command**: unsubscribe joins the loop fiber,
   which may sit in the uninterruptible submitted window up to
   `commandTimeoutMs`. Fine, but W8 must document the option and tests must
   not assume instant unsubscribe.
8. **Subscription-name collision across generations**: keep the
   generation-stamped naming; a reused name after reconnect can receive a
   zombie PDU meant for the dead subscription (name-scoped daemon state).

## Cross-references

- [`v2-readd3.gpt56solxh.md`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) — the work plan (W3 §388-423, W4 §425-497, W5 §498-571).
- Round-0 architecture journal (rebuild workspace,
  `.test-agent/watchman-v2-readd/research0.glm53max.md`) — R1 ancestor-root,
  R2 PDU loss signals, R3 Scope-free Native, R4 dep-list gap; both folded in here.
- [`review-failure-paths0.gpt56s.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/review-failure-paths0.gpt56s.md) — pre-attachment publish loss (180-200), donor subscribe-response stripping defect (76-91).
- [`review-simplification0.gpt56s.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/review-simplification0.gpt56s.md) — one attach state machine (98-136).
- [`vision0.gpt56s.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/vision0.gpt56s.md) — B2 boundary (888-905), fresh-clock/cursor deletion (907-929).
- [`watchwoman0.unknown.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/watchwoman0.unknown.md) — `watch-project` `$HOME` crawl incident (203-232).
- Transport source: `@superbfowle/fb-watchman-esm@3.0.0` `index.js` via unpkg (2026-09-05); Effect rc.112 via local effect-smol checkout (`internal/effect.ts:1048-1089`).
