---
type: Design
title: Discovery counter-position — the case for project-scoped refresh, and what location-native really costs
description: Standalone counter-argument to rung 4's location-native recommendation; enumerates what is genuinely lost, prices the project-scoped options, and analyzes the switchability the operator asked for.
resource: design/jj-vcs/discovery-counter0.glm53.md
tags: [jj-vcs, worktree, discovery, design, counter-position]
status: draft
generated: { by: agent:glm-5.3-high, at: 2026-09-05 }
sources:
  - id: way-forward
    resource: design/jj-vcs/way-forward0.glm53.md
    title: The ladder proposal whose rung-4 option (a) this doc argues against
  - id: assess0
    resource: file:///home/rektide/src/opencode-working/.design/compose-20260904/assess-jjvcs0.glm53.md
    title: Assessor 0 — verdict "jank as design" on stored-source discovery
  - id: assess1
    resource: file:///home/rektide/src/opencode-working/.design/compose-20260904/assess-jjvcs1.glm53.md
    title: Assessor 1 — trajectory and the registration-shape finding
  - id: upstream
    resource: jj:v2@origin@23f3f8b6ca61 packages/core/src/worktree.ts
    title: Post-#47358 refresh — the location-only policy verbatim
  - id: fleet-probe
    resource: "jj workspace list @ ~/src/opencode-jj-vcs, 2026-09-05"
    title: Operator's variant fleet — ~50 workspaces, one shared store
---

# Discovery counter-position: what location-native loses

Written at the operator's request before blessing rung 4's shape. The
operator's instinct, verbatim: *"ideally i would like to be able to switch
between location-native vs project-scoped but this feels really really
difficult. i somewhat want to do project-scoped still."* This doc owes that
instinct its strongest honest case — then prices the menu. It argues *for*
project-scoped; the way-forward design note
([`way-forward1.glm53.md`](way-forward1.glm53.md)) makes the final call.

## The two policies, precisely

**Location-native** (upstream `v2@origin` `23f3f8b6ca61`, verbatim): a
location's `refresh()` probes **only `location.project.directory`**, and only
when that directory is itself a stored, existing row. The policy comment in
the source: *"a location's plugin instances only discover its own checkout,
not sibling clones."* Wire surface: none — refresh is location-identity
scoped, no parameters.

**Project-scoped** (our carried line, and the halted evening stack): refresh
enumerates every stored **unowned** source row of the project and probes each
with the VCS-filtered strategy set. Our line threaded `projectID` through
every op and the wire; the halted stack kept an optional `projectID` superset.

## The fleet fact that reframes everything

Probed 2026-09-05: the operator's entire variant fleet — `opencode-working`,
`opencode-jj-vcs`, `opencode-cache-time`, `opencode-watchman`, `vcs-core`,
`v1`, `v2`, and ~44 more — are **jj workspaces of a single shared store**
(`jj workspace list` from any of them enumerates all). Under our identity
layer (store-derived, one remote probe on miss), that whole fleet resolves to
**one project ID**.

Consequences:

- For jj, "sibling discovery from one's own checkout" is not a narrowing:
  any single variant's self-probe (`jj workspace list`) **enumerates the
  entire fleet**. The feature's sibling semantics survive location-native
  discovery intact.
- Project-wide **removal** detection also survives: `refresh()` lists *all*
  stored rows of the project and drops the ones whose directory vanished —
  from any location.
- The stale window for *new* externally-created workspaces is "since any
  variant of the store was last opened in this server" — in this operator's
  workflow, minutes at most.

The fleet fact does not settle the question. It removes the phantom losses —
but the real ones remain.

## What location-native genuinely loses

1. **Identity coherence.** Our identity model deliberately says: one project
   spans many checkouts (clones share an ID; workspaces share a store).
   Upstream's discovery policy is *narrower than our own ID space*. There is
   a real design incoherence in an identity layer that spans the fleet and a
   discovery layer that declines to look at it. Project-scoped discovery is
   the policy that matches the ID space we already chose and defended
   ([`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) ID-space stance).

2. **A place to stand without a location.** Location-native refresh requires
   an open location whose own directory is registered. There is no headless
   "keep the project's rows fresh" action: no boot-time sweep across
   projects, no daemon pass, no SDK orchestration that materializes
   worktrees for a project it is not itself running in. Our old line had
   exactly such a hook (`refreshAfterBoot` per location); a *project*-scoped
   pass would generalize it; location-native forecloses the generalization.

3. **Git-family sibling clones.** Upstream's comment — "not sibling clones" —
   is *about this operator's topology class*: same-project clones (same
   origin URL ⇒ same project ID) that are *not* workspaces of a shared store.
   New worktrees created inside such a clone are invisible until that clone
   is opened. Today the fleet is jj-unified, so this is latent; the day the
   operator keeps a plain `git clone` beside the fleet (or a collaborator
   does), project-scoped is the only policy that sees it.

4. **Future orchestrator surfaces.** Cotail, an app-level workspace manager,
   anything that drives worktrees for *many* projects from one place — under
   location-native each needs a location per project, or a new protocol
   surface minted later under pressure. The wire superset exists *today* in
   the halted stack; adopting it later is another seam pass over
   `worktree.ts`, `schema`, `protocol`, `server`, and the generated client.

5. **The switchability itself.** The operator wants policies switchable, the
   way variants are switchable. A policy welded into the hot path cannot be
   switched; a policy that exists as a separate pass can be triggered,
   scheduled, or skipped.

## The menu, priced

| Option | Shape | Gets | Costs |
|---|---|---|---|
| **0. Pure location-native** | upstream `refresh()` verbatim | zero divergence on the hottest file; upstreamable; both assessors' sufficiency finding | all five losses above, permanently until upgraded |
| **1. Internal project pass** | additive `refreshProject(projectID)` beside the location method — iterates stored unowned sources; **no wire change** | headless freshness (boot/sweeper/SDK), git-clone coverage, coherence — losses 2, 3, and the substance of 1 | one internal seam upstream lacks (drift on our side only); cross-location probing upstream's comment forbids — ours to justify; must respect `setWhere` guards (it does, by construction) |
| **2. Wire superset** | option 1 + `projectID` on the protocol (create/remove/refresh) + client regen | everything, remotely addressable | the halted stack's shape: wire-exposed with zero consumers (assessor 0's "jank-leaning"); protocol + client churn at every freshen; walking it *back* later is the most expensive direction |
| **3. Config-switchable dual policy** | both discovery policies compiled in, chosen by config (would live in the new `ConfigWorktree`) | literal switchability | carries two discovery policies forever: dual test matrices, dual drift, the "scar tissue behind a flag" the halted stack was dinged for — as policy |

## The asymmetry that answers the switchability wish

Upgrade costs are not symmetric:

- `0 → 1` is **additive and small**: one internal function plus its caller;
  the location method is untouched; removal is trivial.
- `1 → 2` is additive but crosses the wire: protocol, client regen, tests.
- `2 → 0` or `3 → 0` means **unshipping a public surface** — the most
  expensive direction, usually never done.

So the "switch" the operator wants decomposes correctly into: *does the
explicit project pass run, and from where?* — a scheduling/trigger question —
rather than *which policy is compiled into refresh*. Start at 0; if the itch
arrives, add 1 (and, if ever, a config bit that triggers 1 at boot — a far
smaller dual surface than option 3's two hot-path policies). Never start at 2
or 3; those are the shapes you cannot leave.

## The honest recommendation

Take option **0** for the rebuild's rung 4 — the easy way forward, per the
operator's own lean — and record option **1** as the named, priced upgrade
with concrete triggers: a sweeper/boot-freshness need, a git-clone variant
fleet, or a live orchestrator consumer. Option 2 only ever in response to a
real consumer, never speculatively. Option 3 never.

## Cross-references

- [`way-forward1.glm53.md`](way-forward1.glm53.md) — the execution design
  note this doc feeds; rung 4 records the blessed shape.
- [`way-forward0.glm53.md`](way-forward0.glm53.md) — the ladder; §rung 4
  option (a) is what this doc stress-tested.
- [`jj-vcs2.glm53.md`](jj-vcs2.glm53.md) — the ID-space stance loss 1 leans
  on.
- [`table-ownership0.glm53max.md`](table-ownership0.glm53max.md) — the other
  rung-2/3 constraint set (orthogonal to discovery, same "stay minimal on
  core seams" logic).
- Assessor verdicts: assess0 §1 ("jank as design, defensible as carrier"),
  assess1 §3 delta 2 (superset "jank-leaning") — both against carrying the
  wire surface without a consumer.
