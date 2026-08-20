# Pulse animation throttle — 3 fps

## Motivation

The V2 TUI renderer runs its pulse/redraw loop at `targetFps: 60` by default,
spinning the terminal redraw path sixty times per second even when nothing but
a cursor pulse or marquee is animating. On long-lived TUI sessions this is
wasted CPU (and fan noise) for purely cosmetic motion. The feature throttles
live animations to 3 fps while keeping input handling on-demand — key events
still render immediately; only the idle animation loop is slowed — and
preserves the existing `animations: false` off switch.

## Current patch shape

One commit, `fix(tui): throttle pulse animations to 3 fps` (floating bookmark
`pulse-3fps`, same-day snapshot `pulse-3fps-20260818`), five files:

- `packages/tui/src/app.tsx:232` — renderer options use
  `targetFps: typeof config.animations === "number" ? config.animations : 3`
  instead of a hardcoded 60. Numeric config sets an explicit rate; boolean or
  unset config gets the 3 fps default.
- `packages/tui/src/app.tsx:246` — a handed-off renderer
  (`handoff.renderer.targetFps = options.targetFps`) also receives the
  throttle, since it was created with the old options before this call.
- `packages/tui/src/config/index.tsx:200` — the `animations` schema widens
  from `Schema.Boolean` to `Union([Boolean, Number.isGreaterThan(0)])`, so
  `animations: 3` (any positive fps) is valid config; `0` is rejected.
- `packages/tui/src/component/prompt/index.tsx:220` and
  `packages/tui/src/component/session-tabs.tsx:299,832` — animation gates
  change from `config.animations ?? true` to `config.animations !== false`.
  This matters because `0 ?? true` is falsy-but-not-null (would disable
  animations for a numeric value the schema now admits) and, more importantly,
  any positive number must count as "animations enabled"; only an explicit
  `false` disables.
- `packages/tui/test/config-v2.test.tsx:20` — regression test
  `validates animation frame rates`: `true` decodes, `3` decodes, `0` throws.

## Refresh history

- 2026-08-18 (first): feature authored directly atop `b0c3a16e` as `e70692db`.
- 2026-08-18 (re-freshen for the `working` rebuild): rebased onto the new
  `v2@origin` tip `044d04df` ("fix(cli): preserve clean build manifest").
  No upstream commit between `b0c3a16e` and `044d04df` touched any of the
  five files, so the rebase was conflict-free; the tree diff is identical
  (5 files, +14/−5). New tip `1ed0d82a`; both `pulse-3fps` and the same-day
  `pulse-3fps-20260818` snapshot point at it (same-day rebuild replaces the
  same-day snapshot per the manifest convention).

## Verification

From `packages/tui` (never repo root):

- `bun test test/config-v2.test.tsx` — 16 pass, 0 fail, 110 expect() calls
  (manifest records 16 passing; count unchanged by the rebase).
- `bun typecheck` (`tsgo -b`) — clean, exit 0.

## Open questions

- The numeric fps applies only to the renderer loop; per-component animation
  gates (marquee in `session-tabs.tsx`, fades in `prompt/index.tsx`) honor
  only the boolean on/off, not the rate. Do we want the number to slow those
  too, or is renderer-level throttling the whole story?
- Upstream shape: a boolean-or-number `animations` key overloads one config
  field with two meanings. An upstreamable variant might use
  `animations.fps` or accept the overload if upstream prefers one key.
- `handoff.renderer.targetFps` is set mutationally at
  `app.tsx:246` because the handoff renderer is created before config is
  resolved. If upstream ever constructs the handoff renderer config-aware,
  that line can go.

# Addendum 2026-08-20 — render-loop cost audit + configurable pulse timebase

## What the render loop actually costs (OpenTUI 0.5.4 source-verified)

Read from `@opentui/core` 0.5.4 (`chunk-node-tq0x9mbj.js`, bun cache) after a
concern that we might be "firing the pulse timer for non-used renders":

- **The loop is demand-driven, not a global ticker.** `Renderable.live`
  (counted only while `_visible`) propagates to the root; `liveRequestCounter
  > 0` starts the renderer, dropping to 0 pauses it and clears the timer
  (`:9440-9452`). Nothing live → zero frames, zero timers. Hidden/offscreen
  pulses drop their live count automatically (`set visible`, `:284-298`), so
  invisible tabs do not keep the loop awake. The "timer fires while idle"
  fear is unfounded.
- **While anything is live, every frame pays full price.**
  `canReuseCurrentRenderList()` returns false whenever `_liveCount > 0`
  (`:1471-1473`), so each frame re-walks the tree calling `onUpdate` on every
  visible renderable, then runs `renderSelf()` on every visible renderable —
  a full JS repaint of the screen into the buffer, with no per-renderable
  dirty check. The native diff discards unchanged cells afterward, so
  terminal I/O is minimal, but the JS redraw is paid regardless. A running
  session's sweep is live forever (`RUN_DURATION` cycles while `active`), so
  the loop ticks for the session's duration; each tick repaints the whole
  screen even though only the 1-cell sweep strip changed.
- Conclusion: `targetFps` reduced steady-state cost 20x (60→3 full repaints
  + tree walks per second) but cannot reduce it further; per-frame
  whole-screen JS work would need dirty-region rendering in opentui-core.
  Input/state-driven renders (`requestRender` → `scheduleRenderTimer`) use
  `minTargetFrameTime` from `maxFps` (60), so typing/output latency is
  unaffected by the throttle — confirmed at `:7602-7612`.

## `animationSpeed` (this round)

The 3 fps sampler made the authored-for-60fps timings look bad: `RUN_DURATION`
2800ms sampled 8x/cycle reads as discrete jumps. Added a configurable
timebase:

- `packages/tui/src/config/index.tsx` — new `animationSpeed` config key,
  `Number > 0`, optional; no resolved default (consumption-site default).
- `packages/tui/src/component/tab-pulse.tsx` — `speed` option + setter on
  `TabPulseRenderable`; the single scaling point is `onUpdate`, multiplying
  `deltaTime` before `inner.advance`/`outer.advance`, which uniformly retimes
  the sweep clock, all `Envelope` one-shots, and both `GatedEnvelope` voices.
  Changing speed does not `requestRender` (it only retimes future ticks).
- `packages/tui/src/component/session-tabs.tsx` — `pulseSpeed` memo in both
  tab components, passed to all five `<TabPulse>` call sites:
  `config.animationSpeed ?? (typeof config.animations === "number" ? 1 : 0.2)`
  i.e. default playback 0.2 (5x slower, so at 3 fps the sweep front moves
  ~1.2 cells/frame — a readable crawl), but authored speed 1 when the user
  sets an explicit numeric fps, since a fast sampler shows authored timing as
  designed.
- `packages/tui/test/config-v2.test.tsx` — `validates animation playback
  speed` (0.2 and 1 decode; 0 and -1 throw).

## Verification (2026-08-20)

From `packages/tui`: `bun test test/config-v2.test.tsx` — 17 pass / 0 fail /
114 expects; `bun typecheck` clean.
