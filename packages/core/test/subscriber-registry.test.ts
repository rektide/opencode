import { describe, expect } from "bun:test"
import { Deferred, Effect, Exit, Fiber, Layer, Option, Stream } from "effect"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { SubscriberRegistry } from "@opencode-ai/core/subscriber-registry"
import { Location } from "@opencode-ai/schema/location"
import { Plugin } from "@opencode-ai/schema/plugin"
import { Workspace } from "@opencode-ai/schema/workspace"
import { Subscriber } from "@opencode-ai/schema/subscriber"
import { testEffect } from "./lib/effect"

const registryLayer = LayerNode.compile(
  LayerNode.group([SubscriberRegistry.configured({ observerCapacity: 4 })]),
  [],
) as unknown as Layer.Layer<SubscriberRegistry.Service>

const it = testEffect(registryLayer)

const target = (name: string): Subscriber.Target => ({
  namespace: "event",
  name,
})

const watchInto = (changes: Subscriber.Change[], query?: Subscriber.Query) =>
  SubscriberRegistry.Service.pipe(
    Effect.flatMap((service) =>
      service
        .watch(undefined, query)
        .pipe(
          Stream.tap((change) => Effect.sync(() => changes.push(change))),
          Stream.runDrain,
        ),
    ),
    Effect.forkScoped,
  )

describe("SubscriberRegistry", () => {
  it.live("registers scoped leases and removes them exactly once", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      const changes: Subscriber.Change[] = []
      const watcher = yield* watchInto(changes)
      yield* Effect.sleep(1)
      yield* Effect.scoped(
        Effect.gen(function* () {
          const registration = yield* service.register({
            kind: "stream",
            target: target("public-feed"),
            delivery: { type: "effect-stream" },
          })
          expect(yield* service.count({ target: { name: "public-feed" } })).toBe(1)
          registration.close("overflow")
          registration.close("overflow")
          expect(yield* service.count({ target: { name: "public-feed" } })).toBe(0)
        }),
      )
      yield* Effect.sleep(1)
      yield* Fiber.interrupt(watcher)
      const added = changes.find((change): change is Extract<Subscriber.Change, { type: "added" }> =>
        change.type === "added",
      )
      if (!added) throw new Error("expected added change")
      expect(changes.filter((change) => change.type === "removed")).toEqual([
        { type: "removed", revision: 2, id: added.subscriber.id, reason: "overflow" },
      ])
      expect(yield* service.count()).toBe(0)
    }),
  )

  it.live("counts registrations and applies structured queries", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* service.register({
            kind: "listener",
            owner: { type: "server", component: "event-feed-bridge" },
            target: target("public-feed"),
            delivery: { type: "callback" },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "client", client: "unknown" },
            target: target("public-feed"),
            delivery: { type: "sse", capacity: 16 },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "core", component: "config" },
            target: { namespace: "state", name: "reload" },
            delivery: { type: "effect-stream" },
          })

          expect(yield* service.count()).toBe(3)
          expect(yield* service.count({ target: { namespace: "event" } })).toBe(2)
          expect(yield* service.count({ kind: "listener", owner: { component: "event-feed-bridge" } })).toBe(1)
          expect(yield* service.count({ owner: { type: "client" } })).toBe(1)
          const snapshot = yield* service.snapshot()
          expect(snapshot.subscribers.map((subscriber) => subscriber.target.name).sort()).toEqual([
            "public-feed",
            "public-feed",
            "reload",
          ])
        }),
      )
    }),
  )

  it.live("links children through parentID", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          const bridge = yield* service.register({
            kind: "listener",
            owner: { type: "server", component: "event-feed-bridge" },
            target: target("public-feed"),
            delivery: { type: "callback" },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "client", client: "unknown" },
            target: target("public-feed"),
            delivery: { type: "sse", capacity: 16 },
            parentID: bridge.id,
          })
          const snapshot = yield* service.snapshot()
          expect(snapshot.subscribers.find((subscriber) => subscriber.kind === "stream")?.parentID).toBe(bridge.id)
        }),
      )
    }),
  )

  it.live("updates state and records activity counters without lifecycle deltas", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      const changes: Subscriber.Change[] = []
      const watcher = yield* watchInto(changes, { target: { name: "public-feed" } })
      yield* Effect.sleep(1)
      yield* Effect.scoped(
        Effect.gen(function* () {
          const registration = yield* service.register({
            kind: "stream",
            target: target("public-feed"),
            delivery: { type: "effect-stream" },
          })
          yield* Effect.sleep(1)
          registration.delivered()
          registration.delivered(3)
          registration.dropped()
          registration.lag(7)
          registration.lag(2)
          registration.update({ state: "draining" })
          registration.update({ state: "draining" })
          yield* Effect.sleep(1)
          const snapshot = yield* service.snapshot()
          const info = snapshot.subscribers.find((subscriber) => subscriber.id === registration.id)
          expect(info?.state).toBe("draining")
          expect(info?.activity).toMatchObject({ delivered: 4, dropped: 1, lag: 2, highWaterMark: 7 })
        }),
      )
      yield* Effect.sleep(1)
      yield* Fiber.interrupt(watcher)
      expect(changes.map((change) => change.type)).toEqual(["snapshot", "added", "updated", "removed"])
      const removed = changes.at(-1)
      if (removed?.type !== "removed") throw new Error("expected removed")
      expect(removed.reason).toBe("scope-closed")
    }),
  )

  it.live("delivers an atomic snapshot-first handoff under concurrent mutation", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      const changes: Subscriber.Change[] = []
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* service.register({ kind: "stream", target: target("public-feed"), delivery: { type: "effect-stream" } })
          const watcher = yield* watchInto(changes)
          yield* Effect.sleep(1)
          yield* Effect.scoped(
            service.register({ kind: "stream", target: target("public-feed"), delivery: { type: "effect-stream" } }),
          )
          yield* Effect.sleep(1)
          yield* Fiber.interrupt(watcher)
        }),
      )
      const first = changes[0]
      if (first?.type !== "snapshot") throw new Error("expected snapshot first")
      expect(first.snapshot.subscribers.length).toBe(1)
      expect(changes.slice(1).map((change) => change.type)).toEqual(["added", "removed"])
      const added = changes[1]
      if (added?.type !== "added") throw new Error("expected added")
      expect(added.revision).toBe(first.snapshot.revision + 1)
    }),
  )

  it.live("fails only the observer that overflows", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      const blocked = yield* Deferred.make<void>()
      const stalled = yield* SubscriberRegistry.Service.pipe(
        Effect.flatMap((service) =>
          service
            .watch(undefined, { target: { name: "public-feed" } })
            .pipe(
              Stream.tap((change) => (change.type === "snapshot" ? Effect.void : Deferred.await(blocked))),
              Stream.runDrain,
            ),
        ),
        Effect.forkScoped,
      )
      // The healthy observer watches a disjoint target, so the burst cannot
      // overflow it and isolation is not a timing race.
      const healthy: Subscriber.Change[] = []
      const healthyWatcher = yield* watchInto(healthy, { target: { namespace: "state" } })
      yield* Effect.sleep(1)

      for (let index = 0; index < 6; index++) {
        yield* Effect.scoped(
          service.register({
            kind: "stream",
            owner: { type: "core", component: `burst-${index}` },
            target: target("public-feed"),
            delivery: { type: "effect-stream" },
          }),
        )
      }
      yield* Effect.scoped(
        service.register({
          kind: "stream",
          owner: { type: "core", component: "survivor" },
          target: { namespace: "state", name: "reload" },
          delivery: { type: "effect-stream" },
        }),
      )
      yield* Deferred.succeed(blocked, undefined)
      yield* Effect.sleep(1)

      const exit = yield* Effect.exit(Fiber.join(stalled))
      expect(Exit.isFailure(exit)).toBeTrue()
      const error = Option.getOrUndefined(Exit.findErrorOption(exit))
      expect(error).toBeInstanceOf(Subscriber.WatchOverflowError)
      expect(yield* service.count()).toBe(0)

      yield* Fiber.interrupt(healthyWatcher)
      expect(healthy.map((change) => change.type)).toEqual(["snapshot", "added", "removed"])
    }),
  )

  it.live("filters snapshots by principal location and own plugin identity", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* service.register({
            kind: "stream",
            owner: { type: "core", component: "global" },
            target: target("public-feed"),
            delivery: { type: "effect-stream" },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "plugin", pluginID: Plugin.ID.make("plug_other"), generation: "1" },
            target: {
              namespace: "event",
              name: "public-feed",
              location: Location.Ref.make({ directory: "/elsewhere" as never, workspaceID: Workspace.ID.make("wrk_other") }),
            },
            delivery: { type: "effect-stream" },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "plugin", pluginID: Plugin.ID.make("plug_self"), generation: "1" },
            target: {
              namespace: "event",
              name: "public-feed",
              location: Location.Ref.make({ directory: "/elsewhere" as never, workspaceID: Workspace.ID.make("wrk_other") }),
            },
            delivery: { type: "effect-stream" },
          })

          const self = yield* service.snapshot({
            location: Location.Ref.make({ directory: "/here" as never, workspaceID: Workspace.ID.make("wrk_here") }),
            pluginID: Plugin.ID.make("plug_self"),
          })
          expect(self.subscribers.map((subscriber) => subscriber.owner)).toMatchObject([
            { type: "core", component: "global" },
            { type: "plugin", pluginID: "plug_self", generation: "1" },
          ])
          const away = yield* service.snapshot({ location: Location.Ref.make({ directory: "/here" as never, workspaceID: Workspace.ID.make("wrk_here") }) })
          expect(away.subscribers.length).toBe(1)
        }),
      )
    }),
  )

  it.live("summarizes groups with low-cardinality keys", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* service.register({
            kind: "stream",
            owner: { type: "client", client: "unknown" },
            target: target("public-feed"),
            delivery: { type: "sse", capacity: 16 },
          })
          yield* service.register({
            kind: "stream",
            owner: { type: "client", client: "unknown" },
            target: target("public-feed"),
            delivery: { type: "sse", capacity: 16 },
          })
          yield* service.register({
            kind: "listener",
            owner: { type: "server", component: "event-feed-bridge" },
            target: target("public-feed"),
            delivery: { type: "callback" },
          })

          const summary = yield* service.summary()
          expect(summary.total).toBe(3)
          expect(summary.groups).toEqual([
            { kind: "stream", namespace: "event", name: "public-feed", delivery: "sse", count: 2 },
            { kind: "listener", namespace: "event", name: "public-feed", delivery: "callback", count: 1 },
          ])
        }),
      )
    }),
  )

  it.live("observing the registry does not register a subscriber", () =>
    Effect.gen(function* () {
      const service = yield* SubscriberRegistry.Service
      const changes: Subscriber.Change[] = []
      yield* Effect.scoped(
        Effect.gen(function* () {
          const watcher = yield* watchInto(changes)
          yield* Effect.sleep(1)
          expect(yield* service.count()).toBe(0)
          const snapshot = yield* service.snapshot()
          expect(snapshot.subscribers.length).toBe(0)
          yield* Fiber.interrupt(watcher)
        }),
      )
      expect(changes.map((change) => change.type)).toEqual(["snapshot"])
    }),
  )
})
