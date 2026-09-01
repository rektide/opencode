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

### 2026-09-01 — freshened onto `43d09b9d75ad`

- New base: upstream `v2@origin` tip `43d09b9d75ad5d74cda5bd29ab72319e724fbbb9`
  ("fix(server): await plugin activation when checking updates"), replacing
  `e70d667a9fe3` (115-commit gap). **Baseline note**: the freshen mandate named
  target `ce6247bd2f28` ("estimate context growth before compaction"), which
  does not exist anywhere in the shared jj repo; the 115-commit count in the
  mandate matches the actual fetched tip `43d09b9d75ad`, and the human
  confirmed freshening onto it.
- Collision audit: clean. Upstream landed no export/question formatting — the
  only adjacent TUI landings are transcript *remount caching*
  (`afd7492018c7`), patch-failure detail coloring (`367ee47d7eb8`), and the
  landed-then-reverted subagent-question surfacing (`9c39e75ce2bf` /
  `e56ceed32bcf`, net zero). `dialog-export-options.tsx` and both focused test
  files are untouched by the gap; the `index.tsx` overlap is disjoint from
  every feature hunk (feature edits the export call site ~1216 and the
  formatters ~3880+; upstream edits imports/memos, ~1349, ~2031, ~3080–3790).
- Duplicate-then-rebase of the four commits (originals untouched;
  `export-qa-20260829` still marks `1df1b60492a7`): rebased **cleanly — zero
  conflicts, zero adaptations**. Freshened ids: `c25432226f53` (answers),
  `0e9a37d47806` (options toggle), `2976a461719d` (design notes),
  `f6374a5363f9` (prior refresh doc).
- Footprint on the new base is **identical** to the previous line's: 5 files,
  +306/−7. The freshened line touches no file the old line did not touch, and
  nothing was dropped or adapted because upstream changed.
- Verification (from `packages/tui` after clean `bun install`, no
  `bun.lock` drift):
  - `bun test test/cli/tui/transcript-export.test.ts` — 6 pass, 0 fail,
    15 expect() calls.
  - `bun test test/cli/tui/inline-tool-wrap-snapshot.test.tsx` — 12 pass,
    0 fail, 2 snapshots, 31 expect() calls.
  - `bun typecheck` (`tsgo -b`) — clean.
- Bookmarks: `export-qa` advanced to the new docs tip below;
  `export-qa-20260901` created at the same commit. Workspace `@` left as an
  empty commit on the tip.
- Confidence: high — the only judgment call in this freshen was the mandate's
  non-existent baseline hash (resolved with the human, see above); the rebase
  itself was mechanical with a byte-identical footprint.

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
