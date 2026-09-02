import { Effect } from "effect"
import type { DatabaseMigration } from "../migration.js"

const migration: DatabaseMigration.Migration = {
  id: "20260902185913_jj-workspace-metadata",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`worktree\` ADD \`metadata\` text;`)
    })
  },
}

export default migration
