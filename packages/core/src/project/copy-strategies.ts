import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AbsolutePath } from "../schema"
import { Git } from "../git"
import { AppProcess } from "@opencode-ai/util/process"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Slug } from "../util/slug"
import { ProjectCopy } from "@opencode-ai/schema/project-copy"
import { DirectoryUnavailableError, JjWorkspaceError, StrategyID, type ListEntry, type Strategy } from "./copy"

const defined = <A>(item: A | undefined): item is A => item !== undefined

export function makeGitWorktreeStrategy(input: {
  git: Git.Interface
  canonical: (directory: AbsolutePath) => Effect.Effect<AbsolutePath, DirectoryUnavailableError>
}) {
  return {
    id: StrategyID.make("git_worktree"),
    vcs: "git",
    create: Effect.fn("ProjectCopy.GitWorktree.create")(function* (options) {
      const repository = yield* input.git.repo.discover(options.sourceDirectory)
      if (!repository) return yield* new DirectoryUnavailableError({ directory: options.sourceDirectory })
      yield* input.git.worktree.create({ repository, directory: options.directory })
      return {
        directory: yield* input.canonical(options.directory),
        strategy: StrategyID.make("git_worktree"),
        metadata: { type: "git_worktree" },
      }
    }),
    remove: Effect.fn("ProjectCopy.GitWorktree.remove")(function* (options) {
      const found = yield* input.git.repo.discover(options.directory)
      if (!found) return yield* new DirectoryUnavailableError({ directory: options.directory })
      yield* input.git.worktree.remove({ repository: found, directory: options.directory, force: options.force })
    }),
    list: Effect.fn("ProjectCopy.GitWorktree.list")(function* (directory) {
      const found = yield* input.git.repo.discover(directory)
      if (!found) return yield* new DirectoryUnavailableError({ directory })
      const entries = yield* input.git.worktree.list(found)
      return yield* Effect.forEach(entries, (entry) =>
        input.canonical(entry.directory).pipe(
          Effect.map(
            (directory) =>
              ({
                directory,
                type: entry.kind === "main" ? "root" : "copy",
                metadata: entry.kind === "main" ? undefined : ({ type: "git_worktree" } as const),
              }) as const,
          ),
          Effect.catchTag("ProjectCopy.DirectoryUnavailableError", () => Effect.succeed(undefined)),
        ),
      ).pipe(Effect.map((items) => items.filter(defined)))
    }),
  } satisfies Strategy
}

export function makeJjWorkspaceStrategy(input: {
  proc: AppProcess.Interface
  fs: FSUtil.Interface
  canonical: (directory: AbsolutePath) => Effect.Effect<AbsolutePath, DirectoryUnavailableError>
}) {
  const run = Effect.fnUntraced(function* (
    operation: JjWorkspaceError["operation"],
    directory: AbsolutePath,
    args: string[],
  ) {
    const result = yield* input.proc
      .run(
        ChildProcess.make("jj", ["--no-pager", "--color=never", ...args], {
          cwd: directory,
          extendEnv: true,
          stdin: "ignore",
        }),
      )
      .pipe(
        Effect.mapError(
          (cause) => new JjWorkspaceError({ operation, directory, message: cause.message }),
        ),
      )
    const text = result.stdout.toString("utf8")
    const message = result.stderr.toString("utf8").trim() || text.trim() || `jj workspace ${operation} failed`
    if (result.exitCode !== 0) return yield* new JjWorkspaceError({ operation, directory, message })
    return text
  })

  const list = Effect.fn("ProjectCopy.JjWorkspace.list")(function* (directory: AbsolutePath) {
    const source = yield* input.canonical(directory)
    const text = yield* run("list", source, [
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
        input.canonical(AbsolutePath.make(item.root)).pipe(
          Effect.map(
            (root) =>
              ({
                directory: root,
                type: root === source ? "root" : "copy",
                metadata:
                  root === source
                    ? undefined
                    : ({
                        type: "jj_workspace",
                        workspace: item.workspace,
                        changeID: item.changeID || undefined,
                        commitID: item.commitID || undefined,
                      } satisfies ProjectCopy.JjWorkspaceMetadata),
              }) satisfies ListEntry,
          ),
          Effect.catchTag("ProjectCopy.DirectoryUnavailableError", () => Effect.succeed(undefined)),
        ),
    ).pipe(Effect.map((items) => items.filter(defined)))
  })

  return {
    id: StrategyID.make("jj_workspace"),
    vcs: "jj",
    create: Effect.fn("ProjectCopy.JjWorkspace.create")(function* (options) {
      const source = yield* input.canonical(options.sourceDirectory)
      const revision = options.base ?? "@"
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
      yield* run("create", source, ["workspace", "add", "--name", workspace, "-r", base, options.directory])
      const directory = yield* input.canonical(options.directory)
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
        strategy: StrategyID.make("jj_workspace"),
        metadata: { ...metadata, base },
      }
    }),
    remove: Effect.fn("ProjectCopy.JjWorkspace.remove")(function* (options) {
      const directory = yield* input.canonical(options.directory)
      const entries = yield* list(options.sourceDirectory)
      const entry = entries.find((item) => item.directory === directory)
      const expected = options.metadata?.type === "jj_workspace" ? options.metadata : undefined
      if (!entry || entry.metadata?.type !== "jj_workspace") {
        if (!expected)
          return yield* new JjWorkspaceError({ operation: "remove", directory, message: "JJ workspace is not registered" })
        if (!options.force)
          return yield* new JjWorkspaceError({
            operation: "remove",
            directory,
            message: "JJ workspace is already forgotten; force is required to remove the remaining directory",
            forceRequired: true,
          })
        yield* input.fs.remove(directory, { recursive: true, force: true }).pipe(
          Effect.mapError(
            (cause) => new JjWorkspaceError({ operation: "remove", directory, message: cause.message }),
          ),
        )
        return
      }
      if (expected && expected.workspace !== entry.metadata.workspace)
        return yield* new JjWorkspaceError({ operation: "remove", directory, message: "JJ workspace identity changed" })

      if (!options.force) {
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
      yield* input.fs.remove(directory, { recursive: true, force: true }).pipe(
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
}
