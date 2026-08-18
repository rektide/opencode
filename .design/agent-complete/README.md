# Clickable subagent completion notices

When a background subagent finishes, the parent transcript shows a one-line
notice — `↳ <Agent> finished · <description>` — and nothing else. That notice
is inert. The only click path into the child Session is the original
`subagent` tool-launch row, which can be hundreds of lines up the transcript
(or visually collapsed away). Worse, the notice is the *only* thing the user
sees of a background child: the child's final output lives in the synthetic
message text that only the parent LLM reads, so clicking through is currently
the only way for the human to see what the child actually said — and the
affordance to do so is missing.

This patch makes the completion notice itself hover-highlight and navigate
into the child Session. It is a TUI-only, client-side change: everything
needed is already persisted in the synthetic message metadata.

## Current behavior

```mermaid
sequenceDiagram
    participant P as Parent session
    participant C as Child session
    participant T as TUI transcript
    P->>C: subagent tool, background=true
    T-->>T: launch row: "General Subagent — desc" (clickable, metadata.sessionID)
    C-->>P: job completes
    P->>P: notifyWhenDone → injectCompletion<br/>synthetic message, metadata { source: "subagent", childID, agent, state }
    T-->>T: notice row: "↳ Agent finished · desc" (static text, childID ignored)
```

- **Launch row** — the `Subagent` tool-part component
  (`packages/tui/src/routes/session/index.tsx:2877`) reads
  `metadata.sessionID` and navigates on click:

  ```ts
  onClick={() => {
    const id = sessionID()
    if (id) navigate({ type: "session", sessionID: id })
  }}
  ```

  at `index.tsx:2894-2897`.

- **Completion injection** — when the subagent runs in the background (either
  `background=true` at launch or the foreground block being backgrounded
  mid-run), core arms `notifyWhenDone`
  (`packages/core/src/tool/plugin/subagent.ts:96-119`). When the child job
  settles, `injectCompletion` (`subagent.ts:80-93`) writes a synthetic parent
  message via `runtime.session.synthetic` whose text wraps the child's final
  output in `<subagent sessionID="..." state="...">...</subagent>` and whose
  metadata is `{ source: "subagent", childID, agent, state }` with `state` one
  of `completed | error | cancelled`.

- **Notice row** — `SessionNoticeMessageV2`
  (`packages/tui/src/routes/session/index.tsx:1658-1701`) renders that message
  as a static single line inside a plain `<box>`/`<text>`, two-tone heading
  (`↳ Agent finished` / `! Agent failed` / `! Agent cancelled`) plus truncated
  description suffix. It has no mouse handlers and never reads `childID`.

- **Shell notices share the renderer** — background shell completions inject
  the same message shape with `metadata: { source: "shell", state }`
  (`packages/core/src/tool/plugin/shell.ts:118`). There is no child Session
  and no `childID`; those notices must stay inert.

## Design

In `SessionNoticeMessageV2`, the `completion()` branch (`source` is
`"subagent"` or `"shell"`) becomes interactive when a `childID` is present —
which is exactly the subagent case:

- **Clickable for every terminal state.** `completed`, `error`, and
  `cancelled` notices all navigate. A failed child's transcript is the
  post-mortem; withholding navigation there would be the least useful case to
  leave broken.
- **Hover semantics mirror `InlineTool`** (`index.tsx:2383-2416`): track a
  local hover signal, brighten the heading to `theme.text.default` on hover
  while the row is clickable, restore the state color otherwise.
- **Mouse-up with selection guard**, exactly like `InlineTool` at
  `index.tsx:2409-2416`: ignore the click when
  `renderer.getSelection()?.getSelectedText()` is non-empty so drag-selecting
  the notice text never navigates.
- **Navigate like the launch row**: `useRoute().navigate({ type: "session",
  sessionID: childID })` (`index.tsx:2894-2897`).

Two rendering shapes were considered:

- **A — keep the custom markup, attach handlers** (minimal diff): add the
  hover signal and `onMouseOver`/`onMouseOut`/`onMouseUp` to the existing
  `<box marginLeft={3}>`. Preserves the exact two-tone styling.
- **B — reuse `InlineToolRow`** (recommended): render through
  `InlineToolRow` (`index.tsx:2423`), which already accepts the mouse props
  and lays out `paddingLeft={3}` plus the `INLINE_TOOL_ICON_WIDTH` icon
  column. Using icon `↳` aligns the notice's icon column with the launch
  row's `✓`, making launch and completion read as the same visual family.
  The two-tone heading/suffix survives as rich `<span>` children (the row
  applies a single `fg` only to text without its own style); hover color
  brightening is still computed at the call site since `InlineToolRow` takes
  colors, not hover logic. The existing wrap-snapshot coverage
  (`packages/tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx`) covers
  this geometry.

Either shape satisfies the requirement; B is preferred for alignment with
the launch row, A is the acceptable fallback if the span styling fights
`InlineToolRow`'s label handling.

### Explicit non-goals

- No core, protocol, or schema changes — `childID` is already in the durable
  synthetic message metadata; nothing new needs to be persisted.
- No mini-renderer work (`packages/tui/src/mini/footer.subagent.tsx` renders
  its own child rows).
- No new composer/subagents-tab behavior — "Navigate to subagent" already
  exists there (`packages/tui/src/routes/session/composer/subagents-tab.tsx`).
- No keyboard activation — transcript rows are not focusable today; see open
  questions.

## Verification

- Focused TUI test rendering `SessionNoticeMessageV2` with a synthetic
  subagent-completion message (metadata `{ source: "subagent", childID,
  agent, state }`), asserting the row is clickable and navigation fires for
  `completed`, `error`, and `cancelled`, and that a shell notice (no
  `childID`) is not clickable. Follow the harness patterns in
  `packages/tui/test/cli/tui/inline-tool-wrap-snapshot.test.tsx`.
- `bun typecheck` from `packages/tui`.
- Live pass: `bun run dev:live` from this worktree, prompt the agent to
  launch a background subagent, let it finish, and click the completion
  notice without scrolling.

## Baseline note

This workspace currently sits on the background-service reap feature line;
before implementation, rebase onto the current `v2@origin` tip per the
freshen procedure in the `working` manifest
(`~/a/doc/opencode/patches.md`). The feature itself depends on nothing but
upstream — it composes with any accepted stack.

## Open questions

- Hover affordance beyond brightening: append a `→`/`open` hint, underline
  the heading, or swap the `↳` icon on hover?
- Should the notice ever show the child's output inline (expand on click)
  instead of navigating? Navigation is the established pattern (launch row,
  subagents tab) and the immediate ask; inline expansion can come later.
- A child Session deleted after completion: `navigate` would target a missing
  session. The launch row has the same unguarded behavior today; matching it
  is acceptable, but a guard could degrade to inert.
- Keyboard path: is there a future where transcript rows (notices included)
  are keyboard-selectable, so Enter opens the child the way click does?
