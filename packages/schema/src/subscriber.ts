export * as Subscriber from "./subscriber.js"

import { Schema } from "effect"
import { descending } from "./identifier.js"
import { Location } from "./location.js"
import { Plugin } from "./plugin.js"
import { DateTimeUtcFromMillis, NonNegativeInt, optional, statics } from "./schema.js"

export const ID = Schema.String.check(Schema.isStartsWith("sub_")).pipe(
  Schema.brand("Subscriber.ID"),
  statics((schema) => ({
    create: () => schema.make("sub_" + descending()),
  })),
)
export type ID = typeof ID.Type

export const ProcessID = Schema.String.check(Schema.isStartsWith("subp_")).pipe(
  Schema.brand("Subscriber.ProcessID"),
  statics((schema) => ({
    create: () => schema.make("subp_" + descending()),
  })),
)
export type ProcessID = typeof ProcessID.Type

export const Kind = Schema.Literals(["stream", "listener", "attachment", "hook", "projector", "physical"])
export const State = Schema.Literals(["starting", "active", "draining", "failed"])
export const Namespace = Schema.Literals(["event", "event-log", "pty", "filesystem", "plugin-hook", "state"])
export const RemovalReason = Schema.Literals(["scope-closed", "overflow", "failed", "shutdown"])

/** Who is responsible for consuming or reacting to a resource. */
export const Owner = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("core"),
    component: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("server"),
    component: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("plugin"),
    pluginID: Plugin.ID,
    generation: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("client"),
    client: Schema.Literals(["tui", "desktop", "web", "cli", "acp", "unknown"]),
    instanceID: optional(Schema.String),
  }),
]).annotate({ identifier: "Subscriber.Owner" })
export type Owner = typeof Owner.Type

/** The resource a subscriber receives or reacts to. */
export interface Target extends Schema.Schema.Type<typeof Target> {}
export const Target = Schema.Struct({
  namespace: Namespace,
  /** Stable low-cardinality class, such as `public-feed` or `output`. */
  name: Schema.String,
  /** High-cardinality diagnostic identity, such as a Session or PTY ID. Never a metric label. */
  instance: optional(Schema.String),
  location: optional(Location.Ref),
}).annotate({ identifier: "Subscriber.Target" })

/** How updates cross the relationship. */
export interface Delivery extends Schema.Schema.Type<typeof Delivery> {}
export const Delivery = Schema.Union([
  Schema.Struct({ type: Schema.Literal("effect-stream") }),
  Schema.Struct({ type: Schema.Literal("callback") }),
  Schema.Struct({ type: Schema.Literal("sse"), capacity: NonNegativeInt }),
  Schema.Struct({ type: Schema.Literal("websocket") }),
]).annotate({ identifier: "Subscriber.Delivery" })

export interface Activity extends Schema.Schema.Type<typeof Activity> {}
export const Activity = Schema.Struct({
  delivered: NonNegativeInt,
  dropped: NonNegativeInt,
  lag: optional(NonNegativeInt),
  highWaterMark: optional(NonNegativeInt),
  lastAt: optional(DateTimeUtcFromMillis),
}).annotate({ identifier: "Subscriber.Activity" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  processID: ProcessID,
  parentID: optional(ID),
  kind: Kind,
  owner: Owner,
  target: Target,
  delivery: Delivery,
  state: State,
  startedAt: DateTimeUtcFromMillis,
  updatedAt: DateTimeUtcFromMillis,
  activity: Activity,
}).annotate({ identifier: "Subscriber.Info" })

export interface Update extends Schema.Schema.Type<typeof Update> {}
export const Update = Schema.Struct({
  state: optional(State),
}).annotate({ identifier: "Subscriber.Update" })

export interface Query extends Schema.Schema.Type<typeof Query> {}
export const Query = Schema.Struct({
  owner: optional(
    Schema.Struct({
      type: optional(Schema.String),
      pluginID: optional(Plugin.ID),
      component: optional(Schema.String),
    }),
  ),
  target: optional(
    Schema.Struct({
      namespace: optional(Namespace),
      name: optional(Schema.String),
      instance: optional(Schema.String),
    }),
  ),
  kind: optional(Kind),
  state: optional(State),
}).annotate({ identifier: "Subscriber.Query" })

export interface Snapshot extends Schema.Schema.Type<typeof Snapshot> {}
export const Snapshot = Schema.Struct({
  processID: ProcessID,
  revision: NonNegativeInt,
  subscribers: Schema.Array(Info),
}).annotate({ identifier: "Subscriber.Snapshot" })

export interface Summary extends Schema.Schema.Type<typeof Summary> {}
export const Summary = Schema.Struct({
  processID: ProcessID,
  revision: NonNegativeInt,
  total: NonNegativeInt,
  groups: Schema.Array(
    Schema.Struct({
      kind: Kind,
      namespace: Namespace,
      name: Schema.String,
      delivery: Schema.Literals(["effect-stream", "callback", "sse", "websocket"]),
      count: NonNegativeInt,
    }),
  ),
}).annotate({ identifier: "Subscriber.Summary" })

export type Change = typeof Change.Type
export const Change = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    snapshot: Snapshot,
  }),
  Schema.Struct({
    type: Schema.Literal("added"),
    revision: NonNegativeInt,
    subscriber: Info,
  }),
  Schema.Struct({
    type: Schema.Literal("updated"),
    revision: NonNegativeInt,
    subscriber: Info,
  }),
  Schema.Struct({
    type: Schema.Literal("removed"),
    revision: NonNegativeInt,
    id: ID,
    reason: RemovalReason,
  }),
]).annotate({ identifier: "Subscriber.Change" })

export class WatchOverflowError extends Schema.TaggedErrorClass<WatchOverflowError>()("Subscriber.WatchOverflow", {
  capacity: Schema.Int,
}) {}
