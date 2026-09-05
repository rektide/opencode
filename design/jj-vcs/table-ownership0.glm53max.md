---
type: Design
title: Table ownership — never alter core tables from feature lines
description: Directive, exit plan, and (disabled) scrub runbook for the jj-vcs worktree.metadata column, after the 2026-09-04 migration-lineage incident.
resource: design/jj-vcs/table-ownership0.glm53max.md
tags: [jj-vcs, database, migration, policy, incident]
status: stable
generated: { by: llm:glm53max, at: 2026-09-04T21:00:00-04:00 }
stale_after: 2026-10-04
sources:
  - id: incident
    resource: file:///home/rektide/src/opencode-working/.design/compose-20260904/compose-20260904.gpt56s.md
    title: Compose friction 2026-09-04 — deployment incident addendum
    author: llm:gpt56s + llm:glm53max
    last_modified: 2026-09-04
  - id: manifest
    resource: file:///home/rektide/ado/patches.md
    title: OpenCode patches and ideas — data-store directive
    author: rektide
    last_modified: 2026-09-04
  - id: followups
    resource: design/jj-vcs/followups.glm53.md
    title: Known follow-ups ledger
    last_modified: 2026-09-04
---

# Table ownership: never alter core tables from feature lines

## Situation

On 2026-09-04 the deployed `working` build could not boot a single server.
Root cause: this feature line's commit "record worktree metadata" (C5) adds a
`metadata` column to the **core-owned `worktree` table**. The 2026-09-02
composition shipped that ALTER as migration
`20260902065751_jj-workspace-metadata`; the rewritten feature line carried a
byte-identical ALTER as `20260902185913_jj-workspace-metadata`. The migrator
journals by id, so every live database migrated by a 09-02-era build re-ran
the ALTER and died with `duplicate column name: metadata`. Same-day
mitigation: compose rider `cdc7a949` guards the ALTER with a
`pragma_table_info` check so either lineage boots.

The guard is a bandage. The disease is that a feature line mutated a table it
does not own.

## The directive

**A feature line never ALTERs, DROPs, RENAMEs, or otherwise modifies a table
owned by OpenCode core — and never adds columns to core tables. Not "rarely".
Not "just one nullable column". Never.**

Durable feature state goes in one of, in order of preference:

1. **No storage at all** — in-memory/Effect layer state when persistence is
   not genuinely required.
2. **Non-database storage** — the plugin storage API, or a sidecar file the
   feature owns under the state directory.
3. **A `rektide_`-prefixed table of our own** — explicit ownership, additive
   only, created by one guarded idempotent migration (see rules below).

The `rektide_` prefix is deliberate: the migrator reserves the unprefixed
namespace for OpenCode core and `_`-prefixed tables for embedders, so an
unprefixed-but-namespaced `rektide_*` table migrates normally while being
unmistakably ours in every database inspection, today and in any future
upstream tooling.

## Why `worktree.metadata` is a standing time bomb

- **Upstream can add the same column.** If OpenCode core ever adds a
  `metadata` column to `worktree` (a plausible generic extension), their
  migration collides with our residue on every shared database — their
  ALTER, our column, same crash class we just lived through, except we do
  not control their migration to add a guard.
- **Fresh vs migrated databases diverge forever.** Fresh databases get the
  column from the bootstrap schema (`schema.up` builds the full current
  shape); migrated ones get it from one of two journal ids. Any code or tool
  reasoning about "does this DB have the column" must handle three worlds.
- **Composition regenerates migration timestamps.** Every freshen/rebuild
  that carries this feature can mint a new id for the same statement. The
  guard suppressed this once; a future rewrite of the migration file that
  drops the guard re-arms it.
- **Reverts and forks inherit it silently.** Any DB copied, backed up, or
  opened by an older binary carries the column with no journal entry the
  older binary understands.

## The migrate-away plan (sanctioned path)

Move the metadata into our own table without ever touching `worktree`
again. Phased, each step independently shippable:

1. **Own table.** One guarded migration creates
   `rektide_jj_worktree (id text PRIMARY KEY, metadata text)` — plain
   `CREATE TABLE IF NOT EXISTS` semantics via a pragma guard, idempotent by
   construction.
2. **Backfill.** Same migration, guarded by
   `pragma_table_info('worktree')`: if the legacy column exists,
   `INSERT OR IGNORE INTO rektide_jj_worktree SELECT id, metadata FROM
   worktree WHERE metadata IS NOT NULL`. Never errors on databases without
   the column; no-ops when already backfilled.
3. **Dual-read cutover.** Write path goes to `rektide_jj_worktree` only.
   Read path prefers our table, falling back to the legacy column for rows
   written by pre-cutover binaries (a row missing from our table but
   non-NULL in the legacy column).
4. **Drop the fallback** after a settle period (a future compose, once no
   pre-cutover binary is plausible in the fleet).
5. **Never drop the legacy column.** Dropping a column from `worktree` is
   exactly the prohibited modification. The column stays as inert residue.
   If upstream ever collides with it, that becomes a deliberate
   human-attended decision, not a migration.
6. **Tests pin the three worlds**: a fresh bootstrap database, a database
   journaled with `20260902065751_*`, and one journaled with
   `20260902185913_*` — the migration and both read paths must behave
   identically across them.

Register the work in [`followups.glm53.md`](followups.glm53.md) when
scheduled.

## The scrub runbook — DISABLED, DO NOT RUN

*This section is written on instruction as a hypothetical. It has never been
executed. It must never be executed. It exists only so the idea has a
concrete, analyzable shape and so nobody "improves" the system into this by
accident. Every step below is a footgun; the notes say why.*

Goal as stated: remove all evidence that we ever altered `worktree` — both
migration files, the journal rows, and the column itself.

What it would take:

1. **Rewrite composition history** so neither
   `20260902065751_jj-workspace-metadata` nor
   `20260902185913_jj-workspace-metadata` exists in any `working` snapshot
   reachable by a deployed binary. Rewriting the snapshots we already
   deployed does nothing for the binaries still holding them; every extant
   dist and deleted-inode process is frozen history.
2. **Journal surgery on every deployed database**:
   `DELETE FROM migration WHERE id LIKE '%_jj-workspace-metadata'`. Any
   binary that still carries the migration files then re-runs them — the
   duplicate-column crash, deliberately recreated. Any binary that does not
   carries a journal referencing ids absent from its registry — the
   legacy-drizzle seeding path dies on unknown timestamps.
3. **Column drop**: `ALTER TABLE worktree DROP COLUMN metadata` (SQLite
   ≥3.35). Prohibited by the directive regardless — and it breaks every
   older binary whose `schema.up`/ORM still expects the column, turning a
   cosmetic residue into a hard startup failure for them.
4. **Bootstrap schema divergence**: removing the column from the generated
   schema means fresh databases no longer match every migrated one, so any
   tooling or hand-written SQL keyed on column indexes/prefixes can drift.

The runbook stays disabled indefinitely. The guard (`cdc7a949`) plus the
migrate-away plan is the complete sanctioned response.

## Idempotency rules for any migration a feature line carries

Even `rektide_*` migrations must assume hostile replay conditions, because
composition regenerates timestamps and several binary generations share one
database file:

- Guard every DDL with a schema probe (`pragma_table_info`,
  `sqlite_master`) — the statement must no-op when its effect already
  exists.
- Never infer prior state from journal ids; probe the schema.
- Never mutate rows or tables the feature did not create.
- Fresh databases bootstrap from `schema.up` without running migrations at
  all — a migration's only job is upgrading databases created by older
  binaries. Test against fresh, old-journal, and new-journal databases.
- Prefer migrations whose entire content is "create my table if absent,
  backfill my table if the legacy source still exists".

## Cross-references

- [`patches.md` data-store directive](file:///home/rektide/ado/patches.md) —
  the repo-wide rule this doc instantiates for jj-vcs.
- [compose-20260904 incident addendum](file:///home/rektide/src/opencode-working/.design/compose-20260904/compose-20260904.gpt56s.md)
  — the incident that forced this policy.
- [`rewrite1.glm53.md`](rewrite1.glm53.md) — the rewritten line that minted
  the second migration id.
- [`followups.glm53.md`](followups.glm53.md) — where the migrate-away work
  gets scheduled.
