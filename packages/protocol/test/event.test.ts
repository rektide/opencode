import { expect, test } from "bun:test"
import { WorkspaceID } from "@opencode-ai/schema/workspace-id"
import { Schema } from "effect"
import {
  ControlledFeedItem,
  EventInterest,
  EventSubscriptionID,
  isOpenCodeEvent,
  OpenCodeEvent,
  type OpenCodeEventEncoded,
} from "../src/groups/event.js"

type JsonShape<Value> = Value extends string | number | boolean | null
  ? Value
  : Value extends undefined
    ? never
    : Value extends ReadonlyArray<infer Item>
      ? ReadonlyArray<JsonShape<Item>>
      : Value extends object
        ? {
            readonly [Key in keyof Value as undefined extends Value[Key] ? never : Key]: JsonShape<Value[Key]>
          } & {
            readonly [Key in keyof Value as undefined extends Value[Key] ? Key : never]?: JsonShape<
              Exclude<Value[Key], undefined>
            >
          }
        : Value

// JSON.stringify omits undefined object properties, so normalize them before
// requiring every runtime event shape to fit its encoded wire contract.
const wireReady: [JsonShape<OpenCodeEvent>] extends [JsonShape<OpenCodeEventEncoded>] ? true : false = true

test("classifies public events by type", () => {
  expect(isOpenCodeEvent({ type: "server.connected" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.status.changed" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.resources.changed" })).toBe(true)
  expect(isOpenCodeEvent({ type: "mcp.tools.changed" })).toBe(false)
  expect(isOpenCodeEvent({ type: "acme.updated" })).toBe(false)
})

test("keeps public event runtime values within the encoded contract", () => {
  expect(wireReady).toBe(true)
})

test("validates the exact controlled subscription ID prefix", () => {
  expect(String(Schema.decodeUnknownSync(EventSubscriptionID)("evsub_0123456789abcdef"))).toBe(
    "evsub_0123456789abcdef",
  )
  expect(() => Schema.decodeUnknownSync(EventSubscriptionID)("evsub0123456789abcdef")).toThrow()
  expect(() => Schema.decodeUnknownSync(EventSubscriptionID)("evt_0123456789abcdef")).toThrow()
})

test("round-trips workspace-distinct controlled interests", () => {
  const input = {
    locations: [
      { directory: "/workspace" },
      { directory: "/workspace", workspaceID: WorkspaceID.make("wrk_other") },
    ],
    sessions: ["ses_first", "ses_second"],
  }

  expect(Schema.encodeSync(EventInterest)(Schema.decodeUnknownSync(EventInterest)(input))).toEqual(input)
})

test("decodes the controlled ready frame separately from public events", () => {
  const ready = { type: "event-feed.ready", data: { subscriptionID: "evsub_0123456789abcdef" } }
  const encoded: unknown = ready

  expect(JSON.stringify(Schema.decodeUnknownSync(ControlledFeedItem)(encoded))).toBe(JSON.stringify(ready))
  expect(isOpenCodeEvent(ready)).toBe(false)
})
