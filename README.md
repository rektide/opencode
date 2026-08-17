# opencode beads tickets

Canonical record of every opencode-related beads issue tracker found on
workhorse, captured 2026-08-17. Insurance against bd format drift: bd 1.0.3
can no longer read the old-format `beads.db` (plain SQLite) stores used by
several source projects, so `issues.jsonl` — the JSONL export format — is
the canonical written-down format here.

## Canonical format

`projects/<name>/issues.jsonl` — one JSON object per line, byte-unmodified
export of that project's database. This is the source of truth. Never edit
these files in place.

`projects/<name>/metadata.json` — the tracker backend metadata copied from
the source `.beads/` dir, when present.

`PROVENANCE.tsv` — where each file came from, how it was exported, when,
and the issue count. `sqlite-export` rows were exported directly from the
old-format SQLite db (columns map 1:1 to the bd JSONL keys; `labels` and
`comments` tables were empty in every source). `bd-export-1.0.3` rows came
from `bd export` and use the richer 17-key schema.

Two schema generations exist:

| generation | keys | source |
|---|---|---|
| legacy (10-key) | id, title, description, acceptance_criteria, status, priority, issue_type, created_at, created_by, updated_at | sqlite-export from old-format dbs |
| current (17-key) | legacy keys + `_type`, labels, dependencies, comment_count, dependency_count, dependent_count, owner | bd export 1.0.3 |

Verified-empty databases are recorded as an empty `issues.jsonl`.

Not captured (no `.beads` or no database): `~/a/a/opencode/.beads` (created
2026-08-17, still empty), `opencode-beads-context`, `opencode-plugin-export`.

## Planned: derived and merged copies

Raw canonical files stay untouched. Follow-up rounds will add:

- `derived/<name>/issues.jsonl` — edited/fixed copies (schema alignment to
  the current 17-key generation, id collision fixes, status repairs) with
  changes described in commit messages
- a merged view once the derived copies are reviewed

## Restore

```sh
mkdir -p <project>/.beads
cp projects/<project>/issues.jsonl <project>/.beads/
cd <project> && bd import .beads/issues.jsonl
```

A second copy of the raw data lives in `~/src/opencode-beads.tgz`.
