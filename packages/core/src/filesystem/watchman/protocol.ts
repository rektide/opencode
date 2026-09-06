export * as Protocol from "./protocol.js"

/**
 * Typed command and frame vocabulary for the watchman JSON-line protocol.
 *
 * Requests are always array-form envelopes (`["watch", "/root"]`): the older
 * installed stock binary aborts on object-form requests. Replies and pushes
 * are decoded once here, by top-level shape, so the session never guesses
 * from key presence at the call site.
 */

export type Command =
  | { readonly type: "version"; readonly required: readonly string[] }
  | { readonly type: "watch"; readonly root: string }
  | { readonly type: "clock"; readonly root: string }
  | { readonly type: "subscribe"; readonly root: string; readonly name: string; readonly since: string }
  | { readonly type: "unsubscribe"; readonly root: string; readonly name: string }

export const REQUIRED_CAPABILITIES = [
  "cmd-watch",
  "cmd-clock",
  "cmd-subscribe",
  "cmd-unsubscribe",
  "field-name",
  "field-exists",
] as const

export const REPLY_TYPE = {
  version: "version",
  watch: "watch",
  clock: "clock",
  subscribe: "subscribe",
  unsubscribe: "unsubscribed",
} as const satisfies Record<Command["type"], Frame["type"]>

/** The frame a command settles with, per the runtime association check. */
export type ReplyOf<T extends Command["type"]> = Extract<Frame, { readonly type: (typeof REPLY_TYPE)[T] }>

export const encode = (command: Command) => {
  switch (command.type) {
    case "version":
      return JSON.stringify(["version", { required: command.required }])
    case "watch":
      return JSON.stringify(["watch", command.root])
    case "clock":
      return JSON.stringify(["clock", command.root])
    case "subscribe":
      return JSON.stringify([
        "subscribe",
        command.root,
        command.name,
        { since: command.since, fields: ["name", "exists"] },
      ])
    case "unsubscribe":
      return JSON.stringify(["unsubscribe", command.root, command.name])
  }
}

/** One subscription result row; `type` is not requested or used. */
export interface Row {
  readonly name: string
  readonly exists: boolean
}

export type Frame =
  | { readonly type: "version"; readonly version: string; readonly capabilities: Readonly<Record<string, boolean>> }
  | { readonly type: "watch"; readonly watch: string }
  | { readonly type: "clock"; readonly clock: string }
  | { readonly type: "subscribe"; readonly subscribe: string }
  | { readonly type: "unsubscribed" }
  | {
      readonly type: "push"
      readonly subscription: string
      readonly clock: string | undefined
      readonly fresh: boolean
      readonly files: readonly Row[]
    }
  | { readonly type: "canceled"; readonly subscription: string }
  | { readonly type: "error"; readonly error: string }
  /** Subscription-less unilateral notification (e.g. stock clock ticks): dropped. */
  | { readonly type: "ignored" }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const string = (value: unknown) => (typeof value === "string" ? value : undefined)

const rows = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): Row[] => {
    if (!isRecord(entry)) return []
    const name = string(entry.name)
    if (name === undefined || typeof entry.exists !== "boolean") return []
    return [{ name, exists: entry.exists }]
  })
}

/**
 * Decodes one parsed reply or push. Returns `undefined` for shapes this
 * adapter does not speak — the session treats those as protocol failures.
 *
 * Discrimination order is load-bearing: stock pushes carry `clock` and
 * Watchwoman's merged subscribe acknowledgement carries `files`, so
 * `unilateral` and the reply keys must be examined before either.
 */
export const decode = (value: unknown): Frame | undefined => {
  if (!isRecord(value)) return undefined
  const error = string(value.error)
  if (error !== undefined) return { type: "error", error }
  if (value.unilateral === true) {
    const subscription = string(value.subscription)
    if (subscription === undefined) return { type: "ignored" }
    return push(subscription, value)
  }
  if (value.canceled === true) {
    const subscription = string(value.subscription)
    if (subscription === undefined) return undefined
    return { type: "canceled", subscription }
  }
  const watch = string(value.watch)
  if (watch !== undefined) return { type: "watch", watch }
  const subscribe = string(value.subscribe)
  if (subscribe !== undefined) return { type: "subscribe", subscribe }
  // Stock replies with `deleted`; Watchwoman with `unsubscribed`.
  if (value.deleted !== undefined || value.unsubscribed !== undefined) return { type: "unsubscribed" }
  if ("files" in value) {
    const subscription = string(value.subscription)
    if (subscription === undefined) return undefined
    return push(subscription, value)
  }
  const clock = string(value.clock)
  if (clock !== undefined) return { type: "clock", clock }
  const version = string(value.version)
  if (version !== undefined) {
    const capabilities = isRecord(value.capabilities)
      ? Object.fromEntries(
          Object.entries(value.capabilities).flatMap(([key, entry]) =>
            typeof entry === "boolean" ? [[key, entry] as const] : [],
          ),
        )
      : {}
    return { type: "version", version, capabilities }
  }
  return undefined
}

const push = (subscription: string, value: Record<string, unknown>): Frame => ({
  type: "push",
  subscription,
  clock: string(value.clock),
  fresh: value.is_fresh_instance === true,
  files: rows(value.files),
})

/**
 * The stable daemon-root identity of a clock: everything but the tick.
 * Clocks are `c:<start>:<pid>:<root>:<tick>`; a prefix change means the
 * daemon record of this root was replaced and subscriptions are stale.
 */
export const identity = (clock: string) => {
  const parts = clock.split(":")
  return parts.length > 4 ? parts.slice(0, 4).join(":") : clock
}
