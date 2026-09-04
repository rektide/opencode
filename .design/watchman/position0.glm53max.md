---
type: Design
title: Light position record and citation-follows convention
description: Current positions of the three moving sources behind the watchman corpus, plus the chase policy that source citations record what they follow rather than pinning.
resource: /.design/watchman/position0.glm53max.md
tags: [opencode, watchman, watchwoman, position, citations]
status: stable
generated: { by: model:zai/glm-5.3-max, at: 2026-09-04T02:30:00Z }
verified: { by: none, at: never }
stale_after: 2026-09-18
sources:
  - id: route-position-gate
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
    title: Position gate pin before steering
  - id: maintenance-log
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
  - id: vcs-alignment
    resource: /.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md
    title: OpenCode VCS signals epic alignment
---

# Light position record and citation-follows convention

This is the Leg 0 "position fix" from
[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md), deliberately kept light
per recorded human steering: **chase, do not pin.** Position facts are
observational context for interpreting citations, not gates that block work.
Exhaustive pinning costs more to maintain than the drift it prevents.

## Chase policy

- Citations **record what they follow.** A doc citing source records the
  revision it actually read, e.g. "follows watchwoman-systemd `d2eef362`".
- Drift is expected. When noticed, add a dated line to the drift log below
  rather than blocking on it. Update a citing doc only when its claim depends
  on the moved code, and then only when the doc is next touched.
- Baselines and live gates cite *their own run*, not this file. This file
  never serves as provenance for a behavioral test result.

## Current positions

| Source                                  | Current value                                                                                                        | Observed   | Notes                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| OpenCode watchman docs tip              | `1d2aeb94` (`kzpzrwwkonpr`, align VCS signals epic with daemon design)                                                | 2026-09-04 | Working copy empty on top.                                                              |
| `watchman` floating bookmark            | `594bac08` (docs: link remade architecture)                                                                           | 2026-09-04 | ~9 docs-only commits behind the tip; advance when convenient (bookmark-debt convention). |
| Watchman implementation line base       | freshened onto `v2@origin` `43d09b9d` on 2026-09-01                                                                   | README     | Upstream has moved since; see next row.                                                 |
| Upstream `v2@origin`                    | `7ba5f3e5` (per the `term-v2-20260903` refresh record)                                                                | 2026-09-03 | Freshen debt for the watchman line; collision check owed at freshen time, not before.   |
| `watchwoman-systemd` checkout           | `d2eef362` (`nvzllptpw`, docs(opencode): align daemon design with VCS signals tracer), clean working copy              | 2026-09-04 | `nav0-syn0`'s `166eeb6d` citation was current at syn time; superseded by this.          |
| Deployed production daemon              | `watchwoman 0.7.0`, `/usr/local/bin/watchwoman`, Compfuzor pin `systemd@rektide`                                      | 2026-09-04 | Unchanged since the alignment inspection; production lane still on the historical line. |

## Drift log

- **2026-09-04** — Initial record. Three known-open drifts, none gating Leg 0
  drafting: `watchwoman-systemd` moved `166eeb6d` → `d2eef362` since
  `nav0-syn0` was written; upstream `v2` moved `43d09b9d` → `7ba5f3e5` since
  the last freshen; the floating `watchman` bookmark trails the docs tip.

## Cross-references

- [`nav0-syn0.gpt56sol.md`](/.design/watchman/nav0-syn0.gpt56sol.md) defines
  the position gate this record satisfies in reduced form; its five-item
  full-pinned variant applies only to live behavioral gates, not to citation
  context.
- [`README.md`](/.design/watchman/README.md) remains the maintenance log for
  the implemented fallback/cursor/metrics line and owns freshen records.
- [`opwatch-vcs-signals-alignment0.gpt56solmax.md`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
  holds the deployed-binary and Compfuzor-pin details summarized above.
