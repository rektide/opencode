---
type: Review
title: jj-vcs compose assessment 0 — verdicts on the halted 2026-09-04 evening stack
description: Independent decision-support opinion on the seven semantic judgment calls in the unbookmarked 62-commit composition, plus trajectory analysis and a recommendation among accept / defer / park.
resource: file:///home/rektide/src/opencode-working/.design/compose-20260904/assess-jjvcs0.glm53.md
tags: [compose, jj-vcs, worktree, review, opencode]
status: stable
generated: { by: llm:glm53, at: 2026-09-04T23:15:00-04:00 }
sources:
  - id: halted-stack
    resource: jj:23f3f8b6ca61..@
    title: Unbookmarked 62-commit evening composition on v2@origin 23f3f8b6ca61
  - id: feature-line
    resource: jj:jj-vcs-rektide@a01a597f04d0
    title: jj-vcs feature line (16 commits on 7ba5f3e5b220)
  - id: morning-port
    resource: jj:working-20260904@97b06ee96f0e
    title: Morning-accepted composition on 211cd73f1ab7
  - id: feature-docs
    resource: jj:jj-vcs-rektide design/jj-vcs/way-forward0.glm53.md + table-ownership0.glm53max.md
    title: Feature line's own post-halt design notes (previous-wave material; no assessor reports read)
---

# jj-vcs compose assessment 0 (glm53)

Independent reviewer's opinion for the operator. I read no other assessor
report (none existed in `.design/compose-20260904/` at review time); the only
opinion-adjacent material read is the feature line's **own** design docs at its
tip (`design/jj-vcs/way-forward0.glm53.md`, `table-ownership0.glm53max.md`),
which are previous-wave feature material. All verdicts below were formed from
the four trees directly and only then cross-checked against those docs.

## Structure verification (all claims re-checked)

| Claim | Result | Evidence |
|---|---|---|
| 62-commit stack `23f3f8b6ca61..@` | **Confirmed** | `jj log -r '23f3f8b6ca61..@'` → 62 commits |
| Zero conflicts | **Confirmed** | all 62 report `clean` (`if(conflict, ...)` template) |
| Contiguous single-parent chain on the base | **Confirmed** | 63 commits in `23f3f8b6ca61::@`, 0 merges, single root `wqprpnmulmns` ("throttle pulse animations"), base is ancestor of `@` |
| Taxonomy 57 feature + 4 riders + 1 client-regen | **Confirmed** | 15 jj-vcs (9 code + 6 docs) + 42 other-feature + riders `nlzmrkspssur` (models.dev), `lpswmmqpvtow`/`xrrvymyzwmqk` (theme claims), `osqkzwutyvqr` (jj metadata migration guard — jj-specific), `tmmlzsrmmpns` (client regen — jj-specific) |
| Feature line "15 commits on 7ba5f3e5b220" | **16 now** | `7ba5f3e5b220..jj-vcs-rektide` = 16; the 16th is `zusqupqztkqo` ("propose way-forward ladder"), authored *tonight after the halt* — the line was 15 when composition began |
| Bookmark `jj-vcs-rektide` at `a01a597f04d0` | **Confirmed** | — |
| `working`/`working-20260904` at `97b06ee9` untouched | **Confirmed** | bookmark still on the morning composition (base `211cd73f1ab7`) |

The composed jj-vcs commits carry **new change-ids** (`zzkmyvspuuul`,
`ulywruswtqxq` appear only once, in the stack) — this compose **re-applied**
the feature rather than rebasing it, so every conflict resolution is a fresh
semantic decision, which is exactly what the operator is being asked to review.

**Focused suites (re-run from `packages/core`):** `bun test test/vcs-jj.test.ts
test/worktree-jj.test.ts test/worktree.test.ts test/vcs.test.ts
test/vcs-hg.test.ts test/plugin/worktree.test.ts test/project.test.ts` →
**110 pass, 0 fail, 6 skip** (all six skips are mercurial, environmental).
`bun run typecheck` (`tsgo -b`) → **clean**. The "110 pass" claim is exact.

**Seam isolation (morning vs evening):** morning base `211cd73f1ab7` (Sep 4
10:45 +02:00) is **35 commits behind** evening base `23f3f8b6ca61` (Sep 4
20:43 −04:00); those 35 commits are the worktree/plugin-strategy rebuild.
`packages/core/src/worktree.ts` at `working-20260904` is **byte-identical to
the feature line** — the morning port composed clean *because its base
predates the rebuild*, not because the line fits the new architecture. The
morning port will hit the identical 12-conflict wall at the next rebuild.

## Verdicts on the seven judgment calls

| # | Call | Verdict |
|---|---|---|
| 1 | Discovery policy: stored-source-directories replaces upstream's location-only | **jank** (as design; defensible as carrier) |
| 2 | `projectID` superset API on Create/Remove (+ optional refresh input) | **uncertain** → jank-leaning (wire-exposed, zero consumers) |
| 3 | Upstream's `local` guard kept in create/remove | **defensible** |
| 4 | `worktree.test.ts` "defaults to Git" expectation gains `metadata` | **defensible** |
| 5 | `worktree-jj.test.ts` re-fitted to Location/Global layer fakes | **defensible** (minor warts) |
| 6 | Strategy interface: `unknown` channels, `DuplicateStrategyError` dropped, `ListEntry` re-homed to schema | **defensible** (the model call) |
| 7 | VCS-derived strategy default via literal jj/git checks → `current.selected` | **defensible with a wart** |

### 1. Discovery policy — stored-source-directories vs location-only — **jank as a design, defensible as a carrier**

Evidence: composed `packages/core/src/worktree.ts:404-448` (commit `zzkmyvsp`
+ `ulywrusw`): refresh enumerates `checked.filter(strategy === undefined &&
exists)` as probe sources, with the comment "Discover from the project's
stored source directories so externally created jj workspaces are found;
strategies are filtered by project VCS." Upstream `23f3f8b6ca61` same file,
lines 318-336: probes **only** `location.project.directory` under the comment
"A location's plugin instances only discover its own checkout, not sibling
clones." The feature line (`jj-vcs-rektide`) had the stored-source policy; the
compose kept it verbatim.

Why jank-as-design: the reversal is **likely unnecessary for jj's model**.
`worktree/jj.ts` (byte-identical to the feature line) runs `jj workspace list
--ignore-working-copy` *from any checkout of the shared store*, and that
command enumerates **every sibling workspace**. Under upstream's location-only
policy, each non-workspace location probing its own checkout still surfaces
the complete sibling set for the project, because every jj sibling is itself a
discoverable checkout of the same store. The stored-source enumeration is
broader than the feature needs; it re-introduces exactly the cross-location
probing upstream's comment forbids (including probing stored *git sibling
clones* of the same project from an unrelated location). Mitigations exist —
VCS filtering (`projectVcs == null ? all : filter(s.vcs === projectVcs)`,
line 407), ownership guards (`setWhere ... isNull(strategy)`, line 258), and
error swallows for `DirectoryUnavailableError`/`JjWorkspaceError` (lines
420-423) — so it is mechanically safe and fully tested, hence "defensible as
an interim carrier". But it is the single highest-divergence resolution and
the most likely seam to re-conflict, and the code-level analysis says a
location-native shape would deliver the same feature without the divergence.

### 2. `projectID` superset API — **uncertain, jank-leaning**

Evidence: `packages/schema/src/worktree.ts:13,27` — `projectID:
optional(ProjectID)` on `CreateInput`/`RemoveInput` (feature had it
**required**; upstream has no such field). Core ops re-parameterized
(`worktree.ts:183-277`, `ops.*` take explicit `projectID`); `refresh` takes
`input?: {projectID?}` (`worktree.ts:138,389`) defaulting to the location's
closure project — a genuine hybrid: upstream's location identity as the
default, the feature's cross-project reach as an option.

Two facts sharpen this beyond "superset therefore fine":

- **It is wire-exposed and half-exposed.** The regenerated client
  (`tmmlzsrmmpns`, `packages/client/src/promise/generated/types.ts` ~6118+)
  publishes optional `projectID` on worktree create/remove, but the server
  handler `worktree.refresh` remains un-parameterized
  (`packages/server/src/handlers/worktree.ts:16-17`, identical to upstream).
  So cross-project *mutation* is public API while cross-project *refresh* is
  internal/test-only. That inconsistency is a smell, not a design.
- **No production consumer exists.** `rg` over `packages/app` + `packages/tui`
  shows every worktree.create/remove caller (`workspaces/create.ts`,
  `prompt/move.tsx`, `new-session/*`) omits `projectID`; only the tests pass
  it (`worktree-jj.test.ts:104-249`, always explicit). The superset currently
  buys nothing but the divergence, and it crosses a boundary upstream
  deliberately removed (upstream ops are closure-scoped; `changed()` even had
  to re-take `projectID`, `worktree.ts:183-185`).

The one real mitigation: it is a strict superset — every upstream-shaped call
behaves exactly as upstream. So this is not a correctness break; it is an
undocumented policy re-widening sitting in the public protocol. Uncertain
verdict: if a cross-project consumer (cotail, workspace UI) is imminent, this
is a defensible documented extension; nothing in the stack documents it.

### 3. `local` guard kept — **defensible**

Evidence: `worktree.ts:155-157` defines the guard (fail when
`location.workspaceID` set); enforced in `create` (295), `remove` (370),
`refresh` (390). The feature line had **deleted** `UnsupportedLocationError`
entirely (feature `worktree.ts` removes it from the `Error` union); the stack
restored it and even wired its server message back
(`handlers/worktree.ts` diff in `ulywrusw`). This is the most upstream-aligned
call of the seven: worktree ops from workspace-qualified locations stay
blocked, matching upstream's "manage from the primary checkout" UX. The
tension with the feature's cross-project semantics is real but latent — the
guard blocks *workspace-qualified locations*, while the superset API allows an
unqualified location to target another project; the tests never exercise that
combination adversarially (fixture `Location` has no `workspaceID`,
`worktree-jj.test.ts:17-37`). Coherent, conservative, and reversible.

### 4. Upstream test expectation edited — **defensible**

Evidence: `packages/core/test/worktree.test.ts:710-713` at `@` vs `23f3f8b6ca61`
same lines: the "defaults to Git" `toContainEqual` gains `metadata: { type:
"git_worktree" }`. This is the *entire* edit to upstream's worktree tests
(one line, per `zzkmyvsp` diffstat). It is not a weakened assertion —
`toContainEqual` still demands an exact row match; the row genuinely now
carries metadata because `worktree/git.ts` (in `zzkmyvsp`) emits it for both
`Info` and worktree `ListEntry`s. Editing upstream tests in-compose deserves
operator eyes (and got them — it's on the review list), but the edit tracks
the feature contract rather than hiding a regression. The alternative (suppress
git metadata) would diverge from the feature's own shape.

### 5. `worktree-jj.test.ts` re-fitted — **defensible, minor warts**

Evidence: the only diff between the feature's and the stack's jj test is the
~40-line fixture preamble: upstream's idiom (`AppNodeBuilder.build(..., [
Global.node.replace(...), Location.node.replace(Layer.succeed(...)) ])`,
`worktree-jj.test.ts:17-37`) replaces the feature's bespoke node graph, adding
`Git.node`/`FSUtil.node`. All six test bodies are byte-identical and still
pass explicit `projectID` (lines 104-249), which the optional-projectID API
accepts. Warts: (i) the fixture location is a **constant** tmpdir
(`opencode-worktree-jj-fixture`) — shared mutable state across runs/parallel
suites, a hygiene step down from per-test roots; (ii) the fake location's
project id (`jj-worktree-fixture`) differs from the project under test
(`jj-worktree-project`), so the tests quietly bake the cross-project superset
in as the *default* path — they verify the feature but do not protect
upstream's location-scoped contract for jj flows. Six tests, all green, real
`jj` binaries exercised (`$` shell usage preserved).

### 6. Strategy interface alignment — **defensible, and the model for the rest**

Evidence: `worktree.ts:98-114` — upstream's `Effect<..., unknown>` channels
kept (feature had typed unions `Git.WorktreeError | JjWorkspaceError |
DirectoryUnavailableError`); `Editor.add` delete-then-set semantics kept
(175-179), so `DuplicateStrategyError` is dropped along with the feature's
`register` API; `ListEntry` re-homed to the schema package with the feature's
`metadata` field added (`schema/src/worktree.ts:66-71`; upstream's at 40-44
had no metadata; the feature had defined it inline in core). All three moves
are toward the #47358 design — plugin strategies must return `unknown` since
they're arbitrary plugin code; `Editor.add`'s replace-not-error semantics is
what the strategy registry actually implements; schema is where protocol types
live. `JjWorkspaceError` survives as a core error with `forceRequired`
(`worktree.ts:79-84`) and is unwrapped through `operationError` (484-491) and
mapped in the server handler. This call is what a deliberate migration would
have done; nothing was lost that isn't recoverable if typed channels are ever
wanted back.

### 7. VCS-derived default via literal checks — **defensible with a wart**

Evidence: `worktree.ts:304-308`:
`vcsDefault = projectVcs === "jj" ? jjStrategy.id : projectVcs === "git" ?
gitStrategy.id : current.selected`, commented as "unclassified projects keep
the configured selection." Feature line behavior: unclassified projects
**errored** (`StrategyID.make(projectVcs ?? "unknown")` →
`StrategyUnavailableError`); upstream behavior: always configured selection.
The stack's synthesis preserves upstream's contract for unclassified projects
while honoring classification when present — behaviorally reasonable and
tested (the app UI's `workspaces/create.ts` change in `ulywrusw` even drops
its hardcoded `strategy: "git"` to lean on this default, and
`new-session/workspace/controller.ts` now treats `jj` like `git` for
new-session flows). The wart: `Project.Vcs` is an **open pattern string**
(`schema/src/project.ts:11`), not an enum — a project classified `hg` (hg
support exists; `vcs-hg.test.ts`) is *classified*, yet silently falls to
`current.selected` (git), contradicting the comment's "unclassified" framing;
and the literals duplicate data the `Strategy.vcs` tag (line 100) already
carries — `strategies` lookup by tag would remove both problems. Fails
loudly enough in practice (git strategy on an hg repo errors at
`git.repo.discover`), but it is a new synthesis neither parent had.

## Trajectory: one-time seam migration or ongoing collision?

**Ongoing collision pattern, with two compounding cost drivers.**

1. **Upstream is actively rebuilding exactly this subsystem.** The 35-commit
   morning→evening delta (one day!) is #47358 plugin strategies, location-only
   discovery, location-scoped ops, plus #47150/#47148 TUI restructures. This is
   the *second* seam shift in three days: the 2026-09-02 provider-era shift
   already forced one full rewrite of this feature
   (`design/jj-vcs/rewrite0/rewrite1`), and tonight's #47358 shift reproduced
   the same failure shape at a bigger seam (12/15 conflicts, multi-round
   resolutions). Of the six features composed tonight, only jj-vcs collided —
   because it is the only one whose semantics are *expressed in* the subsystem
   upstream keeps re-architecting. The jj semantic core itself (recognition,
   provider, bookmarks, labels, `--ignore-working-copy`, `jj.ts`) is
   base-agnostic and slid clean both times.
2. **The storage model is a standing time bomb independent of seams.** The
   metadata column ALTERs core's `worktree` table; the 2026-09-02 vs 09-04
   migration-id collision already took down the *deployed* build this morning
   (`duplicate column name: metadata`), and tonight's stack carries a **second
   idempotence bandage** (`osqkzwutyvqr`, pragma_table_info guard + two new
   migration tests) rather than the migrate-away the feature's own stable
   directive prescribes (`table-ownership0.glm53max.md`: feature lines never
   alter core tables; move to a `rektide_`-owned sidecar). Every future
   composition re-carries this ALTER and re-risks the lineage class of
   incident; if upstream ever adds its own `metadata` column, the collision
   becomes structural.

Relief is not imminent from upstream: their jj PRs (#45009, `jj-vcs-plugin`)
are unmerged and orphaned on machinery that v2 removed (2026-08-31), so no
convergence is coming; when they eventually land their own jj support it will
be a *supersession seam* — a third translation — unless our line is by then
native to their seams. Meanwhile the morning-accepted port, being
byte-identical old-architecture expression, pays the same 12-conflict wall at
the next no-freshen rebuild of its lineage. **Conclusion: every rebuild
re-costs this feature until jj-vcs is re-derived on the post-#47358 seams (or
superseded).** The cost is concentrated and predictable — which also means the
fix is well-scoped.

## The three options

### (a) Accept the stack after operator review

Possible: mechanically green (110/0 tests, clean typecheck, zero conflicts,
contiguous), and five of seven calls are defensible. But acceptance means the
operator knowingly blesses, into accepted `working`: the discovery-policy
reversal (call 1 — with a sufficient upstream-compatible alternative
demonstrated), a wire-exposed cross-project mutation surface with **zero
production consumers** and an internally inconsistent shape (call 2), and the
core-table ALTER + second bandage that the feature's own stable directive
says to eliminate. It also doesn't stop the recurrence — the remaining
divergences are precisely the seams upstream keeps moving. Acceptance would
institutionalize tonight's under-pressure judgment as policy.

### (b) Defer jj-vcs: rebuild the composition without it — **RECOMMENDED**

The procedure-correct raise the evening run failed to make, and the option
with the best cost shape:

- The budget exists for exactly this; deferring is compliance, not retreat.
- `working-20260904` remains a **working, previously-accepted carrier** of the
  full jj feature set on a one-day-older base. Nothing user-visible is lost
  tonight.
- Deferral is cheap mechanically: drop the 15 jj-vcs commits plus the two
  jj-specific riders (`osqkzwutyvqr`, `tmmlzsrmmpns`); the remaining 45
  commits (4 clean-composed features + 2 independent riders) are untouched by
  the jj semantics.
- The fix is already spec'd by the feature line itself (`way-forward0.glm53.md`):
  a rebuild ladder on the post-#47358 seams — rung 1 salvage recognition/
  provider verbatim (slid clean tonight, verified), rung 2 metadata
  migrate-away per the table-ownership directive (kills the incident class),
  rung 3 jj strategy registered through `Editor.add`/`State` (tonight's stack
  already proves the shape — call 6), rung 4 **location-native sibling
  discovery** (my code-level finding: sufficient, because `jj workspace list`
  from any checkout of the shared store enumerates all siblings; upstream's
  location-only policy then delivers the whole feature), rung 5 salvage
  workspace management + hardening (slid clean). Supersession trigger:
  upstream jj PR merging — then re-aim at their seams.
- Keep tonight's unbookmarked stack **parked as the reference map** — its
  `worktree.ts` union documents every seam, and its green 110-test run is the
  behavioral spec the rebuild must match. Read it; do not graft it.

Honest cost: `working`'s lineage carries old-architecture jj-vcs until the
rebuild lands, so a *no-freshen* rebuild of `working` before then re-pays the
conflicts — defer is a circuit breaker, the rebuild is the fix. If the rebuild
ladder starts immediately (its rungs 1+5 are tonight-verified salvage), the
exposure window is one compose cycle.

### (c) Park everything unbookmarked

Disproportionate. The halt was triggered by jj-vcs overage; the other four
features and two riders composed within budget with 0-1 trivial conflicts and
deserve their normal acceptance path. Parking 47 good commits to avoid
reviewing 15 contentious ones inverts the budget's purpose.

## Recommendation

**(b) Defer jj-vcs, keep tonight's stack unbookmarked as reference, start the
rebuild ladder now.** The decisive evidence: the two hardest resolutions
(discovery policy, `projectID` surface) are policy decisions with (i) a
demonstrably sufficient upstream-compatible alternative and (ii) no production
consumer respectively — neither should enter accepted `working` by compose
fiat; the storage model is under an active migrate-away directive from the
feature's own stable docs; and the trajectory analysis says accepting tonight
buys one quiet cycle at most before the same wall returns. The stack is not
waste: it is the seam map and the behavioral spec for the rebuild. If the
operator instead wants jj-vcs on the new base *now* regardless, then (a) with
two preconditions: document (or strip) the `projectID` wire surface, and open
the discovery-reconciliation and metadata migrate-away as blocking follow-ups
before the next compose.

## Cross-references

- [`way-forward0.glm53.md`](/design/jj-vcs/way-forward0.glm53.md) (feature
  line) — the rebuild ladder; my rung-4 sufficiency finding independently
  corroborates its discovery option (a).
- [`table-ownership0.glm53max.md`](/design/jj-vcs/table-ownership0.glm53max.md)
  (feature line) — the stable directive against core-table ALTERs; the
  deployed-boot incident that makes call "storage" a standing cost driver.
- Key commits: `zzkmyvsp` / `ulywrusw` (judgment-call commits, stack-only
  change-ids), `osqkzwutyvqr` (migration bandage + tests), `tmmlzsrmmpns`
  (client regen exposing `projectID`).
- Trees compared: `@` (stack tip `3228ac139af5`), `jj-vcs-rektide`
  (`a01a597f04d0`), `23f3f8b6ca61` (upstream), `working-20260904`
  (`97b06ee96f0e`; `worktree.ts` byte-identical to the feature line).
