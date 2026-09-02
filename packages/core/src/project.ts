export * as Project from "./project.js"

import { Context, Effect, Layer, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm"
import path from "path"
import { AbsolutePath } from "./schema.js"
import { Bus } from "./bus.js"
import { Database } from "./database/database.js"
import { Worktree } from "@opencode-ai/schema/worktree"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Git } from "./git.js"
import { AppProcess } from "@opencode-ai/util/process"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Hash } from "@opencode-ai/util/hash"
import { ProjectSchema } from "./project/schema.js"
import { ProjectTable, upsertProject } from "./project/sql.js"
import { WorktreeTable } from "./worktree/sql.js"

export const ID = ProjectSchema.ID
export type ID = ProjectSchema.ID

export const Vcs = ProjectSchema.Vcs
export type Vcs = ProjectSchema.Vcs

export const Current = ProjectSchema.Current
export type Current = ProjectSchema.Current

export const Info = ProjectSchema.Info
export interface Info extends Schema.Schema.Type<typeof Info> {}

export const UpdateInput = ProjectSchema.UpdateInput
export type UpdateInput = ProjectSchema.UpdateInput

export class NotFoundError extends Schema.TaggedError<NotFoundError>()("Project.NotFoundError", {
  projectID: ID,
}) {}

export interface Resolved {
  readonly previous?: ID
  readonly id: ID
  readonly directory: AbsolutePath
  // This checkout's main directory; the stored project canonical may be another clone.
  readonly canonical: AbsolutePath
  readonly vcs?: Vcs
}

// Keep this filesystem-only; permission checks use it and should not execute VCS commands.
export const root = Effect.fn("Project.root")(function* (
  fs: FSUtil.Interface,
  input: AbsolutePath,
  markers: readonly string[] = [".jj", ".git", ".hg"],
) {
  return yield* fs.up({ targets: [...markers], start: input, mode: "first" }).pipe(
    Effect.map((matches) => (matches[0] ? AbsolutePath.make(path.dirname(matches[0])) : undefined)),
    Effect.orElseSucceed(() => undefined),
  )
})

export interface Interface {
  readonly list: () => Effect.Effect<ReadonlyArray<Info>>
  readonly update: (input: UpdateInput) => Effect.Effect<Info, NotFoundError>
  /** Resolves and persists the owning Project. */
  readonly resolve: (input: AbsolutePath, options?: { readonly discovery?: boolean }) => Effect.Effect<Resolved>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Project") {}

function fromRow(row: typeof ProjectTable.$inferSelect): Info {
  const icon =
    row.icon_url || row.icon_url_override || row.icon_color
      ? {
          url: row.icon_url ?? undefined,
          override: row.icon_url_override ?? undefined,
          color: row.icon_color ?? undefined,
        }
      : undefined
  return {
    id: row.id,
    canonical: row.worktree,
    vcs: row.vcs ?? undefined,
    name: row.name ?? undefined,
    icon,
    commands: row.commands ?? undefined,
    time: {
      created: row.time_created,
      updated: row.time_updated,
      initialized: row.time_initialized ?? undefined,
    },
    sandboxes: row.sandboxes,
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const proc = yield* AppProcess.Service
    const bus = yield* Bus.Service
    const db = (yield* Database.Service).db

    const announcing = new Set<string>()
    const persist = Effect.fnUntraced(function* (project: Resolved) {
      const previous = yield* db
        .select({ canonical: ProjectTable.worktree })
        .from(ProjectTable)
        .where(eq(ProjectTable.id, project.id))
        .get()
        .pipe(Effect.orDie)
      yield* upsertProject(db, project).pipe(Effect.orDie)
      // Clones share a project ID; only replace a canonical directory that is gone.
      if (
        previous &&
        previous.canonical !== project.canonical &&
        !(yield* fs.exists(previous.canonical).pipe(Effect.orElseSucceed(() => true)))
      ) {
        const row = yield* db
          .update(ProjectTable)
          .set({ worktree: project.canonical })
          .where(eq(ProjectTable.id, project.id))
          .returning()
          .get()
          .pipe(Effect.orDie)
        if (row) yield* bus.publish(ProjectSchema.Event.Updated, fromRow(row))
      }
      if (!project.vcs) return project
      const directories: Array<{ projectID: ID; directory: AbsolutePath; strategy?: string }> = [
        { projectID: project.id, directory: project.canonical },
      ]
      if (project.directory !== project.canonical)
        directories.push({
          projectID: project.id,
          directory: project.directory,
          strategy: project.vcs.type === "git" ? "git" : project.vcs.type === "jj" ? "jj_workspace" : undefined,
        })
      // A missing directory row means this directory's resolution is a new durable
      // fact. The row insert commits atomically with the event, so a crash between
      // checks retries on the next resolve instead of stranding the announcement.
      // The in-flight set keeps concurrent resolves from publishing the same fact
      // twice.
      for (const item of directories) {
        const key = item.projectID + "\u0000" + item.directory
        if (announcing.has(key)) continue
        announcing.add(key)
        yield* Effect.gen(function* () {
          const stored = yield* db
            .select({ directory: WorktreeTable.directory })
            .from(WorktreeTable)
            .where(and(eq(WorktreeTable.project_id, item.projectID), eq(WorktreeTable.directory, item.directory)))
            .get()
            .pipe(Effect.orDie)
          if (stored) return
          const directory = AbsolutePath.make(yield* fs.resolve(item.directory))
          const markerless = yield* db
            .select({ id: ProjectTable.id, directory: ProjectTable.worktree })
            .from(ProjectTable)
            .where(
              and(
                isNull(ProjectTable.vcs),
                gte(ProjectTable.worktree, directory),
                lte(ProjectTable.worktree, AbsolutePath.make(directory + "\uffff")),
              ),
            )
            .all()
            .pipe(Effect.orDie)
          const adopted = yield* Effect.filter(markerless, (candidate) =>
            Effect.gen(function* () {
              if (candidate.id === item.projectID) return false
              if (!FSUtil.contains(directory, candidate.directory)) return false
              const found = yield* fs
                .up({ targets: [".jj", ".git", ".hg"], start: candidate.directory, stop: directory, mode: "first" })
                .pipe(Effect.orElseSucceed(() => []))
              if (!found[0]) return false
              return (yield* fs.resolve(path.dirname(found[0]))) === directory
            }),
          )
          yield* bus.publish(
            Worktree.Event.Resolved,
            {
              projectID: item.projectID,
              directory: item.directory,
              previous: project.previous ?? ID.global,
              ...(adopted.length ? { adopted: adopted.map((candidate) => candidate.id) } : {}),
            },
            {
              commit: () =>
                db
                  .insert(WorktreeTable)
                  .values({ project_id: item.projectID, directory: item.directory, strategy: item.strategy })
                  .onConflictDoNothing()
                  .run()
                  .pipe(Effect.orDie, Effect.asVoid),
            },
          )
        }).pipe(Effect.ensuring(Effect.sync(() => announcing.delete(key))))
      }
      return project
    })

    const list = Effect.fn("Project.list")(function* () {
      const rows = yield* db
        .select()
        .from(ProjectTable)
        .orderBy(desc(ProjectTable.time_updated), asc(ProjectTable.id))
        .all()
        .pipe(Effect.orDie)
      return rows.map(fromRow)
    })

    const update = Effect.fn("Project.update")(function* (input: UpdateInput) {
      const row = yield* db
        .update(ProjectTable)
        .set({
          name: input.name === undefined ? undefined : input.name || null,
          icon_url_override: input.icon?.override === undefined ? undefined : input.icon.override || null,
          icon_color: input.icon?.color === undefined ? undefined : input.icon.color || null,
          commands:
            input.commands?.start === undefined
              ? undefined
              : input.commands.start
                ? { start: input.commands.start }
                : null,
          time_updated: Date.now(),
        })
        .where(eq(ProjectTable.id, input.projectID))
        .returning()
        .get()
        .pipe(Effect.orDie)
      if (!row) return yield* new NotFoundError({ projectID: input.projectID })
      const project = fromRow(row)
      yield* bus.publish(ProjectSchema.Event.Updated, project)
      return project
    })

    const cached = Effect.fnUntraced(function* (dir: string) {
      return yield* fs.readFileString(path.join(dir, "opencode")).pipe(
        Effect.map((value) => value.trim()),
        Effect.map((value) => (value ? ID.make(value) : undefined)),
        Effect.orElseSucceed(() => undefined),
      )
    })

    const remote = Effect.fnUntraced(function* (repo: Git.Repository) {
      const origin = yield* git.remote.get(repo)
      if (!origin) return undefined
      const normalized = url(origin)
      if (!normalized) return undefined
      return ID.make(Hash.fast(`git-remote:${normalized}`))
    })

    function url(input: string) {
      const value = input.trim()
      if (!value) return undefined

      const parsed = URL.parse(value)
      if (parsed) {
        if (parsed.protocol === "file:") return undefined
        return parts(parsed.hostname, parsed.pathname)
      }
      const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
      if (scp) return parts(scp[2], scp[3])
      return undefined
    }

    function parts(host: string, name: string) {
      const pathname = name
        .replace(/^\/+/, "")
        .replace(/\.git\/?$/, "")
        .replace(/\/+$/, "")
      if (!host || !pathname) return undefined
      return `${host.toLowerCase()}/${pathname}`
    }

    const rootCommit = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const command = Effect.fnUntraced(function* (cwd: AbsolutePath, executable: string, args: string[]) {
      const result = yield* proc
        .run(ChildProcess.make(executable, args, { cwd, extendEnv: true, stdin: "ignore" }))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (!result || result.exitCode !== 0) return undefined
      return result.stdout.toString("utf8")
    })

    const jjDiscover = Effect.fnUntraced(function* (input: AbsolutePath) {
      const marker = yield* fs.up({ targets: [".jj", ".git", ".hg"], start: input, mode: "first" }).pipe(
        Effect.map((matches) => matches[0]),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (!marker || path.basename(marker) !== ".jj") return undefined
      const workspace = path.dirname(marker)
      const directory = AbsolutePath.make(
        yield* fs.resolve(workspace).pipe(Effect.catch(() => Effect.succeed(workspace))),
      )

      // .jj/repo is the repository in the main workspace and a pointer file in
      // secondary workspaces (layout verified against jj 0.40). A dangling
      // pointer degrades to the git or directory path instead of shelling out.
      const reference = path.join(marker, "repo")
      const direct = yield* fs.isDir(reference)
      const pointer = direct
        ? undefined
        : yield* fs.readFileStringSafe(reference).pipe(Effect.catch(() => Effect.succeed(undefined)))
      const target = direct ? reference : pointer === undefined ? undefined : path.resolve(marker, pointer.trim())
      if (!target) return undefined
      const store = yield* fs.realPath(target).pipe(
        Effect.map((value) => AbsolutePath.make(value)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
      if (!store) return undefined
      const canonical = AbsolutePath.make(path.dirname(path.dirname(store)))

      // The git backing store without invoking jj: colocated repositories
      // point at the checkout .git through store/git_target, older standalone
      // layouts keep their git dir under store/git.
      const storeDir = path.join(store, "store")
      const gitTarget = yield* fs
        .readFileStringSafe(path.join(storeDir, "git_target"))
        .pipe(Effect.catch(() => Effect.succeed(undefined)))
      const gitDir =
        gitTarget !== undefined
          ? AbsolutePath.make(path.resolve(storeDir, gitTarget.trim()))
          : (yield* fs.isDir(path.join(storeDir, "git")))
            ? AbsolutePath.make(path.join(storeDir, "git"))
            : undefined

      // Cached identity first: an already-known project resolves with zero
      // subprocesses, and a stable ID never churns when a remote appears later.
      const previous = yield* cached(gitDir ?? store)
      if (previous) return { previous, id: previous, directory, canonical, vcs: { type: "jj" as const, store } }

      const origin = gitDir
        ? yield* command(directory, "git", ["--git-dir", gitDir, "remote", "get-url", "origin"])
        : undefined
      const normalized = origin ? url(origin) : undefined
      const id = normalized
        ? ID.make(Hash.fast(`git-remote:${normalized}`))
        : ID.make(Hash.fast(`jj-store:${gitDir ?? store}`))
      return { previous: undefined, id, directory, canonical, vcs: { type: "jj" as const, store } }
    })

    // Mercurial identity uses the cached ID or the first root changeset; remote-derived
    // identity (the git `remote()` path) is a follow-up.
    const hgRoot = Effect.fnUntraced(function* (worktree: AbsolutePath) {
      const result = yield* proc
        .run(
          ChildProcess.make("hg", ["log", "-r", "roots(all())", "-T", "{node}\n"], {
            cwd: worktree,
            env: { HGPLAIN: "1" },
            extendEnv: true,
            stdin: "ignore",
          }),
        )
        .pipe(Effect.orElseSucceed(() => undefined))
      if (!result || result.exitCode !== 0) return undefined
      const node = result.stdout
        .toString("utf8")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean)
        .toSorted()[0]
      return node ? ID.make(node) : undefined
    })

    const hgDiscover = Effect.fnUntraced(function* (dotHg: AbsolutePath) {
      const worktree = AbsolutePath.make(path.dirname(dotHg))
      const store = AbsolutePath.make(dotHg)
      const previous = yield* cached(store)
      const id = previous ?? (yield* hgRoot(worktree))
      return {
        previous,
        id: id ?? ID.global,
        directory: worktree,
        vcs: { type: "hg" as const, store },
      }
    })

    const resolve = Effect.fn("Project.resolve")(function* (
      input: AbsolutePath,
      _options?: { readonly discovery?: boolean },
    ) {
      const jj = yield* jjDiscover(input)
      if (jj) return yield* persist(jj)

      const directory = AbsolutePath.make(yield* fs.resolve(input))
      // A damaged colocated .jj must not shadow the git fallback, so .git wins
      // the marker scan; healthy jj repositories resolve earlier via jjDiscover.
      const native = yield* fs.up({ targets: [".git", ".jj", ".hg"], start: directory, mode: "first" }).pipe(
        Effect.map((matches) => matches[0]),
        Effect.orElseSucceed(() => undefined),
      )
      const repo =
        native && path.basename(native) === ".git"
          ? yield* git.repo.discover(AbsolutePath.make(path.dirname(native)))
          : undefined
      if (repo) {
        const previous = yield* cached(repo.commonDirectory)
        const id = (yield* remote(repo)) ?? previous ?? (yield* rootCommit(repo))
        const canonical =
          repo.gitDirectory === repo.commonDirectory
            ? repo.worktree
            : yield* git.worktree.list(repo).pipe(
                Effect.map((items) => items.find((item) => item.kind === "main")?.directory ?? repo.worktree),
                Effect.orElseSucceed(() => repo.worktree),
              )
        return yield* persist({
          previous,
          id: id ?? ID.global,
          directory: repo.worktree,
          canonical,
          vcs: { type: "git" as const, store: repo.commonDirectory },
        })
      }

      const hg = native && path.basename(native) === ".hg" ? yield* hgDiscover(AbsolutePath.make(native)) : undefined
      if (hg) {
        return yield* persist({
          ...hg,
          canonical: hg.directory,
        })
      }

      return yield* persist({
        id: ID.make(Hash.fast(`directory:${directory}`)),
        directory,
        canonical: directory,
        vcs: undefined,
      })
    })

    return Service.of({ list, update, resolve })
  }),
)

export const node = makeGlobalNode({
  service: Service,
  layer: layer,
  deps: [Bus.node, Database.node, FSUtil.node, Git.node, AppProcess.node],
})
