import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect } from "effect"
import { loadFactory } from "@opencode-ai/core/filesystem/watcher/watchman/client"
import { makeRegistry } from "@opencode-ai/core/filesystem/watcher/watchman/root"
import { tmpdir } from "../fixture/tmpdir"
import { it } from "../lib/effect"

const suite = process.env.OPENCODE_WATCHMAN_LIVE === "1" ? describe : describe.skip

suite("Watchman live", () => {
  it.live("receives project-relative updates from the daemon", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireDisposable(Effect.promise(() => tmpdir()))
      const source = path.join(tmp.path, "source")
      const file = path.join(source, "skill.md")
      yield* Effect.promise(() => fs.mkdir(source))
      const update = yield* Deferred.make<string, Error>()
      const registry = yield* loadFactory.pipe(Effect.flatMap((factory) => makeRegistry(factory)))
      const subscription = yield* registry.subscribe(
        { type: "project", project: tmp.path },
        {
          type: "directory",
          target: source,
          ignore: [],
          placement: { type: "project", root: tmp.path },
          publish: (event) => Deferred.doneUnsafe(update, Effect.succeed(event.path)),
          fail: (error) => Deferred.doneUnsafe(update, Effect.fail(error)),
        },
      )

      yield* Effect.promise(() => fs.writeFile(file, "# live\n"))
      expect(yield* Deferred.await(update).pipe(Effect.timeout("5 seconds"))).toBe(file)
      yield* Effect.promise(() => subscription.unsubscribe())
    }),
  )
})
