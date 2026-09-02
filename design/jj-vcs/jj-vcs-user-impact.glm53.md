---
type: Analysis
title: jj-vcs features — what they actually do for the user
description: Plain-user-terms explanation of the three never-understood feature areas in the local jj-vcs stack (project copies, working-copy labels, working-copy snapshots), with an honest keep/rebuild/miss-it verdict for each.
resource: design/jj-vcs/jj-vcs-user-impact.glm53.md
tags: [vcs, jujutsu, project-copy, tui, snapshots, keep-or-drop]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T00:00:00Z }
verified: { by: unassigned, at: never }
stale_after: 2026-10-01
sources:
  - id: local-stack
    resource: "jj-vcs stack, commit range c29968bf0850..ca1d2bb5606e (12 commits)"
    title: Local jj-vcs WIP (rektide)
  - id: key-files
    resource: packages/core/src/project/copy.ts, copy-strategies.ts, vcs/jj.ts, project.ts; packages/tui sidebar/footer.tsx, prompt/index.tsx, prompt/move.tsx
  - id: upstream-plugin
    resource: "cc7d4ebb packages/core/src/plugin/vcs/jj.ts (jj-vcs-plugin branch)"
    title: Upstream jj VCS plugin (Shoubhit Dash)
  - id: snapshot-probe
    resource: .test-agent/jj-snapshot-probe/probe-result.txt
    title: Empirical auto-snapshot probe, jj 0.40.0
---

# What the jj-vcs features actually do for you

This is the companion to [`jj-vcs.glm53.md`](jj-vcs.glm53.md): that doc compared
our stack against upstream's and deliberately skipped "why would a user care".
This doc is only about user impact. Everything below was read out of the actual
code at `ca1d2bb5606e`; snapshot claims were verified live against jj 0.40.0
(see [`.test-agent/jj-snapshot-probe/README.md`](../../.test-agent/jj-snapshot-probe/README.md) — output
recorded in `.test-agent/jj-snapshot-probe/probe-result.txt`).

One framing fact that makes all three areas make sense: **in this stack, every
jj workspace of one repository is one opencode project.** `jjDiscover` in
[project.ts](/packages/core/src/project.ts) derives the project ID from the
shared backing store (or its git remote), so `~/archive/anomalyco/opencode` and
`~/src/opencode-jj-vcs` — two workspaces of one repo — resolve to the *same*
project, sharing session history. The three features below are all different
consequences of that fact.

## 1. Project copies ("manage jj workspaces from inside opencode")

### What it is

A copy strategy registry in [copy.ts](/packages/core/src/project/copy.ts):
opencode keeps a per-project list of working directories in a database table
(`ProjectDirectories`, migration `20260815031744`), and each entry can be
*managed* by a strategy. The pre-existing `git_worktree` strategy wraps
`git worktree add/remove/list`; commit `424a6bc38601` added the parallel
`jj_workspace` strategy in [copy-strategies.ts](/packages/core/src/project/copy-strategies.ts)
wrapping `jj workspace add` / `forget` / `list`. Refresh walks each registered
root and re-imports whatever `jj workspace list` says, so externally-created
workspaces are harvested automatically. Commit `ca1d2bb5606e` made the
`strategy` parameter optional — the server handler in
[project-copy.ts](/packages/server/src/handlers/project-copy.ts) now picks
`jj_workspace` vs `git_worktree` from the project's VCS type, so callers never
choose. The delete path is deliberately protective: `JjWorkspace.remove`
refuses to `jj workspace forget` a workspace that has working-copy changes,
conflicts, or any non-empty commit after the base it was created at, unless you
pass `force` — and the TUI then shows you the file changes before confirming.

### What you see and can do

The TUI surface is the **`/move` command** (or palette → "Move session"), which
existed before this stack for git worktrees — the stack extends it to jj:

- The dialog lists **every workspace of your repo** (and git worktrees, on git
  projects), refreshed from `jj workspace list` when it opens. Your existing
  `~/src/<repo>-<variant>` directories appear here automatically, because
  [project.ts](/packages/core/src/project.ts) `persist` registers the canonical
  root and refresh re-imports the rest. You do not have to create variants
  through opencode for them to show up.
- **`ctrl+m` → type a name** creates a new jj workspace via `jj workspace add`
  (named `opencode-<slug>-<random>` internally, at `@` or a given base), moves
  the current session into it, and injects a synthetic reminder message that
  the working directory changed ([prompt/move.tsx](/packages/tui/src/component/prompt/move.tsx)
  `create` / `moveExistingSession`).
- **`ctrl+d` twice** on a managed row forgets the workspace and deletes the
  directory — with the "has uncommitted work?" guard and a diff preview dialog
  before the forced delete ([dialog-move-session.tsx](/packages/tui/src/component/dialog-move-session.tsx)
  `remove`).
- Moving a session between workspaces keeps the same project, so history,
  config, and tabs all follow.

Two placement quirks worth knowing: the **TUI** creates copies under
`<opencode data dir>/worktree/<projectID[:6]>/<name>` (app.tsx wires
`worktree: global.data + "/worktree"`), i.e. *not* next to your repo — while
the **web/desktop app** flow (new-session workspace bar, enabled for jj by
`ca1d2bb5606e`) creates them as a *sibling of the project directory*
(`getDirectory(projectDirectory)` in [submit.ts](/packages/app/src/components/prompt-input/submit.ts)),
which does match your `~/src/<repo>-<variant>` convention. The flows are
inconsistent on purpose or not, that's what the code does today.

### Without it (upstream jj support)

Upstream's jj plugin has no copy strategy for jj projects at all
(`strategy: undefined`). Concretely, on upstream: the `/move` dialog no longer
lists your jj workspaces (nothing populates the directory table for jj), `ctrl+m`
fails with "no project-copy strategy available", and there is no guarded
workspace deletion. You can still `jj workspace add` in a shell and re-open
opencode in the new directory — project identity works either way — you just
lose the in-app lifecycle and the cross-workspace session hopper.

### Verdict — would you miss it? **Yes; this is the one real feature.**

This is your actual workflow productized: you create and destroy
`~/src/<repo>-<variant>` workspaces constantly, and this feature makes that a
`ctrl+m` away, auto-lists every variant you already have, moves a live session
between them, and stops you from `forget`-ing a variant with uncommitted work.
If you switch to upstream detection, this is the piece worth re-building on
top (as `jj-vcs.glm53.md` already recommends). Two honest caveats: the TUI's
copy location doesn't match where you keep variants (the app flow does), and
the whole thing hard-depends on the `jj` binary being on PATH — with the
strategy silently offering nothing otherwise.

## 2. Working-copy labels ("which jj change am I on?")

### What it is

`VcsJj.info` in [vcs/jj.ts](/packages/core/src/vcs/jj.ts) runs one
`jj log -r @` template plus `jj workspace list` and returns a
`workingCopy` struct (schema in [schema/src/vcs.ts](/packages/schema/src/vcs.ts)):
label, workspace name, change ID, commit ID, bookmarks, description,
conflicted, empty. The label is "first bookmark on `@`, else the first 12
chars of the change ID". Core's [vcs.ts](/packages/core/src/vcs.ts) returns
`{ branch: {}, workingCopy }` for jj and re-runs the adapter on every
`vcs.get`; it deliberately skips the branch-metadata file-watcher refresh that
git gets, so jj info refreshes when clients sync, not on file events.

### What you see and can do

Almost all of the data is invisible. Everything rendered anywhere is the
**label**:

- The prompt line prefix and the sidebar footer both show
  `~/src/opencode-jj-vcs:zzkqywsunwts` instead of a bare path
  ([prompt/index.tsx](/packages/tui/src/component/prompt/index.tsx) line ~1416,
  [sidebar/footer.tsx](/packages/tui/src/feature-plugins/sidebar/footer.tsx)).
  For git this slot shows the branch; for jj it shows your bookmark or change
  ID — so at a glance you know which workspace/change a session is attached
  to, which is genuinely useful when several variants of one repo are open.
- The web app's new-session workspace bar (non-prod channel) shows the same
  label per workspace, and the session page's "changes" review now works for
  jj projects (commit `75f82c274ee7` un-gated it from `vcs === "git"`).

The rest — workspace name, change/commit IDs, full bookmark list, description,
**conflicted and empty flags** — is computed, schema'd, shipped to the client,
and rendered by nothing. It's plumbing without a faucet.

### Without it

Upstream's jj plugin reports `branch.current = first bookmark on @` and
`default = trunk` — computed with `--ignore-working-copy`, so it's cheap and
never touches the repo. You'd still see `dir:bookmark` whenever `@` carries a
bookmark; you'd see nothing when it doesn't (no change-ID fallback), and no
workspace/conflict data (which nothing displays today anyway). The session-page
review also works upstream since it gates on the plugin's adapter.

### Verdict — would you miss it? **Barely. Nice, thin, partially redundant.**

The visible delta vs upstream is one thing: a change-ID label when `@` has no
bookmark. The rest is unrendered data and a workspace-bar nicety. It's cheap to
keep and harmless, but if you're deciding what to rebuild after switching to
upstream detection, this is last in line — and if you do rebuild it, note that
half the schema (conflicted/empty/changeID/…) is currently dead weight unless
you add UI for it. It would be worth keeping only if you actually want a
"this workspace has conflicts" indicator, which the data already computes.

## 3. Working-copy snapshot behavior ("opencode mutates your jj repo by looking at it")

### What it is

jj auto-snapshots: before any command observes a repo from inside a workspace,
jj absorbs that workspace's uncommitted file edits into the working-copy
commit `@` (same change ID, new commit ID) — unless the command is passed
`--ignore-working-copy`. Our stack never passes that flag: `jjDiscover`
in [project.ts](/packages/core/src/project.ts) runs `jj git root` and
`jj workspace list` on every project resolve; the label path runs
`jj log -r @` + `jj workspace list`; diff/status run `jj diff`/`jj log`
(those arguably *should* snapshot); and copy refresh runs
`jj workspace list` at every server boot (`refreshAfterBoot`) and every time
the move dialog opens. Verified empirically on jj 0.40.0
(`.test-agent/jj-snapshot-probe/`): **every command our stack runs snapshots,
except `jj workspace root`** — including `jj git root` and `jj workspace list`,
which look read-only.

### What you see and can do

You don't "do" anything — this is a side effect, and it cuts both ways:

- **Good:** opencode's own file edits get absorbed into `@` promptly, so when
  you run `jj st` in your terminal it's always current, and the label/diff
  surfaces never show a stale working copy. Also, jj being jj, the end state is
  identical to what your own next `jj` command would have produced — this
  changes *when* snapshots happen, not *what* they contain.
- **Bad:** "read-only" opencode paths mutate the repo. Every project open runs
  several snapshotting subprocesses (each stats all tracked files — noticeable
  on big repos); in colocated repos every snapshot also auto-exports refs to
  the git side, which can startle git-side tooling and file watchers; and if a
  snapshot collides with *your own* concurrent `jj` invocation (lock
  contention), our code swallows the failure — in the adapter that degrades to
  empty diff/status, and worse, in `jjDiscover` it returns `undefined`, which
  silently demotes the project to a plain `directory:` project until the next
  successful resolve. An agent tool that rewrites repo state from its
  detection path is a real discipline smell, not just a perf nit.

### Without it

Upstream's detection is filesystem-only (never runs `jj`), and its metadata
commands (`bookmark list`) pass `--ignore-working-copy`; only diff/status
snapshot, which is the correct split. Switching to upstream **removes** the
implicit mutation entirely. You lose nothing you can see: your own jj usage
snapshots your working copies anyway.

### Verdict — would you miss it? **No — it's a bug-shaped feature; fix, don't keep.**

There is no scenario where you miss the implicit snapshots: the "freshness"
benefit is what any jj command you run yourself already provides, and the
costs (silent degradation on lock contention, repo mutation from detection,
snapshot storms on large repos) are all downside. Whichever stack survives,
adding `--ignore-working-copy` to every metadata/discovery invocation — while
keeping it off the intentional diff/status paths — is a straight improvement,
matching `jj-vcs.glm53.md`'s recommendation.

## Summary table

| Area | User-visible surface | Without it (upstream) | Miss it? |
| --- | --- | --- | --- |
| Project copies | `/move` dialog: list/create (`ctrl+m`)/delete (`ctrl+d`) jj workspaces, session hopping | dialog empty for jj, no create/delete; shell `jj workspace add` still fine | **Yes — rebuild** |
| Working-copy labels | `dir:bookmark-or-changeid` in prompt + footer; app workspace bar | `dir:bookmark` only when `@` is bookmarked | **Barely — optional** |
| Auto-snapshots from detection | none visible (side effects: eager absorption, lock errors, silent project demotion) | detection never runs `jj`; metadata is read-only | **No — adopt `--ignore-working-copy`** |

## Surprises found while reading

- The `/move` dialog, keybinds, and copy API all pre-exist for git worktrees in
  the base commit; the stack's contribution is the jj strategy plus automatic
  VCS-based strategy selection — smaller than it sounds, riding a
  pre-existing feature.
- `conflicted` / `empty` / `changeID` / `commitID` / `workspace` are computed
  and shipped end-to-end but never rendered — a conflict indicator would be
  nearly free to add in the footer if wanted.
- Refresh preserves the recorded creation `base` across re-imports
  (`f69fe057c438`) specifically so the delete-guard keeps working — a subtle,
  thoughtful touch.
- `jjDiscover` also shells out to **git** (`git remote get-url origin` against
  the backing store) during jj discovery — detection spawns up to 4
  subprocesses per resolve, each (except `workspace root`) a potential
  snapshotter.
- Core's jj info skips the file-watcher-based refresh git gets
  (`vcs.type !== "jj"` guard in [vcs.ts](/packages/core/src/vcs.ts)), so the
  footer label refreshes only when the client re-syncs — it can lag behind a
  bookmark you set in your terminal.

## Cross-references

- [`jj-vcs.glm53.md`](jj-vcs.glm53.md) — the concern-by-concern technical
  comparison against upstream's `jj-vcs-plugin` branch and the integration
  recommendation ("take upstream's detection, keep our product") that this
  doc's verdicts assume.
- [`packages/core/src/project/copy.ts`](/packages/core/src/project/copy.ts) and
  [`copy-strategies.ts`](/packages/core/src/project/copy-strategies.ts) — the
  copy registry, the `jj_workspace` strategy and its delete guard.
- [`packages/core/src/vcs/jj.ts`](/packages/core/src/vcs/jj.ts) — the adapter
  behind labels, diffs, and every snapshotting invocation.
- [`packages/core/src/project.ts`](/packages/core/src/project.ts) — `jjDiscover`:
  workspace→project identity and the detection-time snapshots.
- [`packages/tui/src/component/prompt/move.tsx`](/packages/tui/src/component/prompt/move.tsx)
  and [`dialog-move-session.tsx`](/packages/tui/src/component/dialog-move-session.tsx) —
  the `/move` flow users actually touch.
- [upstream plugin `vcs/jj.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/plugin/vcs/jj.ts) —
  the `--ignore-working-copy` discipline this stack lacks.
- `.test-agent/jj-snapshot-probe/` — the live probe backing the snapshot claims.
