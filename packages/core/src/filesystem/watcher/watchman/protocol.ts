export * as WatchmanProtocol from "./protocol.js"

import { Option, Schema } from "effect"

export type Command =
  | { readonly type: "version"; readonly required: readonly string[] }
  | { readonly type: "watch"; readonly root: string }
  | { readonly type: "clock"; readonly root: string }
  | {
      readonly type: "subscribe"
      readonly root: string
      readonly name: string
      readonly since: string
    }
  | { readonly type: "unsubscribe"; readonly root: string; readonly name: string }

export type Reply =
  | { readonly type: "version"; readonly version: string; readonly capabilities: Readonly<Record<string, boolean>> }
  | { readonly type: "watch"; readonly watch: string; readonly relativePath?: string }
  | { readonly type: "clock"; readonly clock: string }
  | { readonly type: "subscribe"; readonly subscribe: string; readonly clock?: string }
  | { readonly type: "unsubscribe"; readonly subscription: string; readonly deleted: boolean }
  | { readonly type: "rejection"; readonly message: string }

export const Row = Schema.Struct({
  name: Schema.String,
  exists: Schema.Boolean,
  type: Schema.optional(Schema.String),
})
export type Row = typeof Row.Type

export type Push =
  | {
      readonly type: "batch"
      readonly subscription: string
      readonly root?: string
      readonly clock?: string
      readonly fresh: boolean
      readonly files: readonly Row[]
    }
  | { readonly type: "canceled"; readonly subscription: string; readonly clock?: string }

export type PushResult =
  | { readonly _tag: "Push"; readonly push: Push }
  | { readonly _tag: "NotPush" }
  | { readonly _tag: "InvalidPush" }

export type ReplyResult =
  | { readonly _tag: "Reply"; readonly reply: Reply }
  | { readonly _tag: "InvalidReply" }

const ErrorReply = Schema.Struct({ error: Schema.String })
const VersionReply = Schema.Struct({
  version: Schema.String,
  capabilities: Schema.optional(Schema.Record(Schema.String, Schema.Boolean)),
})
const WatchReply = Schema.Struct({ watch: Schema.String, relative_path: Schema.optional(Schema.String) })
const ClockReply = Schema.Struct({ clock: Schema.String })
const SubscribeReply = Schema.Struct({
  subscribe: Schema.String,
  clock: Schema.optional(Schema.String),
})
const StockUnsubscribeReply = Schema.Struct({ unsubscribe: Schema.String, deleted: Schema.Boolean })
const WatchwomanUnsubscribeReply = Schema.Struct({ subscription: Schema.String, unsubscribed: Schema.Boolean })
const Batch = Schema.Struct({
  unilateral: Schema.Literal(true),
  subscription: Schema.String,
  root: Schema.optional(Schema.String),
  clock: Schema.optional(Schema.String),
  is_fresh_instance: Schema.optional(Schema.Boolean),
  files: Schema.Array(Row),
})
const Canceled = Schema.Struct({
  subscription: Schema.String,
  canceled: Schema.Literal(true),
  clock: Schema.optional(Schema.String),
})

const decodeError = Schema.decodeUnknownOption(ErrorReply)
const decodeVersion = Schema.decodeUnknownOption(VersionReply)
const decodeWatch = Schema.decodeUnknownOption(WatchReply)
const decodeClock = Schema.decodeUnknownOption(ClockReply)
const decodeSubscribe = Schema.decodeUnknownOption(SubscribeReply)
const decodeStockUnsubscribe = Schema.decodeUnknownOption(StockUnsubscribeReply)
const decodeWatchwomanUnsubscribe = Schema.decodeUnknownOption(WatchwomanUnsubscribeReply)
const decodeBatch = Schema.decodeUnknownOption(Batch)
const decodeCanceled = Schema.decodeUnknownOption(Canceled)

export function encode(command: Command): readonly unknown[] {
  if (command.type === "version") return ["version", { required: command.required }]
  if (command.type === "watch") return ["watch", command.root]
  if (command.type === "clock") return ["clock", command.root]
  if (command.type === "unsubscribe") return ["unsubscribe", command.root, command.name]
  return [
    "subscribe",
    command.root,
    command.name,
    {
      since: command.since,
      fields: ["name", "exists", "type"],
    },
  ]
}

export function push(value: unknown): PushResult {
  const batch = Option.getOrUndefined(decodeBatch(value))
  if (batch)
    return {
      _tag: "Push",
      push: {
        type: "batch",
        subscription: batch.subscription,
        ...(batch.root ? { root: batch.root } : {}),
        ...(batch.clock ? { clock: batch.clock } : {}),
        fresh: batch.is_fresh_instance ?? false,
        files: batch.files,
      },
    }
  const canceled = Option.getOrUndefined(decodeCanceled(value))
  if (canceled)
    return {
      _tag: "Push",
      push: {
        type: "canceled",
        subscription: canceled.subscription,
        ...(canceled.clock ? { clock: canceled.clock } : {}),
      },
    }
  if (!value || typeof value !== "object") return { _tag: "NotPush" }
  if (Reflect.get(value, "unilateral") === true || Reflect.get(value, "canceled") === true)
    return { _tag: "InvalidPush" }
  return { _tag: "NotPush" }
}

export function reply(command: Command, value: unknown): ReplyResult {
  const error = Option.getOrUndefined(decodeError(value))
  if (error) return { _tag: "Reply", reply: { type: "rejection", message: error.error } }
  if (command.type === "version") {
    const result = Option.getOrUndefined(decodeVersion(value))
    return result
      ? {
          _tag: "Reply",
          reply: { type: "version", version: result.version, capabilities: result.capabilities ?? {} },
        }
      : { _tag: "InvalidReply" }
  }
  if (command.type === "watch") {
    const result = Option.getOrUndefined(decodeWatch(value))
    return result
      ? {
          _tag: "Reply",
          reply: {
            type: "watch",
            watch: result.watch,
            ...(result.relative_path ? { relativePath: result.relative_path } : {}),
          },
        }
      : { _tag: "InvalidReply" }
  }
  if (command.type === "clock") {
    const result = Option.getOrUndefined(decodeClock(value))
    return result
      ? { _tag: "Reply", reply: { type: "clock", clock: result.clock } }
      : { _tag: "InvalidReply" }
  }
  if (command.type === "subscribe") {
    const result = Option.getOrUndefined(decodeSubscribe(value))
    return result
      ? {
          _tag: "Reply",
          reply: { type: "subscribe", subscribe: result.subscribe, ...(result.clock ? { clock: result.clock } : {}) },
        }
      : { _tag: "InvalidReply" }
  }
  const stock = Option.getOrUndefined(decodeStockUnsubscribe(value))
  if (stock)
    return { _tag: "Reply", reply: { type: "unsubscribe", subscription: stock.unsubscribe, deleted: stock.deleted } }
  const watchwoman = Option.getOrUndefined(decodeWatchwomanUnsubscribe(value))
  return watchwoman
    ? {
        _tag: "Reply",
        reply: { type: "unsubscribe", subscription: watchwoman.subscription, deleted: watchwoman.unsubscribed },
      }
    : { _tag: "InvalidReply" }
}
