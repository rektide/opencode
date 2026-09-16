import { expect, test } from "bun:test"
import { ServerOptions } from "@opencode-ai/server/options"
import { Option, Schema } from "effect"

const decode = Schema.decodeUnknownOption(ServerOptions)

test("accepts ephemeral port zero", () => {
  expect(Option.isSome(decode({ port: 0 }))).toBe(true)
})

test("rejects ports outside the valid range", () => {
  expect(Option.isNone(decode({ port: -1 }))).toBe(true)
  expect(Option.isNone(decode({ port: 65_536 }))).toBe(true)
})

test("accepts optional app metadata", () => {
  expect(Option.getOrThrow(decode({ app: { name: "sdk", version: "1.2.3", channel: "beta" } })).app).toEqual({
    name: "sdk",
    version: "1.2.3",
    channel: "beta",
  })
})

test("accepts durable event persistence configuration", () => {
  expect(Option.getOrThrow(decode({ events: { persist: true } })).events).toEqual({ persist: true })
})

test("validates Watchman filesystem options", () => {
  expect(
    Option.getOrThrow(decode({ fs: { watchman: { socket: "/run/watchman.sock", commandTimeoutMs: 5_000 } } })).fs
      ?.watchman,
  ).toEqual({ socket: "/run/watchman.sock", commandTimeoutMs: 5_000 })
  expect(Option.isNone(decode({ fs: { watchman: { socket: "/run/watchman.sock", commandTimeoutMs: 0 } } }))).toBe(
    true,
  )
  expect(Option.isNone(decode({ fs: { watchman: { socket: "relative" } } }))).toBe(true)
})

test("accepts an optional CORS allowlist", () => {
  expect(Option.getOrThrow(decode({})).cors).toBeUndefined()
  expect(Option.getOrThrow(decode({ cors: [] })).cors).toEqual([])
  expect(Option.getOrThrow(decode({ cors: ["http://192.168.1.10:3001", "https://example.com"] })).cors).toEqual([
    "http://192.168.1.10:3001",
    "https://example.com",
  ])
  expect(Option.isNone(decode({ cors: "http://192.168.1.10:3001" }))).toBe(true)
})
