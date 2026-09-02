export * as WorktreeJj from "./jj.js"

import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { Worktree } from "@opencode-ai/schema/worktree"
import { AppProcess } from "@opencode-ai/util/process"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Slug } from "../util/slug.js"
import { AbsolutePath } from "../schema.js"
import { JjWorkspaceError, type ListEntry, type Strategy } from "../worktree.js"
import { canonical } from "./directory.js"

const defined = <A>(item: A | undefined): item is A => item !== undefined

export const make = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service

  const run = Effect.fnUntraced(function* (
    operation: JjWorkspaceError["operation"],
    directory: AbsolutePath,
    args: string[],
  ) {
    const result = yield* proc
      .run(
        ChildProcess.make("jj", ["--no-pager", "--color=never", ...args], {
          cwd: directory,
          extendEnv: true,
          stdin: "ignore",
        }),
      )
      .pipe(Effect.mapError((cause) => new JjWorkspaceError({ operation, directory, message: cause.message })))
    const text = result.stdout.toString("utf8")
    const message = result.stderr.toString("utf8").trim() || text.trim() || `jj workspace ${operation} failed`
    if (result.exitCode !== 0) return yield* new JjWorkspaceError({ operation, directory, message })
    return text
  })

  const list = Effect.fn("Worktree.Jj.list")(function* (directory: AbsolutePath) {
    const source = yield* canonical(fs, directory)
    const text = yield* run("list", source, [
      // Metadata answers never depend on unsaved edits, and jj snapshots the
      // working copy on load unless told not to.
      "--ignore-working-copy",
      "workspace",
      "list",
      "-T",
      'name ++ "\\0" ++ root ++ "\\0" ++ target.change_id() ++ "\\0" ++ target.commit_id() ++ "\\0"',
    ])
    const fields = text.split("\0")
    const records = Array.from({ length: Math.floor(fields.length / 4) }, (_, index) => ({
      workspace: fields[index * 4],
      root: fields[index * 4 + 1],
      changeID: fields[index * 4 + 2],
      commitID: fields[index * 4 + 3],
    })).filter((item) => item.workspace && item.root)
    return yield* Effect.forEach(
      records,
      (item) =>
        canonical(fs, AbsolutePath.make(item.root)).pipe(
          Effect.map((root) => {
            const entry: ListEntry =
              root === source
                ? { directory: root, type: "root" }
                : {
                    directory: root,
                    type: "worktree",
                    metadata: {
                      type: "jj_workspace",
                      workspace: item.workspace,
                      changeID: item.changeID || undefined,
                      commitID: item.commitID || undefined,
                    },
                  }
            return entry
          }),
          Effect.catchTag("Worktree.DirectoryUnavailableError", () => Effect.succeed(undefined)),
        ),
    ).pipe(Effect.map((items) => items.filter(defined)))
  })

  return {
    id: Worktree.StrategyID.make("jj_workspace"),
    vcs: "jj" as const,
    create: Effect.fn("Worktree.Jj.create")(function* (input) {
      const source = yield* canonical(fs, input.sourceDirectory)
      const revision = input.base ?? "@"
      const identity = (yield* run("create", source, [
        "log",
        "--no-graph",
        "-r",
        revision,
        "-T",
        'commit_id ++ "\\0" ++ change_id ++ "\\0"',
      ])).split("\0")
      const base = identity[0]?.trim()
      if (!base || !identity[1]?.trim() || identity.length !== 3)
        return yield* new JjWorkspaceError({
          operation: "create",
          directory: source,
          message: `JJ revision must resolve to exactly one commit: ${revision}`,
        })
      const workspace = `opencode-${Slug.create()}-${crypto.randomUUID().slice(0, 8)}`
      yield* run("create", source, ["workspace", "add", "--name", workspace, "-r", base, input.directory])
      const directory = yield* canonical(fs, input.directory)
      const entry = (yield* list(source)).find(
        (item) => item.metadata?.type === "jj_workspace" && item.metadata.workspace === workspace,
      )
      const metadata = entry?.metadata
      if (!metadata || metadata.type !== "jj_workspace")
        return yield* new JjWorkspaceError({
          operation: "create",
          directory,
          message: "Created JJ workspace could not be discovered",
        })
      return {
        directory,
        strategy: Worktree.StrategyID.make("jj_workspace"),
        metadata: { ...metadata, base },
      }
    }),
    remove: Effect.fn("Worktree.Jj.remove")(function* (input) {
      const directory = yield* canonical(fs, input.directory)
      const entries = yield* list(input.sourceDirectory)
      const entry = entries.find((item) => item.directory === directory)
      const expected = input.metadata?.type === "jj_workspace" ? input.metadata : undefined
      if (!entry || entry.metadata?.type !== "jj_workspace") {
        if (!expected)
          return yield* new JjWorkspaceError({ operation: "remove", directory, message: "JJ workspace is not registered" })
        if (!input.force)
          return yield* new JjWorkspaceError({
            operation: "remove",
            directory,
            message: "JJ workspace is already forgotten; force is required to remove the remaining directory",
            forceRequired: true,
          })
        yield* fs
          .remove(directory, { recursive: true, force: true })
          .pipe(Effect.mapError((cause) => new JjWorkspaceError({ operation: "remove", directory, message: cause.message })))
        return
      }
      if (expected && expected.workspace !== entry.metadata.workspace)
        return yield* new JjWorkspaceError({ operation: "remove", directory, message: "JJ workspace identity changed" })

      if (!input.force) {
        if (!expected?.base)
          return yield* new JjWorkspaceError({
            operation: "remove",
            directory,
            message: "JJ workspace creation base is unknown",
            forceRequired: true,
          })
        const changed = yield* run("remove", directory, ["diff", "-r", "@", "-T", 'path ++ "\\0"'])
        const conflict = yield* run("remove", directory, ["log", "--no-graph", "-r", "@", "-T", "conflict"])
        const history = (yield* run("remove", directory, [
          "log",
          "--no-graph",
          "-r",
          `${expected.base}..@`,
          "-T",
          'current_working_copy ++ "\\0" ++ empty ++ "\\0" ++ description.first_line() ++ "\\0"',
        ])).split("\0")
        const valuable = Array.from({ length: Math.floor(history.length / 3) }, (_, index) => ({
          current: history[index * 3],
          empty: history[index * 3 + 1],
          description: history[index * 3 + 2],
        })).some((item) => item.current !== "true" || item.empty !== "true" || !!item.description)
        if (changed || conflict.trim() === "true" || valuable)
          return yield* new JjWorkspaceError({
            operation: "remove",
            directory,
            message: "JJ workspace contains working-copy changes, conflicts, or committed work after its base",
            forceRequired: true,
          })
      }

      const source = entries.find((item) => item.directory !== directory)
      if (!source)
        return yield* new JjWorkspaceError({
          operation: "remove",
          directory,
          message: "Cannot forget the only registered JJ workspace",
        })
      yield* run("remove", source.directory, ["workspace", "forget", entry.metadata.workspace])
      yield* fs.remove(directory, { recursive: true, force: true }).pipe(
        Effect.mapError(
          (cause) =>
            new JjWorkspaceError({
              operation: "remove",
              directory,
              message: `JJ workspace was forgotten but its directory could not be removed: ${cause.message}`,
            }),
        ),
      )
    }),
    list,
  } satisfies Strategy
})
