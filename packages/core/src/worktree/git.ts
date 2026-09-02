export * as WorktreeGit from "./git.js"

import { Effect } from "effect"
import { Worktree } from "@opencode-ai/schema/worktree"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Git } from "../git.js"
import { canonical, DirectoryUnavailableError } from "./directory.js"
import type { ListEntry, Strategy } from "../worktree.js"

export const make = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const git = yield* Git.Service

  return {
    id: Worktree.StrategyID.make("git"),
    vcs: "git" as const,
    create: Effect.fn("Worktree.Git.create")(function* (input) {
      const repository = yield* git.repo.discover(input.sourceDirectory)
      if (!repository) return yield* new DirectoryUnavailableError({ directory: input.sourceDirectory })
      yield* git.worktree.create({ repository, directory: input.directory, ref: input.branch })
      return {
        directory: yield* canonical(fs, input.directory),
        strategy: Worktree.StrategyID.make("git"),
        metadata: { type: "git_worktree" } satisfies Worktree.GitWorktreeMetadata,
      }
    }),
    remove: Effect.fn("Worktree.Git.remove")(function* (input) {
      const repository = yield* git.repo.discover(input.directory)
      if (!repository) return yield* new DirectoryUnavailableError({ directory: input.directory })
      yield* git.worktree.remove({ repository, directory: input.directory, force: input.force })
    }),
    list: Effect.fn("Worktree.Git.list")(function* (directory) {
      const repository = yield* git.repo.discover(directory)
      if (!repository) return yield* new DirectoryUnavailableError({ directory })
      const entries = yield* git.worktree.list(repository)
      return yield* Effect.forEach(entries, (entry) =>
        canonical(fs, entry.directory).pipe(
          Effect.map((directory) => {
            const item: ListEntry =
              entry.kind === "main"
                ? { directory, type: "root" }
                : { directory, type: "worktree", metadata: { type: "git_worktree" } }
            return item
          }),
          Effect.catchTag("Worktree.DirectoryUnavailableError", () => Effect.undefined),
        ),
      ).pipe(Effect.map((items) => items.filter((item): item is ListEntry => item !== undefined)))
    }),
  } satisfies Strategy
})
