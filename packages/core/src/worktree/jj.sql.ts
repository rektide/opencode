import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Worktree } from "@opencode-ai/schema/worktree"
import { absoluteColumn } from "../database/path.js"

export const JjWorktreeTable = sqliteTable("rektide_jj_worktree", {
  id: absoluteColumn().primaryKey(),
  metadata: text({ mode: "json" }).$type<Worktree.JjWorkspaceMetadata>().notNull(),
})
