import { Event } from "@opencode-ai/schema/event"
import { EventManifest } from "@opencode-ai/schema/event-manifest"
import { Location } from "@opencode-ai/schema/location"
import { Session } from "@opencode-ai/schema/session"
import { SessionEvent } from "@opencode-ai/schema/session-event"
import { optional } from "@opencode-ai/schema/schema"
import type { Definition } from "@opencode-ai/schema/event"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors.js"

export const EventSubscriptionID = Schema.String.check(Schema.isStartsWith("evsub_")).pipe(
  Schema.brand("EventSubscription.ID"),
  Schema.annotate({ identifier: "EventSubscription.ID" }),
)
export type EventSubscriptionID = typeof EventSubscriptionID.Type

export class EventSubscriptionNotFoundError extends Schema.TaggedError<EventSubscriptionNotFoundError>()(
  "EventSubscriptionNotFoundError",
  {
    subscriptionID: EventSubscriptionID,
    message: Schema.String,
  },
  { httpApiStatus: 404 },
) {}

export const EventFeedProfile = Schema.Literals(["location", "session-streaming"])

const streamingTypes = new Set<string>([
  SessionEvent.Text.Delta.type,
  SessionEvent.Reasoning.Delta.type,
  SessionEvent.Tool.Input.Delta.type,
  SessionEvent.Tool.Progress.type,
  SessionEvent.Compaction.Delta.type,
])

/** Delivery policy, not authorization. Every other public type stays broad. */
export const isStreamingEvent = (event: { readonly type: string }) => streamingTypes.has(event.type)

export interface EventInterest extends Schema.Schema.Type<typeof EventInterest> {}
export const EventInterest = Schema.Struct({
  locations: Schema.Array(Location.Ref),
  sessions: Schema.Array(Session.ID),
  profile: EventFeedProfile.pipe(optional),
}).annotate({ identifier: "EventInterest" })

export interface EventFeedReady extends Schema.Schema.Type<typeof EventFeedReady> {}
export const EventFeedReady = Schema.Struct({
  type: Schema.Literal("event-feed.ready"),
  data: Schema.Struct({ subscriptionID: EventSubscriptionID, profiles: Schema.Array(EventFeedProfile).pipe(optional) }),
}).annotate({ identifier: "EventFeedReady" })

const fields = {
  id: Event.ID,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  location: Schema.optional(Location.Ref),
}

const rpcEvent = Schema.Struct({
  id: Event.ID,
  created: Schema.Finite,
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  type: Schema.TemplateLiteral(["rpc.", Schema.String]),
  location: Location.Ref,
  data: Schema.Record(Schema.String, Schema.Unknown),
}).annotate({ identifier: "V2Event.rpc" })

const schema = <const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) =>
  Schema.Union([
    ...definitions,
    rpcEvent,
    ...(definitions.some((definition) => definition.type === "server.connected")
      ? []
      : [
          Schema.Struct({
            ...fields,
            type: Schema.Literal("server.connected"),
            data: Schema.Struct({}),
          }).annotate({ identifier: "V2Event.server.connected" }),
        ]),
  ]).annotate({ identifier: "V2Event" })

const make = <const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) => {
  const EventSchema = schema(definitions)
  const ControlledFeedItem = Schema.Union([EventSchema, EventFeedReady]).annotate({
    identifier: "ControlledFeedItem",
  })
  return {
    schema: EventSchema,
    controlledSchema: ControlledFeedItem,
    group: HttpApiGroup.make("server.event")
      .add(
        HttpApiEndpoint.get("event.subscribe", "/api/event", {
          success: HttpApiSchema.StreamSse({ data: EventSchema }),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "v2.event.subscribe",
            summary: "Subscribe to events",
            description:
              "Subscribe to native events and plugin RPC events across all server locations. Volatile by contract: a slow consumer overflows and fails the stream, and events during disconnection are missed.",
          }),
        ),
      )
      .add(
        HttpApiEndpoint.get("event.controlled.subscribe", "/api/experimental/event", {
          success: HttpApiSchema.StreamSse({ data: ControlledFeedItem }),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "v2.event.controlled.subscribe",
            summary: "Subscribe to a controlled event feed",
            description:
              "Open an experimental event stream that activates after the client replaces its complete Location and Session interest set.",
          }),
        ),
      )
      .add(
        HttpApiEndpoint.put(
          "event.controlled.replaceInterests",
          "/api/experimental/event/subscriptions/:subscriptionID/interests",
          {
            params: { subscriptionID: EventSubscriptionID },
            payload: EventInterest,
            success: HttpApiSchema.NoContent,
            error: [EventSubscriptionNotFoundError, InvalidRequestError],
          },
        ).annotateMerge(
          OpenApi.annotations({
            identifier: "v2.event.controlled.replaceInterests",
            summary: "Replace controlled event interests",
            description:
              "Replace the complete Location and Session interest set for one live controlled event subscription.",
          }),
        ),
      )
      .annotateMerge(OpenApi.annotations({ title: "event", description: "Experimental event stream routes." })),
  }
}

export const makeEventGroup = <const Definitions extends ReadonlyArray<Definition>>(definitions: Definitions) =>
  make(definitions).group

const event = make(EventManifest.ServerDefinitions)
export const EventGroup = event.group
export const OpenCodeEvent = event.schema
export type OpenCodeEvent = typeof OpenCodeEvent.Type
export type OpenCodeEventEncoded = typeof OpenCodeEvent.Encoded
export const ControlledFeedItem = event.controlledSchema
export type ControlledFeedItem = typeof ControlledFeedItem.Type
export const isOpenCodeEvent = (event: { readonly type: string }): event is OpenCodeEvent =>
  event.type === "server.connected" || EventManifest.isServer(event) || event.type.startsWith("rpc.")
