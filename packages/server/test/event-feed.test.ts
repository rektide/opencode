import { describe, expect, test } from "bun:test"
import { Agent } from "@opencode-ai/core/agent"
import { Bus } from "@opencode-ai/core/bus"
import { SubscriberRegistry } from "@opencode-ai/core/subscriber-registry"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Event } from "@opencode-ai/schema/event"
import { Context, Deferred, Effect, Exit, Fiber, Layer, Option, Schema, Stream } from "effect"
import { it } from "../../core/test/lib/effect"
import { EventFeed } from "../src/event-feed"

const Internal = Bus.ephemeral({ type: "test.internal", schema: { value: Schema.String } })

const event = (id: string): Event.Payload<typeof Agent.Event.Updated> => ({
  id: Event.ID.make(`evt_${id}`),
  created: Date.now(),
  type: Agent.Event.Updated.type,
  data: {},
})

const internal = (value: string): Event.Payload<typeof Internal> => ({
  id: Event.ID.create(),
  created: Date.now(),
  type: Internal.type,
  data: { value },
})

function makeSource() {
  let subscriber: Bus.Subscriber | undefined
  return {
    observe: (next: Bus.Subscriber) =>
      Effect.sync(() => {
        subscriber = next
        return Effect.sync(() => {
          if (subscriber === next) subscriber = undefined
        })
      }),
    publish: (event: Event.Payload) => Effect.suspend(() => (subscriber ? subscriber(event) : Effect.void)),
  }
}

const registryLayer = () =>
  Effect.map(
    Layer.build(
      LayerNode.compile(LayerNode.group([SubscriberRegistry.configured()]), []) as unknown as Layer.Layer<
        SubscriberRegistry.Service
      >,
    ),
    (context) => Context.get(context, SubscriberRegistry.Service),
  )

describe("EventFeed", () => {
  test("preserves the public SSE frame encoding", () => {
    const payload = event("wire")
    expect(EventFeed.frame(payload)).toBe(`data: ${JSON.stringify(payload)}\n\n`)
  })

  it.effect("encodes once and delivers the same frame to every subscriber", () =>
    Effect.gen(function* () {
      let encodes = 0
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          encodes += 1
          return event.type
        },
      })
      const first = yield* feed.subscribe
      const second = yield* feed.subscribe
      const left = yield* first.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      const right = yield* second.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(event("example"))

      expect([Array.from(yield* Fiber.join(left)), Array.from(yield* Fiber.join(right))]).toEqual([
        [Agent.Event.Updated.type],
        [Agent.Event.Updated.type],
      ])
      expect(encodes).toBe(1)
    }),
  )

  it.effect("fails only the subscriber that exceeds its lag capacity", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        capacity: 1,
        encode: (event) => event.id,
      })
      const slow = yield* feed.subscribe
      const fast = yield* feed.subscribe
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const received = new Array<string>()
      const fastFiber = yield* fast.pipe(
        Stream.take(3),
        Stream.runForEach((frame) =>
          Effect.sync(() => received.push(frame)).pipe(
            Effect.andThen(
              frame === "evt_one"
                ? Deferred.succeed(first, undefined)
                : frame === "evt_two"
                  ? Deferred.succeed(second, undefined)
                  : Effect.void,
            ),
          ),
        ),
        Effect.forkScoped,
      )

      yield* source.publish(event("one"))
      yield* Deferred.await(first)
      yield* source.publish(event("two"))
      yield* Deferred.await(second)
      yield* source.publish(event("three"))

      yield* Fiber.join(fastFiber)

      const result = yield* slow.pipe(Stream.runCollect, Effect.exit)
      expect(received).toEqual(["evt_one", "evt_two", "evt_three"])
      expect(Exit.isFailure(result)).toBeTrue()
      if (Exit.isSuccess(result)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(result))).toBeInstanceOf(EventFeed.SubscriberOverflowError)
    }),
  )

  it.effect("filters internal events before they consume subscriber capacity", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, { capacity: 1, encode: (event) => event.type })
      const stream = yield* feed.subscribe

      yield* source.publish(internal("one"))
      yield* source.publish(internal("two"))
      yield* source.publish(event("public"))

      expect(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect))).toEqual([Agent.Event.Updated.type])
    }),
  )

  it.effect("disconnects current subscribers after an encoding failure and continues for later subscribers", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        encode: (event) => {
          if (event.id === Event.ID.make("evt_bad")) throw new Error("invalid event")
          return event.id
        },
      })
      const current = yield* feed.subscribe
      const failed = yield* current.pipe(Stream.runCollect, Effect.exit, Effect.forkScoped)

      yield* source.publish(event("bad"))
      const exit = yield* Fiber.join(failed)

      const next = yield* feed.subscribe
      const received = yield* next.pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* source.publish(event("good"))

      expect(Exit.isFailure(exit)).toBeTrue()
      if (Exit.isSuccess(exit)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(exit))).toBeInstanceOf(EventFeed.EncodingError)
      expect(Array.from(yield* Fiber.join(received))).toEqual(["evt_good"])
    }),
  )

  it.effect("mirrors SSE queues into the subscriber registry", () =>
    Effect.gen(function* () {
      const registry = yield* registryLayer()
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, { registry, encode: (event) => event.type })

      expect(yield* registry.count({ target: { namespace: "event", name: "public-feed" } })).toBe(1)
      const bridge = yield* registry.snapshot(undefined, { kind: "listener" })
      expect(bridge.subscribers[0]?.owner).toEqual({ type: "server", component: "event-feed-bridge" })

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* feed.subscribe
          expect(yield* feed.count).toBe(1)
          expect(yield* registry.count({ kind: "stream", target: { namespace: "event", name: "public-feed" } })).toBe(1)
          const linked = yield* registry.snapshot(undefined, { kind: "stream" })
          expect(linked.subscribers[0]?.parentID).toBe(bridge.subscribers[0]?.id)
          expect(linked.subscribers[0]?.owner).toEqual({ type: "client", client: "unknown" })
          expect(linked.subscribers[0]?.delivery).toEqual({ type: "sse", capacity: 4096 })

          const stream = yield* feed.subscribe
          const consumed = yield* stream.pipe(
            Stream.take(1),
            Stream.runCollect,
            Effect.forkScoped,
          )
          yield* source.publish(event("delivered"))
          yield* Fiber.join(consumed)
          const counted = yield* registry.snapshot(undefined, { kind: "stream" })
          const activity = counted.subscribers.find((subscriber) => subscriber.activity.delivered > 0)?.activity
          expect(activity?.delivered).toBe(1)
        }),
      )
      expect(yield* feed.count).toBe(0)
      expect(yield* registry.count({ kind: "stream" })).toBe(0)
      expect(yield* registry.count({ kind: "listener" })).toBe(1)
    }),
  )

  it.live("removes exactly the overflowing subscriber with an overflow reason", () =>
    Effect.gen(function* () {
      const registry = yield* registryLayer()
      const source = makeSource()
      const feed = yield* EventFeed.make(source.observe, {
        registry,
        capacity: 1,
        encode: (event) => event.id,
      })
      const slow = yield* feed.subscribe
      const changes: Array<string> = []
      const watching = yield* registry
        .watch(undefined, { kind: "stream" })
        .pipe(
          Stream.tap((change) =>
            Effect.sync(() => {
              if (change.type === "removed") changes.push(change.reason)
            }),
          ),
          Stream.runDrain,
          Effect.forkScoped,
        )
      yield* Effect.sleep(1)

      yield* source.publish(event("one"))
      yield* source.publish(event("two"))

      const result = yield* slow.pipe(Stream.runCollect, Effect.exit)
      expect(Exit.isFailure(result)).toBeTrue()
      expect(yield* registry.count({ kind: "stream" })).toBe(0)
      const removed = yield* registry.snapshot()
      expect(removed.subscribers.filter((subscriber) => subscriber.kind === "stream").length).toBe(0)
      yield* Effect.sleep(1)
      yield* Fiber.interrupt(watching)
      expect(changes[0]).toBe("overflow")
    }),
  )
})
