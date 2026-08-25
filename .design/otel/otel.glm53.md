---
type: Design
title: Plugin OTEL host capability
description: Expose OpenCode's host-managed OpenTelemetry tracer and meter to Effect, Promise, and TUI plugins without transferring exporter lifecycle or registering process-global providers.
status: draft
generated: { by: llm:glm-5.3, at: 2026-08-21 }
sources:
  - id: observability-layer
    resource: /packages/util/src/observability.ts
    title: OpenCode observability layer
  - id: otlp-layer
    resource: /packages/util/src/observability/otlp.ts
    title: OTLP log and trace wiring
  - id: plugin-host
    resource: /packages/core/src/plugin.ts
    title: Effect plugin loader and inherited host context
  - id: watchman-otel
    resource: file:///home/rektide/src/opencode-watchman/.design/watchman/otel0.glm53.md
    title: Watchman OTEL observability design
---

# Plugin OTEL host capability

## What's up

OpenCode already owns an OTEL pipeline, but plugins cannot uniformly use it.
The CLI wraps the application in `Observability.layer`; when
`OTEL_EXPORTER_OTLP_ENDPOINT` is configured, that layer exports logs and
traces. Effect-flavor server plugins happen to inherit the host Effect context
and can use `Effect.withSpan`, but that behavior is undocumented. Promise and
TUI plugins have no telemetry capability, while importing
`@opentelemetry/api` yields its process-global no-op provider because OpenCode
deliberately keeps its provider scoped.

This patch creates an explicit plugin capability for host-managed OTEL. It is
the base for subsequent OTEL work, including linked Watchman
subscribe/unsubscribe spans and subscription counters designed in
[`opencode-watchman` `otel0.glm53.md`](file:///home/rektide/src/opencode-watchman/.design/watchman/otel0.glm53.md).

Workspace: `~/src/opencode-otel`, jj workspace `mkmsnstp`, based directly on
`v2@origin` `e11b3d08b606` on 2026-08-21. This is an independent patch line and
is not yet integrated into `working`.

Research prompt: *how should OpenCode expose its scoped OpenTelemetry provider
to all plugin flavors while preserving host ownership, no-op behavior when
OTLP is disabled, context propagation, plugin lifecycle isolation, and future
metrics support?*

## Current state

### Host observability

[`packages/util/src/observability.ts`](/packages/util/src/observability.ts)
provides local logging and conditionally adds OTLP:

- logs through `OtlpLogger` to `/v1/logs`;
- traces through `@effect/opentelemetry/NodeSdk`, `BatchSpanProcessor`, and
  `OTLPTraceExporter` to `/v1/traces`;
- resource attributes including `opencode.client`, `opencode.run`, deployment
  channel, and service instance identity.

[`packages/util/src/observability/otlp.ts`](/packages/util/src/observability/otlp.ts)
builds a scoped `NodeTracerProvider`. It does **not** call
`provider.register()`. Only an `AsyncLocalStorageContextManager` is registered
globally so AI SDK spans can parent correctly. This separation is useful:
OpenCode controls creation, flushing, shutdown, and fallback without changing
the behavior of every library importing the OTEL API.

Metrics are not wired. Effect ships `Metric` instruments, and
`@effect/opentelemetry` ships `OtelMetrics` plus NodeSdk
`Configuration.metricReader`, but OpenCode has no MeterProvider/reader or
`/v1/metrics` exporter today.

### Plugin execution

- **Effect server plugins**: [`packages/core/src/plugin.ts:50-60`](/packages/core/src/plugin.ts)
  invokes `plugin.effect(host)` after `State.inherit()`, replacing only the
  child `Scope` and loggers. The host tracer service remains in context, so
  `Effect.withSpan` already exports when OTLP is enabled.
- **Promise server plugins**: the Promise adapter captures the host Effect
  context (`packages/plugin/src/promise/adapter.ts:88-109`) and runs adapted
  domain calls through it, but the Promise context exposes no tracer object.
- **TUI plugins**: TUI plugins are dynamically imported in-process and receive
  a context assembled by `packages/tui/src/plugin/api.tsx`. That context has no
  Effect runtime or telemetry capability.

Plugins are not isolated VM/worker processes today. A host-bound tracer or
meter reference can be handed to them directly. If plugins later move behind a
worker/process boundary, the contract must change to W3C trace-context
propagation over that boundary; that is not this patch.

## Goals

1. Give Effect, Promise, and TUI plugins an explicit OTEL capability backed by
   the same host provider and resource identity.
2. Keep provider/exporter lifecycle host-owned: plugins cannot flush, shut
   down, replace, or globally register providers.
3. Keep the capability safe and stable when no OTLP endpoint is configured: it
   becomes a no-op, not an unavailable optional.
4. Preserve the existing preferred path for Effect plugins:
   `Effect.withSpan`/`Effect.linkSpans`; the explicit capability is for direct
   OTEL libraries, Promise callbacks, TUI code, and shared plugin helpers.
5. Establish a seam for a host meter once the OTLP metric reader is wired.

## Non-goals

- Implement Watchman instrumentation in this patch.
- Build or operate an OTEL collector/backend.
- Let plugins configure exporter endpoints, processors, sampling, resource
  identity, flushing, or shutdown.
- Register OpenCode's provider as the process-global OTEL provider.
- Promise cross-process plugin propagation before plugins are actually
  isolated.

## Interface

Expose a small capability in each plugin context, backed by direct OTEL API
types:

```ts
import type { Meter, Tracer } from "@opentelemetry/api"

export interface Telemetry {
  /** Defaults instrumentation scope name to the current plugin id. */
  readonly tracer: (name?: string, version?: string) => Tracer
  /** No-op until the host configures a MeterProvider/reader. */
  readonly meter: (name?: string, version?: string) => Meter
}

export interface Context {
  // existing domains...
  readonly telemetry: Telemetry
}
```

The host creates the capability per plugin, so omitted `name` resolves to the
plugin id. Plugins may provide a child instrumentation scope when one package
contains multiple independently instrumented modules. The host does not
automatically prefix an explicitly supplied name; instrumentation scope names
are producer-controlled OTEL identity.

`@opentelemetry/api` becomes a direct dependency of `@opencode-ai/plugin`.
Using its standard `Tracer`/`Meter` types avoids inventing a partial tracing
facade that third-party instrumentations cannot consume. The API package is
provider-neutral and intentionally small; SDK/exporter packages remain host
dependencies only.

### Effect plugins

Effect plugins should continue to use Effect-native tracing whenever possible:

```ts
yield* work.pipe(
  Effect.withSpan("plugin.operation"),
  Effect.linkSpans(origin),
)
```

That path inherits Effect context, span links, annotations, interruption, and
failure status. `context.telemetry.tracer()` exists for libraries that require
an OTEL `Tracer`, not as a replacement for `Effect.withSpan`.

### Promise plugins

Promise plugins receive the same synchronous capability through the Promise
adapter's `context2`. A Promise callback can use normal OTEL APIs without
owning an SDK:

```ts
const tracer = context.telemetry.tracer()
await tracer.startActiveSpan("plugin.refresh", async (span) => {
  try {
    await refresh()
  } finally {
    span.end()
  }
})
```

The host's AsyncLocalStorage context manager supplies active-context
propagation. Tests must verify that a Promise-plugin span created inside a host
operation parents/links as expected; do not assume context inheritance merely
because the provider reference is correct.

### TUI plugins

`usePluginHost()` gains a host telemetry value and
`createPluginContext()` exposes the per-plugin capability. The provider must
be captured at TUI startup from the same `Observability.layer` that wraps the
CLI/TUI process, then carried through a small TUI context. Do not read
`trace.getTracerProvider()` globally: OpenCode has intentionally not globally
registered its scoped provider, so that call returns the no-op proxy.

This TUI handoff is the implementation seam most likely to shape the patch.
It should be solved explicitly rather than by registering globals as a
shortcut.

## Host service

Introduce an always-present host telemetry service owned by observability:

```ts
export interface PluginTelemetry {
  readonly tracer: (scope: string, version?: string) => Tracer
  readonly meter: (scope: string, version?: string) => Meter
}
```

Behavior:

- endpoint configured: delegates to the scoped OTEL tracer provider and (once
  configured) meter provider;
- endpoint absent or initialization failed: returns OTEL no-op tracer/meter;
- host shutdown: existing observability scope flushes and shuts down providers;
  plugin cleanup never touches provider lifecycle.

The service must be available at the plugin-host construction boundary and at
TUI startup without reversing package dependencies. The likely ownership is
the existing util observability layer, with narrow adapters in Core and TUI.
Before implementation, verify that Core/TUI may depend on the selected service
module under current workspace dependency rules; if not, keep the contract in
`@opencode-ai/plugin` and provide it from composition roots rather than making
Core construct observability.

## Options considered

### A. Explicit host capability (recommended)

Pros: lifecycle-safe, testable, works with no-op fallback, uniform across
plugin flavors, no global side effects, direct standard OTEL types.

Cost: requires an explicit TUI handoff and a new plugin-package dependency on
`@opentelemetry/api`.

### B. Register the host provider globally

Every plugin and third-party library calling `trace.getTracer()` would work
without a plugin contract change. This is standard in many OTEL SDK setups,
but it conflicts with the current scoped design: global registration is
single-assignment process state, teardown/rebuild is awkward, tests may leak
providers across cases, and unrelated libraries silently change behavior.
Reject unless a separate architecture decision makes OpenCode's provider the
documented process-global provider.

### C. OpenCode-specific tracing facade

A tiny `context.trace.span(name, options, fn)` avoids the OTEL API dependency
and can adapt cleanly to Effect. It also re-invents attributes, links, events,
status, context propagation, and instrumentation scopes; third-party OTEL
instrumentations cannot use it. Reject for an API explicitly intended to
expose OTEL.

### D. Effect-only documentation

Document that Effect plugins already inherit the host tracer and stop there.
This leaves Promise and TUI plugins uninstrumentable and does not create the
meter seam. Useful documentation, insufficient patch.

## Metrics pipeline

Tracer exposure is useful immediately because the host already exports traces.
Meter exposure is intentionally forward-compatible but no-op until a reader is
wired. A follow-up commit in this patch line can mirror trace setup:

1. dynamically import `@opentelemetry/sdk-metrics` and the OTLP HTTP metric
   exporter only when an endpoint is configured;
2. create `PeriodicExportingMetricReader` targeting `${endpoint}/v1/metrics`;
3. pass it through NodeSdk `metricReader`;
4. let the existing observability scope own flush/shutdown;
5. test local fallback when initialization fails.

Keep trace-capability exposure and metric export as separate commits. The
plugin API may include `meter()` from the start because its no-op behavior is
well-defined, but trace exposure must not be blocked on metrics.

## Proposed source shape

```text
packages/plugin/src/
  effect/telemetry.ts       # shared plugin contract re-export
  promise/telemetry.ts      # Promise context type/re-export
  tui/telemetry.ts          # TUI context type/re-export
packages/util/src/observability/
  telemetry.ts              # host-owned tracer/meter capability
packages/core/src/plugin/
  host.ts                   # bind capability to server plugin id
packages/plugin/src/promise/
  adapter.ts                # hand same capability to Promise context
packages/tui/src/
  context/telemetry.ts      # carry host capability into Solid/plugin host
  plugin/api.tsx            # bind capability to TUI plugin id
```

Exact placement may shrink after prototyping. Do not create three independent
implementations: one contract, one host capability, thin target adapters.

## Verification

Use an in-memory exporter/provider fixture rather than global OTEL state.

1. Effect plugin: `Effect.withSpan` exports with plugin load as parent/context.
2. Promise plugin: `context.telemetry.tracer()` emits through the host exporter
   and preserves active context in an adapted callback.
3. TUI plugin: emitted span reaches the host exporter with instrumentation
   scope defaulted to plugin id.
4. No endpoint: all plugin flavors can call tracer/meter methods without
   throwing or importing SDK/exporter packages.
5. Lifecycle: unloading a plugin ends only plugin-owned spans/cleanups; it does
   not flush or shut down the host provider.
6. Isolation: two plugin ids receive distinct default instrumentation scope
   names.
7. No globals: the process-global OTEL provider remains unchanged.
8. Metrics follow-up: counter/gauge values export through the configured reader
   and provider shutdown flushes once.

Run typechecks from affected packages (`packages/plugin`, `packages/core`,
`packages/tui`, `packages/util`, `packages/cli`) and focused plugin lifecycle,
Promise adapter, TUI plugin-context, and observability suites.

## Sequencing

1. Contract + no-op capability: plugin Telemetry types and host service.
2. Server Effect/Promise contexts: bind by plugin id; document Effect-native
   tracing preference.
3. TUI handoff: capture scoped provider at startup and expose through plugin
   context.
4. Tests across all three flavors.
5. Separate commit: OTLP metric reader/exporter.
6. Consumers (Watchman and others) add their own instrumentation on top.

## Open questions

1. Should `meter()` ship in the first public contract while it is guaranteed
   no-op, or land with the reader follow-up? Lean: ship it now; no-op is OTEL's
   defined disabled behavior and avoids another API revision.
2. Should plugin id be the default instrumentation scope or should published
   package name/version be available separately? Lean: plugin id by default,
   optional explicit name/version.
3. How does the scoped provider reach TUI startup with the least dependency
   movement? Prototype this before freezing file placement.
4. Does direct OTEL `startActiveSpan` inside Promise callbacks see the host
   Effect span as active through the installed context manager? This needs a
   real exporter test, not inference.
5. Should OpenCode expose baggage/propagator helpers later? Not needed for
   in-process plugins; defer until a real process boundary exists.

## Cross-references

- [`opencode-watchman` `otel0.glm53.md`](file:///home/rektide/src/opencode-watchman/.design/watchman/otel0.glm53.md)
  — motivating consumer: linked subscription lifecycle spans and metrics.
- [`opencode` plugin guide](file:///home/rektide/a/d/o/plugin.md) — current
  Effect, Promise, and TUI plugin surfaces and lifecycle rules.
- [`opencode` patches working set](file:///home/rektide/archive/doc/opencode/patches.md)
  — patch workspace status and relationship to older provider observability
  experiments.
- [`packages/util/src/observability.ts`](/packages/util/src/observability.ts)
  and [`packages/util/src/observability/otlp.ts`](/packages/util/src/observability/otlp.ts)
  — existing host ownership and fallback behavior.
- [`packages/core/src/plugin.ts`](/packages/core/src/plugin.ts) — Effect plugin
  context inheritance that already makes Effect-native tracing work.
