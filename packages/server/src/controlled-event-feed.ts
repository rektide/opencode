export * as ControlledEventFeed from "./controlled-event-feed"

import { Bus } from "@opencode-ai/core/bus"
import {
  EventSubscriptionID,
  EventSubscriptionNotFoundError,
  isOpenCodeEvent,
  isStreamingEvent,
  type ControlledFeedItem,
  type EventInterest,
  type OpenCodeEvent,
} from "@opencode-ai/protocol/groups/event"
import { InvalidRequestError } from "@opencode-ai/protocol/errors"
import { Event } from "@opencode-ai/schema/event"
import type { Location } from "@opencode-ai/schema/location"
import { SessionEvent } from "@opencode-ai/schema/session-event"
import type { SessionID } from "@opencode-ai/schema/session-id"
import { Cause, Context, Effect, Layer, Queue, Schema, Scope, Semaphore, Stream } from "effect"

export const SubscriberCapacity = 4_096
export const InterestByteCapacity = 256 * 1_024
export const LocationInterestCapacity = 1_024
export const SessionInterestCapacity = 4_096

export class SubscriberOverflowError extends Schema.TaggedError<SubscriberOverflowError>()(
  "ControlledEventFeed.SubscriberOverflow",
  { capacity: Schema.Int },
) {}

export class EncodingError extends Schema.TaggedError<EncodingError>()("ControlledEventFeed.EncodingError", {
  eventID: Event.ID,
  eventType: Schema.String,
  cause: Schema.Defect(),
}) {}

export type Error = SubscriberOverflowError | EncodingError

export interface Interface {
  readonly subscribe: Effect.Effect<Stream.Stream<string, Error>, never, Scope.Scope>
  readonly replaceInterests: (input: {
    readonly subscriptionID: EventSubscriptionID
    readonly interest: EventInterest
  }) => Effect.Effect<void, EventSubscriptionNotFoundError | InvalidRequestError>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/server/ControlledEventFeed") {}

type InterestSet = {
  readonly profile: NonNullable<EventInterest["profile"]>
  readonly locations: ReadonlyMap<string, Location.Ref>
  readonly sessions: ReadonlySet<SessionID>
}

type Subscriber = {
  readonly id: EventSubscriptionID
  readonly queue: Queue.Queue<string, Error>
  active: boolean
  requested: InterestSet
  readonly derivedLocations: Map<SessionID, Location.Ref>
}

type Overflow = {
  readonly subscriptionIDs: readonly EventSubscriptionID[]
  readonly overflowCount: number
}

const emptyInterest = (): InterestSet => ({ profile: "location", locations: new Map(), sessions: new Set() })

export function frame(item: ControlledFeedItem) {
  return `data: ${JSON.stringify(item)}\n\n`
}

export const make = Effect.fn("ControlledEventFeed.make")(function* (
  observe: (observer: Bus.RoutedObserver) => Effect.Effect<Bus.Unsubscribe>,
  options?: {
    readonly capacity?: number
    readonly encode?: (event: OpenCodeEvent) => string
    readonly createID?: () => EventSubscriptionID
  },
) {
  const capacity = options?.capacity ?? SubscriberCapacity
  const render = options?.encode ?? frame
  const createID = options?.createID ?? randomID
  const subscribers = new Map<EventSubscriptionID, Subscriber>()
  const admission = Semaphore.makeUnsafe(1)
  let activeCount = 0
  let overflowCount = 0

  const critical = <A>(section: () => A) => admission.withPermit(Effect.sync(section))

  const remove = (subscriber: Subscriber) => {
    if (subscribers.get(subscriber.id) !== subscriber) return
    subscribers.delete(subscriber.id)
    if (subscriber.active) activeCount -= 1
  }

  const offer = (subscriber: Subscriber, value: string) => {
    if (Queue.offerUnsafe(subscriber.queue, value)) return true
    overflowCount += 1
    remove(subscriber)
    Queue.failCauseUnsafe(subscriber.queue, Cause.fail(new SubscriberOverflowError({ capacity })))
    return false
  }

  const logOverflow = (
    input: Overflow & { readonly phase: "registration" | "activation" | "event"; readonly event?: OpenCodeEvent },
  ) =>
    Effect.logWarning("event feed subscriber overflow").pipe(
      Effect.annotateLogs({
        eventFeedMode: "controlled",
        phase: input.phase,
        capacity,
        overflowedSubscribers: input.subscriptionIDs.length,
        overflowCount: input.overflowCount,
        subscriptionIDs: input.subscriptionIDs,
        ...(input.event ? { eventID: input.event.id, eventType: input.event.type } : {}),
      }),
    )

  const fail = (error: Error) =>
    critical(() => {
      const current = Array.from(subscribers.values())
      subscribers.clear()
      activeCount = 0
      current.forEach((subscriber) => Queue.failCauseUnsafe(subscriber.queue, Cause.fail(error)))
    })

  const publish = Effect.fnUntraced(function* (input: Bus.RoutedEvent) {
    const event = input.event
    if (!isOpenCodeEvent(event)) return
    if (activeCount === 0) return
    const encoded = yield* Effect.try({
      try: () => render(event),
      catch: (cause) => new EncodingError({ eventID: event.id, eventType: event.type, cause }),
    }).pipe(
      Effect.catch((error) =>
        Effect.logError("Failed to encode controlled public event", {
          eventID: error.eventID,
          eventType: error.eventType,
          cause: error.cause,
        }).pipe(Effect.andThen(fail(error)), Effect.as(undefined)),
      ),
    )
    if (encoded === undefined) return
    const streaming = isStreamingEvent(event)
    const keys = input.audience.type === "locations" ? input.audience.refs.map(locationKey) : []
    const overflow = yield* critical(() => {
      const subscriptionIDs: EventSubscriptionID[] = []
      for (const subscriber of subscribers.values()) {
        if (!subscriber.active) continue
        const sessionID = input.audience.sessionID
        if (subscriber.requested.profile === "session-streaming") {
          if (
            (!streaming || (sessionID !== undefined && subscriber.requested.sessions.has(sessionID))) &&
            !offer(subscriber, encoded)
          )
            subscriptionIDs.push(subscriber.id)
          continue
        }
        if (sessionID !== undefined && isMoved(event) && subscriber.requested.sessions.has(sessionID)) {
          subscriber.derivedLocations.set(sessionID, event.data.location)
        }
        if (sessionID !== undefined && event.type === SessionEvent.Deleted.type) {
          subscriber.derivedLocations.delete(sessionID)
        }
        if (matches(subscriber, input.audience, keys) && !offer(subscriber, encoded))
          subscriptionIDs.push(subscriber.id)
      }
      if (subscriptionIDs.length === 0) return
      return { subscriptionIDs, overflowCount }
    })
    if (overflow) yield* logOverflow({ ...overflow, phase: "event", event })
  })

  const unsubscribe = yield* observe(publish)
  yield* Effect.addFinalizer(() => unsubscribe)

  const subscribe = Effect.acquireRelease(
    Queue.dropping<string, Error>(capacity).pipe(
      Effect.flatMap((queue) => {
        const subscriber: Subscriber = {
          id: createID(),
          queue,
          active: false,
          requested: emptyInterest(),
          derivedLocations: new Map(),
        }
        return critical(() => {
          const offered = offer(
            subscriber,
            frame({
              type: "event-feed.ready",
              data: { subscriptionID: subscriber.id, profiles: ["location", "session-streaming"] },
            }),
          )
          if (offered) {
            subscribers.set(subscriber.id, subscriber)
          }
          return {
            subscriber,
            overflow: offered ? undefined : { subscriptionIDs: [subscriber.id], overflowCount },
          }
        }).pipe(
          Effect.tap((result) =>
            result.overflow ? logOverflow({ ...result.overflow, phase: "registration" }) : Effect.void,
          ),
          Effect.map((result) => result.subscriber),
        )
      }),
    ),
    (subscriber) =>
      critical(() => remove(subscriber)).pipe(Effect.andThen(Queue.shutdown(subscriber.queue)), Effect.asVoid),
  ).pipe(Effect.map((subscriber) => Stream.fromQueue(subscriber.queue)))

  const replaceInterests: Interface["replaceInterests"] = Effect.fn("ControlledEventFeed.replaceInterests")(
    function* (input) {
      const requested = normalize(input.interest)
      if (requested instanceof InvalidRequestError) return yield* requested
      const connected = frame({ id: Event.ID.create(), type: "server.connected", data: {} })
      const result: {
        readonly error?: EventSubscriptionNotFoundError
        readonly overflow?: Overflow
      } = yield* critical(() => {
        const subscriber = subscribers.get(input.subscriptionID)
        if (!subscriber)
          return {
            error: new EventSubscriptionNotFoundError({
              subscriptionID: input.subscriptionID,
              message: `Controlled event subscription ${input.subscriptionID} was not found`,
            }),
          }
        subscriber.requested = requested
        for (const sessionID of subscriber.derivedLocations.keys()) {
          if (requested.profile !== "location" || !requested.sessions.has(sessionID))
            subscriber.derivedLocations.delete(sessionID)
        }
        if (subscriber.active) return {}
        if (!offer(subscriber, connected))
          return {
            error: new EventSubscriptionNotFoundError({
              subscriptionID: input.subscriptionID,
              message: `Controlled event subscription ${input.subscriptionID} is closed`,
            }),
            overflow: { subscriptionIDs: [subscriber.id], overflowCount },
          }
        subscriber.active = true
        activeCount += 1
        return {}
      })
      if (result.overflow) yield* logOverflow({ ...result.overflow, phase: "activation" })
      if (result.error) return yield* result.error
    },
  )

  return Service.of({ subscribe, replaceInterests })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    return yield* make(bus.observeRouted)
  }),
)

function normalize(interest: EventInterest): InterestSet | InvalidRequestError {
  const bytes = new TextEncoder().encode(JSON.stringify(interest)).byteLength
  if (bytes > InterestByteCapacity) return invalid(`Interest exceeds ${InterestByteCapacity} encoded bytes`)
  if (interest.locations.length > LocationInterestCapacity)
    return invalid(`Interest exceeds ${LocationInterestCapacity} Location entries`)
  if (interest.sessions.length > SessionInterestCapacity)
    return invalid(`Interest exceeds ${SessionInterestCapacity} Session entries`)
  const locations = new Map(interest.locations.map((ref) => [locationKey(ref), ref]))
  const sessions = new Set(interest.sessions)
  if (locations.size > LocationInterestCapacity)
    return invalid(`Interest exceeds ${LocationInterestCapacity} distinct Locations`)
  if (sessions.size > SessionInterestCapacity)
    return invalid(`Interest exceeds ${SessionInterestCapacity} distinct Sessions`)
  return { locations, sessions, profile: interest.profile ?? "location" }
}

function invalid(message: string) {
  return new InvalidRequestError({ message, field: "interest" })
}

function matches(subscriber: Subscriber, audience: Bus.EventAudience, keys: readonly string[]) {
  if (audience.type === "global") return true
  if (keys.some((key) => covers(subscriber, key))) return true
  return audience.sessionID !== undefined && subscriber.requested.sessions.has(audience.sessionID)
}

function covers(subscriber: Subscriber, key: string) {
  if (subscriber.requested.locations.has(key)) return true
  for (const derived of subscriber.derivedLocations.values()) {
    if (locationKey(derived) === key) return true
  }
  return false
}

function locationKey(ref: Location.Ref) {
  return JSON.stringify([ref.directory, ref.workspaceID])
}

function isMoved(event: Event.Payload): event is Event.Payload<typeof SessionEvent.Moved> {
  return event.type === SessionEvent.Moved.type
}

function randomID() {
  return EventSubscriptionID.make(
    `evsub_${Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  )
}
