# Implement Demand-Driven TUI Animation Rate

Implement and verify the OpenCode V2 TUI animation-rate patch in
`~/src/opencode-anim-rate`. Work from this jj workspace, commit each coherent
slice as you go, and leave an empty working-copy commit when finished. Follow
the repository `AGENTS.md`; do not modify the V1 `packages/opencode` package.

The patch bookmark is `anim-rate`, based on `v2@origin`. The
source idea is entry 13 in
[`~/archive/doc/opencode/patches.md`](file:///home/rektide/archive/doc/opencode/patches.md#tui-animation-fps-throttle-animations-number--boolean--new).

## Problem

Running many V2 TUIs consumes much more CPU than expected. A live measurement
with eight TUI processes found nominally idle clients commonly consuming CPU,
with one quiet TUI around 9.5% of a core and an active TUI around 21.8%. A
10-second `perf` sample showed substantial OpenTUI frame preparation, text
buffer drawing, box drawing, and blending.

The event bus is globally broadcast and deserves separate filtering work, but
it did not explain the idle baseline: an authenticated eight-second capture of
`/api/event` contained only `server.connected` and a heartbeat while the TUI
continued consuming CPU.

The direct cause is animation liveness. `TabPulseRenderable` sets `live = true`
while a tab is active, glowing and breathing, or finishing an envelope. In
OpenTUI, `live` propagates to the root and calls `renderer.requestLive()`, which
starts the renderer-wide continuous loop. The full TUI has `targetFps: 60`.
Consequently one small tab pulse causes the entire interface to update, lay
out, render, diff, and potentially write at 60 fps. Vertical tabs can mount
several pulse renderables for one tab.

The existing `animations: false` setting is an effective emergency workaround,
but users should be able to retain low-rate animation. More importantly, a
pulse should own its cadence and request individual frames instead of keeping
the whole renderer live.

## Relevant Code

- [`packages/tui/src/component/tab-pulse.tsx`](/packages/tui/src/component/tab-pulse.tsx)
  contains `Envelope`, `PulseState`, and `TabPulseRenderable`.
- [`packages/tui/src/component/session-tabs.tsx`](/packages/tui/src/component/session-tabs.tsx)
  creates the horizontal and vertical tab pulses.
- [`packages/tui/src/config/index.tsx`](/packages/tui/src/config/index.tsx)
  currently defines `animations` as an optional boolean.
- [`packages/tui/src/app.tsx`](/packages/tui/src/app.tsx) creates the full
  renderer with `targetFps: 60`.
- [`packages/tui/src/mini/runtime.lifecycle.ts`](/packages/tui/src/mini/runtime.lifecycle.ts)
  establishes the useful precedent `targetFps: 30, maxFps: 60`.
- [`packages/tui/src/ui/animation.ts`](/packages/tui/src/ui/animation.ts) has a
  separate 16 ms scheduler for finite Solid-driven animations. Account for it
  in analysis and tests, but do not broaden the first patch unless measurement
  shows it defeats the intended steady-state fix.
- OpenTUI source is locally available at
  [`~/archive/anomalyco/opentui/packages/core/src/Renderable.ts`](file:///home/rektide/archive/anomalyco/opentui/packages/core/src/Renderable.ts)
  and
  [`renderer.ts`](file:///home/rektide/archive/anomalyco/opentui/packages/core/src/renderer.ts).

## Existing Timing Model

Preserve wall-clock animation speed when reducing sample rate.

`PulseState.advance(deltaTime)` already advances clocks by the renderer's
elapsed delta, and pulse durations are expressed in milliseconds. A replacement
scheduler must likewise calculate elapsed monotonic time, not add a fixed
`1000 / fps` amount. If the event loop stalls for 300 ms, the next pulse sample
should advance by approximately 300 ms. Lower frame rate should make motion less
finely sampled, not make a 2.8-second sweep last longer.

`createAnimatable` uses seconds and currently clamps each spring delta to 50 ms.
It also wakes every 16 ms independently of `renderer.targetFps`. This is a
separate finite-animation path. Document any observed interaction rather than
silently mixing a broad scheduler rewrite into the steady-state pulse fix.

## Renderer Knobs

OpenTUI exposes two independent controls:

- `targetFps` controls rescheduling of the continuous live loop.
- `maxFps` controls the throttle for ordinary `requestRender()` calls.

Keep `maxFps` at 60 so typing, scrolling, and state changes remain responsive.
A numeric animation rate may set `targetFps`, but once tab pulses become
demand-driven they should schedule their own `requestRender()` calls at the
configured animation cadence. Ordinary requests occurring between pulse ticks
must still render promptly at `maxFps`.

## Desired Interface

Widen TUI configuration to accept:

```jsonc
{
  "animations": 12
}
```

Semantics:

- `false`: disable animations, preserving current behavior.
- `true` or omitted: enable animations at the existing default cadence.
- a positive numeric value: enable animations and sample them at that many
  frames per second.

Use `Schema.Finite.check(Schema.isGreaterThan(0))`; zero, negative values,
`NaN`, and infinity must not reach `1000 / fps`. Fractional and high rates are
valid user choices: accept values such as `1.5`, `59.998`, and `1000`.
Preserve the current default unless measurement and product direction justify
changing it. Treat requested animation cadence and delivered renderer frame
rate as distinct when `maxFps` coalesces requests.

Do not assume every accepted rate maps exactly to a host timeout. A tiny
positive rate can overflow `1000 / fps`, and a high rate can produce a period
below timer resolution. Keep validation permissive, but make scheduling safe:
chunk or saturate unrepresentably long delays, run sub-resolution cadences no
faster than the event loop permits, and never accumulate a backlog of missed
samples.

Keep the caller-facing interface small. Derive "animations enabled" and
"animation frame rate" once rather than scattering `typeof` checks throughout
the TUI. Numeric values must count as enabled. Update the toggle command so
disabling and re-enabling from a numeric setting has deliberate behavior; at
minimum, do not accidentally turn a numeric value into false through boolean
negation.

## Demand-Driven Pulse

Replace pulse use of OpenTUI `live` with an "ask render" scheduler:

1. A state change starts scheduling if `inner.live || outer.live` says the
   pulse's visual state will continue changing.
2. At each due sample, calculate elapsed monotonic time, advance both
   `PulseState` values, and call `requestRender()` once.
3. Continue only while either pulse state remains live. Finite envelopes must
   naturally stop their timer. Running sweeps and breathing glows remain
   scheduled until their corresponding state turns off.
4. Setters still request an immediate render so user-visible state changes are
   not delayed until the next animation tick.
5. Destruction, disablement, and terminal state must cancel scheduling. No
   timer may retain a destroyed renderable.
6. Do not set `this.live = true`; after the patch, tab pulses must not call
   `requestLive()` or keep OpenTUI's continuous loop alive.

Prefer one small scheduler module scoped to a renderer over one independent
timer per rendered strip. Construct it beside the renderer and inject a narrow
internal port for monotonic time, timeout operations, and one renderer
invalidation function. Pulse tasks provide their cadence and advance callback,
and registration returns cancellation. The implementation can maintain
registered pulse tasks and use one timeout for the next cadence boundary. It
should advance every due pulse and invalidate the renderer once per tick. Keep
this seam internal unless a second real animation consumer demonstrates that
it belongs in the general animation module. A `WeakMap` keyed by
`RenderContext` is an optional lookup adapter if custom-renderable construction
makes explicit propagation noisy, not a required ownership model.

Do not advance animation state from both `onUpdate` and the timeout. Choose one
clock owner. The likely shape is for the scheduler callback to advance state
before requesting a render, while `renderSelf` only reads the resulting state.

Consider visibility explicitly. An offscreen or hidden pulse must not force
full-render requests forever. If OpenTUI clipping does not expose enough
visibility information to solve that correctly in this patch, document the
remaining limitation and at least ensure disabled and destroyed instances are
removed. Do not add speculative OpenTUI core changes without a demonstrated
need.

## Implementation Slices

Commit coherent work separately where practical:

1. Add validated numeric animation configuration, normalize its semantics, and
   apply the frame rate to renderer setup without reducing `maxFps`.
2. Add demand-driven pulse scheduling and remove `TabPulseRenderable.live`.
3. Add focused timing/lifecycle tests and any measurement harness or concise
   documentation needed to reproduce the CPU improvement.

Use conventional commit titles such as `feat(tui): configure animation frame
rate` and `fix(tui): render tab pulses on demand`.

## Tests

Build a deterministic fake-clock seam rather than sleeping in tests. Cover:

- configuration accepts `false`, `true`, omitted, and valid numeric fps;
- configuration rejects zero, negative, and non-finite values while accepting
  fractional and high positive rates;
- extreme positive rates do not overflow timeout scheduling or accumulate
  missed-sample backlog;
- numeric fps leaves animations enabled;
- the scheduler coalesces multiple pulse tasks onto one timer;
- elapsed wall time, not nominal frame count, advances pulse clocks;
- a running or breathing pulse asks for frames at the configured cadence;
- a finite envelope stops asking for frames after completion;
- disabling or destroying a pulse cancels future asks;
- an immediate setter change requests a render without waiting for a tick;
- no tab pulse enters OpenTUI live mode.

Run tests and type checking from `packages/tui`, never from repository root:

```sh
bun test <focused-test-files>
bun typecheck
```

Follow the package's existing test commands if they are more specific.

## Runtime Verification

Measure before and after against the same terminal dimensions and tab state.
Record enough context to distinguish an active model stream from a steady
running/breathing tab indicator.

Useful commands:

```sh
pidstat -u -p <tui-pid> 1 10
perf record -F 99 -g -p <tui-pid> -- sleep 10
perf report --stdio --no-children --percent-limit 1
```

Verify all of the following:

- a steady pulse no longer starts a 60 fps renderer-wide live loop;
- configured low-rate animation visibly progresses at the same wall-clock
  speed;
- typing and ordinary interaction remain responsive because `maxFps` stays 60;
- CPU use scales materially better when several TUIs are open;
- `animations: false` remains a complete kill-switch.

Capture measured baseline and result in the commit body or a concise addendum
under this design directory. Do not claim the global event-broadcast scaling
problem is solved by this patch; that is separate work.

## Completion

Before stopping:

- run focused tests and `bun typecheck` from `packages/tui`;
- inspect `jj diff --git`;
- commit all patch files in logical commits with explicit paths;
- ensure bookmark `anim-rate` points to the patch tip;
- leave a short summary of behavior, measurements, tests, and any unresolved
  visibility limitation.
