import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { eq, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Database } from "@opencode-ai/core/database/database"
import { Bus } from "@opencode-ai/core/bus"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { Worktree } from "@opencode-ai/core/worktree"
import { WorktreeTable } from "@opencode-ai/core/worktree/sql"
import { JjWorktreeTable } from "@opencode-ai/core/worktree/jj.sql"
import { Location } from "@opencode-ai/core/location"
import { Global } from "@opencode-ai/util/global"
import { FSUtil } from "@opencode-ai/util/fs-util"
import { Git } from "@opencode-ai/core/git"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

class Fixture extends Context.Service<Fixture, Effect.Success<ReturnType<typeof makeFixture>>>()("JjWorktreeFixture") {}

const infrastructure = AppNodeBuilder.build(LayerNode.group([Project.node, Database.node, Bus.node]))
const it = testEffect(
  Layer.unwrap(
    Effect.gen(function* () {
      const input = yield* makeFixture()
      const database = yield* Database.Service
      const bus = yield* Bus.Service
      return Layer.merge(
        Layer.succeed(Fixture, input),
        worktreeLayer(input, database, bus, input.sourceDirectory),
      )
    }),
  ).pipe(Layer.provideMerge(infrastructure)),
)

function abs(input: string) {
  return AbsolutePath.make(input)
}

function worktreeLayer(
  input: { readonly root: { readonly path: string }; readonly sourceDirectory: AbsolutePath; readonly projectID: Project.ID },
  database: Database.Interface,
  bus: Bus.Interface,
  directory: AbsolutePath,
) {
  return AppNodeBuilder.build(
    LayerNode.group([Worktree.node, Git.node, FSUtil.node, Location.node, Global.node]),
    [
      Database.node.replace(Layer.succeed(Database.Service, database)),
      Bus.node.replace(Layer.succeed(Bus.Service, bus)),
      Global.node.replace(Global.layerWith({ data: input.root.path })),
      Location.node.replace(
        Layer.succeed(
          Location.Service,
          Location.Service.of({
            directory,
            project: { id: input.projectID, directory, canonical: input.sourceDirectory },
            vcs: { type: "jj", store: AbsolutePath.make(path.join(input.sourceDirectory, ".jj", "repo")) },
          }),
        ),
      ),
    ],
  ).pipe(Layer.fresh)
}

function makeFixture() {
  return Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
    )
    yield* Effect.promise(async () => {
      await $`jj git init`.cwd(root.path).quiet()
      await Bun.write(path.join(root.path, "base.txt"), "base\n")
      await $`jj commit -m initial`.cwd(root.path).quiet()
    })
    const sourceDirectory = abs(yield* Effect.promise(() => fs.realpath(root.path)))
    const projectID = Project.ID.make(`jj-worktree-${crypto.randomUUID()}`)
    const database = yield* Database.Service
    yield* database.db
      .insert(ProjectTable)
      .values({ id: projectID, worktree: sourceDirectory, vcs: "jj", sandboxes: [], time_created: 1, time_updated: 1 })
      .run()
      .pipe(Effect.orDie)
    yield* database.db
      .insert(WorktreeTable)
      .values({ project_id: projectID, directory: sourceDirectory })
      .run()
      .pipe(Effect.orDie)
    return { root, sourceDirectory, projectID, db: database.db }
  })
}

function metadata(directory: AbsolutePath) {
  return Database.Service.use((database) =>
    database.db
      .select({ metadata: JjWorktreeTable.metadata })
      .from(JjWorktreeTable)
      .where(eq(JjWorktreeTable.id, directory))
      .get()
      .pipe(Effect.orDie, Effect.map((row) => row?.metadata)),
  )
}

describe("Worktree (jj)", () => {
  const itJj = Bun.which("jj") ? it : { live: it.live.skip }

  itJj.live("creates from an immutable base by default and preserves owned metadata through discovery", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-created`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))
      const base = (yield* Effect.promise(() => $`jj log --no-graph -r @- -T commit_id`.cwd(input.root.path).text())).trim()

      const created = yield* worktrees.create({ directory: parent, name: "copy", base: "@-" })
      const stored = yield* metadata(created.directory)

      expect(stored).toMatchObject({ type: "jj_workspace", base })
      yield* worktrees.refresh()
      expect(yield* metadata(created.directory)).toEqual(stored)
      yield* worktrees.remove({ directory: created.directory, force: false })
      expect(yield* metadata(created.directory)).toBeUndefined()
    }),
  )

  itJj.live("requires force to remove work created after the recorded base", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-valuable`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))
      const created = yield* worktrees.create({ directory: parent, name: "copy" })
      yield* Effect.promise(async () => {
        await Bun.write(path.join(created.directory, "valuable.txt"), "valuable\n")
        await $`jj commit -m valuable`.cwd(created.directory).quiet()
      })

      const error = yield* worktrees.remove({ directory: created.directory, force: false }).pipe(Effect.flip)

      expect(error).toBeInstanceOf(Worktree.OperationError)
      if (error instanceof Worktree.OperationError) expect(error.forceRequired).toBe(true)
      yield* worktrees.remove({ directory: created.directory, force: true })
    }),
  )

  itJj.live("rejects a base that resolves to multiple commits", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-ambiguous`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))

      const error = yield* worktrees.create({ directory: parent, name: "copy", base: "all()" }).pipe(Effect.flip)

      expect(error).toBeInstanceOf(Worktree.OperationError)
      expect(yield* Effect.promise(() => Bun.file(path.join(parent, "copy")).exists())).toBe(false)
    }),
  )

  itJj.live("discovers the full workspace fleet and backfills metadata for persist-registered rows", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const worktrees = yield* Worktree.Service
      const target = abs(`${input.root.path}-jj-external`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      yield* Effect.promise(() => $`jj workspace add --name external-copy -r @- ${target}`.cwd(input.root.path).quiet())

      const result = yield* worktrees.refresh()
      const discovered = abs(yield* Effect.promise(() => fs.realpath(target)))

      expect(result.updated).toContain(discovered)
      expect(yield* metadata(input.sourceDirectory)).toMatchObject({ type: "jj_workspace", workspace: "default" })
      expect(yield* metadata(discovered)).toMatchObject({ type: "jj_workspace", workspace: "external-copy" })
      yield* worktrees.remove({ directory: discovered, force: true })
    }),
  )

  itJj.live("keeps the canonical workspace unowned when refreshing from a secondary workspace", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const target = abs(`${input.root.path}-jj-secondary`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      yield* Effect.promise(() => $`jj workspace add --name secondary -r @- ${target}`.cwd(input.root.path).quiet())
      const directory = abs(yield* Effect.promise(() => fs.realpath(target)))
      yield* input.db.insert(WorktreeTable).values({ project_id: input.projectID, directory }).run().pipe(Effect.orDie)
      const database = yield* Database.Service
      const bus = yield* Bus.Service
      const context = yield* Layer.build(worktreeLayer(input, database, bus, directory))
      const worktrees = Context.get(context, Worktree.Service)

      yield* worktrees.refresh()

      expect(
        yield* input.db
          .select({ directory: WorktreeTable.directory, strategy: WorktreeTable.strategy })
          .from(WorktreeTable)
          .where(eq(WorktreeTable.project_id, input.projectID))
          .all()
          .pipe(Effect.orDie),
      ).toEqual(
        expect.arrayContaining([
          { directory: input.sourceDirectory, strategy: null },
          { directory, strategy: "jj_workspace" },
        ]),
      )
    }),
  )

  itJj.live("keeps a separate clone root unowned when its project canonical belongs to another repository", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const target = abs(`${input.root.path}-jj-clone`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      yield* Effect.promise(async () => {
        await fs.mkdir(target)
        await $`jj git init`.cwd(target).quiet()
      })
      const directory = abs(yield* Effect.promise(() => fs.realpath(target)))
      yield* input.db.insert(WorktreeTable).values({ project_id: input.projectID, directory }).run().pipe(Effect.orDie)
      const database = yield* Database.Service
      const bus = yield* Bus.Service
      const context = yield* Layer.build(worktreeLayer(input, database, bus, directory))
      const worktrees = Context.get(context, Worktree.Service)

      yield* worktrees.refresh()

      expect(
        yield* input.db
          .select({ strategy: WorktreeTable.strategy })
          .from(WorktreeTable)
          .where(eq(WorktreeTable.directory, directory))
          .get()
          .pipe(Effect.orDie),
      ).toEqual({ strategy: null })
    }),
  )

  itJj.live("discovers legacy metadata into owned storage on demand", () =>
    Effect.gen(function* () {
      const input = yield* Fixture
      const worktrees = yield* Worktree.Service
      const target = abs(`${input.root.path}-jj-legacy`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      const base = (yield* Effect.promise(() => $`jj log --no-graph -r @- -T commit_id`.cwd(input.root.path).text())).trim()
      yield* Effect.promise(() => $`jj workspace add --name legacy-copy -r @- ${target}`.cwd(input.root.path).quiet())
      const directory = abs(yield* Effect.promise(() => fs.realpath(target)))
      yield* input.db.run(sql`ALTER TABLE worktree ADD metadata text`)
      yield* input.db.run(sql`
        INSERT INTO worktree (project_id, directory, strategy, metadata, time_created)
        VALUES (${input.projectID}, ${directory}, 'jj_workspace', ${JSON.stringify({
          type: "jj_workspace",
          workspace: "legacy-copy",
          base,
        })}, 1)
      `)

      yield* worktrees.refresh()

      expect(yield* metadata(directory)).toMatchObject({ workspace: "legacy-copy", base })
      yield* worktrees.remove({ directory, force: false })
    }),
  )
})
