export * as EventFeed from "./event-feed"

import { Bus } from "@opencode-ai/core/bus"
import { SubscriberRegistry } from "@opencode-ai/core/subscriber-registry"
import { Event } from "@opencode-ai/schema/event"
import { isOpenCodeEvent, type OpenCodeEvent } from "@opencode-ai/protocol/groups/event"
import { Cause, Context, Effect, Layer, Queue, Schema, Scope, Stream } from "effect"

export const SubscriberCapacity = 4_096

export class SubscriberOverflowError extends Schema.TaggedError<SubscriberOverflowError>()(
  "EventFeed.SubscriberOverflow",
  { capacity: Schema.Int },
) {}

export class EncodingError extends Schema.TaggedError<EncodingError>()("EventFeed.EncodingError", {
  eventID: Event.ID,
  eventType: Schema.String,
  cause: Schema.Defect(),
}) {}

export type Error = SubscriberOverflowError | EncodingError

export interface Interface {
  readonly subscribe: Effect.Effect<Stream.Stream<string, Error>, never, Scope.Scope>
  /** Authoritative count of attached SSE queues; zero means no public event clients. */
  readonly count: Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/server/EventFeed") {}

export function frame(event: OpenCodeEvent) {
  return `data: ${JSON.stringify(event)}\n\n`
}

export const make = Effect.fn("EventFeed.make")(function* (
  observe: (subscriber: Bus.Subscriber) => Effect.Effect<Bus.Unsubscribe>,
  options?: {
    readonly capacity?: number
    readonly encode?: (event: OpenCodeEvent) => string
    readonly registry?: SubscriberRegistry.Interface
  },
) {
  const capacity = options?.capacity ?? SubscriberCapacity
  const render = options?.encode ?? frame
  const registry = options?.registry
  const subscribers = new Map<Queue.Queue<string, Error>, SubscriberRegistry.Registration | undefined>()

  const bridge = registry
    ? yield* registry.register({
        kind: "listener",
        owner: { type: "server", component: "event-feed-bridge" },
        target: { namespace: "event", name: "public-feed" },
        delivery: { type: "callback" },
      })
    : undefined

  const fail = (error: Error) =>
    Effect.sync(() => {
      const current = Array.from(subscribers)
      subscribers.clear()
      for (const [subscriber, registration] of current) {
        registration?.close("failed")
        Queue.failCauseUnsafe(subscriber, Cause.fail(error))
      }
    })

  const publish = Effect.fnUntraced(function* (event: Event.Payload) {
    if (!isOpenCodeEvent(event)) return
    if (subscribers.size === 0) return
    const encoded = yield* Effect.try({
      try: () => render(event),
      catch: (cause) => new EncodingError({ eventID: event.id, eventType: event.type, cause }),
    }).pipe(
      Effect.catch((error) =>
        Effect.logError("Failed to encode public event", {
          eventID: error.eventID,
          eventType: error.eventType,
          cause: error.cause,
        }).pipe(Effect.andThen(fail(error)), Effect.as(undefined)),
      ),
    )
    if (encoded === undefined) return
    for (const [subscriber, registration] of subscribers) {
      if (Queue.offerUnsafe(subscriber, encoded)) {
        registration?.delivered()
        continue
      }
      subscribers.delete(subscriber)
      registration?.dropped()
      registration?.close("overflow")
      Queue.failCauseUnsafe(subscriber, Cause.fail(new SubscriberOverflowError({ capacity })))
    }
  })

  const unsubscribe = yield* observe(publish)
  yield* Effect.addFinalizer(() => unsubscribe)

  return Service.of({
    subscribe: Effect.acquireRelease(
      Effect.gen(function* () {
        const queue = yield* Queue.dropping<string, Error>(capacity)
        const registration = registry
          ? yield* registry.register({
              kind: "stream",
              owner: { type: "client", client: "unknown" },
              target: { namespace: "event", name: "public-feed" },
              delivery: { type: "sse", capacity },
              ...(bridge === undefined ? {} : { parentID: bridge.id }),
            })
          : undefined
        subscribers.set(queue, registration)
        return queue
      }),
      (queue) =>
        Effect.sync(() => {
          subscribers.get(queue)?.close("scope-closed")
          subscribers.delete(queue)
        }).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.asVoid),
    ).pipe(Effect.map(Stream.fromQueue)),
    count: Effect.sync(() => subscribers.size),
  })
})

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const bus = yield* Bus.Service
    const registry = yield* SubscriberRegistry.Service
    return yield* make(bus.listen, { registry })
  }),
)
