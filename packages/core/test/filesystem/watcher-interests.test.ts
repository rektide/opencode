import { expect } from "bun:test"
import { Effect, Exit, Fiber, Layer, Stream } from "effect"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { WatchInterests } from "@opencode-ai/core/filesystem/watcher/interests"
import { Location } from "@opencode-ai/core/location"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { location } from "../fixture/location"
import { it } from "../lib/effect"

it.effect("retains unchanged interests and starts additions before releasing removals", () => {
  const lifecycle: string[] = []
  const native = Watcher.Native.of({
    subscribe: (input) =>
      Effect.sync(() => {
        lifecycle.push(`start:${input.target}`)
        return {
          unsubscribe: () => {
            lifecycle.push(`stop:${input.target}`)
            return Promise.resolve()
          },
        }
      }),
  })
  return Effect.gen(function* () {
    const interests = yield* WatchInterests.make()
    const changes: Watcher.Update[] = []
    yield* interests.changes.pipe(
      Stream.runForEach((update) => Effect.sync(() => changes.push(update))),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* interests.ensure([{ path: "/first", type: "directory", ignore: ["b", "a", "a"] }])
    yield* Effect.yieldNow
    yield* interests.reconcile([{ path: "/first", type: "directory", ignore: ["a", "b"] }])
    yield* Effect.yieldNow
    expect(lifecycle).toEqual(["start:/first"])

    yield* interests.reconcile([{ path: "/second", type: "directory" }])
    yield* Effect.yieldNow
    expect(lifecycle).toEqual(["start:/first", "start:/second", "stop:/first"])
    expect(changes).toEqual([
      { path: "/first", type: "update" },
      { path: "/second", type: "update" },
    ])
  }).pipe(
    Effect.provide(
      Layer.merge(
        Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ),
    ),
  )
})

it.effect("preserves the previous plan until reconciliation commits", () => {
  const active = new Set<string>()
  const native = Watcher.Native.of({
    subscribe: (input) =>
      Effect.sync(() => {
        active.add(input.target)
        return {
          unsubscribe: () => {
            active.delete(input.target)
            return Promise.resolve()
          },
        }
      }),
  })
  return Effect.gen(function* () {
    const interests = yield* WatchInterests.make()
    yield* interests.reconcile([{ path: "/previous", type: "directory" }])
    yield* interests.ensure([{ path: "/addition", type: "directory" }])
    yield* Effect.yieldNow

    // A failed source refresh never reaches reconcile, so both the prior plan
    // and any safely acquired additions remain available for the retry.
    expect(active).toEqual(new Set(["/previous", "/addition"]))
  }).pipe(
    Effect.provide(
      Layer.merge(
        Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ),
    ),
  )
})

it.effect("propagates a physical failure and allows owner recovery", () => {
  const controls: { fail?: (error: Error) => void; subscribes: number } = { subscribes: 0 }
  const native = Watcher.Native.of({
    subscribe: (input) =>
      Effect.sync(() => {
        controls.subscribes++
        controls.fail = input.fail
        return { unsubscribe: () => Promise.resolve() }
      }),
  })
  return Effect.gen(function* () {
    const interests = yield* WatchInterests.make()
    const changes = yield* interests.changes.pipe(Stream.runDrain, Effect.forkScoped({ startImmediately: true }))
    yield* interests.ensure([{ path: "/failed", type: "directory" }])
    yield* Effect.yieldNow
    controls.fail?.(new Error("native failure"))

    expect(Exit.isFailure(yield* Fiber.await(changes))).toBe(true)
    yield* Effect.yieldNow
    const resumed = yield* interests.changes.pipe(
      Stream.take(1),
      Stream.runHead,
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* interests.ensure([{ path: "/failed", type: "directory" }])
    expect((yield* Fiber.join(resumed)).valueOrUndefined).toEqual({ path: "/failed", type: "update" })
    expect(controls.subscribes).toBe(2)
  }).pipe(
    Effect.provide(
      Layer.merge(
        Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ),
    ),
  )
})
