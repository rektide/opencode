import { describe, expect } from "bun:test"
import { $ } from "bun"
import fs from "fs/promises"
import path from "path"
import { and, eq } from "drizzle-orm"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Database } from "@opencode-ai/core/database/database"
import { Project } from "@opencode-ai/core/project"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { Worktree } from "@opencode-ai/core/worktree"
import { WorktreeTable } from "@opencode-ai/core/worktree/sql"
import { tmpdir } from "./fixture/tmpdir"
import { testEffect } from "./lib/effect"

const it = testEffect(AppNodeBuilder.build(LayerNode.group([Worktree.node, Database.node])))

function abs(input: string) {
  return AbsolutePath.make(input)
}

const jjWorkspace = Worktree.StrategyID.make("jj_workspace")

function setupJj() {
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
    const projectID = Project.ID.make("jj-worktree-project")
    const { db } = yield* Database.Service
    yield* db
      .insert(ProjectTable)
      .values({ id: projectID, worktree: sourceDirectory, vcs: "jj", sandboxes: [], time_created: 1, time_updated: 1 })
      .run()
      .pipe(Effect.orDie)
    yield* db
      .insert(WorktreeTable)
      .values({ project_id: projectID, directory: sourceDirectory })
      .run()
      .pipe(Effect.orDie)
    return { root, sourceDirectory, projectID, db }
  })
}

function storedMetadata(projectID: Project.ID, directory: AbsolutePath) {
  return Database.Service.use(({ db }) =>
    db
      .select({ strategy: WorktreeTable.strategy, metadata: WorktreeTable.metadata })
      .from(WorktreeTable)
      .where(and(eq(WorktreeTable.project_id, projectID), eq(WorktreeTable.directory, directory)))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map((row) =>
          row === undefined ? undefined : { strategy: row.strategy ?? undefined, metadata: row.metadata ?? undefined },
        ),
      ),
  )
}

describe("Worktree (jj)", () => {
  const itJj = Bun.which("jj") ? it : { live: it.live.skip }

  itJj.live("creates a JJ workspace from an explicit immutable base and persists its identity", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-created`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))
      const base = (yield* Effect.promise(() => $`jj log --no-graph -r @- -T commit_id`.cwd(input.root.path).text())).trim()

      const created = yield* worktrees.create({
        projectID: input.projectID,
        strategy: jjWorkspace,
        from: input.sourceDirectory,
        directory: parent,
        name: "copy",
        base: "@-",
      })

      expect(created.strategy).toBe(jjWorkspace)
      expect(created.metadata.type).toBe("jj_workspace")
      if (created.metadata.type !== "jj_workspace") return
      expect(created.metadata.base).toBe(base)
      expect(created.metadata.workspace).toStartWith("opencode-")
      expect((yield* storedMetadata(input.projectID, created.directory))?.metadata).toEqual(created.metadata)
      expect(
        yield* Effect.promise(() => $`jj workspace list -T 'name ++ "\\n"'`.cwd(input.root.path).text()),
      ).toContain(created.metadata.workspace)

      yield* worktrees.refresh({ projectID: input.projectID })
      expect((yield* storedMetadata(input.projectID, created.directory))?.metadata).toEqual(created.metadata)

      yield* worktrees.remove({ projectID: input.projectID, directory: created.directory, force: false })
      expect(yield* Effect.promise(() => Bun.file(created.directory).exists())).toBe(false)
      expect(
        yield* Effect.promise(() => $`jj workspace list -T 'name ++ "\\n"'`.cwd(input.root.path).text()),
      ).not.toContain(created.metadata.workspace)
    }),
  )

  itJj.live("requires force to remove committed JJ work after the recorded base", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-committed`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))
      const created = yield* worktrees.create({
        projectID: input.projectID,
        strategy: jjWorkspace,
        from: input.sourceDirectory,
        directory: parent,
        name: "copy",
      })
      yield* Effect.promise(async () => {
        await Bun.write(path.join(created.directory, "committed.txt"), "valuable\n")
        await $`jj commit -m valuable`.cwd(created.directory).quiet()
      })

      const error = yield* worktrees
        .remove({ projectID: input.projectID, directory: created.directory, force: false })
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(Worktree.JjWorkspaceError)
      if (error instanceof Worktree.JjWorkspaceError) expect(error.forceRequired).toBe(true)
      yield* worktrees.remove({ projectID: input.projectID, directory: created.directory, force: true })
    }),
  )

  itJj.live("rejects a JJ base that resolves to multiple commits", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-ambiguous`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))

      const error = yield* worktrees
        .create({
          projectID: input.projectID,
          strategy: jjWorkspace,
          from: input.sourceDirectory,
          directory: parent,
          name: "copy",
          base: "all()",
        })
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(Worktree.JjWorkspaceError)
      expect(yield* Effect.promise(() => Bun.file(path.join(parent, "copy")).exists())).toBe(false)
    }),
  )

  itJj.live("requires force to remove a changed JJ workspace", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const parent = abs(`${input.root.path}-jj-dirty`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(parent, { recursive: true, force: true })))
      const created = yield* worktrees.create({
        projectID: input.projectID,
        strategy: jjWorkspace,
        from: input.sourceDirectory,
        directory: parent,
        name: "copy",
      })
      yield* Effect.promise(() => Bun.write(path.join(created.directory, "dirty.txt"), "dirty\n"))

      const error = yield* worktrees
        .remove({ projectID: input.projectID, directory: created.directory, force: false })
        .pipe(Effect.flip)

      expect(error).toBeInstanceOf(Worktree.JjWorkspaceError)
      if (error instanceof Worktree.JjWorkspaceError) expect(error.forceRequired).toBe(true)
      yield* worktrees.remove({ projectID: input.projectID, directory: created.directory, force: true })
      expect(yield* Effect.promise(() => Bun.file(created.directory).exists())).toBe(false)
    }),
  )

  itJj.live("refresh discovers an externally created JJ workspace", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const target = abs(`${input.root.path}-jj-external`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      yield* Effect.promise(() => $`jj workspace add --name external-copy -r @- ${target}`.cwd(input.root.path).quiet())

      const result = yield* worktrees.refresh({ projectID: input.projectID })
      const discovered = abs(yield* Effect.promise(() => fs.realpath(target)))
      const row = yield* storedMetadata(input.projectID, discovered)

      expect(result.updated).toContain(discovered)
      expect(row?.strategy).toBe("jj_workspace")
      expect(row?.metadata).toMatchObject({ type: "jj_workspace", workspace: "external-copy" })
      yield* worktrees.remove({ projectID: input.projectID, directory: discovered, force: true })
    }),
  )

  itJj.live("keeps the persisted JJ project root canonical after workspace renames", () =>
    Effect.gen(function* () {
      const input = yield* setupJj()
      const worktrees = yield* Worktree.Service
      const target = abs(`${input.root.path}-jj-alpha`)
      yield* Effect.addFinalizer(() => Effect.promise(() => fs.rm(target, { recursive: true, force: true })))
      yield* Effect.promise(async () => {
        await $`jj workspace rename zeta`.cwd(input.root.path).quiet()
        await $`jj workspace add --name alpha -r @- ${target}`.cwd(input.root.path).quiet()
      })

      yield* worktrees.refresh({ projectID: input.projectID })
      const canonical = yield* storedMetadata(input.projectID, input.sourceDirectory)
      const linked = yield* storedMetadata(input.projectID, abs(yield* Effect.promise(() => fs.realpath(target))))

      expect(canonical?.strategy).toBeUndefined()
      expect(canonical?.metadata).toBeUndefined()
      expect(linked?.strategy).toBe("jj_workspace")
      expect(linked?.metadata).toMatchObject({ type: "jj_workspace", workspace: "alpha" })
      if (linked) yield* worktrees.remove({ projectID: input.projectID, directory: abs(yield* Effect.promise(() => fs.realpath(target))), force: true })
    }),
  )
})
