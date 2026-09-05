---
type: Design
title: jj-vcs way forward — rebuild on the post-#47358 seams
description: Speculative plan for re-deriving the jj-vcs feature natively on upstream's re-architected worktree subsystem, folding in the table-ownership migrate-away.
resource: file:///home/rektide/src/opencode-jj-vcs/design/jj-vcs/way-forward0.glm53.md
tags: [opencode, jj-vcs, worktree, design]
status: draft
generated: { by: agent:glm-5.3-high, at: 2026-09-04 }
sources:
  - id: compose-20260904-evening
    resource: file:///home/rektide/src/opencode-working/.design/compose-20260904/compose-20260904.gpt56s.md
    title: 2026-09-04 compose friction report (morning) + evening session
  - id: table-ownership
    resource: file:///home/rektide/src/opencode-jj-vcs/design/jj-vcs/table-ownership0.glm53max.md
    title: Never alter tables we do not own — migrate-away plan
  - id: rewrite1
    resource: file:///home/rektide/src/opencode-jj-vcs/design/jj-vcs/rewrite1.glm53.md
    title: Provider-era rewrite execution + outcome
---

# Way forward: rebuild jj-vcs on the post-#47358 seams

Written the evening of 2026-09-04, immediately after the evening composition
run hit its conflict budget on this feature and was halted by the operator.
This doc is speculative — a proposal for the operator to accept, amend, or
discard — not a decision. Two independent assessments of the halted
composition are being produced in parallel
(`opencode-working/.design/compose-20260904/assess-jjvcs{0,1}.*.md`); this
doc should be read beside them.

## The diagnosis

The evening compose absorbed 67 upstream commits per feature. Five features
slid through with zero or one trivial conflict. jj-vcs took **12 conflicted
commits out of 15** and multiple resolution rounds. That asymmetry is not
bad luck; it is an **architecture expression gap**:

- Our line's three weeks of jj semantics (cross-workspace identity, the
  metadata column, jj workspace strategy and management) are *expressed
  against the worktree subsystem as it existed at `7ba5f3e5`*: a
  `registry` map with a `register` function, ops parameterized by explicit
  `projectID`, discovery that probes every stored source directory,
  `ListEntry` defined inline in core.
- Upstream has since re-architected exactly that subsystem (#47358
  configurable plugin strategies): strategies live in a `State`-managed map
  mutated through `Editor.add` (delete-then-set, no duplicate errors), ops
  are location-closure-scoped, discovery is location-only by deliberate
  policy ("a location's plugin instances only discover its own checkout,
  not sibling clones"), rows carry ownership guards (`setWhere` with
  `replace`), and `ListEntry` moved to the schema package.
- Every conflict tonight was one of those expressions meeting the new
  reality. The resolutions I produced under pressure transplant jj
  semantics into the new architecture — mechanically green (110 worktree/vcs
  tests, 10/10 typechecks) but semantically unreviewed, and readable as
  scar tissue: two discovery policies stitched behind a flag of intent,
  a superset `projectID` API upstream deliberately removed, upstream tests
  edited to fit our contract.

The morning-accepted port (`working-20260904` on `211cd73f`) does not have
this problem because it predates #47358. The evening's 35-commit delta is
the seam shift. **Carrying our line as-is means re-paying this translation
at every rebuild until it is re-derived** — the same conclusion the
2026-09-02 evening reached for the provider-era seam shift, which produced
the rewrite ladder this workspace already knows how to execute.

## The proposal: recreate-afresh on the new seams

Same pattern as [`rewrite1.glm53.md`](rewrite1.glm53.md): rebuild the line
on the current `v2@origin` tip in this workspace, folding compose riders
into self-contained commits, with per-rung gates — **not** another rebase.
The rebuild is also the natural vehicle for the metadata migrate-away, so
the line exits non-compliant with the table-ownership directive.

### Rung ladder

1. **Recognition and identity** (salvage verbatim). The bottom three
   commits — recognize `.jj`, reclassify on project open, jj VCS provider
   (`plugin/vcs/jj.ts`) — slid clean tonight. Duplicate their content as
   the ladder's base. Verification: vcs-jj 6 + project family.
2. **Metadata migrate-away** (design change, per
   [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md)). Stop
   ALTERing core's `worktree` table entirely. Own a `rektide_jj_worktree`
   sidecar table (or a state-directory sidecar file — decide below) written
   by exactly one guarded idempotent migration, backfilled from the legacy
   `worktree.metadata` column where present, dual-read during transition,
   never dropping the legacy column. This deletes the entire
   migration-lineage incident class (`cdc7a949` becomes unnecessary) and
   complies with the 2026-09-04 directive. Verification: fresh-DB, old-DB,
   healed-DB matrix from the directive's runbook.
3. **jj strategy as a native plugin strategy**. Register
   `worktree/jj.ts` through the mechanism #47358 actually provides —
   initial-map beside `WorktreeGit` for the built-in, and/or the
   plugin-strategy declaration surface for external registration. Adopt
   `setWhere`/`replace` ownership semantics instead of the feature's
   changed-detection upsert; keep only the metadata-preservation nuance the
   guards don't cover. The `local` guard stays untouched.
4. **Discovery reconciliation** — the one real design problem; options:
   - **(a) Location-native sibling discovery**: each workspace location's
     service discovers siblings *from its own working copy* (`jj workspace
     list` against the location's checkout). Satisfies upstream's
     location-only policy in letter and spirit — every location probes only
     itself — while jj's shared-store model still surfaces every sibling to
     the project, because each sibling has its own location. My instinct:
     this is the correct shape and likely *simpler* than what we carry.
   - **(b) Project-scoped refresh seam**: keep an explicit
     `refresh({projectID})` entry point (the evening stack's superset API)
     as a thin, documented extension. Costlier: re-introduces cross-location
     mutation upstream just removed.
   - **(c) Upstream proposal**: sell (a) or a discovery hook upstream once
     (a) proves out. Their jj PRs being orphaned (#45009, `jj-vcs-plugin`)
     means the maintainers lack a live consumer — we are the evidence base.
   - Recommendation: build (a); keep (b) out unless a concrete consumer
     (cotail, app workspace UI) demands it.
5. **Workspace management + small hardening** (salvage). `base` input,
   `--ignore-working-copy` on workspace list, bookmark listings, working-copy
   labels, ignores — all slid clean or near-clean tonight; re-home on the
   new `Strategy` interface with upstream's `unknown` error channels and
   `operationError` wrapping.

### What gets salvaged from the halted evening stack

The unbookmarked 62-commit composition in `opencode-working` is reference
material, not garbage: its `worktree.ts` union is a working map of every
seam (state registration, `setWhere` guards, location closures, schema
`ListEntry` re-homing, the test-fixture idiom for Location/Global fakes),
and its 110-test green run is the behavioral spec the rebuild must match.
Read it; do not graft it.

### Orchestration and gates

`(1+3) × 1` serialized per the manifest's pattern: one worker, one rung,
coordinator validates (count, contiguity, suite, typecheck) before the
next. Rungs 1 and 5 are mechanical; rungs 2–4 each get a short design note
in this directory *before* implementation (the discovery note first — it
gates rung 4's shape). Full focused family as the acceptance gate:
vcs-jj 6 + worktree-jj 6 + vcs/worktree 11 + project 30 + ignores 10.

### Compose policy until the rebuild lands

Defer jj-vcs from `working` rebuilds (the procedure-correct raise the
evening run failed to make). `working-20260904`'s morning port stays the
accepted carrier. If a rebuild is needed before the new line lands, compose
without jj-vcs and record the exclusion.

## Upstream watch (unchanged, restated)

- #45009 / `jj-vcs-plugin`: unmerged, orphaned on machinery v2 removed
  2026-08-31. Ours remains the only live jj line. **Supersession trigger**:
  that PR (or a new jj line) merging — then the rebuild targets *their*
  seams instead.
- #47358's direction (plugin-declared strategies) is the seam we are
  adopting; watch for follow-ups touching `Editor.add`, discovery policy,
  or worktree ownership guards, and re-aim rungs 3–4 if they land.

## Open questions for the operator

1. Discovery: bless option (a), or is there a concrete cross-location
   consumer that forces (b)?
2. Metadata home: `rektide_jj_worktree` table vs a state-directory sidecar
   file (plugin-storage-shaped)? The directive prefers least-database; the
   access pattern (per-directory lookup at discovery time) is simple enough
   for either.
3. Does the rebuild ride the *current* `v2@origin` tip or wait for the next
   freshen wave cadence?
4. What happens to tonight's halted stack: park unbookmarked for reference
   until the rebuild lands, then abandon?

## Cross-references

- [`rewrite0.glm53.md`](rewrite0.glm53.md) /
  [`rewrite1.glm53.md`](rewrite1.glm53.md) — the precedent this proposal
  re-runs, at a bigger seam.
- [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md) — the
  directive and migrate-away plan rung 2 implements.
- [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) — us-vs-upstream stance table;
  the "unmerged API fine / ID space blocker" judgements still hold.
- [`jj-vcs-user-impact.glm53.md`](jj-vcs-user-impact.glm53.md) — the
  copies-are-the-feature verdict that keeps rung 5's scope honest.
- Evening composition state: `opencode-working` unbookmarked 62-commit
  stack on `23f3f8b6ca61`; accepted baseline `working-20260904` at
  `97b06ee9`; assessments landing in
  `opencode-working/.design/compose-20260904/`.
