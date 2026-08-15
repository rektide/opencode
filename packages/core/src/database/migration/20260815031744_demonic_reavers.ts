import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

const migration: DatabaseMigration.Migration = {
  id: "20260815031744_demonic_reavers",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`project_directory\` ADD \`metadata\` text;`)
    })
  },
}

export default migration
