---
type: Design
title: Watchman OTEL observability
description: Event-span design for watchman subscribe/unsubscribe lifetimes using OTEL messaging semconv with span links, the host tracer/exporter facts that gate plugin access, and the metrics pipeline gap.
status: draft
generated: { by: llm:glm-5.3, at: 2026-08-20 }
sources:
  - id: observability-src
    resource: file:///home/rektide/archive/anomalyco/opencode/packages/util/src/observability.ts
  - id: plugin-host
    resource: file:///home/rektide/archive/anomalyco/opencode/packages/core/src/plugin.ts
  - id: effect-links
    resource: file:///home/rektide/.local/share/opencode/repos/github.com/Effect-TS/effect-smol/packages/effect/src/Effect.ts
  - id: messaging-semconv
    resource: https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/
---

# Watchman OTEL observability (otel0)

## What's up

The watchman backend runs and survives daemon restarts (unbounded retry,
landed 2026-08-20; see [`cleanup0.gpt56t.md`](cleanup0.gpt56t.md) and the
[README](README.md)). The user now wants to *see* it: subscriptions and
unsubscriptions as counters, and — the idea this wave develops — **linked
pub/sub event spans per OTEL messaging semantic conventions**, with a link
from each unsubscribe back to its subscribe. That idea immediately raised
three questions, all answered by source research on 2026-08-20:

1. Is there any metric system in opencode, and is it plugin-usable?
2. Is there an exporter set up for plugins? Do plugins run in isolated
   contexts?
3. Can opencode provide its own exporter for traces?

Research prompt: *what observability does the opencode host actually wire
(logs/traces/metrics), which runtimes do plugins execute in and what tracer
do they see, does Effect v4 support span links natively, and what does the
OTEL messaging semconv say about subscribe/unsubscribe and link-based
correlation?*

## Verified: the host's observability surface

All `packages/…` citations are the archive checkout
(`~/a/a/opencode`, v2 line).

1. **Logs + traces exist; metrics do not.** `Observability.layer`
   (`packages/util/src/observability.ts`, called from
   `packages/cli/src/index.ts:76`) composes local file/pretty loggers and,
   when `OTEL_EXPORTER_OTLP_ENDPOINT`/`_HEADERS` are set, OTLP **logs**
   (`OtlpLogger` → `/v1/logs`) and OTLP **traces**
   (`observability/otlp.ts` `tracingLayer`: NodeSdk +
   `BatchSpanProcessor` + OTLPTraceExporter → `/v1/traces`). Resource
   attributes include `opencode.run` (per-run id), `opencode.client`,
   channel, `service.instance.id`. No MeterProvider, no `/v1/metrics`
   exporter, and `Metric.` appears in zero source files. `packages/stats`
   is an unrelated analytics website, not runtime telemetry.
2. **Effect v4 ships a full `Metric` API in the bundled dependency,
   unused** (`Metric.counter`/`gauge`/histogram confirmed in
   `dist/Metric.d.ts`). Better: `@effect/opentelemetry`'s `NodeSdk`
   `Configuration` already accepts `metricReader`, and the package ships
   an `OtelMetrics` bridge — the metrics pipeline is sitting in the
   dependency tree, one `Observability.layer` mirror away from existing.
3. **The host tracer is a scoped Effect service, not a global.**
   `layerTracerProvider` builds a `NodeTracerProvider` into the
   `OtelTracerProvider` service; there is no `provider.register()` call
   anywhere. The only global registered is a context manager
   (`AsyncLocalStorageContextManager`, for AI SDK span parenting) — a
   deliberate narrowness, and a hint that globals are avoided on purpose.
   When no endpoint is configured, Effect's no-op tracer swallows
   everything: spans cost nothing until an exporter exists.
4. **Effect-flavor server plugins already ride the host tracer.**
   `packages/core/src/plugin.ts:45-52` runs `plugin.effect(host)` with the
   host context *inherited* (only `Scope` and loggers are swapped, via
   `State.inherit` + `updateContext`). A plugin's `Effect.withSpan`
   exports whenever the host's endpoint is set. This *is* today's answer
   to "opencode provides its own exporter" — undocumented.
5. **Promise-flavor and TUI plugins are the real gap.** Neither context
   exposes any observability surface; `@opentelemetry/api`'s global tracer
   is the no-op default for them. They run in-process as dynamically
   imported modules (no isolates; TUI plugins in the TUI process), so a
   tracer *reference* handed over just works — no IPC, no wire
   propagation. The clean fix is a host API (`ctx.trace` /
   TUI-context equivalent) returning `provider.getTracer(name, version)`
   bound to the scoped host provider: ~20 lines, no global mutation.
   Tracked as workspace `~/src/opencode-plugin-otel` in
   [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md)
   (working set, NEW, not integrated). If the workerd spike ever moves
   plugins cross-process, W3C tracecontext propagation becomes the
   problem instead — not today's.

## Verified: the semconv fit

From the [messaging spans spec](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/)
(status: **Development**, with the `OTEL_SEMCONV_STABILITY_OPT_IN`
compatibility regime — treat emitted shape as advisory, not contract):

- Watchman *is* a messaging system under the spec's own definitions:
  producer = the filesystem/editor writing; intermediary = the daemon;
  destination = the watched root; our named subscription with its cursor
  is a consumer-group-style offset. Mapping: `messaging.system="watchman"`,
  `messaging.destination.name=<root>`,
  `messaging.client.id=opencode-<pid>-<gen>`, PDU ≈ pushed batch,
  `messaging.batch.message_count=n`.
- **There is no `subscribe`/`unsubscribe` operation type** — the registry
  defines `create`/`send`/`receive`/`process`/`settle`. But the registry
  permits custom values where no well-known one applies, and
  `messaging.system="watchman"` is custom anyway (same escape hatch), so
  `messaging.operation.type="subscribe"` is legal-if-nonstandard and
  cannot collide with any real system's dashboards.
- **Links are the spec's canonical correlation mechanism** — "these
  conventions use span links as the default mechanism to correlate
  producers and consumer(s)", precisely because lifetimes are many-to-many
  and a span has one parent. Subscribe↔unsubscribe correlation via links
  is not a hack; it is the standard OTEL answer.
- Effect v4 supports it natively: `Effect.linkSpans(span, { relationship:
  "follows" })`, `Effect.currentSpan`, `Effect.spanLinks` (effect-smol
  `Effect.ts` ~8100–8220). Links to *ended* spans are the normal case.

## Design

### Event spans, never a lifetime span

Do **not** represent the subscription as one long span. A hours/days-long
span sits unflushed in the `BatchSpanProcessor`, is invisible until close,
and bloats memory — the opposite of observable. Instead, two short event
spans correlated by link **and** by a shared attribute (attribute search
beats link navigation in Grafana/Jaeger for finding pairs):

```ts
// establish (native.ts, after subscribe ack):
const subscribe = yield* Effect.currentSpan // from a withSpan around establish
// stashed on subscription State; spans may outlive via ended context

// close (native.ts, in close()):
Effect.linkSpans(state.subscribeSpan, { relationship: "follows" })
// inside Effect.withSpan("watchman.unsubscribe", …)
```

- `watchman.subscribe` / `watchman.unsubscribe` (span names), plus
  `watchman.resume` on reconnect — each links back to its subscribe span,
  so an outage-and-recover trail is navigable to origin.
- Attributes on every such span, both namespaces:
  - `watchman.subscription = opencode-<gen>-<id>` (the correlation key),
  - `watchman.root`, `watchman.relative_root`, `watchman.routing`,
  - `messaging.system = "watchman"`,
    `messaging.operation.type = "subscribe"|"unsubscribe"|"resume"`
    (custom values, permitted),
    `messaging.destination.name = <root>`,
    `messaging.client.id = opencode-<pid>-<gen>`.
- `error.type` on failed variants per semconv error conventions.

### Metrics (dormant until a reader exists)

- Counters: `opencode_watchman_subscriptions_total`,
  `opencode_watchman_unsubscriptions_total`,
  `opencode_watchman_reconnects_total`.
- Gauge: live subscriptions (already tracked as the demand counter that
  gates the notify loop).
- Histogram: outage duration (outageSince → reconnect).

These accumulate in-process via Effect `Metric` and export automatically
the day `Observability.layer` gains a `metricReader`. Near-term
visibility without a collector stays with the existing log lines
(`watcher started/stopped`, `watchman subscription resumed`).

### Where each signal lives

| Signal | Carries | Pipeline today |
| --- | --- | --- |
| logs | detail, PDUs warnings, outage notify | local + OTLP logs |
| linked event-spans | lifetimes, correlation, causality | OTLP traces |
| metrics | rates, live counts, outage durations | none yet (reader is one mirror away) |

### Sequencing

1. Instrument `packages/core/src/filesystem/watchman/native.ts` (spans +
   metrics, ~40 lines). Core code inherits the host tracer — works
   immediately when an endpoint is set, free otherwise.
2. `~/src/opencode-plugin-otel`: `ctx.trace` host API (plugin gap, above).
3. Optional upstream: `metricReader` mirror in `Observability.layer`.

## Open questions

1. **Both namespaces or custom-only?** Lean: emit `watchman.*` +
   `messaging.*` together — custom values are legal, and standard
   dashboards get a chance to interpret.
2. **Which events get spans?** Lean: subscribe/unsubscribe/resume; PDU
   processing stays logs-only (too chatty for spans).
3. **Sampling** — moot at these frequencies (tens per run); default
   sampler fine.
4. **Cardinality** — `destination.name = <root path>` is highish but
   these are rare event spans at dev-machine scale; acceptable.

## Cross-references

- [`README.md`](README.md) — maintenance log; "Open follow-ups" lists the
  spec'd-but-unimplemented diagnostics this wave supersedes/extends.
- [`cleanup0.gpt56t.md`](cleanup0.gpt56t.md) — the daemon ownership model;
  subscription identity and naming (`opencode-<gen>-<id>`) is shared here.
  (Written under a prior model label; kept for lineage.)
- [`plugin.md`](file:///home/rektide/a/d/o/plugin.md) — plugin contracts;
  confirms no observability surface in either context today.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  `opencode-plugin-otel` working-set entry (the plugin-tracer gap and its
  workspace).
- Watchman source `cmds/subscribe.cpp:575-598` — the daemon's own
  per-subscription census info (`{name, client, pid, query}`): the
  daemon-side counterpart of what our spans record client-side.
