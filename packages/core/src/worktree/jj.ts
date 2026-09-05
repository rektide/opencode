export * as WorktreeJj from "./jj.js"

import { and, eq, ne, sql } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import path from "path"
import { Worktree } from "@opencode/schema/worktree"
import { AppProcess } from "@opencode/util/process"
import { FSUtil } from "@opencode/util/fs-util"
import { Database } from "../database/database.js"
import { Slug } from "../util/slug.js"
import { AbsolutePath } from "../schema.js"
import { Location } from "../location.js"
import type { Strategy } from "./strategies.js"
import { WorktreeTable } from "./sql.js"
import { canonical, DirectoryUnavailableError } from "./directory.js"
import { JjWorktreeTable } from "./jj.sql.js"

const decodeMetadata = Schema.decodeUnknownOption(Worktree.JjWorkspaceMetadata)
const decodeLegacy = Schema.decodeUnknownOption(Schema.fromJsonString(Worktree.JjWorkspaceMetadata))
const defined = <A>(item: A | undefined): item is A => item !== undefined

export const make = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const proc = yield* AppProcess.Service
  const db = (yield* Database.Service).db
  const projectID = (yield* Location.Service).project.id
  const hasLegacyMetadata = (
    yield* db.all<{ name: string }>(sql`PRAGMA table_info(worktree)`).pipe(Effect.orDie)
  ).some((column) => column.name === "metadata")

  const run = Effect.fnUntraced(function* (operation: string, directory: AbsolutePath, args: string[]) {
    const result = yield* proc
      .run(
        ChildProcess.make("jj", ["--no-pager", "--color=never", ...args], {
          cwd: directory,
          extendEnv: true,
          stdin: "ignore",
        }),
      )
      .pipe(
        Effect.mapError(
          (cause) =>
            new Worktree.OperationError({ message: `Jujutsu workspace ${operation} failed: ${cause.message}` }),
        ),
      )
    const text = result.stdout.toString("utf8")
    const message = result.stderr.toString("utf8").trim() || text.trim() || `jj workspace ${operation} failed`
    if (result.exitCode !== 0) return yield* new Worktree.OperationError({ message })
    return text
  })

  const read = Effect.fnUntraced(function* (directory: AbsolutePath) {
    const owned = yield* db
      .select({ metadata: JjWorktreeTable.metadata })
      .from(JjWorktreeTable)
      .where(eq(JjWorktreeTable.id, directory))
      .get()
      .pipe(Effect.orDie)
    if (owned) return Option.getOrUndefined(decodeMetadata(owned.metadata))
    if (!hasLegacyMetadata) return undefined
    const legacy = yield* db
      .get<{ metadata: string | null }>(sql`SELECT metadata FROM worktree WHERE directory = ${directory}`)
      .pipe(Effect.orDie)
    if (!legacy?.metadata) return undefined
    return Option.getOrUndefined(decodeLegacy(legacy.metadata))
  })

  const write = (directory: AbsolutePath, metadata: Worktree.JjWorkspaceMetadata) =>
    db
      .insert(JjWorktreeTable)
      .values({ id: directory, metadata })
      .onConflictDoUpdate({ target: JjWorktreeTable.id, set: { metadata } })
      .run()
      .pipe(Effect.orDie, Effect.asVoid)

  const list = Effect.fn("Worktree.Jj.list")(function* (directory: AbsolutePath) {
    const source = yield* canonical(fs, directory)
    if (!(yield* fs.existsSafe(path.join(source, ".jj", "repo"))))
      return yield* new DirectoryUnavailableError({ directory: source })
    const fields = (
      yield* run("list", source, [
        "--ignore-working-copy",
        "workspace",
        "list",
        "-T",
        'name ++ "\\0" ++ root ++ "\\0" ++ target.change_id() ++ "\\0" ++ target.commit_id() ++ "\\0"',
      ])
    ).split("\0")
    const records = Array.from({ length: Math.floor(fields.length / 4) }, (_, index) => ({
      workspace: fields[index * 4],
      root: fields[index * 4 + 1],
      changeID: fields[index * 4 + 2],
      commitID: fields[index * 4 + 3],
    })).filter((item) => item.workspace && item.root)

    return yield* Effect.forEach(records, (item) =>
      canonical(fs, AbsolutePath.make(item.root)).pipe(
        Effect.flatMap((root) =>
          Effect.gen(function* () {
            const previous = yield* read(root)
            const metadata: Worktree.JjWorkspaceMetadata = {
              type: "jj_workspace",
              workspace: item.workspace,
              changeID: item.changeID || undefined,
              commitID: item.commitID || undefined,
              ...(previous?.workspace === item.workspace && previous.base ? { base: previous.base } : {}),
            }
            yield* write(root, metadata)
            return root === source
              ? ({ directory: root, type: "root" } as const)
              : ({ directory: root, type: "worktree", metadata } as const)
          }),
        ),
        Effect.catchTag("Worktree.DirectoryUnavailableError", () => Effect.undefined),
      ),
    ).pipe(Effect.map((items) => items.filter(defined)))
  })

  return {
    id: Worktree.StrategyID.make("jj_workspace"),
    vcs: "jj" as const,
    create: Effect.fn("Worktree.Jj.create")(function* (input) {
      const source = yield* canonical(fs, input.sourceDirectory)
      const revision = input.base ?? "@"
      const identity = (
        yield* run("create", source, [
          "log",
          "--no-graph",
          "-r",
          revision,
          "-T",
          'commit_id ++ "\\0" ++ change_id ++ "\\0"',
        ])
      ).split("\0")
      const base = identity[0]?.trim()
      if (!base || !identity[1]?.trim() || identity.length !== 3)
        return yield* new Worktree.OperationError({
          message: `JJ revision must resolve to exactly one commit: ${revision}`,
        })
      const workspace = `opencode-${Slug.create()}-${crypto.randomUUID().slice(0, 8)}`
      yield* run("create", source, ["workspace", "add", "--name", workspace, "-r", base, input.directory])
      const directory = yield* canonical(fs, input.directory)
      const entry = (yield* list(source)).find(
        (item) => item.metadata?.type === "jj_workspace" && item.metadata.workspace === workspace,
      )
      if (entry?.metadata?.type !== "jj_workspace")
        return yield* new Worktree.OperationError({ message: "Created JJ workspace could not be discovered" })
      yield* write(directory, { ...entry.metadata, base })
      return { directory }
    }),
    remove: Effect.fn("Worktree.Jj.remove")(function* (input) {
      const directory = yield* canonical(fs, input.directory)
      const expected = yield* read(directory)
      const candidates = yield* db
        .select({ directory: JjWorktreeTable.id })
        .from(JjWorktreeTable)
        .innerJoin(WorktreeTable, eq(WorktreeTable.directory, JjWorktreeTable.id))
        .where(and(eq(WorktreeTable.project_id, projectID), ne(JjWorktreeTable.id, directory)))
        .all()
        .pipe(Effect.orDie)
      const source = (yield* Effect.filter(candidates, (item) => fs.isDir(item.directory)))[0]
      if (!source)
        return yield* new Worktree.OperationError({ message: "Cannot forget the only registered JJ workspace" })
      const entries = yield* list(source.directory)
      const entry = entries.find((item) => item.directory === directory)
      if (entry?.metadata?.type !== "jj_workspace") {
        if (!expected) return yield* new Worktree.OperationError({ message: "JJ workspace is not registered" })
        if (!input.force)
          return yield* new Worktree.OperationError({
            message: "JJ workspace is already forgotten; force is required to remove the remaining directory",
            forceRequired: true,
          })
        yield* fs.remove(directory, { recursive: true, force: true }).pipe(
          Effect.mapError((cause) => new Worktree.OperationError({ message: cause.message })),
        )
        yield* db.delete(JjWorktreeTable).where(eq(JjWorktreeTable.id, directory)).run().pipe(Effect.orDie)
        return
      }
      if (expected && expected.workspace !== entry.metadata.workspace)
        return yield* new Worktree.OperationError({ message: "JJ workspace identity changed" })

      if (!input.force) {
        if (!expected?.base)
          return yield* new Worktree.OperationError({
            message: "JJ workspace creation base is unknown",
            forceRequired: true,
          })
        const changed = yield* run("remove", directory, ["diff", "-r", "@", "-T", 'path ++ "\\0"'])
        const conflict = yield* run("remove", directory, ["log", "--no-graph", "-r", "@", "-T", "conflict"])
        const history = (
          yield* run("remove", directory, [
            "log",
            "--no-graph",
            "-r",
            `${expected.base}..@`,
            "-T",
            'current_working_copy ++ "\\0" ++ empty ++ "\\0" ++ description.first_line() ++ "\\0"',
          ])
        ).split("\0")
        const valuable = Array.from({ length: Math.floor(history.length / 3) }, (_, index) => ({
          current: history[index * 3],
          empty: history[index * 3 + 1],
          description: history[index * 3 + 2],
        })).some((item) => item.current !== "true" || item.empty !== "true" || !!item.description)
        if (changed || conflict.trim() === "true" || valuable)
          return yield* new Worktree.OperationError({
            message: "JJ workspace contains working-copy changes, conflicts, or committed work after its base",
            forceRequired: true,
          })
      }

      yield* run("remove", source.directory, ["workspace", "forget", entry.metadata.workspace])
      yield* fs.remove(directory, { recursive: true, force: true }).pipe(
        Effect.mapError(
          (cause) =>
            new Worktree.OperationError({
              message: `JJ workspace was forgotten but its directory could not be removed: ${cause.message}`,
            }),
        ),
      )
      yield* db.delete(JjWorktreeTable).where(eq(JjWorktreeTable.id, directory)).run().pipe(Effect.orDie)
    }),
    list,
  } satisfies Strategy
})
