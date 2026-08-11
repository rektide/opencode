# Demand-Driven Animation Rate Assessment

## Verdict

The diagnosis and intended behavior are sound. The prompt correctly separates
animation cadence from ordinary render responsiveness and improves on the
original `targetFps`-only idea by removing `TabPulseRenderable` from OpenTUI's
renderer-wide continuous mode.

The design needs a few lifecycle and ownership decisions made explicit, but it
does not need a different architecture. The original workspace-base blocker
found during this assessment has now been corrected.

## Resolved Base Mismatch

The `anim-rate` bookmark initially descended from an old local `dev` revision
that had no `packages/tui` directory. Its TUI was under
`packages/opencode/src/cli/cmd/tui`, exactly the V1 package the prompt forbids
modifying.

The named implementation files exist at `v2@origin` (`2372edd5`), including:

- `packages/tui/src/component/tab-pulse.tsx`
- `packages/tui/src/component/session-tabs.tsx`
- `packages/tui/src/config/index.tsx`
- `packages/tui/src/ui/animation.ts`

Current `dev@origin` (`5d953482`) has the extracted `packages/tui` package but
does not have `tab-pulse.tsx` or `session-tabs.tsx`. The prompt therefore cannot
be repaired merely by updating local `dev` to `dev@origin`.

The design commits and working copy now descend from `v2@origin` at
`2372edd5`, and the implementation handoff records that base. The blocker is
resolved; implementation should remain on this V2 line and avoid
`packages/opencode`.

## Validated Claims

The central mechanism is accurately described:

- `TabPulseRenderable` computes `live` from running, breathing, and envelope
  state, then updates it from setters and `onUpdate`.
- OpenTUI propagates live counts to `RootRenderable`, which calls
  `requestLive()` when the first live descendant appears.
- `requestLive()` starts continuous renderer mode, and the renderer schedules
  that loop using `targetFrameTime`.
- Ordinary `requestRender()` calls are independently throttled by
  `minTargetFrameTime`, derived from `maxFps`.
- The full V2 TUI requests `targetFps: 60`; the mini renderer demonstrates the
  separate `targetFps: 30, maxFps: 60` configuration.
- `PulseState.advance(deltaTime)` already uses elapsed milliseconds, so a
  monotonic elapsed-time scheduler preserves animation duration.

Demand-driven scheduling is materially better than only lowering
`targetFps`. While continuous mode is running, an ordinary request can be
coalesced behind the next low-rate continuous frame. Pulse-owned one-shot
requests allow interaction to continue at `maxFps` between animation samples.

Removing `TabPulseRenderable.onUpdate` also has a likely secondary benefit:
OpenTUI treats an `onUpdate` override as preventing render-command-list reuse.
Moving pulse advancement outside the render traversal should make that list
reusable when no other changing layout condition prevents it.

## Required Clarifications

### 1. Normalize The Value At A Named Seam

Accept any finite number greater than zero. Cadences such as `1.5`, `59.998`,
and `1000` are meaningful user choices and do not need product-policy limits.
Effect Schema should reject only zero, negative values, `NaN`, and infinities.

`maxFps: 60` can prevent a high requested cadence from producing a distinct
render for every timer tick, but that is renderer behavior rather than a reason
to reject the configuration. The scheduler should avoid needless accumulated
work when requests coalesce, document the distinction between requested sample
rate and delivered frame rate, and leave future renderer limits independent of
the public animation-rate domain.

This permissive domain moves edge handling into the scheduler implementation.
Extremely small positive values can overflow `1000 / fps`; extremely high
values can fall below host timer resolution. Saturating or chunking long waits
and treating short periods as event-loop-limited preserves the interface
without allowing invalid timeout behavior or missed-sample backlog.

Define one normalization helper for the public `boolean | number | undefined`
value:

- `enabled`: value is not `false`
- `fps`: numeric value, otherwise the caller's default cadence

The caller-specific default matters because the full renderer defaults to 60
while mini currently uses 30. Do not scatter truthiness or `typeof` checks.

The prompt should state whether numeric `animations` applies to mini mode. Mini
currently excludes `animations` from `RunTuiConfig`, so supporting it there is
additional scope rather than a one-line renderer change.

### 2. Pass Cadence To The Pulse Explicitly

Setting renderer `targetFps` does not configure a demand-driven pulse timer.
The normalized rate must reach `SessionTabs` and `TabPulse`, or reach the
scheduler through a narrowly scoped context. The current `SessionTabs`
`animations` prop is boolean and must not accidentally erase a numeric rate.

Keep `targetFps` configured too, because other OpenTUI live renderables may use
continuous mode. In the renderer handoff path in `app.tsx`, also assign the
rate to the reused renderer; that path currently updates only `useMouse` and
does not reapply the renderer options object.

V2 config is watched and reconciled after startup, while renderer options are
currently computed only once. Either reactively update `renderer.targetFps`
when the normalized rate changes or explicitly define numeric rate changes as
restart-only. Pulse props alone cannot keep other live renderables at the new
cadence.

### 3. Choose Scheduler Ownership And Injection

The recommendation to scope scheduling per `RenderContext` comes from resource
ownership, not from a requirement to use a `WeakMap`. Render requests,
coalescing, suspension, destruction, output backpressure, and the eventual
frame all belong to one renderer. A process-global scheduler would have to
partition those concerns by renderer anyway, while coupling otherwise
independent renderers and concurrent `testRender` instances.

Prefer an explicitly constructed scheduler module beside the renderer. Inject
a small internal port containing the monotonic clock, timeout operations, and
one render invalidation function. Pulse tasks supply only their cadence and
advance callback. Production adapts the renderer and system clock to the port;
tests adapt OpenTUI's `ManualClock`. This is a real seam because it has both
production and deterministic test adapters, while its clock details remain
internal rather than expanding the pulse interface.

How custom renderables receive that scheduler is a separate decision:

- Explicit propagation through the TUI animation context is easiest to reason
  about and makes dependency ownership visible.
- A `WeakMap<RenderContext, Scheduler>` can be a narrow lookup adapter if
  OpenTUI's custom-renderable construction makes explicit propagation noisy.
- A process animation broker can own one timer heap while partitioning tasks
  and render invalidations by renderer. This is more advanced and useful only
  if multiple renderers or many independent cadences demonstrate timer cost.
- An OpenTUI-owned scheduler would integrate best with suspension,
  backpressure, visibility, and its private clock, but requires a justified
  upstream core interface rather than a speculative OpenCode patch.

The external interface should stay deep: register an advancing task at a
cadence and receive a cancellation function. Timer heaps, phase alignment,
drift correction, renderer partitioning, and coalescing stay implementation
details. Cadence is passed explicitly as data; clock and render effects are
injected dependencies.

Each scheduler should:

- keep one monotonic deadline and one timeout for its registered tasks;
- advance every due task from actual elapsed time;
- issue one context-level render request after advancing all due tasks, rather
  than one request per pulse;
- tolerate registration and removal while ticking;
- clear its timeout when no tasks remain;
- avoid deadline drift by advancing from cadence boundaries rather than
  scheduling `interval` milliseconds after callback completion.

A fresh registration should establish its timestamp at registration. Define
what happens after invisibility: freezing and resuming an old finite envelope
violates wall-clock duration, while advancing by the full hidden interval makes
it catch up immediately. Catch-up is the more consistent default.

### 4. Make Lifecycle Hooks Concrete

Use the OpenTUI lifecycle seams explicitly:

- setters synchronize scheduler membership and request the immediate frame;
- the scheduled callback owns `PulseState.advance`;
- `renderSelf` only reads state;
- `destroySelf()` unregisters the task, allowing base `destroy()` to retain its
  normal cleanup behavior;
- `onRemove()` unregisters a detached pulse, with an explicit re-registration
  path if OpenTUI reattaches or reparents it;
- disablement and terminal envelope state unregister immediately;
- renderer suspension pauses the scheduler instead of repeatedly making
  ignored `requestRender()` calls;
- local `visible = false` should stop frame requests, with elapsed time handled
  deliberately when visibility returns.

Ancestor clipping and scrollbox culling remain a real limitation. OpenTUI does
not expose a simple persistent "currently rendered in viewport" signal to the
pulse. Document that limitation rather than adding speculative core changes.
Checking `pulse.visible` does not solve it: scrollbox culling skips descendants
without changing their own visibility flag. Treat offscreen vertical-tab work
as an explicit acceptance gap and measure it separately.

### 5. Decide Toggle Semantics

The current boolean negation has one coherent but lossy behavior:

- numeric value to `false` disables animation;
- `false` to `true` re-enables at the default and forgets the numeric rate.

That is not an accidental bug, but it is a product decision. Either specify it
as accepted behavior or retain the last numeric rate in a deliberate setting
or runtime seam. Do not imply that a single persisted union field can preserve
both disabled state and its prior numeric value without extra state.

## Test Assessment

The requested coverage is appropriate, but tests should target three layers:

1. Schema and normalization tests for accepted values, rejected boundaries,
   enablement, and default rates.
2. Scheduler unit tests through its small task-registration interface using an
   injected `ManualClock` adapter. Assert one active timeout per renderer,
   fractional cadence, high requested cadence, cadence alignment, elapsed-time
   catch-up, safe reciprocal overflow, no missed-sample backlog, removal during
   a tick, and timer teardown.
3. `TabPulseRenderable` integration tests using OpenTUI's test renderer. Assert
   immediate invalidation, finite completion, destroy/disable cleanup, and that
   renderer scheduler state never enters continuous mode.

The existing tab-pulse test uses real sleeps. New scheduler tests should not
copy that pattern. Prefer OpenTUI's existing `Clock` contract and `ManualClock`
test implementation over a new clock vocabulary.

Runtime CPU measurement remains necessary because `requestRender()` still
runs the renderer pipeline. The expected improvement is fewer pulse-driven
frames and better interaction latency, not partial-tree rendering. Record frame
counts or renderer state alongside `pidstat`/`perf` data so CPU changes can be
attributed to the cadence change.

Describe `animations: false` as disabling the OpenCode-owned animation
consumers wired to this setting. Calling it a complete renderer-wide
kill-switch overstates what the application config controls.

## Recommended Handoff Changes

Revise the prompt before implementation to:

1. Keep the patch based on the reviewed V2 revision that contains
   `TabPulseRenderable`.
2. Accept any finite positive numeric cadence, including fractional and high
   values.
3. Name the normalization seam and how the rate reaches each pulse.
4. Choose renderer-local scheduler ownership, its injection seam, and
   `destroySelf()` cleanup without prescribing `WeakMap` lookup.
5. State mini-mode scope, renderer-handoff behavior, visibility catch-up, and
   toggle restoration semantics.
6. Define config hot-reload, ordinary removal/reparenting, and renderer
   suspension behavior.

With those changes, the proposed three implementation slices remain sensible
and the work is ready to implement.

## Cross-References

- [`prompt0.gpt5.md`](/.design/anim-rate/prompt0.gpt5.md) is the assessed
  implementation handoff; its diagnosis and test outline remain the foundation
  after the base and ownership corrections above.
- [`README.md`](/.design/anim-rate/README.md) summarizes the two intended
  improvements but should be corrected with the chosen upstream bookmark once
  the base decision is made.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md#tui-animation-fps-throttle-animations-number--boolean--new)
  contains the narrower `targetFps`-only predecessor. The demand-driven design
  improves it by preserving ordinary `maxFps` responsiveness while pulses are
  active.
