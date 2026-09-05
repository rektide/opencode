import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20260905043614_rektide-jj-worktree",
  up(tx) {
    return Effect.gen(function* () {
      const table = yield* tx.get<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rektide_jj_worktree'`,
      )
      if (!table)
        yield* tx.run(`
          CREATE TABLE \`rektide_jj_worktree\` (
            \`id\` text PRIMARY KEY,
            \`metadata\` text NOT NULL
          );
        `)

      const columns = yield* tx.all<{ name: string }>(`PRAGMA table_info(\`worktree\`)`)
      if (!columns.some((column) => column.name === "metadata")) return
      if (columns.some((column) => column.name === "directory")) {
        yield* tx.run(`
          INSERT OR IGNORE INTO \`rektide_jj_worktree\` (\`id\`, \`metadata\`)
          SELECT \`directory\`, \`metadata\` FROM \`worktree\` WHERE \`metadata\` IS NOT NULL;
        `)
        return
      }
      if (columns.some((column) => column.name === "id"))
        yield* tx.run(`
          INSERT OR IGNORE INTO \`rektide_jj_worktree\` (\`id\`, \`metadata\`)
          SELECT \`id\`, \`metadata\` FROM \`worktree\` WHERE \`metadata\` IS NOT NULL;
        `)
    })
  },
}

export default migration
