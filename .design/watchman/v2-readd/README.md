---
type: Index
title: v2 re-add payload
description: The collected Watchman-on-v2 corpus — conflict map, plan lineage, and working plan — plus the naming convention for future rounds and the compose-process readiness notes from the ado patch stack.
resource: /.design/watchman/v2-readd/README.md
tags: [opencode, watchman, v2, re-add, index, compose]
status: stable
generated: { by: model:glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - id: corpus-index
    resource: /.design/watchman/README.md
    title: Watchman design corpus index
  - id: patch-stack
    resource: file:///home/rektide/ado/patches.md
    title: OpenCode patches and ideas (accepted working stack)
  - id: compose-procedure
    resource: file:///home/rektide/ado/patches-apply.md
    title: Building working — lineage, compose procedure, pre-flight battery
---

# v2 re-add payload

Everything for getting Watchman support back onto current `v2@origin`,
collected in one directory so a rework round can carry the whole payload as
a unit. Parent corpus: [`.design/watchman/README.md`](/.design/watchman/README.md).

## Reading order and status

Read in this order; the lineage is causal, each plan a reaction to the last.

| # | Doc | What it is | Status |
| --- | --- | --- | --- |
| 1 | [`v2-conflict0.glm53h.md`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) | The measured collision map: divergence geometry, hunk-by-hunk conflicts, the two architectures side by side, paths A/B/C | Standing evidence — its textual merge rules are historical once we start clean; its semantic warnings are not |
| 2 | [`v2-reintroduction-plan0.gpt56solxh.md`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md) | Source-grounded clean re-introduction: fresh-clock controller, donor disposition, indirect-consumer analysis, scenarios | Correctness source — its public-API/error-channel breadth was narrowed by readd2 into U1/U2 |
| 3 | [`v2-readd0.glm53max.md`](/.design/watchman/v2-readd/v2-readd0.glm53max.md) | Position 1: merge-based freshen (one 23-hunk merge + adaptation stack) | Superseded — inherited pieces: pre-flight, probe recipe, verification discipline |
| 4 | [`v2-readd1.glm53max.md`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) | Position 2 v1: verbatim backend carry, synthetic-invalidation loudness, zero upstream-file edits | Superseded — its loudness bridge cannot work pre-attach (see readd2 §"Why the original loudness bridge cannot work"); discipline kept |
| 5 | [`v2-readd2.gpt56solxh.md`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | Carry-first revision: upstream substrate whole, two small upstream candidates (U1 generation-aware `onReady`, U2 Config-local invalidation), freshly re-authored exact-root backend, ownership-classified fork budget | Architecture decision — its corrected spike superseded by readd3's build-now directive |
| 6 | [`v2-readd3.gpt56solxh.md`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) | **The work plan:** build now, no spike gate — W0-W10 commit graph with per-commit files, tests, and acceptance; plain `watch` exact roots, fresh clocks, no cursor/placement/`watch-project`; U1/U2 isolated at the bottom of the stack | Active — implementation follows this graph from W0 |
| 7 | [`v2-flow0.glm53max.md`](/.design/watchman/v2-readd/v2-flow0.glm53max.md) | **Process (not a plan revision):** how scratch journals from the multi-agent build promote into their durable committed home in the carrier's `.design/watchman/v2-readd/` — triage classes, `v2-` prefixed name preservation, `log.md` build log, coordinator-owned promotion passes | Active convention — governs every file the build produces |
| 8 | [`v2-readd6-draft0.glm53max.md`](/.design/watchman/v2-readd/v2-readd6-draft0.glm53max.md) | **Round 6 lean re-cut:** upstreamable design accepting readd5's common core but shrinking the fortress — immediate-return subscription with invalidate-on-install, generation-counter fencing, per-root attach serialization, heartbeat, pure mapping; Watchwoman concerns forked to the watchwoman-systemd repo; fortress defenses documented as non-goals with re-entry triggers | Active — implementation follows this cut in the carrier worktree atop W1; commit sequencing deferred to a post-build pass |

**Lineage continues in the carrier.** `v2-readd4`, `v2-readd4-dirty`, and
`v2-readd4-prompt0` were authored here but belong to the build era; the
2026-09-05 promotion pass moved them (and the agent journals) to
[`~/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/README.md).
This directory remains the frozen planning-era record: conflict map through
readd3.

The deciding thread across all five: both sides independently built the
generic half (desired-state reconcile, readiness, recreation survival); the
durable position is to own the *backend*, not the *substrate* — and to get
owner-visible continuity through a small generic seam (U1/U2) rather than a
forked watcher API or fabricated updates.

## Naming convention for future rounds

- Pattern: `v2-<wave><round>.<model>.md` — same wave-name rules as the
  parent corpus, model suffix mandatory (`readd2` without a suffix is a
  bug).
- Next design round: `v2-readd4.<model>.md`. Revisions increment; never
  overwrite a prior round.
- Synthesis rounds: `v2-readd3-syn.<model>.md`.
- New sub-topics get their own wave name, still prefixed `v2-` (e.g. a
  future `v2-spike0.<model>.md` for the U1 ordering spike writeup).
- Accepted tips get a prefix-less symlink per the corpus convention.

## Compose-process readiness

From the accepted `working` patch stack
([`patches.md`](file:///home/rektide/ado/patches.md),
[`patches-apply.md`](file:///home/rektide/ado/patches-apply.md)). Watchman is
currently **excluded from `working`** ("explicitly excluded while its
independent line remains active"; the floating `watchman` bookmark last
observed at `594bac08`, prior accepted snapshot `watchman-20260902`). When
the carrier line is ready to compose, this is what the process expects:

- **Declare lineage:** `base: v2@origin` — the carrier workspace holds only
  its own commits directly atop the upstream tip. Undeclared growth is
  treated as damage (this workspace was caught at it once, 2026-08-19).
  readd2's "start clean, never merge ancestry" is this rule.
- **Bookmarks:** keep the floating `watchman` bookmark fast-forwarded to the
  top of the accepted line (work-above-the-bookmark rule); date snapshots
  (`watchman-YYYYMMDD`) preserve superseded accepted tips.
- **Baseline locking:** fetch through the `v2` workspace
  (`~/archive/anomalyco/v2`) only — concurrent fetches race the colocated
  repo; lock once, don't chase a moving tip (younger than ~1 h = expect
  churn).
- **Drift counting:** `::v2@origin ~ ::<tip>` with both `::` closures —
  `x ~ ::y` silently returns 1.
- **Verification gates:** focused suites + per-package typechecks
  (schema/core/protocol/client/server/cli/tui/plugin/app/www); host build
  with `OPENCODE_CHANNEL=local bun run build -- --single --skip-install`;
  binary smoke; boot-smoke gate (added after the 2026-09-04 migration-id
  incident — generated migrations must be idempotent-checked against live
  DBs).
- **Known environment gotchas:** run location suites with
  `env -u OPENCODE_LOCATION_CACHE_TTL`; documented pre-existing upstream
  failures (Ctrl-O timing, `session-home` family timeouts, `.hg/branch`
  watcher timeout, one acp permission test) are not composition damage —
  verify against bare upstream before chasing; current v2 pins Bun 1.4.x and
  jj-vcs recorded a pre-existing `process-lock-ffi.bun.ts` pointer
  typecheck error on that Bun — don't adopt it as ours.
- **Conflict discipline:** reconstruct whole regions, never marker surgery;
  rebase by explicit duplicate commit ids (never change-ids); count commits
  with an explicit template; `jj duplicate` output is bottom-up and
  SIGPIPEs through `head`.
- **AGENTS.md precedent:** the compose resolves our AGENTS.md deletion by
  *keeping upstream's* — which is why readd2 drops the deletion from the
  feature payload.
- **The rewrite precedent:** the 2026-09-02 jj-vcs rewrite
  (recreate-afresh on fresh `v2@origin`, design-laddered, sequential agent
  batches with per-batch gates) is the closest executed analogue to this
  carrier plan — its beyond-parity findings (a dropped flag, a latent
  typecheck failure) are the argument for its parity-and-evidence discipline,
  which readd2's scripted-protocol-actor and live-gate commits adopt.

## Cross-references

- [`.design/watchman/README.md`](/.design/watchman/README.md) — parent corpus
  index; this directory's docs are slotted in its chronology (rows 13-14)
  and forward-work table.
- [`static-selection-handoff.unknown.md`](/.design/watchman/static-selection-handoff.unknown.md)
  — execution authority for the donor line whose target state the carrier
  carries; the donor line stays bookmarked as evidence.
- [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) — donor
  behavior record; referenced by every plan's carry/disposition table.
