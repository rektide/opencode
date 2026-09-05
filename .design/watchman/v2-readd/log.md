---
type: Log
title: v2 re-add build log
description: Dated update history of the Watchman v2 re-add carrier build — baseline, Wn landings, promotion passes, deviations.
resource: /.design/watchman/v2-readd/log.md
tags: [opencode, watchman, v2-readd, log]
status: stable
generated: { by: model:glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
---

# v2 re-add build log

Newest first. One line per event; details live in the linked records.

## 2026-09-05

- **Promotion pass** (coordinator-directed): `v2-readd4`{,`-dirty`,`-prompt0`}
  moved from the archive payload dir (were untracked there); six journals
  promoted from archive scratch with `v2-` prefixes (research0, execution0,
  owners0, protocol0, actor0 ×2 models); this `README.md` + `log.md` created;
  link sweep run. Scratch README retains pointer rows.
- **In flight**: W2 (owner convergence: `config.ts`, agent/command/source
  plugins + tests) and the W3 fixture actor
  (`test/filesystem/fixture/watchman/client.ts`, `watchman-actor.test.ts`) in
  the working copy.
- **W1 landed**: `refactor(core): make watcher readiness generation-aware`
  (ornkqwlk) — `invalidate?()` native signal, per-subscriber `onReady`
  rerun, ordering tests.
- **W0 landed**: `docs(watchman): record v2 rebuild plan` (pxuvrknr) — the
  readd3 copy as the baseline record.
- **Baseline locked**: `v2@origin` = `4306c07b` (fetched through the shared
  repo's `v2` workspace); carrier line started directly on it.
