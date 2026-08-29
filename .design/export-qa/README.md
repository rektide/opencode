# Session Markdown export includes Q&A — `export-qa`

Implements patches.md idea #10 ("Session Markdown export includes question
answers") plus the "show all options" extension: exporting every offered
option, not just the answer taken.

## Motivation

Q&A from the `question` tool is decision context. The TUI renders it as
question/answer pairs, but Markdown export sent every tool part through the
generic input/output formatter, making Q&A noisy (`**Tool: question**` plus a
JSON blob of `state.input`) and easy to miss. JSON export retains the raw tool
input and answer metadata unchanged.

## Patch shape

Two feature commits on top of upstream `v2@origin`:

1. **`feat(tui): emit question answers in transcript export`** —
   `packages/tui/src/routes/session/index.tsx`:
   - `formatSessionTranscript(session, messages, thinking)` is now exported
     and special-cases completed `question` tool parts (matched through the
     existing `toolDisplay(name) === "question"` dispatch used by the TUI
     renderer). Each question renders as `**Question:** <text>` followed by
     `**Answer:** <labels>`; multi-select answers join with `, `; empty
     answers render `(no answer)`, mirroring the TUI's inline rendering.
   - New `formatQuestionTranscript` helper does the per-question formatting
     and returns `undefined` for non-completed parts or when answers metadata
     is missing, which falls back to the generic tool output (legacy
     transcripts).
2. **`feat(tui): show all question options in export dialog`** —
   - `packages/tui/src/routes/session/index.tsx`: gains an `allOptions`
     parameter; `parseQuestions` now also returns each option's
     `label`/`description`. When enabled, each question lists every offered
     option as a Markdown task list with `[x]` on taken options and `[ ]` on
     the rest, each description on its own indented line.
   - `packages/tui/src/ui/dialog-export-options.tsx`: new "Show all question
     options" checkbox (markdown format only, tab order after "Include
     thinking"). Custom typed answers appear only in the answer line and
     check no option box.

The `/export` slash command passes the toggle through; `/copy` keeps the
default (answers only, no option list).

## Verification

- `bun test test/cli/tui/transcript-export.test.ts` — 6 focused tests: single
  answer, multi-part prompt order, multi-select join, unanswered marker,
  option list hidden/shown by the toggle (with descriptions), generic
  fallback on missing metadata.
- `bun test test/cli/tui/inline-tool-wrap-snapshot.test.tsx` — updated
  `parseQuestions` assertion, 12 pass.
- `bun test test/cli/tui/` — 168 pass, 1 skip.
- `bun typecheck` from `packages/tui` — clean.

## Open questions

- Should `/copy` also expose the options toggle, or remain the compact form?

## Refresh log

### 2026-08-29 — freshened onto `e70d667a9fe3`

- New base: upstream `v2@origin` tip `e70d667a9fe3` ("fix(ai): preserve
  Anthropic finish across usage deltas (#46171)"), replacing `33567c57`.
- Duplicate-then-rebase of the three feature commits (new ids `bfd4ff50`,
  `d6a4caf`, `0083c7d8`) rebased **cleanly: zero conflicts**. Upstream
  neither moved the export formatter nor landed question-answer export
  natively (`formatSessionTranscript` stays in
  `packages/tui/src/routes/session/index.tsx` next to
  `toolDisplay`/`parseQuestions`; the dialog stays in
  `packages/tui/src/ui/dialog-export-options.tsx`), so no re-homing or
  resolution was needed.
- Bookmarks: `export-qa` and `export-qa-20260829` point at the fresh tip
  (`wttszzyo` / `0083c7d8`); dated `export-qa-20260819` remains untouched on
  the original line (`xmlpuvzz` / `a709dd8d`).
- Verification (from `packages/tui` after `bun install` at the workspace
  root):
  - `bun test test/cli/tui/transcript-export.test.ts` — 6 pass, 0 fail,
    15 expect() calls.
  - `bun test test/cli/tui/inline-tool-wrap-snapshot.test.tsx` — 12 pass,
    0 fail, 2 snapshots.
  - `bun typecheck` — clean.
