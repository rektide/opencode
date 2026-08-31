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

test("accepts only explicit filesystem watcher backends", () => {
  expect(Option.getOrThrow(decode({})).fs?.watcherBackend).toBeUndefined()
  expect(Option.getOrThrow(decode({ fs: { watcherBackend: "parcel" } })).fs?.watcherBackend).toBe("parcel")
  expect(Option.getOrThrow(decode({ fs: { watcherBackend: "watchman" } })).fs?.watcherBackend).toBe("watchman")
  expect(Option.isNone(decode({ fs: { watcherBackend: "default" } }))).toBe(true)
})

test("accepts watcher deadline tuning and rejects non-positive values", () => {
  const fs = Option.getOrThrow(
    decode({
      fs: {
        subscribeTimeoutMs: 30_000,
        watchman: { commandTimeoutMs: 120_000, retryBaseMs: 500, retryCapMs: 10_000 },
      },
    }),
  ).fs
  expect(fs?.subscribeTimeoutMs).toBe(30_000)
  expect(fs?.watchman).toEqual({ commandTimeoutMs: 120_000, retryBaseMs: 500, retryCapMs: 10_000 })
  expect(Option.isNone(decode({ fs: { subscribeTimeoutMs: 0 } }))).toBe(true)
  expect(Option.isNone(decode({ fs: { watchman: { commandTimeoutMs: -5 } } }))).toBe(true)
  expect(Option.isNone(decode({ fs: { watchman: { retryBaseMs: "500" } } }))).toBe(true)
})

test("accepts a Watchman CLI binary override", () => {
  expect(
    Option.getOrThrow(decode({ fs: { watchman: { binary: "/opt/watchman/bin/watchman" } } })).fs?.watchman?.binary,
  ).toBe("/opt/watchman/bin/watchman")
  expect(Option.isNone(decode({ fs: { watchman: { binary: 5 } } }))).toBe(true)
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
