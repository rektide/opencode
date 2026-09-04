import { expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { WatchInterests } from "@opencode-ai/core/filesystem/watcher/interests"
import type { WatcherInternal } from "@opencode-ai/core/filesystem/watcher/internal"
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

it.effect("normalizes placement into distinct physical demand keys", () => {
  const placements: string[] = []
  const native = Watcher.Native.of({
    subscribe: (input) =>
      Effect.sync(() => {
        placements.push(
          input.placement.type === "exact"
            ? `exact:${input.target}`
            : `project:${input.placement.root}:${input.target}`,
        )
        return { unsubscribe: () => Promise.resolve() }
      }),
  })
  return Effect.gen(function* () {
    const interests = yield* WatchInterests.make()
    yield* interests.reconcile([
      { path: "/project/nested", type: "directory", ignore: ["b", "a", "a"] },
      { path: "/project/nested", type: "directory", ignore: ["a", "b"], placement: { type: "exact" } },
      { path: "/project/nested", type: "directory", ignore: ["b", "a"], placement: { type: "exact" } },
    ])
    yield* Effect.yieldNow

    expect(placements).toEqual(["project:/project:/project/nested", "exact:/project/nested"])
  }).pipe(
    Effect.provide(
      Layer.merge(
        Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ),
    ),
  )
})

it.effect("broadcasts lifecycle while suppressing unchanged terminal demand", () => {
  const controls = new Map<
    string,
    {
      readonly publish: (update: Watcher.Update) => void
      readonly invalidate: (reason: WatcherInternal.ContinuityReason) => void
      readonly fail: (error: Error) => void
    }
  >()
  let subscribes = 0
  const native = Watcher.Native.of({
    subscribe: (input) =>
      Effect.sync(() => {
        subscribes++
        controls.set(input.target, input)
        return { unsubscribe: () => Promise.resolve() }
      }),
  })
  return Effect.gen(function* () {
    const interests = yield* WatchInterests.make()
    const first: WatchInterests.Signal[] = []
    const second: WatchInterests.Signal[] = []
    const sawFailure = yield* Deferred.make<void>()
    yield* interests.signals.pipe(
      Stream.runForEach((signal) =>
        Effect.sync(() => {
          first.push(signal)
          if (signal.type === "failure") Deferred.doneUnsafe(sawFailure, Effect.void)
        }),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* interests.signals.pipe(
      Stream.runForEach((signal) => Effect.sync(() => second.push(signal))),
      Effect.forkScoped({ startImmediately: true }),
    )
    const changes = yield* interests.changes.pipe(Stream.runDrain, Effect.forkScoped({ startImmediately: true }))
    const desired: WatchInterests.Input[] = [
      { path: "/failed", type: "directory" },
      { path: "/sibling", type: "directory" },
    ]
    yield* interests.reconcile(desired)
    yield* Effect.yieldNow
    expect(first.map((signal) => signal.type)).toEqual(["ready", "ready"])
    expect(first.some((signal) => signal.type === "change")).toBe(false)

    controls.get("/failed")?.invalidate("retry")
    controls.get("/failed")?.fail(new Error("native failure"))
    yield* Deferred.await(sawFailure)
    controls.get("/sibling")?.publish({ path: "/sibling/changed", type: "update" })
    yield* Effect.yieldNow

    expect(Exit.isFailure(yield* Fiber.await(changes))).toBe(true)
    expect(first).toEqual(second)
    expect(first.slice(2).map((signal) => signal.type)).toEqual(["invalidation", "invalidation", "failure", "change"])
    expect(
      first
        .slice(2)
        .map((signal) =>
          signal.type === "invalidation" ? signal.reason : signal.type === "change" ? signal.update.path : signal.type,
        ),
    ).toEqual(["retry", "terminal", "failure", "/sibling/changed"])

    yield* interests.reconcile(desired)
    yield* Effect.yieldNow
    expect(subscribes).toBe(2)

    yield* interests.reconcile([{ path: "/failed", type: "directory", ignore: ["new-generation"] }, desired[1]])
    yield* Effect.yieldNow
    expect(subscribes).toBe(3)
  }).pipe(
    Effect.provide(
      Layer.merge(
        Watcher.layer().pipe(Layer.provide(Layer.succeed(Watcher.Native, native))),
        Layer.succeed(Location.Service, Location.Service.of(location({ directory: AbsolutePath.make("/project") }))),
      ),
    ),
  )
})
