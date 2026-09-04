# Graceful TUI termination (`term-v2`)

This workspace holds the graceful-termination and exit-epilogue patch stack
for the OpenCode v2 TUI: catchable death signals route through normal scoped
cleanup, and the exit epilogue is a pluggable row registry with plugin
adapters. Workspace `~/src/opencode-term-v2` (jj workspace name matches the
directory; V1 precedent was `~/src/opencode-term`, bookmark `term`, commit
`e524a2c6`). Floating bookmark `term-v2` at `71b797d2` (= snapshot
`term-v2-20260901`), 25 commits directly on base `v2@origin` `43d09b9d`.
Manifest: "Graceful TUI termination" row in the accepted `working` table
(preferred order 2, though recent rebuilds apply the line last to ease
merging) and idea-log #5 in [`patches.md`](/opencode/patches.md).

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

## Line shape (25 commits on `43d09b9d`)

| Commit | Subject | Scope |
| --- | --- | --- |
| `fd408bef` | fix(tui): gracefully handle termination signals | Route `SIGHUP`/`SIGINT`/`SIGTERM` through normal scoped TUI cleanup: restore terminal state/title, remove listeners, print the normal session epilogue exactly once. `SIGQUIT` remains unhandled; `SIGKILL` cannot be caught by any process. |
| `744a1626` | feat(tui): show session activity on exit | Session-activity epilogue row. |
| `3c064771` | fix(tui): preserve epilogue across termination | Epilogue survives the signal-driven exit path. |
| `312b0515` | feat(tui): harden session activity epilogue | Robustness of the fixed core `Active` row. |
| `0c750563` | test(tui): strengthen epilogue lifecycle coverage | Lifecycle tests. |
| `939675d9` | test(tui): cover epilogue route ownership | Route-ownership tests. |
| `0b02f58c` `6a6c119c` `ec3c4667` | docs(tui): epilogue exploration | Pluggable-epilogue possibility-space doc, expanded research wave, implementation primer. |
| `5d31d6c0` `1385bd39` | docs(term-v2): refresh records | 2026-08-29 and 2026-08-31 refresh notes. |
| `bad11cf1` | feat(tui): retain supplemental epilogue rows | Registry retains supplemental rows. |
| `ea70c3c4` | feat(plugin): expose TUI epilogue rows | ⚡ plugin-surface change — see below. |
| `95a36491` | feat(tui): show session cost on exit | First plugin-fed adapter row. |
| `aac20b0f` | feat(tui): show last activity date in epilogue | Second adapter row. |
| `3282a77b` | docs: document TUI epilogue rows | Registry documentation. |
| `c147eca1` | test(tui): verify epilogue render isolation | One adapter's failure cannot take down the epilogue render. |
| `8f44c476` | test(tui): harden epilogue process matrix | Real-process signal matrix (SIGINT/SIGTERM/etc. against actual TUI processes). |
| `f1743c78` | test(tui): cover epilogue reload interval | Reload cadence coverage. |
| `254bf69a` | fix(tui): contain invalid epilogue projections | Bad adapter projections are contained. |
| `4d528b9` `3faa2dc` `dd89b83` `4d770ce` | docs(tui): registry architecture / refresh / review records | Architecture doc, base refresh, post-refresh verification, review fixes. |
| `71b797d2` | docs(term-v2): record refresh onto 43d09b9d | 2026-09-01 freshen record (tip). |

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

## Verification

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
- [`epilogue-registry-implementation0.gpt56s.md`](epilogue-registry-implementation0.gpt56s.md) — current registry direction: ownership graph, invariants, public contract, carry surface.
- [`epilogue-implementation.md`](epilogue-implementation.md) — accepted execution primer for a fresh implementation session.
- [`epilogue-plugins1-syn0.gpt56s.md`](epilogue-plugins1-syn0.gpt56s.md) — research-wave synthesis and staged recommendation.
- [`research/index.md`](research/index.md) — six independent reports (fixed carry, headless slot, plugin surface audit, retained cells, shutdown carry audit, structured registry).
- [`refresh-20260901.glm53.md`](refresh-20260901.glm53.md) — latest freshen record.
- [`patches.md`](/opencode/patches.md) — accepted table, 2026-08-31/09-01 refresh notes, and idea-log #5.
