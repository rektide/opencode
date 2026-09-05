---
type: Plan
title: Scratch-to-durable artifact flow for the v2 re-add build
description: How working journals and artifacts produced in .test-agent scratch during the carrier build get moved into their durable, committed homes — roles of the three watchman workspaces, triage classes, naming, the coordinator-owned promotion pass, and the scale properties that keep it O(1) per artifact as the volume grows.
resource: /.design/watchman/v2-readd/v2-flow0.glm53max.md
tags: [opencode, watchman, v2-readd, artifacts, workflow, test-agent, promotion, plan]
status: draft
generated: { by: model:glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-09-19
sources:
  - id: payload-index
    resource: /.design/watchman/v2-readd/README.md
    title: v2 re-add payload index and round-naming convention
  - id: work-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan (W0-W10)
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: scratch-index
    resource: file:///home/rektide/src/opencode-watchman-old/.test-agent/watchman-v2-readd/README.md
    title: Scratch research-journal index (coordinator-owned)
  - id: patch-stack
    resource: file:///home/rektide/ado/patches.md
    title: Accepted working-stack process (bookmarks, compose, verification)
---

# Scratch-to-durable artifact flow for the v2 re-add build

## What this is for

The carrier build is multi-agent: a coordinator ("GX"), research agents, and
execution agents. Code lands as commits in the carrier workspace
(`~/src/opencode-watchman-v2-readd`); the agents journal their work as
OKF-frontmatter'd, append-only, round-numbered files in gitignored scratch
(`.test-agent/watchman-v2-readd/`). Today that scratch lives in the archive
workspace. The volume will grow — more rounds, more models, per-W
verification evidence, upstream-proposal drafts — and every one of those
files has a different right home. This document defines the flow so "move it
into place" is a repeatable pass instead of a per-file improvisation.

Snapshot of scratch at authoring time (2026-09-05 04:15, three files — this
list dates fast; the durable index, not this snapshot, is authoritative):

| File | Author role | Content |
| --- | --- | --- |
| `README.md` | coordinator | Scratch index: journal table, round conventions, `R<N>` plan-correction numbering |
| `research0.glm53max.md` (616 lines) | research agent | Validated audit of readd3 against upstream `4306c07b` + donor dissection, reusable-vs-legacy classification, plan corrections R1–R7 |
| `execution0.glm53f.md` (252 lines) | execution agent | Preflight and first-slice (W1) journal; explicitly durable, append-only |

## The map: who holds what

| Location | Role | Rule |
| --- | --- | --- |
| `.test-agent/watchman-v2-readd/**` (any workspace; currently the archive's) | **Scratch.** Working journals in flight | Gitignored; never committed; never edited across agents (existing convention holds) |
| `~/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/**` | **The durable home for everything about the build.** Plan copy, implementation records, promoted journals, upstream-proposal drafts | Committed on the carrier line, rides with the code |
| `~/src/opencode-watchman-old/.design/watchman/**` | **Frozen donor corpus + planning-era payload.** Evidence of the old architecture and the v2-readd plan lineage | No new build records; process docs (this file, the payload README) are the only living edits |
| `~/src/opencode-watchman` (default workspace) | Parked clean on `v2@origin` | No role in the flow; do not start parallel lines there |

One durable home per artifact class — carrier for build records, corpus for
history — is what keeps "so many more" tractable: promotion never has to
decide between homes, only between promote / rewrite / discard.

## Triage classes

Every scratch file at a promotion pass falls in exactly one class:

| Class | Rule | Examples |
| --- | --- | --- |
| **Promote** (move verbatim) | Conclusions with durable value, already written to corpus standard (frontmatter, append-only discipline) | `research0.*` (plan-correction audit), `execution0.*` (build journal), future `research<N>/execution<N>` |
| **Rewrite, then promote** | Value is conclusions, form is process | Probe transcripts, verification runs → fold results into the execution journal or build log; raw files die |
| **Discard on cleanup** | No durable value | One-off scripts, duplicates, exploratory dead ends |

Promotion is `mv`, never `cp` — one source of truth; a copy in scratch and a
copy in `.design` will diverge and the scratch one will win by accident.

## Naming and homes in the durable directory

The payload directory's convention extends unchanged
([`README.md`](/.design/watchman/v2-readd/README.md)):

- **Promoted journals keep their names, gaining the `v2-` prefix**:
  `research0.glm53max.md` → `v2-research0.glm53max.md`,
  `execution0.glm53f.md` → `v2-execution0.glm53f.md`. Rounds and models are
  already encoded; append-only growth means the file count grows linearly
  with rounds, not with content.
- **`log.md`** (OKF reserved name) in the carrier's `v2-readd/` directory:
  the carrier build log — dated entries, one line per event (baseline
  record, Wn landings, promotions, deviations). Multi-author by design, so
  no model suffix. Create it at the first promotion pass.
- **Carrier-side `README.md`**: mirror of the payload index plus an
  "implementation records" section listing promoted journals and the build
  log. Create it at the first promotion pass; thereafter every promotion
  adds one row.
- **Upstream-proposal drafts** (U1/U2 PR bodies when written):
  `v2-upstream-u<N>.<model>.md` in the same directory.
- The corpus copy of the payload in the archive workspace stays as the
  planning-era record; it is not updated with build records.

## The promotion pass

Coordinator-owned ("GX" already owns the scratch index — same authority), run
at each Wn milestone or whenever a journal round closes. One pass handles any
number of files:

1. **Freeze**: no agent is mid-append in the files being promoted (a closed
   round or a Wn boundary is the natural freeze point).
2. **Triage** every file in `.test-agent/watchman-v2-readd/` into the three
   classes above.
3. **Move** promote-class files into the carrier's
   `.design/watchman/v2-readd/` with their `v2-` prefixed names (`mv`).
4. **Index**: add one row per promoted file to the carrier-side `README.md`;
   append a dated line to `log.md`.
5. **Point**: update the scratch `README.md` journal table — the row becomes
   a pointer to the durable path, or is removed with the file (pointers are
   nicer for agents mid-context).
6. **Commit, path-limited, in the carrier**: when its `@` is clean between
   Wn commits, or with explicit paths while it is dirty —
   `jj commit -m "docs(watchman): record Wn research and execution journals" .design/watchman/v2-readd`
   — never a bare `jj commit` (the carrier `@` is shared with in-flight
   code work; explicit paths are already house rule).
7. **Cleanup** (free, any time after the commit is green): remaining
   discard-class scratch per the normal `.test-agent` cleaning convention.

## Guardrails

- Scratch is never committed. If it matters, it promotes; if it promotes, it
  lives in the carrier's `.design` tree.
- Never write into another agent's in-flight commit: promotion commits use
  explicit paths; journal appends stay in scratch until their freeze point.
- The plan copy riding in the carrier `@` alongside W1 should land
  deliberately — as its own docs commit (the W0 record) or knowingly with
  W1 — not swept by accident into a code commit.
- The archive corpus stays frozen except process documents like this one.
- The parked default workspace stays parked; if it ever gains a role
  (e.g. compose/integration), that is a new decision recorded here first.
- No pushing; the human pushes.

## Scale properties

- **O(1) work per artifact**: name preserved, one row, one log line; the
  pass itself is the only batch operation.
- **Linear file growth**: append-only journals mean `research0` grows by
  addenda; new files only for new rounds or new agents.
- **Index lag is tolerated where it is cheap** (scratch) and forbidden where
  it matters (durable): the carrier README is updated in the same pass as
  the move, so the committed index can never trail the committed files.
- **Workspace-agnostic intake**: promotion pulls from
  `.test-agent/watchman-v2-readd/` in any of the workspaces, so agents can
  keep scratching wherever they sit (long-term, preferring the carrier's own
  `.test-agent/` keeps everything in one tree — a preference, not a
  migration order).

## Open items

1. Whether Wn *verification evidence* (test-run records, live-gate output)
   becomes its own journal class (`v2-verify-w<N>.<model>.md`) or folds into
   the execution journal's addenda — decide at the first verification-heavy
   milestone (W5/W6).
2. Whether promoted journals ever need an abridged corpus echo (summary
   addendum in the archive corpus). Default no: the corpus is frozen; the
   carrier line is the living record.

## Cross-references

- [`README.md`](/.design/watchman/v2-readd/README.md) — payload index whose
  naming convention this flow extends; the carrier-side mirror to create.
- [`v2-readd3.gpt56solxh.md`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md)
  — the work plan whose W0/W10 documentation duties this flow operationalizes.
- Scratch index and journals (as of this writing):
  [`README.md`](file:///home/rektide/src/opencode-watchman-old/.test-agent/watchman-v2-readd/README.md),
  [`research0`](file:///home/rektide/src/opencode-watchman-old/.test-agent/watchman-v2-readd/research0.glm53max.md),
  [`execution0`](file:///home/rektide/src/opencode-watchman-old/.test-agent/watchman-v2-readd/execution0.glm53f.md).
- [`patches.md`](file:///home/rektide/ado/patches.md) — the compose process
  whose bookmark/verification conventions the carrier line will eventually
  enter through.
