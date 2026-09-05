---
type: Report
title: jj-vcs composition assessment 1 — engineering tradeoffs
description: Independent decision-support opinion on the unbookmarked 62-commit compose in opencode-working, focused on engineering tradeoffs of the jj-vcs feature against upstream #47358's worktree re-architecture.
resource: .design/compose-20260904/assess-jjvcs1.glm53.md
tags: [jj-vcs, compose, worktree, assessment, decision-support]
status: draft
generated: { by: llm:glm53, at: 2026-09-04T23:30:00-04:00 }
stale_after: 2026-10-04
sources:
  - id: upstream-base
    resource: jj:23f3f8b6ca61
    title: v2@origin compose base — #47358 strategy/state/editor worktree architecture
  - id: feature-line
    resource: jj:a01a597f04d0
    title: jj-vcs-rektide feature tip (15 commits on 7ba5f3e5b220)
  - id: accepted-port
    resource: jj:97b06ee96f0e
    title: working/working-20260904 — morning accepted port of the same feature
  - id: table-ownership
    resource: design/jj-vcs/table-ownership0.glm53max.md
    title: Table ownership directive, incident record, migrate-away plan
  - id: followups
    resource: design/jj-vcs/followups.glm53.md
    title: jj-vcs known follow-ups ledger
  - id: stance
    resource: design/jj-vcs/jj-vcs2.glm53.md
    title: Danger catalog, ID-space analysis, carrying-cost tiers
  - id: upstream-check
    resource: design/jj-vcs/upstream-check-20260902.glm53.md
    title: Upstream movement probes and orphaned jj-vcs-plugin finding
---

# jj-vcs composition assessment 1 (glm53)

Second independent reviewer, engineering-tradeoff angle. I read the upstream
base's machinery, the composed tip end-to-end, the feature line, and the
accepted `working` port, re-ran the focused suites and typechecks, and ran the
upstream movement probes fresh. I did not read assessor 0's output.

## The situation, as I find it

The 62-commit stack is real, coherent, and greener than the framing suggests.
What the compose actually did to jj-vcs is **not** scar-tissue grafting: it
re-derived the feature onto upstream's new idioms (`State`/`Editor`,
`setWhere` ownership guards, the `local` location guard, location nodes,
`operationError` wrapping), and in several places the composed result is
*better* than both the feature line and the accepted morning port. The
semantic core the operator is worried about — multi-source discovery,
projectID threading — turns out to be **feature-line DNA already live in the
accepted `working` deployment since this morning**, not choices minted under
conflict pressure today. What today's compose minted is smaller and mostly
upstreamward. The genuinely new liabilities are a metadata-backfill wart I
found (not in the admitted list), the standing `worktree.metadata` column
liability (documented, unscheduled), and the unreviewed-provenance problem
itself.

Verified evidence:

- `packages/core`: 105/105 pass across `worktree-jj`, `vcs-jj`, `worktree`,
  `project`, `database-migration`, `filesystem/ignore`, `ripgrep`,
  `instructions/builtins` (18.5s, live jj suites included); `bun run
  typecheck` clean; `packages/app` typecheck clean.
- All 9 code commits of the 15-commit feature line are present as distinct
  commits in the stack, plus the 6 docs commits, plus two riders
  (`23820c8482b8` migration-lineage guard, `3228ac139af5` client regen).
- Upstream probes (run 2026-09-04 evening): `bee852b5cf82`,
  `46465000a0e0`, `cc7d4ebb` all still **unmerged** into `origin/v2`;
  `origin/jj-vcs-plugin` still exists, unmoved; no `jj.ts` under
  `packages/core/src/plugin/vcs/` on `origin/v2` (only `git.ts`, `hg.ts`);
  no `.jj` recognition in v2's `project.ts`.

## 1. What #47358 bought, and whether our feature fights it

Upstream's re-architecture bought four things, all visible in `worktree.ts`
at `23f3f8b6ca61`:

1. **Strategy as data.** `State.create` + `Editor.add/configure` +
   `State.Transformable<Editor>` — strategies become runtime-registerable
   state instead of hardcoded calls, with plugin reach-through
   (`ctx.worktree.transform`, `ctx.vcs.transform` in `plugin/host.ts`).
2. **Row ownership discipline.** `ops.create`'s `setWhere` — "discovery may
   claim an unowned row, but never replace another strategy's ownership."
3. **Location scoping.** The `local` guard (workspace locations reject
   create/remove/refresh), location-only discovery ("a location's plugin
   instances only discover its own checkout, not sibling clones"),
   `makeLocationNode`.
4. **A normalization of error flow** — `operationError` wrapping, typed
   `Error` union, `InvalidDirectoryError` canonical checks.

**Complement (most of the feature):**

- The **VCS provider half is already native**: `plugin/vcs/jj.ts` registers
  via `ctx.vcs.transform((editor) => editor.add({ id: "jj", ... }))`, sitting
  beside upstream's `plugin/vcs/git.ts`/`hg.ts`. This is feature-line DNA
  (present in `0d96e98b85bd`), not a compose invention. Zero fight.
- The **identity layer** (`project.ts` `jjDiscover`: `.jj/repo` dir-vs-pointer
  probe, `store/git_target`, cache-first `git-remote:`/`jj-store:` hashing)
  is orthogonal to #47358 entirely — it lives below the worktree subsystem
  and complements the re-architecture's location model cleanly.
- **`--ignore-working-copy` metadata discipline** (all metadata-class jj
  invocations) complements the location-scoping philosophy: reads don't
  mutate the working copy.

**Fight (two real axes, one cosmetic):**

- **Discovery breadth.** Upstream probes only `location.project.directory`
  (when registered); we probe every stored *unowned* row. See §3.
- **Table ownership.** The `worktree.metadata` column mutates a core-owned
  table — already an incident producer, with a sanctioned migrate-away plan
  in [`table-ownership0.glm53max.md`](../../design/jj-vcs/table-ownership0.glm53max.md).
- Cosmetic: `JjWorkspaceError` (a jj-specific tagged error) sits in the core
  `Worktree.Error` union and `operationError` passthrough — seam leakage a
  plugin-shaped jj strategy wouldn't have.

**The registration choice nobody admitted:** jj's *worktree* strategy is
hardcoded into `worktree.ts`'s initial `strategies` map rather than arriving
via the plugin seam. I would have made the same call — upstream's
`Editor.add` sets `selected = strategy.id`, so plugin-registering jj would
flip the default strategy to jj_workspace for *every* project, including git
ones; the built-in registration with `vcsDefault` selection in `create()` is
the only shape that works without amending upstream's editor semantics. But
it means when upstream eventually lands its own jj support (their orphaned
line is plugin-shaped), ours and theirs will disagree about where jj lives.
That's the actual long-term divergence to manage, and it should be a named
fact in the review, not an accident.

## 2. Coherence review of the composed files

**`packages/core/src/worktree.ts` (tip)** — reads like one system. Every
load-bearing upstream idiom survives verbatim: the `local` guard, the
`setWhere` comment and logic, `State`/`transform`/`reload` on the interface,
canonical + `InvalidDirectoryError`, `operationError`, the destination-exists
suffix loop. The feature's additions layer *on top* rather than *instead*:
second builtin strategy in the initial map, `vcs` field + `vcsDefault`
selection (strictly better than the feature line's `StrategyID.make(vcs ??
"unknown")` fabrication and the accepted port's equivalent), `metadata` in
`StoredInput`/ops, projectID threading, and the multi-source discovery
block. Scar-tissue spots, all minor:

- `refresh()`'s `toReversed()` iteration order is load-bearing (map overwrite
  decides which strategy claims a directory both can list) and unexplained by
  any comment. The collision case is mostly theoretical (git worktree list
  and jj workspace list enumerate disjoint kinds), but it deserves the same
  class of comment upstream wrote for `setWhere`.
- The compose grafted upstream's `setWhere` onto the feature's pre-SELECT
  `changed` computation in `ops.create`. Sound (guarded writes still return
  `false`; the pre-check only suppresses no-op writes), but it is now a
  two-layer write path where upstream has one statement — the most
  "resolved-conflict-looking" code in the file.

**`packages/core/src/worktree/jj.ts`** — the best file in the feature.
Coherent module: `\0`-template parsing with record filtering, create that
resolves the base commit then re-lists to confirm the workspace exists before
reporting success, and a genuinely careful remove ladder (identity check
against stored metadata, forgotten-workspace handling with `forceRequired`,
working-copy/conflict/committed-work probes before non-force removal,
forget-from-a-sibling-workspace, directory removal after forget with error
reporting). The safety probes in `remove` intentionally run *without*
`--ignore-working-copy` because they need the snapshot — correct, and the
inverse of the list-path discipline. No notes.

**`packages/schema/src/worktree.ts`** — clean union
(`git_worktree | jj_workspace`), optional `projectID`/`base`. One contract
tightening to flag: `Info` now *requires* `strategy` and `metadata`. The
plugin host decodes strategy results through `Worktree.Info`
(`decodeWorktree`), so third-party strategies compiled against upstream's
`{ directory }` shape fail decode. Pre-1.0, ecosystem is nascent — fine to
ship, but it is a quiet breaking change to #47358's plugin contract and
belongs in the review list.

## 3. Verdicts on the admitted semantic deltas

### Delta 1 — feature-style discovery (probe stored sources) over location-only

**Ship it.** Three reasons:

- It is not new-today: the identical `sourceDirectories =
  checked.filter(item => item.strategy === undefined && item.exists)` block
  is in the accepted `working` port (`97b06ee9`). The operator already lives
  with these semantics in production since this morning.
- It is *behaviorally close* to upstream for the common case. Upstream probes
  the location's registered directory; `jj workspace list` enumerates the
  whole repo from any workspace, so even upstream's shape would surface all
  workspaces for a jj project. The real delta is clone breadth (probing every
  registered canonical root, so workspaces of sibling clones attach to the
  shared project identity — which is the feature's stated purpose, "cross-
  workspace jj identity") and subprocess fan-out.
- The fan-out is bounded: strategies are filtered by project VCS
  (`jjDiscover` classifies on open, so nearly every project is classified),
  and unclassified projects are markerless — `persist` writes no rows for
  them, so the probe-everything path is nearly dead code. Worst case remains
  the same *cost class* as upstream's own refresh-on-`list()` (subprocess per
  strategy per root per list call). Fine locally; a debounce/caching pass
  would be a nice-to-have, not a correctness need.

What I'd want before calling it done forever: the unowned-row probe set is an
implicit contract now — if upstream ever changes what `strategy: undefined`
means for a row (e.g., "unknown" vs "source root"), our discovery semantics
shift silently. That's a watch item, not a blocker.

### Delta 2 — optional projectID threading (superset API)

**Ship it, with eyes open.** This is the one admitted delta where the compose
made the API *wider* than both parents, and the direction is right: upstream
takes no projectID (implicitly the location's project), the accepted port
*required* it on `refresh` — optionality restores upstream's no-arg shape
while keeping the feature's cross-project reach. Reachability check: the
protocol payloads carry the schema types (`Worktree.CreateInput`/`RemoveInput`
include optional `projectID`), and the plugin host passes payloads through,
so HTTP and plugins *can* target another project's rows; `LocationQuery`
still gates which location executes, and `atWorktree` rejects workspace
refs.

Production scenario analysis (multi-project server): each root location holds
its own `Worktree` service instance; a cross-project write races the target
project's own refresh — but discovery is idempotent, `setWhere` prevents
ownership theft, and row ops run in transactions, so the worst case is
duplicated subprocesses and interleaved no-op writes, not corruption. The
real hazard is forward-compat: upstream's architecture currently assumes a
location owns its project's rows; if upstream ever builds on that invariant
(per-location sharding, row locking), our threading silently violates it.
Keep the field, keep it in the watch list.

### Delta 3 — upstream's local guard kept

**Ship it; this is the correct answer.** The guard is upstream's seam for
"worktree ops are root-location-only" and the feature had no need to break
it: jj workspace ops run fine from the project's primary directory, and the
composed `source()` falls back to `ops.primary(projectID)` before
`location.project.directory`, so root locations whose directory differs from
the registered primary still resolve sources correctly. The compose also
hoisted a mirror of the guard into the plugin host's `atWorktree`
(`ref?.workspaceID → UnsupportedLocationError`) — earlier, clearer failure
than upstream's fail-deeper-in-refresh; harmless. One asymmetry to know:
`create`/`remove`/`refresh`/`list` all fail on workspace locations, which
means an opencode session *inside* a jj workspace (opened as a workspace
location) cannot manage its sibling workspaces from there. That matches
upstream intent; it is a UX consequence to document, not fix.

### Delta 4 — upstream tests edited to fit

**Ship it.** I count four touches, not two: `worktree.test.ts` (+1:
strengthens an assertion with `metadata: { type: "git_worktree" }`),
`filesystem/ignore.test.ts` (+2: `.jj` added to ignore fixtures),
`ripgrep.test.ts` (+6: `.jj` exclusion assertions added),
`instructions/builtins.test.ts` (asserted env line changes from
`"Is directory a git repo: yes"` to `"Version control: git"`). Three of the
four *add* coverage. The builtins one is the only upstream-contract edit: the
feature changes the agent-visible environment instruction from a boolean to
a VCS name. Justified by the reclassify commit's purpose, but it means every
session prompt in jj projects reads differently — worth a line in release
notes, nothing more.

### Not admitted, found in review

1. **Metadata backfill suppression (real wart).** `ops.create`'s pre-check
   treats `current.metadata === null` as "no change", so a row inserted by
   `persist()` — which registers a visited non-canonical workspace *without*
   metadata — never acquires metadata from refresh (strategy already
   matches, metadata null → `changed = false`, write skipped). Consequence:
   for workspaces first registered by opening them, `remove` sees no stored
   metadata → `expected` undefined → non-force removal fails with "creation
   base is unknown, force required", and force *skips the safety ladder
   entirely*. Not corruption; a degraded safety path on one registration
   route. Fix is small (backfill when incoming metadata is non-null and
   stored is null and strategies match, or have `persist` leave strategy
   null for discovery to claim). Needs a test either way. This is my
   strongest objection-quality finding, and it's a feature-line bug exposed
   — not introduced — by the compose.
2. **`Info` required fields** tighten the plugin-strategy contract (§2).
3. **`JjWorkspaceError` in the core error union** — seam leakage (§1).
4. **`refresh` base-preservation** only fires when stored metadata exists
   with a matching workspace name — the wart in (1) also means
   persist-registered workspaces can't protect their `base`. Same fix
   addresses both.

## 4. Trajectory: carry, freshen, or upstream

The cost curve of carrying ours, given upstream is actively iterating:

- Upstream moved the worktree seam once (35 commits, one day). Our feature
  touches ~7 seams (schema, core worktree, project identity, vcs provider,
  plugin host, protocol/client, TUI/app). Per-compose conflict surgery cost
  scales with both. **But this compose already paid the largest toll** — the
  re-derivation onto `State`/`Editor`/`setWhere`/location-nodes — and the
  result is *closer to upstream's idioms than the accepted port is to the old
  ones*. The marginal carry cost of the next compose just dropped sharply.
- Upstream's own jj work remains dormant: three commits unmerged,
  `jj-vcs-plugin` orphaned on deleted marker machinery, no `jj.ts` beside
  `plugin/vcs/git.ts`, no `.jj` recognition in `project.ts` (probes re-run
  today, results above). There is no imminent collision — but there is also
  no sign upstream stopped caring; `plugin/vcs/{git,hg}.ts` is exactly where
  their jj would land, and our `vcs/jj.ts`-in-core + builtin worktree
  strategy would then be the odd shape out.
- The durable liabilities are (a) the `worktree.metadata` column — a
  demonstrated incident producer with a sanctioned, phased, *unscheduled*
  migrate-away plan — and (b) the builtin-vs-plugin registration divergence
  (§1), which only a deliberate rearchitecture or upstream convergence
  resolves.

A proper FRESHEN of jj-vcs — re-deriving in its own workspace against the
new seams, with tests, per [`jj-vcs2.glm53.md`](../../design/jj-vcs/jj-vcs2.glm53.md)'s
promotion recommendation — remains the durable move, but its content has
changed since that doc was written: today's compose already did the
seam-re-derivation half (under worse conditions). What a deliberate
freshen/additional pass should now contain is concrete and bounded:

1. The `rektide_jj_worktree` migrate-away (phases 1–3 of the table-ownership
   plan) — kills the standing time bomb.
2. The metadata-backfill fix + test (§3, found item 1).
3. A decision on registration shape (keep builtin + document why, or amend
   `Editor.add` with add-without-select and go plugin-shaped), recorded in
   the design docs.
4. The upstream-PR path for the detection tier (jj-vcs2 tier 1) when
  upstream motion resumes.

Freshen-vs-surgery, honestly weighted: surgery cost is now low *because* the
hard re-derivation is done; a from-scratch freshen would mostly re-prove
what's already green. The expensive thing to keep doing is *unreviewed*
surgery — which is a process fix (this assessment, operator review), not a
code fix.

## Recommendation

**(d) Accept-now + schedule a deliberate jj-vcs rearchitecture freshen**,
gated on a short operator review — not (a), (b), or (c).

- Not (b) defer: the composed semantics are the *same feature semantics the
  operator accepted this morning* in `working`, on a newer base, with better
  idiom fit, and fully green. Deferral re-does verified work to satisfy
  procedure, while the procedural harm (unreviewed choices) is cured by
  review, which is cheaper than re-composition.
- Not (c) park: punishes five unrelated green features for one feature's
  review debt.
- Not bare (a): accepting without scheduling leaves the documented
  `worktree.metadata` time bomb and the backfill wart as open-ended
  liabilities. (d) = (a) plus two scheduled follow-ups (migrate-away;
  backfill fix) plus the recorded registration-shape decision.

The operator review list — the specific things to eyeball, in the code, once:

1. `worktree.ts` refresh: the `sourceDirectories` block + VCS filter
   (feature DNA, production-accepted).
2. `worktree.ts` `ops.create`: the pre-check + `setWhere` double layer, and
   the `current.metadata !== null` condition (the wart).
3. `schema/src/worktree.ts`: `Info` requiring `strategy`/`metadata`
   (plugin-contract tightening).
4. `instructions/builtins.ts` + its test: the env-line change
   (`Version control: git`) — agent-visible.
5. The builtin jj strategy registration + `vcsDefault` (vs plugin seam).
6. `worktree/refresh.ts`: the boot-refresh drop-in replacing the accepted
   port's `refreshAfterBoot` (waits for plugin activation, skips workspace
   locations — upstream-shaped, verified present).
7. The riders: `23820c8482b8` (pragma-guarded ALTER, three-worlds test) and
   `3228ac139af5` (generated client only).

## Evidence

- `bun test` (packages/core): worktree-jj, vcs-jj, worktree, project,
  database-migration, filesystem/ignore, ripgrep, instructions/builtins —
  105 pass / 0 fail.
- `bun run typecheck`: packages/core clean; packages/app clean.
- Upstream probes: `git merge-base --is-ancestor` for the three jj commits →
  all unmerged; `git ls-tree origin/v2 packages/core/src/plugin/vcs/` →
  git.ts, hg.ts only; `git grep '\.jj' origin/v2 -- .../project.ts` →
  empty; `origin/jj-vcs-plugin` present, unmoved.
- Lineage: `jj log -r '23f3f8b6ca61..@'` (62 commits, tip `3228ac139af5`),
  feature line `7ba5f3e5b220..a01a597f04d0` (15 commits, 9 code + 6 docs,
  all 9 code commits present in the stack), accepted port `97b06ee9`.

## Cross-references

- [`table-ownership0.glm53max.md`](../../design/jj-vcs/table-ownership0.glm53max.md)
  — the incident, the directive, and the migrate-away plan my recommendation
  schedules; my assessment treats it as authoritative.
- [`followups.glm53.md`](../../design/jj-vcs/followups.glm53.md) — the
  ledger; my found items (backfill wart, `Info` contract) should be added
  there when confirmed.
- [`jj-vcs2.glm53.md`](../../design/jj-vcs/jj-vcs2.glm53.md) — carrying-cost
  tiers and the freshen-on-promotion stance my trajectory section updates.
- [`upstream-check-20260902.glm53.md`](../../design/jj-vcs/upstream-check-20260902.glm53.md)
  — probe definitions; I re-ran them, results current as of 2026-09-04
  evening.
- [`jj-vcs-user-impact.glm53.md`](../../design/jj-vcs/jj-vcs-user-impact.glm53.md)
  — what the feature does for users; the safety-ladder degradation in §3
  found-item 1 lands squarely in its "copies" section's concerns.
- `.design/compose-20260904/` — this wave's directory; assessor 0's report
  lands here independently (deliberately unread).
