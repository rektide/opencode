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

# Addendum 2 — 2026-08-20 — unconditional animationSpeed, throttle raised to 8 fps

## Removing the fps/speed pairing

The first `animationSpeed` round paired playback with the `animations` config
type: numeric fps implied authored speed (1.0), boolean/unset implied 0.2.
That made perceived duration a hidden function of two knobs — worse, at an
8 fps default, `animations: true` and `animations: 8` would run the same loop
at different playback speeds, decided only by a type check. The multiplier is
now unconditional: `config.animationSpeed ?? 0.2` in both tab components.
Semantics are orthogonal — `animations` (fps) sets the sample rate and render
cost, `animationSpeed` sets the timebase. Authored timing at any fps is
`animationSpeed: 1`.

## Throttle 3 fps → 8 fps

`app.tsx` fallback `targetFps` raised from 3 to 8 (125ms frames). At the 0.2
default the sweep cycle runs `2800/0.2` = 14s with ~112 samples (~0.5 cell of
front movement per frame — a smooth crawl). One-shot envelopes stretch
likewise: edge flash 800ms→4s, completion 1.2s→6s, glow release 900ms→4.5s;
tune via `animationSpeed` without touching fps. Idle-animation cost rises to
8 full repaints + tree walks per second (vs 3), still 7.5x below the 60 fps
baseline; input/output renders remain at maxFps cadence.

## Verification

From `packages/tui`: `bun test test/config-v2.test.tsx` — 17 pass / 0 fail;
`bun typecheck` clean.

# Addendum 3 — 2026-08-20 — default playback multiplier 0.2 → 1/3

Both `pulseSpeed` memos now default to `config.animationSpeed ?? 1 / 3`. At
the 8 fps throttle the sweep cycle runs `2800 * 3` = 8.4s with ~67 samples
(~0.8 cell of front movement per frame); one-shots land at 3x authored
duration: edge flash 2.4s, completion 3.6s, glow release 2.7s, glow ignition
1.8s. Tests (17 pass) and typecheck clean from `packages/tui`.

# Addendum 4 — 2026-08-20 — per-channel animationSpeed object

`animationSpeed` now accepts a number (scales every voice) or an object
tuning the four pulse voices independently — `sweep`, `edge`, `completion`,
`glow` — with `rest` as the fallback for unspecified voices. Resolution
order: explicit channel > `rest` > per-channel default; defaults are
sweep 1/3, everything else 2/3 (so unset config, `{}`, and
`{ sweep: 1/3, rest: 2/3 }` are equivalent; a bare number N sets all four).

- `tab-pulse.tsx` — `PulseSpeeds` type, `PulseSpeedConfig`, exported
  `resolvePulseSpeeds` + `DEFAULT_PULSE_SPEEDS`; `PulseState.advance` now
  scales each envelope's delta by its own channel rate (sweep covers both
  the sweep clock and its run envelope); renderable option `speed` widened
  to `speeds` with per-field change detection.
- `config/index.tsx` — schema widened to
  `Number | Struct({ sweep?, edge?, completion?, glow?, rest? })`, all
  positive-only.
- `session-tabs.tsx` — both memos resolve through `resolvePulseSpeeds(config
  .animationSpeed)`; all five `<TabPulse>` sites pass `speeds`.

At the 8 fps throttle with defaults: sweep cycle 2800/(1/3) = 8.4s (~67
samples), edge flash 1.2s, completion 1.8s, glow release 1.35s / ignition
0.9s.

## Verification

From `packages/tui`: `bun test test/config-v2.test.tsx` — 17 pass / 0 fail /
118 expects (object-form cases added); `bun typecheck` clean.

# Addendum 5 — 2026-08-29 — refresh onto e70d667a

## What moved

Duplicate-then-rebase refresh of the whole workspace line (bookmark commit +
the four `animationSpeed` WIP commits + docs) from old base `044d04df` onto
the `v2@origin` tip `e70d667a9fe3` ("fix(ai): preserve Anthropic finish
across usage deltas (#46171)"). Originals and the dated snapshots
(`pulse-3fps-20260813/-20260817/-20260818`) are untouched; `pulse-3fps` and
the new same-day `pulse-3fps-20260829` point at the duplicated feature tip
`nxmmunnlmpmm` / `64535f4d1a0f`.

## Conflicts and adaptations

- No textual rebase conflicts: upstream `044d04df..e70d667a` touched none of
  the files this line edits (verified per-commit and via the final tree
  diff, which is unchanged in shape).
- One semantic adaptation folded into the feature commit: upstream added
  `packages/tui/src/routes/session/sidebar.tsx` (session sidebar route)
  whose `title_shimmer` passes `enabled={config.animations ?? true}` into a
  strictly-boolean prop. The widened `animations: boolean | number` schema
  broke `bun typecheck` there (`TS2322`). Adapted to
  `enabled={config.animations !== false}` (sidebar.tsx:56) — the same
  number-means-enabled convention the feature already uses in
  `prompt/index.tsx` and `session-tabs.tsx`; the adjacent
  `config.animations === false` dim check on line 59 needed no change.
- No upstream equivalent of the feature landed: no `animationSpeed`,
  `resolvePulseSpeeds`, or pulse-fps throttle exists in `e70d667a`. The only
  other `targetFps` upstream is the mini runtime's own fixed 30
  (`src/mini/runtime.lifecycle.ts:163`), which is out of scope here.

## Verification (2026-08-29)

From `packages/tui` (after `bun install` at the workspace root):

- `bun test test/config-v2.test.tsx` — 22 pass, 0 fail, 167 expect() calls
  (up from 17/118 on 2026-08-20; the delta is upstream test growth plus the
  animation cases — `validates animation frame rates` and
  `validates animation playback speed` both pass).
- `bun typecheck` (`tsgo -b`) — clean, exit 0, verified both at the
  bookmarked feature commit standalone and at the full workspace tip.

# Addendum 6 — 2026-08-30 — refresh onto 6a2c3e91c780

## What moved

Duplicate-then-rebase refresh of the whole workspace line (8 commits: feature
code, test pin, and docs) from old base `e70d667a9fe3` onto the `v2@origin`
tip `6a2c3e91c780` ("feat(plugin): add typed rpc and custom events
(#46105)"). The originals and all dated snapshots
(`pulse-3fps-20260813/-20260817/-20260818/-20260829`) are untouched;
`pulse-3fps` and the new same-day `pulse-3fps-20260830` point at the
duplicated line's tip (this docs commit included, per the bookmark
convention).

## Overlap with upstream plugin/RPC work — both intents preserved

Upstream `6a2c3e91c780` also touches `packages/tui/src/app.tsx`: it renames
`tuiPluginDirectories` → `localPluginDirectories` (the import and the
`pluginDirectories` call), part of the typed-RPC/custom-events plugin
rework. The feature's `app.tsx` hunks live in the distinct renderer-options
region (`targetFps` fallback and the `handoff.renderer.targetFps`
propagation). The regions do not overlap, so the rebase merged cleanly with
**zero textual conflicts**, and the merged tree was inspected to confirm
both sides: the renamed `localPluginDirectories` import/call (upstream
intent) alongside `targetFps: typeof config.animations === "number" ?
config.animations : 8` and the handoff assignment (feature intent). No other
upstream commit in `e70d667a..6a2c3e91` touches any file this line edits
(verified per-file with `files()` revsets).

## Diffstat

Freshened line vs `6a2c3e91c780` is identical in shape to the previous line
vs `e70d667a9fe3`: the same 9 files, +356/−17, before this docs commit.
No file the old line did not touch; no diff creep. Upstream `6a2c3e91c780`
and `4df30295366b` changed `package.json`/`bun.lock`, so `bun install` was
re-run at the workspace root before verification.

## Verification (2026-08-30)

From `packages/tui`:

- `bun test test/config-v2.test.tsx` — 22 pass, 0 fail, 167 expect() calls
  (identical to the 2026-08-29 baseline; the animation frame-rate and
  playback-speed cases pass).
- `bun test test/component/tab-pulse.test.tsx` — 8 pass, 0 fail, 170
  expect() calls (matches the manifest's tab-pulse count).
- `bun typecheck` (`tsgo -b`) — clean, exit 0.

## Confidence

High. Mechanical rebase with zero conflicts; the one same-file overlap
(`app.tsx`, plugin/RPC rename vs renderer throttle) is a trivial
region-disjoint union verified in the merged tree; focused-test and
typecheck counts match the previously recorded baseline exactly.

# Addendum 7 — 2026-09-01 — refresh onto 43d09b9d

Duplicate-then-rebase of the 9-commit line from `6a2c3e91` onto `v2@origin`
`43d09b9d75ad`. One textual conflict (sidebar.tsx `title_shimmer` relocation,
feature gate re-applied at the new site) plus five schema-widening typecheck
adaptation lines in `one-cell-spinner.tsx` / `footer.view.tsx`. Verification:
config-v2 22 pass, tab-pulse 8 pass, TUI typecheck clean. Full record:
[`refresh-20260901.glm53.md`](/refresh-20260901.glm53.md). Note: the freshen
instruction named baseline `ce6247bd2f28`, which does not exist in the repo;
the actual fetched `v2@origin` is `43d09b9d` (distances 97/43 match the
instruction exactly) — see the refresh note's baseline section.

# Addendum 8 — 2026-09-03 — refresh onto 7ba5f3e5

Duplicate-then-rebase of the 10-commit line from `43d09b9d` onto `v2@origin`
`7ba5f3e5b220` ("fix(core): restore Ctrl+C in Windows terminals (#47163)").
Zero textual conflicts and zero forced adaptations: the 181-commit delta
touches 4 of this line's files but every hunk region is disjoint, and no
animation/fps equivalent landed upstream. Diffstat identical to the previous
line (12 files, +534/−22). Verification: config-v2 21 pass (upstream rewrote
one test there: 22→21), tab-pulse 8 pass, TUI typecheck clean. Tip
`pulse-3fps` = `pulse-3fps-20260903` = `a81f97c3`; `pulse-3fps-20260901`
untouched. Full record:
[`refresh-20260903.glm53f.md`](/refresh-20260903.glm53f.md). Watch item:
upstream upgraded OpenTUI to 0.5.10 in this delta; the README's 2026-08-20
render-loop audit cites 0.5.4 line numbers.
