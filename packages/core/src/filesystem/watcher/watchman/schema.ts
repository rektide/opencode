import { Schema } from "effect"

const response = {
  version: Schema.optional(Schema.String),
  warning: Schema.optional(Schema.String),
}

export const CapabilityResponse = Schema.Struct({
  ...response,
  capabilities: Schema.Record(Schema.String, Schema.Boolean),
})

export const WatchResponse = Schema.Struct({
  ...response,
  watch: Schema.String,
})

export const ClockResponse = Schema.Struct({
  ...response,
  clock: Schema.String,
})

export const SubscribeResponse = Schema.Struct({
  ...response,
  subscribe: Schema.String,
})

export const UnsubscribeResponse = Schema.Struct({
  ...response,
  unsubscribe: Schema.String,
  deleted: Schema.Boolean,
})

export const SubscriptionChanges = Schema.Struct({
  ...response,
  subscription: Schema.String,
  root: Schema.String,
  clock: Schema.String,
  is_fresh_instance: Schema.Boolean,
  files: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      exists: Schema.Boolean,
      new: Schema.Boolean,
      type: Schema.String,
    }),
  ),
})

export const SubscriptionCanceled = Schema.Struct({
  ...response,
  subscription: Schema.String,
  canceled: Schema.Literal(true),
  root: Schema.optional(Schema.String),
})

export const SubscriptionPdu = Schema.Union([SubscriptionChanges, SubscriptionCanceled])
export type SubscriptionPdu = typeof SubscriptionPdu.Type

export class WatchmanError extends Error {
  override readonly name = "WatchmanError"

  constructor(
    readonly stage: "connect" | "command" | "decode" | "route" | "subscribe" | "reconnect",
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message, { cause })
  }
}

export class GenerationClosed extends WatchmanError {
  constructor(readonly submitted: boolean) {
    super("reconnect", submitted ? "Watchman generation closed during command" : "Watchman generation closed")
  }
}
