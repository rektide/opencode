# Animation Rate Design

This directory prepares the OpenCode V2 TUI animation-rate patch tracked as
entry 13, "TUI animation FPS throttle", in
[`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md#tui-animation-fps-throttle-animations-number--boolean--new).

The immediate investigation found two related but distinct improvements:

1. Let users retain animations at a configured frame rate instead of choosing
   between 60 fps and fully disabled animations.
2. Stop `TabPulseRenderable` from setting `live = true`. A live renderable
   starts OpenTUI's renderer-wide continuous loop, so one animated tab redraws
   the complete TUI every frame. The pulse should instead advance from elapsed
   monotonic time and ask for one render only when its next visual sample is
   due.

The implementation handoff is
[`prompt0.gpt5.md`](/.design/anim-rate/prompt0.gpt5.md). It records the runtime
measurements, relevant source seams, constraints, proposed commit slices, and
verification expected from the next agent.

## Workspace

- Workspace: `~/src/opencode-anim-rate`
- Shared repository trunk: `dev`
- Patch bookmark: `anim-rate`
- Scope: V2 `packages/tui`; avoid `packages/opencode`
