import { expect, test } from "bun:test"
import { ServerProcess } from "../src/server-process.ts"

test("requires explicit Watchman selection and resolves its socket", () => {
  expect(ServerProcess.watchmanOptions({ WATCHMAN_SOCK: "/run/ambient.sock" })).toBeUndefined()
  expect(
    ServerProcess.watchmanOptions({
      OPENCODE_WATCHER_BACKEND: "watchman",
      WATCHMAN_SOCK: "/run/ambient.sock",
    }),
  ).toEqual({ socket: "/run/ambient.sock" })
  expect(
    ServerProcess.watchmanOptions({
      OPENCODE_WATCHER_BACKEND: "watchman",
      OPENCODE_WATCHMAN_SOCKET: "/run/explicit.sock",
      WATCHMAN_SOCK: "/run/ambient.sock",
      OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS: "25000",
    }),
  ).toEqual({ socket: "/run/explicit.sock", commandTimeoutMs: 25_000 })
})

test("rejects invalid Watchman environment configuration", () => {
  expect(() => ServerProcess.watchmanOptions({ OPENCODE_WATCHER_BACKEND: "other" })).toThrow(/backend/i)
  expect(() => ServerProcess.watchmanOptions({ OPENCODE_WATCHER_BACKEND: "watchman" })).toThrow(/socket/i)
  expect(() =>
    ServerProcess.watchmanOptions({ OPENCODE_WATCHER_BACKEND: "watchman", OPENCODE_WATCHMAN_SOCKET: "relative" }),
  ).toThrow(/absolute/i)
  expect(() =>
    ServerProcess.watchmanOptions({
      OPENCODE_WATCHER_BACKEND: "watchman",
      OPENCODE_WATCHMAN_SOCKET: "/run/watchman.sock",
      OPENCODE_WATCHMAN_BINARY: "/usr/bin/watchman",
    }),
  ).toThrow(/binary/i)
  expect(() =>
    ServerProcess.watchmanOptions({
      OPENCODE_WATCHER_BACKEND: "watchman",
      OPENCODE_WATCHMAN_SOCKET: "/run/watchman.sock",
      OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS: "0",
    }),
  ).toThrow(/commandTimeoutMs|integer/i)
})
