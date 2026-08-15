export * as ProjectCopy from "./project-copy.js"

import { Schema } from "effect"
import { optional } from "./schema.js"
import { ProjectID } from "./project-id.js"
import { AbsolutePath } from "./schema.js"

export const StrategyID = Schema.Trim.pipe(Schema.check(Schema.isNonEmpty()), Schema.brand("ProjectCopy.StrategyID"))
export type StrategyID = typeof StrategyID.Type

export const CreateInput = Schema.Struct({
  projectID: ProjectID,
  strategy: StrategyID,
  sourceDirectory: AbsolutePath,
  directory: AbsolutePath,
  name: optional(Schema.String),
  base: optional(Schema.String),
}).annotate({ identifier: "ProjectCopy.CreateInput" })
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

export const RemoveInput = Schema.Struct({
  projectID: ProjectID,
  directory: AbsolutePath,
  force: Schema.Boolean,
}).annotate({ identifier: "ProjectCopy.RemoveInput" })
export interface RemoveInput extends Schema.Schema.Type<typeof RemoveInput> {}

export const GitWorktreeMetadata = Schema.Struct({
  type: Schema.Literal("git_worktree"),
}).annotate({ identifier: "ProjectCopy.GitWorktreeMetadata" })
export interface GitWorktreeMetadata extends Schema.Schema.Type<typeof GitWorktreeMetadata> {}

export const JjWorkspaceMetadata = Schema.Struct({
  type: Schema.Literal("jj_workspace"),
  workspace: Schema.String,
  base: optional(Schema.String),
  changeID: optional(Schema.String),
  commitID: optional(Schema.String),
}).annotate({ identifier: "ProjectCopy.JjWorkspaceMetadata" })
export interface JjWorkspaceMetadata extends Schema.Schema.Type<typeof JjWorkspaceMetadata> {}

export const Metadata = Schema.Union([GitWorktreeMetadata, JjWorkspaceMetadata]).annotate({
  identifier: "ProjectCopy.Metadata",
})
export type Metadata = typeof Metadata.Type

export const Copy = Schema.Struct({
  directory: AbsolutePath,
  strategy: StrategyID,
  metadata: Metadata,
}).annotate({ identifier: "ProjectCopy.Copy" })
export interface Copy extends Schema.Schema.Type<typeof Copy> {}
