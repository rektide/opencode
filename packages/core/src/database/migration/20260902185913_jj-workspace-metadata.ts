import { sql } from "drizzle-orm"
import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20260902185913_jj-workspace-metadata",
  up(tx) {
    return Effect.gen(function* () {
      // The 2026-09-02 working composition shipped this column under id
      // 20260902065751_jj-workspace-metadata. Databases migrated by that
      // build already carry the column and would fail the ALTER below, so
      // skip it when present.
      const columns = yield* tx.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('worktree')`)
      if (columns.some((column) => column.name === "metadata")) return
      yield* tx.run(`ALTER TABLE \`worktree\` ADD \`metadata\` text;`)
    })
  },
}

export default migration
