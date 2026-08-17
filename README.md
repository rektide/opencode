# opencode beads tickets

Insurance copy of beads issue tracker data (`issues.jsonl` + `metadata.json`)
from every opencode-related project on workhorse, gathered 2026-08-17.

Captured because bd 1.0.3 can no longer read the old-format `beads.db`
(plain SQLite) stores used by several of these projects; the JSONL here is a
fresh SQL export of each, not a possibly-stale auto-export.

## Layout

```
projects/<name>/.beads/issues.jsonl   bd-format export (bd import -able)
projects/<name>/.beads/metadata.json  tracker backend metadata
```

| project | issues |
|---|---|
| opencode-transcripter | 60 |
| opencoattails | 58 |
| opencode-multiview | 34 |
| opencode-session-rs | 30 |
| opencode-atuin-hooks | 14 |
| tmux-opencode-split | 14 |
| gunshi-opencode-plugin | 11 |
| opencode-session-watcher | 12 |
| opencodance | 5 |
| opencode-session-fab | 1 |

Empty/unreadable, nothing captured: opencode-beads-bad (0 issues),
opencode-zeroconf (0 issues), openretitle, opencondenser, opencodeth.

A second copy of this data lives in `~/src/opencode-beads.tgz`.

## Restore

```sh
mkdir -p <project>/.beads
cp projects/<project>/.beads/issues.jsonl <project>/.beads/
cd <project> && bd import .beads/issues.jsonl
```
