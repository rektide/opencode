# Graceful TUI termination (`term-v2`)

This workspace holds the graceful-termination and exit-epilogue patch stack
for the OpenCode v2 TUI: catchable death signals route through normal scoped
cleanup, and the exit epilogue is a pluggable row registry with plugin
adapters. Workspace `~/src/opencode-term-v2` (jj workspace name matches the
directory; V1 precedent was `~/src/opencode-term`, bookmark `term`, commit
`e524a2c6`). Floating bookmark `term-v2` at `d6a2a44e` (= snapshot
`term-v2-20260906`): the 2026-09-03 recreate-afresh ladder (signals + core
epilogue → registry/plugin surface → tests → design docs) on base `v2@origin`
`7ba5f3e5b220`, refreshed onto `23f3f8b6` (`term-v2-20260904`), extended on
2026-09-06 by the ordered-selection kernel line (kernel + authority fix +
selector docs; no display wiring yet). The prior 26-commit line remains
preserved under snapshot `term-v2-20260901` at `71b797d2` plus the README
commit `615f01d0`. Manifest: "Graceful TUI termination" row in the
accepted `working` table (preferred order 2, though recent rebuilds apply the
line last to ease merging) and idea-log #5 in
[`patches.md`](/opencode/patches.md).

## Why

Two related complaints:

1. **Hard exits damage the terminal.** Before this stack, `SIGHUP`,
   `SIGINT`, and `SIGTERM` killed the TUI without scoped cleanup: terminal
   state and title were not restored, listeners stayed behind, and the
   normal session epilogue never printed. Disconnecting (terminal close,
   ssh drop, tmux kill) or plain Ctrl-C left a wrecked pane.
2. **The exit epilogue was a fixed, core-owned single row.** Exit printed
   one hardcoded active-session row; nothing else could contribute exit
   summaries (session cost, last activity), and plugins had no surface to
   do so — the 2026-08-31 registry deferral recorded exactly that gap.

## Line shape (4 afresh commits on `7ba5f3e5b220`, 2026-09-03)

The 2026-09-03 freshen recreated the line afresh per operator direction
(precedent: the 2026-09-02 jj-vcs port). The four commits group the same
content by concern:

| Commit | Subject | Scope |
| --- | --- | --- |
| `e28d1d20` | feat(tui): graceful signal termination and core session epilogue | Route `SIGHUP`/`SIGINT`/`SIGTERM` through normal scoped TUI cleanup: restore terminal state/title, remove listeners, preserve and print the session epilogue exactly once; session-activity core row; hardening. Folds the old signals-fix + activity-row + preserve + hardening commits. `SIGQUIT` remains unhandled; `SIGKILL` cannot be caught by any process. |
| `70439dd7` | feat(plugin): expose TUI epilogue rows | ⚡ pluggable row registry exposed to plugins: supplemental rows, session-cost and last-activity adapter rows beside the core `Active` row, invalid-projection containment, www docs. Folds the old registry + ⚡ surface + adapter-row commits. |
| `f1df1712` | test(tui): cover epilogue lifecycle, signal process matrix, and reload | Lifecycle/route-ownership tests, real-process signal matrix, render isolation, reload cadence, `@effect/platform-node` devDep, `bun.lock`. Fixtures adapted to upstream's `PackageSource.prepare` contract. |
| `0731ad28` | docs(term-v2): add feature design docs | The full `.design/term-v2` corpus. |

The prior 25-commit line (freshened 2026-09-01 onto `43d09b9d`) plus its
README commit remain preserved under `term-v2-20260901` (`71b797d2`) and the
unbookmarked `615f01d0`; their per-commit shape is documented in the 09-01
README revision (see the refresh notes for the old table).

## ⚡ Plugin surface

`ea70c3c4` (`feat(plugin): expose TUI epilogue rows`) is a plugin-contract
change: the TUI epilogue registry is exposed to plugins so a plugin can
contribute exit rows. Promotion history: the 2026-08-31 rebuild deliberately
deferred a generic registry ("two independently useful adapters plus
plausible upstream interest" was the threshold, unmet with only the fixed
core `Active` row); session-cost (`95a36491`) and last-activity (`aac20b0f`)
rows met it, and the user promoted the full line — registry and ⚡ surface —
into `working-20260901` on 2026-09-01. No Protocol/client regeneration is
involved; the plugin package typecheck is part of the line's verification.

## History

- **2026-08-29**: `term-v2-20260829` snapshot marks the older 2-commit line
  (signals fix only) composed into `working-20260829`.
- **2026-08-31**: epilogue direction reimplemented directly on `6a2c3e91`
  as an 11-commit line (tip `558add6b`); `working` was tail-swapped to
  `working-20260831` (`2ed37418`) rather than rebuilt. The superseded
  research tip is preserved by `term-v2-20260831` at `e5065101`.
- **2026-09-01**: whole line freshened onto `v2@origin` `43d09b9d`
  (zero conflicts) → tip `71b797d2`, snapshot `term-v2-20260901`; the full
  25-commit line promoted into `working-20260901` (`f4620dc0`) and present
  in `working-20260902` (`09d86c86`).
- **2026-09-03**: freshened onto `v2@origin` `7ba5f3e5b220` by
  operator-directed recreate-afresh (duplicate-then-rebase cascaded 24
  conflicts from one mechanical app.tsx hunk; the duplicates were
  abandoned) → 4-commit ladder, tip `0731ad28`, snapshot
  `term-v2-20260903`. Two one-hunk merges (updater prop; import union),
  clean unions elsewhere, and a 3-line `PackageSource.prepare` fixture
  adaptation. Upstream's #47163 is PTY-only — no supersession.

## Verification

- **2026-09-03 freshen (afresh line on `7ba5f3e5`)**: app-lifecycle 32/32
  (family grew 24→32 with upstream's own new tests; the documented Ctrl-O
  case passed this run); process matrix 9; config+epilogue 20; TUI +
  plugin typechecks clean; frozen lockfile clean.
- **2026-09-01 freshen (feature line)**: app-lifecycle 24 — 2 fails are the
  documented Ctrl-O timing flake, reproduced on bare upstream `43d09b9d`;
  process matrix 9; epilogue 6; TUI + plugin typechecks clean. Full-suite
  failures on this base are pre-existing upstream (session-home family,
  jump-to-latest, `/compact … 70 columns` timeouts) — see the manifest's
  2026-09-01 verification-drift note.
- **Composed `working-20260902`**: app-lifecycle 25/25 (the Ctrl-O case
  passed that run), config+epilogue 20, process matrix 9; TUI typecheck
  clean.
- Per-freshen detail lives in the refresh notes beside this file.

## Deployment notes

Nothing to configure — behavior is unconditional TUI cleanup and epilogue
rendering. Limits worth remembering: `SIGQUIT` is unhandled (core-dump
semantics preserved), and `SIGKILL`/power loss cannot be cleaned up by any
process. The known Ctrl-O app-lifecycle flake is upstream-pre-existing, not
this line; re-run the single test before suspecting the feature.

## Open questions

- Multi-session output is now an explicit feature inquiry, tracked by Rekon's
  `rekon-session-mementos` and capability children. The
  [current checkpoint](file:///home/rektide/src/rekon/design/session-mementos/checkpoint0.gpt6a.md)
  covers visible tabs, a distinct visit record, newest-active-first ordered
  filters with terminating authority, and modular per-session lookers. The
  [local evidence](/.design/term-v2/multi-session-evidence0.gpt6a.md) locates the
  retained-batch seam. This extends the display model, not the general JSX slot
  algebra; bookmark and next-response contracts remain design-gated.
- Should `SIGQUIT` also route through scoped cleanup, or keep core-dump
  semantics for diagnosability?
- The manifest's recorded performance-suspicion order names the
  term-v2 × watchman exit interaction (signal cleanup awaiting watcher
  finalizers — the historic managed-service hang shape) as watch item 3;
  unresolved.
- Upstream interest in the epilogue-rows plugin surface has not been probed;
  natural upstream candidate if interest appears.

## Maintenance notes

- Refresh agents: read this README and the latest `refresh-*.md` before
  rebasing; update this file when finishing (the bookmark convention treats
  docs commits as feature work — they compose into `working` with the code).
- Recent rebuilds apply this line last (after watchman/cache-ttl) to keep
  subsequent feature work easy to integrate, even though the manifest's
  preferred order is 2.
- The `index.md` beside this file indexes the design docs; keep both
  coherent when adding new waves.

## Further reading

- [`index.md`](index.md) — design-doc index for this directory.
- [`refresh-20260903.glm53f.md`](refresh-20260903.glm53f.md) — latest freshen record (recreate-afresh onto `7ba5f3e5b220`).
- [`epilogue-registry-implementation0.gpt56s.md`](epilogue-registry-implementation0.gpt56s.md) — current registry direction: ownership graph, invariants, public contract, carry surface.
- [`epilogue-implementation.md`](epilogue-implementation.md) — accepted execution primer for a fresh implementation session.
- [`epilogue-plugins1-syn0.gpt56s.md`](epilogue-plugins1-syn0.gpt56s.md) — research-wave synthesis and staged recommendation.
- [`research/index.md`](research/index.md) — six independent reports (fixed carry, headless slot, plugin surface audit, retained cells, shutdown carry audit, structured registry).
- [`refresh-20260901.glm53.md`](refresh-20260901.glm53.md) — prior freshen record (zero-conflict rebase onto `43d09b9d`).
- [`patches.md`](/opencode/patches.md) — accepted table, 2026-08-31/09-01 refresh notes, and idea-log #5.
