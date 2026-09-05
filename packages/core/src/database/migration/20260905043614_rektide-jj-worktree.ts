import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20260905043614_rektide-jj-worktree",
  up(tx) {
    return tx.run(`
      CREATE TABLE IF NOT EXISTS \`rektide_jj_worktree\` (
        \`id\` text PRIMARY KEY,
        \`metadata\` text NOT NULL
      );
    `)
  },
}

export default migration
