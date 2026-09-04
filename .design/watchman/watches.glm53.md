---
type: Analysis
title: VCS-internal watch targets for the watchman backend
description: Precise guidance on which git and Jujutsu files/directories the watcher should track despite the VCS-dir exclusions, what each target's events mean, and what watching unlocks for the jj-vcs feature line (live labels, conflict indicator, cross-workspace awareness).
resource: .design/watchman/watches.glm53.md
tags: [watchman, vcs, jujutsu, git, watching]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T09:15:00Z }
verified: { by: unassigned, at: never }
stale_after: 2026-10-02
sources:
  - id: vcs-watch-code
    resource: packages/core/src/vcs.ts (branch-metadata watcher, jj guard)
    title: What core watches today
  - id: op-heads-probe
    resource: opencode-jj-vcs .test-agent/jj-flow-probe + ad-hoc probes (jj 0.40.0)
    title: op_heads mtime behavior across read-only / snapshot / bookmark / workspace operations
    last_modified: 2026-09-02
---

# VCS-internal watch targets

## Situation

The watchwoman deployment deliberately does **not** track VCS repositories —
the exclusions keep churn (`.git/objects`, jj's store and index) out of the
watch stream. That is the right default, but core does want a *few*
VCS-internal signals, and today they are either missed or not wired at all:

- **git**: `packages/core/src/vcs.ts` subscribes to `FileSystem.Event.Changed`
  filtered to `HEAD` under the resolved store, refreshing info and publishing
  `VcsEvent.BranchUpdated` on branch change. With VCS dirs excluded from the
  watcher, these events never fire in this deployment — and even when they
  do, only `HEAD` is watched, so bookmark moves on the same branch are
  invisible.
- **hg**: `<store>/branch`, same wiring.
- **jj**: the watcher block is explicitly skipped (`vcs.type !== "jj"`), so
  jj info refreshes only when something calls `Vcs.info()` — the label lag
  recorded in the jj-vcs user-impact analysis (terminal-side commits and
  bookmark moves never propagate to the footer until a client re-sync).

This document proposes the precise allowlist — the minimal set of
VCS-internal targets worth letting through the exclusions — and what each
unlocks. Everything below was verified against jj 0.40.0 on 2026-09-02
(probes under `opencode-jj-vcs/.test-agent/jj-flow-probe/` plus ad-hoc
op_heads checks).

## The watch matrix

| VCS | Target | Fires when | Unlock | Noise |
| --- | --- | --- | --- | --- |
| git (any) | `<store>/HEAD` | branch switch | live branch label + `VcsEvent.BranchUpdated` (already wired in core) | near-zero |
| git (any) | `<store>/refs/heads/` (dir) | local branch create/move/delete | label refresh when a bookmark moves under you; needed for `main+N`-style labels on git | low |
| git (any) | `<store>/packed-refs` | fetch / gc rewrites refs | remote-tracking updates become visible | low, bursty |
| jj — both layouts | `<repo>/.jj/repo/op_heads/heads/` (dir) | **every state-changing jj operation**: commit, snapshot, bookmark move, workspace add/forget, rebase — repo-wide, from any workspace | the invalidation signal for everything below | low: read-only commands write nothing (verified) |
| jj — colocated only | the two git targets above | raw `git` use on the colocated checkout (invisible to op_heads until the next jj operation) | sees git-driven ref changes immediately | low |
| hg | `<store>/.hg/branch` | branch switch | already wired | near-zero |

**Keep excluding** everything else: `.git/objects/**`, `.git/index`,
`.git/logs/**` (reflog churn), `.jj/repo/store/**` (backing git objects),
`.jj/repo/index/**`, `.jj/working_copy/**`, `.jj/repo/op_store/**` (append
history; `op_heads` is the live summary and sufficient).

### The op_heads target, precisely

`.jj/repo/op_heads/heads/` is a directory of operation-head files that jj
rewrites on every state change, compacting as it goes (add+remove pairs —
watch **creates and removes**, not just creates). Verified behavior:

- `jj log --ignore-working-copy` (our metadata discipline): no change —
  our own refresh calls cannot feed back into the watcher.
- plain `jj log` with a dirty tree (auto-snapshot): rewritten.
- `jj bookmark set`, `jj workspace add`: rewritten — including when run
  from a *different* workspace of the same repo.

One structural note for workspaces: only the **main workspace's** `.jj/repo`
is the real directory; secondaries hold a pointer file. A watcher rooted at
a secondary workspace cannot find op_heads through its own `.jj` — resolve
the pointer to the main repo first (exactly what jj-vcs's filesystem-only
`jjDiscover` does since `0b2dc399`; in core, `vcs.store` already holds the
resolved repo dir, so the target is simply
`<vcs.store>/op_heads/heads`).

## What this unlocks

Watching is an *invalidation signal*, not data — every unlock below pairs
the event with the cheap metadata reads jj-vcs already has (`--ignore-working-copy`,
no snapshot side effects). What the events buy is *when to read*:

1. **Live working-copy labels.** The `bookmark` / `main+5` label refreshes
   the moment you commit or move a bookmark from the terminal — closing the
   lag the user-impact doc found. Debounce the burst (one jj command can
   write several operations, e.g. rebase) and re-read `info()`.
2. **Conflict indicator.** `info.conflicted` is already computed and shipped
   but rendered by nothing (user-impact surprise note) — an op_heads event
   is exactly the trigger a footer badge needs.
3. **Fresh copy lists.** `jj workspace add`/`forget` from the shell fires
   op_heads; the `/move` dialog's jj-workspace list can re-list instead of
   staying stale until reopened.
4. **Cross-workspace awareness.** The op log is repo-global: terminal jj in
   workspace B refreshes state in a session living in workspace A — no
   per-workcase watching exists anywhere else in the system today.
5. **Re-resolution triggers.** Workspace add/forget changes the workspace
   set; an op_heads event can prompt `Project.resolve` re-runs so identity
   and directory rows track the real world.

What watching does **not** unlock: commit contents (reading still costs a
jj call — the watch only says "something changed"), working-tree change
detection (the ordinary file watcher already covers the tree; VCS-internal
watching is about *repo state*), and snapshotting (jj owns that; our
metadata calls deliberately never trigger it).

## Implementation sketch for jj-vcs

In `packages/core/src/vcs.ts`, replace the `vcs.type !== "jj"` guard with a
jj branch of the same subscription shape:

- target: `path.join(vcs.store, "op_heads", "heads")` (store is the resolved
  repo dir since `0b2dc399`);
- filter: `FileSystem.Event.Changed` whose file is inside that directory
  (creates *and* removes);
- debounce ~250ms, then `state.info = yield* impl.info()` and publish a
  label-change event (reuse `VcsEvent.BranchUpdated` or add a jj variant);
- no watcher-interest plumbing exists for the VCS layer today — the
  watchman backend routes declared interests, so landing this likely needs
  the same interest-declaration seam watchman added for skills (see the
  watchman README's routing notes) or a core-declared interest.

And in the watchwoman config: allowlist exactly the matrix above —
`.git/HEAD`, `.git/refs/heads/**`, `.git/packed-refs`,
`.jj/repo/op_heads/**` — keeping every other VCS path excluded. That is the
"target this more precisely" ask, made concrete.

## Verification checklist

- [x] op_heads rewrites on snapshot/bookmark/workspace ops; silent for
      `--ignore-working-copy` reads (probes, jj 0.40.0).
- [ ] Terminal `jj commit` in a secondary workspace updates the footer label
      of an open session in another workspace of the same repo.
- [ ] `/move` copy list reflects a shell-side `jj workspace add` without
      reopening the dialog.
- [ ] Watch stream stays quiet during an agent-driven status/diff burst
      (metadata reads write no operations).

## Cross-references

- [`README.md`](README.md) — watchman feature notes, watcher-interest
  routing, and the deployment's exclusion policy this allowlist amends.
- [`draft2.gpt56t.md`](draft2.gpt56t.md) / [`fallbacks0.glm53.md`](fallbacks0.glm53.md) —
  backend selection and fallback behavior the VCS targets must ride on.
- jj-vcs line: [`design/jj-vcs/jj-vcs2.glm53.md`](../../../opencode-jj-vcs/design/jj-vcs/jj-vcs2.glm53.md)
  (comparison revision with the detection flow this feeds) and
  [`design/jj-vcs/jj-vcs-user-impact.glm53.md`](../../../opencode-jj-vcs/design/jj-vcs/jj-vcs-user-impact.glm53.md)
  (the label lag and unrendered-conflict findings this addresses).
- `~/ado/patches.md` — *Native Jujutsu VCS support* (bookmarks, verdicts)
  and *Watchman retained backend* (accepted feature this doc extends).
