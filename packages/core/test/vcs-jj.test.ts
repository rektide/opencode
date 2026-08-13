import { $ } from "bun"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Bus } from "@opencode-ai/core/bus"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { Vcs } from "@opencode-ai/core/vcs"
import { location } from "./fixture/location"
import { tmpdir } from "./fixture/tmpdir"
import { it } from "./lib/effect"

const describeJj = Bun.which("jj") ? describe : describe.skip

const provide = (directory: string) =>
  Effect.provide(
    LayerNode.compile(LayerNode.group([Vcs.node, Bus.node]), [
      [
        Location.node,
        Layer.succeed(
          Location.Service,
          Location.Service.of(
            location(
              { directory: AbsolutePath.make(directory) },
              { vcs: { type: "jj", store: AbsolutePath.make(path.join(directory, ".jj", "repo", "store", "git")) } },
            ),
          ),
        ),
      ],
    ]),
  )

const withJj = <A, E, R>(f: (directory: string) => Effect.Effect<A, E, R>) =>
  Effect.acquireRelease(
    Effect.promise(() => tmpdir()),
    (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
  ).pipe(
    Effect.flatMap((tmp) =>
      Effect.promise(() => $`jj git init`.cwd(tmp.path).quiet()).pipe(Effect.andThen(f(tmp.path).pipe(provide(tmp.path)))),
    ),
  )

describeJj("Vcs Jujutsu", () => {
  it.live("reports native working-copy changes without inventing a branch", () =>
    withJj((directory) =>
      Effect.gen(function* () {
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(directory, "keep.txt"), "one\ntwo\n")
          await fs.writeFile(path.join(directory, "gone.txt"), "bye\n")
          await $`jj commit -m initial`.cwd(directory).quiet()
          await fs.writeFile(path.join(directory, "keep.txt"), "one\nthree\n")
          await fs.rm(path.join(directory, "gone.txt"))
          await fs.writeFile(path.join(directory, "spaced name.txt"), "hello\n")
        })
        const vcs = yield* Vcs.Service

        expect(yield* vcs.info()).toEqual({ branch: {} })
        expect(yield* vcs.status()).toEqual([
          { file: "gone.txt", additions: 0, deletions: 1, status: "deleted" },
          { file: "keep.txt", additions: 1, deletions: 1, status: "modified" },
          { file: "spaced name.txt", additions: 1, deletions: 0, status: "added" },
        ])
        const diff = yield* vcs.diff("working")
        expect(diff[1].patch).toContain("+three")
        expect(diff[2].patch).toContain("+hello")
      }),
    ),
  )

  it.live("respects patch context and rejects root as an implicit review base", () =>
    withJj((directory) =>
      Effect.gen(function* () {
        const body = Array.from({ length: 20 }, (_, index) => `line-${index}`).join("\n") + "\n"
        yield* Effect.promise(async () => {
          await fs.writeFile(path.join(directory, "file.txt"), body)
          await $`jj commit -m initial`.cwd(directory).quiet()
          await fs.writeFile(path.join(directory, "file.txt"), body.replace("line-10", "changed"))
        })
        const vcs = yield* Vcs.Service
        const tight = yield* vcs.diff("working", { context: 1 })

        expect(tight[0].patch).toContain("line-9")
        expect(tight[0].patch).not.toContain("line-0")
        expect(yield* vcs.diff("branch")).toEqual([])
      }),
    ),
  )
})
