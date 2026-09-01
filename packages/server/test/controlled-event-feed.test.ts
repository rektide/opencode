import { describe, expect } from "bun:test"
import { Agent } from "@opencode-ai/core/agent"
import { Bus } from "@opencode-ai/core/bus"
import {
  ControlledFeedItem,
  EventInterest,
  EventSubscriptionID,
  EventSubscriptionNotFoundError,
} from "@opencode-ai/protocol/groups/event"
import { InvalidRequestError } from "@opencode-ai/protocol/errors"
import { Event } from "@opencode-ai/schema/event"
import { Location } from "@opencode-ai/schema/location"
import { Project } from "@opencode-ai/schema/project"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { SessionEvent } from "@opencode-ai/schema/session-event"
import { SessionID } from "@opencode-ai/schema/session-id"
import { WorkspaceID } from "@opencode-ai/schema/workspace-id"
import { Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { it } from "../../core/test/lib/effect"
import { ControlledEventFeed } from "../src/controlled-event-feed"

const Internal = Bus.ephemeral({ type: "test.controlled.internal", schema: {} })
const a = Location.Ref.make({ directory: AbsolutePath.make("/a") })
const b = Location.Ref.make({ directory: AbsolutePath.make("/b") })
const otherWorkspace = Location.Ref.make({ directory: a.directory, workspaceID: WorkspaceID.make("wrk_other") })
const sessionID = SessionID.make("ses_controlled")
const firstID = EventSubscriptionID.make("evsub_00000000000000000000000000000001")
const secondID = EventSubscriptionID.make("evsub_00000000000000000000000000000002")

function publicEvent(id: string): Event.Payload<typeof Agent.Event.Updated> {
  return {
    id: Event.ID.make(`evt_${id}`),
    created: Date.now(),
    type: Agent.Event.Updated.type,
    data: {},
  }
}

function internal(): Event.Payload<typeof Internal> {
  return { id: Event.ID.create(), created: Date.now(), type: Internal.type, data: {} }
}

function moved(id: string, location: Location.Ref): Event.Payload<typeof SessionEvent.Moved> {
  return {
    id: Event.ID.make(`evt_${id}`),
    created: Date.now(),
    type: SessionEvent.Moved.type,
    durable: { aggregateID: sessionID, seq: Event.Seq.make(0), version: Event.Version.make(1) },
    data: { sessionID, location, projectID: Project.ID.global },
  }
}

function renamed(id: string): Event.Payload<typeof SessionEvent.Renamed> {
  return {
    id: Event.ID.make(`evt_${id}`),
    created: Date.now(),
    type: SessionEvent.Renamed.type,
    durable: { aggregateID: sessionID, seq: Event.Seq.make(1), version: Event.Version.make(1) },
    data: { sessionID, title: id },
  }
}

function deleted(id: string): Event.Payload<typeof SessionEvent.Deleted> {
  return {
    id: Event.ID.make(`evt_${id}`),
    created: Date.now(),
    type: SessionEvent.Deleted.type,
    durable: { aggregateID: sessionID, seq: Event.Seq.make(2), version: Event.Version.make(2) },
    data: { sessionID },
  }
}

function makeSource() {
  let observer: Bus.RoutedObserver | undefined
  return {
    observe: (next: Bus.RoutedObserver) =>
      Effect.sync(() => {
        observer = next
        return Effect.sync(() => {
          if (observer === next) observer = undefined
        })
      }),
    publish: (event: Event.Payload, audience: Bus.EventAudience) =>
      Effect.suspend(() => (observer ? observer({ event, audience }) : Effect.void)),
  }
}

function interests(locations: readonly Location.Ref[] = [], sessions: readonly SessionID[] = []) {
  return EventInterest.make({ locations, sessions })
}

function ids(...values: EventSubscriptionID[]) {
  let index = 0
  return () => {
    const value = values[index]
    index += 1
    if (!value) throw new Error("Missing test subscription ID")
    return value
  }
}

function decode(value: string) {
  return Schema.decodeUnknownSync(ControlledFeedItem)(JSON.parse(value.slice("data: ".length)))
}

function labels(values: readonly string[]) {
  return values.map((value) => {
    const item = decode(value)
    if (item.type === "event-feed.ready") return `ready:${item.data.subscriptionID}`
    if (item.type === "server.connected") return "connected"
    return item.id
  })
}

describe("ControlledEventFeed", () => {
  it.effect("emits a 128-bit subscription ID", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe)
      const stream = yield* feed.subscribe

      const frames = yield* stream.pipe(Stream.take(1), Stream.runCollect)
      const ready = decode(Array.from(frames)[0] ?? "")

      expect(ready.type).toBe("event-feed.ready")
      if (ready.type !== "event-feed.ready") return
      expect(ready.data.subscriptionID).toMatch(/^evsub_[0-9a-f]{32}$/)
    }),
  )

  it.effect("keeps pending subscribers ready-only until activation", () =>
    Effect.gen(function* () {
      const source = makeSource()
      let encodes = 0
      const feed = yield* ControlledEventFeed.make(source.observe, {
        capacity: 1,
        createID: ids(firstID),
        encode: (event) => {
          encodes += 1
          return ControlledEventFeed.frame(event)
        },
      })
      const stream = yield* feed.subscribe

      yield* source.publish(publicEvent("pending-global"), { type: "global" })
      yield* source.publish(publicEvent("pending-local"), { type: "locations", refs: [a] })
      expect(encodes).toBe(0)
      expect(labels(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect)))).toEqual([`ready:${firstID}`])

      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([a]) })
      expect(labels(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect)))).toEqual(["connected"])
      yield* source.publish(publicEvent("active"), { type: "locations", refs: [a] })
      expect(encodes).toBe(1)
      expect(labels(Array.from(yield* stream.pipe(Stream.take(1), Stream.runCollect)))).toEqual(["evt_active"])
    }),
  )

  it.effect("admits the union of global, Location, and exact Session interest once", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, { createID: ids(firstID) })
      const stream = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([a], [sessionID]) })
      const received = yield* stream.pipe(Stream.take(6), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(publicEvent("global"), { type: "global" })
      yield* source.publish(publicEvent("location"), { type: "locations", refs: [a] })
      yield* source.publish(publicEvent("foreign"), { type: "locations", refs: [b] })
      yield* source.publish(publicEvent("intersection"), { type: "locations", refs: [b, a, a] })
      yield* source.publish(renamed("session"), { type: "locations", refs: [b], sessionID })
      yield* source.publish(renamed("other-session"), {
        type: "locations",
        refs: [b],
        sessionID: SessionID.make("ses_other"),
      })
      yield* source.publish(internal(), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(received)))).toEqual([
        `ready:${firstID}`,
        "connected",
        "evt_global",
        "evt_location",
        "evt_intersection",
        "evt_session",
      ])
    }),
  )

  it.effect("keeps same-directory workspaces distinct", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, { createID: ids(firstID) })
      const stream = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([a]) })
      const received = yield* stream.pipe(Stream.take(4), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(publicEvent("other-workspace"), { type: "locations", refs: [otherWorkspace] })
      yield* source.publish(publicEvent("default-workspace"), { type: "locations", refs: [a] })
      yield* source.publish(publicEvent("done"), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(received)))).toEqual([
        `ready:${firstID}`,
        "connected",
        "evt_default-workspace",
        "evt_done",
      ])
    }),
  )

  it.effect("encodes one public frame for every matching subscriber", () =>
    Effect.gen(function* () {
      const source = makeSource()
      let encodes = 0
      const feed = yield* ControlledEventFeed.make(source.observe, {
        createID: ids(firstID, secondID),
        encode: (event) => {
          encodes += 1
          return ControlledEventFeed.frame(event)
        },
      })
      const first = yield* feed.subscribe
      const second = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() })
      yield* feed.replaceInterests({ subscriptionID: secondID, interest: interests() })
      const left = yield* first.pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped)
      const right = yield* second.pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(publicEvent("shared"), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(left)))).toEqual([`ready:${firstID}`, "connected", "evt_shared"])
      expect(labels(Array.from(yield* Fiber.join(right)))).toEqual([`ready:${secondID}`, "connected", "evt_shared"])
      expect(encodes).toBe(1)
    }),
  )

  it.effect("follows a requested Session move until that Session is unfollowed", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, { createID: ids(firstID) })
      const stream = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([], [sessionID]) })
      const received = yield* stream.pipe(Stream.take(6), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(moved("moved", b), { type: "locations", refs: [a, b], sessionID })
      yield* source.publish(publicEvent("derived-one"), { type: "locations", refs: [b] })
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([b], [sessionID]) })
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([], [sessionID]) })
      yield* source.publish(publicEvent("derived-two"), { type: "locations", refs: [b] })
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() })
      yield* source.publish(publicEvent("released"), { type: "locations", refs: [b] })
      yield* source.publish(publicEvent("done"), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(received)))).toEqual([
        `ready:${firstID}`,
        "connected",
        "evt_moved",
        "evt_derived-one",
        "evt_derived-two",
        "evt_done",
      ])
    }),
  )

  it.effect("releases derived move coverage when the Session is deleted", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, { createID: ids(firstID) })
      const stream = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests([], [sessionID]) })
      const received = yield* stream.pipe(Stream.take(5), Stream.runCollect, Effect.forkScoped)

      yield* source.publish(moved("moved", b), { type: "locations", refs: [a, b], sessionID })
      yield* source.publish(deleted("deleted"), { type: "locations", refs: [b], sessionID })
      yield* source.publish(publicEvent("released"), { type: "locations", refs: [b] })
      yield* source.publish(publicEvent("done"), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(received)))).toEqual([
        `ready:${firstID}`,
        "connected",
        "evt_moved",
        "evt_deleted",
        "evt_done",
      ])
    }),
  )

  it.effect("fails only the subscriber that exceeds its queue capacity", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, {
        capacity: 1,
        createID: ids(firstID, secondID),
      })
      const slow = yield* feed.subscribe
      const fast = yield* feed.subscribe
      yield* slow.pipe(Stream.take(1), Stream.runDrain)
      yield* fast.pipe(Stream.take(1), Stream.runDrain)
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() })
      yield* feed.replaceInterests({ subscriptionID: secondID, interest: interests() })
      yield* slow.pipe(Stream.take(1), Stream.runDrain)
      yield* fast.pipe(Stream.take(1), Stream.runDrain)
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const received: string[] = []
      const fastFiber = yield* fast.pipe(
        Stream.take(3),
        Stream.runForEach((value) =>
          Effect.sync(() => received.push(decode(value).type)).pipe(
            Effect.flatMap((length) =>
              length === 1
                ? Deferred.succeed(first, undefined)
                : length === 2
                  ? Deferred.succeed(second, undefined)
                  : Effect.void,
            ),
          ),
        ),
        Effect.forkScoped,
      )

      yield* source.publish(publicEvent("one"), { type: "global" })
      yield* Deferred.await(first)
      yield* source.publish(publicEvent("two"), { type: "global" })
      yield* Deferred.await(second)
      yield* source.publish(publicEvent("three"), { type: "global" })
      yield* Fiber.join(fastFiber)

      const exit = yield* slow.pipe(Stream.runDrain, Effect.exit)
      expect(received).toEqual([Agent.Event.Updated.type, Agent.Event.Updated.type, Agent.Event.Updated.type])
      expect(Exit.isFailure(exit)).toBeTrue()
      if (Exit.isSuccess(exit)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(exit))).toBeInstanceOf(
        ControlledEventFeed.SubscriberOverflowError,
      )
      expect(
        yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() }).pipe(Effect.flip),
      ).toBeInstanceOf(EventSubscriptionNotFoundError)
    }),
  )

  it.effect("fails current subscribers after encoding failure and serves later subscribers", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, {
        createID: ids(firstID, secondID),
        encode: (event) => {
          if (event.id === Event.ID.make("evt_bad")) throw new Error("bad frame")
          return ControlledEventFeed.frame(event)
        },
      })
      const current = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() })
      const failed = yield* current.pipe(Stream.runCollect, Effect.exit, Effect.forkScoped)

      yield* source.publish(publicEvent("bad"), { type: "global" })
      const exit = yield* Fiber.join(failed)
      expect(Exit.isFailure(exit)).toBeTrue()
      if (Exit.isSuccess(exit)) return
      expect(Option.getOrUndefined(Exit.findErrorOption(exit))).toBeInstanceOf(ControlledEventFeed.EncodingError)

      const next = yield* feed.subscribe
      yield* feed.replaceInterests({ subscriptionID: secondID, interest: interests() })
      const received = yield* next.pipe(Stream.take(3), Stream.runCollect, Effect.forkScoped)
      yield* source.publish(publicEvent("good"), { type: "global" })

      expect(labels(Array.from(yield* Fiber.join(received)))).toEqual([`ready:${secondID}`, "connected", "evt_good"])
    }),
  )

  it.effect("rejects missing and oversized replacements explicitly", () =>
    Effect.gen(function* () {
      const source = makeSource()
      const feed = yield* ControlledEventFeed.make(source.observe, { createID: ids(firstID) })

      expect(
        yield* feed.replaceInterests({ subscriptionID: firstID, interest: interests() }).pipe(Effect.flip),
      ).toBeInstanceOf(EventSubscriptionNotFoundError)

      yield* feed.subscribe
      const oversized = interests(
        [],
        Array.from({ length: ControlledEventFeed.SessionInterestCapacity + 1 }, () => sessionID),
      )
      const error = yield* feed.replaceInterests({ subscriptionID: firstID, interest: oversized }).pipe(Effect.flip)
      expect(error).toBeInstanceOf(InvalidRequestError)
      if (!(error instanceof InvalidRequestError)) return
      expect(error.field).toBe("interest")
    }),
  )
})
