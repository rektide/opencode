import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import type { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { command, makeGeneration, type RawClient } from "@opencode-ai/core/filesystem/watcher/watchman/client"
import { makeRegistry } from "@opencode-ai/core/filesystem/watcher/watchman/root"
import { WatchResponse } from "@opencode-ai/core/filesystem/watcher/watchman/schema"
import { it } from "../lib/effect"

type TestClient = RawClient & {
  readonly commands: (readonly unknown[])[]
  readonly emit: (event: string, value?: unknown) => void
  readonly ended: () => number
}

function client(
  respond: (
    args: readonly unknown[],
    callback: (error: Error | null, response?: unknown) => void,
    client: TestClient,
  ) => void = standard,
): TestClient {
  const listeners = new Map<string, (value?: unknown) => void>()
  const commands: (readonly unknown[])[] = []
  let ended = 0
  const result: TestClient = {
    commands,
    end: () => {
      ended++
    },
    ended: () => ended,
    command: (args, callback) => {
      commands.push(args)
      respond(args, callback, result)
    },
    capabilityCheck: (_capabilities, callback) => callback(null, { capabilities: { relative_root: true } }),
    on: (event, listener) => {
      listeners.set(event, listener)
      return result
    },
    emit: (event, value) => listeners.get(event)?.(value),
  }
  return result
}

function standard(args: readonly unknown[], callback: (error: Error | null, response?: unknown) => void) {
  if (args[0] === "watch") return callback(null, { watch: args[1] })
  if (args[0] === "clock") return callback(null, { clock: "c:1" })
  if (args[0] === "subscribe") return callback(null, { subscribe: args[2] })
  callback(null, { unsubscribe: args[2], deleted: true })
}

function input(target: string, updates: Watcher.Update[] = []) {
  return {
    type: "directory" as const,
    target,
    ignore: [] as const,
    placement: { type: "project" as const, root: "/repo" },
    publish: (update: Watcher.Update) => updates.push(update),
    fail: (_error: Error) => {},
  }
}

it.effect("shares one route and raw client across nested project interests", () =>
  Effect.gen(function* () {
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(() => {
      const raw = client()
      clients.push(raw)
      return raw
    })
    const intent = { type: "project" as const, project: "/repo" }
    const config = yield* registry.subscribe(intent, input("/repo/.opencode"))
    const skills = yield* registry.subscribe(intent, input("/repo/.opencode/skills"))

    expect(clients).toHaveLength(1)
    expect(clients[0].commands.filter((args) => args[0] === "watch")).toEqual([["watch", "/repo"]])
    expect(clients[0].commands.filter((args) => args[0] === "subscribe").map((args) => args[3])).toMatchObject([
      { relative_root: ".opencode" },
      { relative_root: ".opencode/skills" },
    ])

    yield* Effect.promise(() => config.unsubscribe())
    yield* Effect.promise(() => skills.unsubscribe())
    expect(clients[0].commands.some((args) => args[0] === "watch-del")).toBe(false)
  }),
)

it.live("does not let a pending route block another root intent", () =>
  Effect.gen(function* () {
    const routeStarted = yield* Deferred.make<void>()
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(
      () => {
        const index = clients.length
        const raw = client((args, callback) => {
          if (index === 0 && args[0] === "watch") {
            Deferred.doneUnsafe(routeStarted, Effect.void)
            return
          }
          standard(args, callback)
        })
        clients.push(raw)
        return raw
      },
      { commandTimeout: "100 millis" },
    )
    const pending = yield* registry
      .subscribe({ type: "project", project: "/first" }, input("/first"))
      .pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(routeStarted)

    const second = yield* registry.subscribe({ type: "project", project: "/second" }, input("/second"))
    expect(clients).toHaveLength(2)
    expect(clients[1].commands).toContainEqual(["watch", "/second"])
    yield* Effect.promise(() => second.unsubscribe())
    yield* Fiber.interrupt(pending)
  }),
)

it.live("a submitted timeout closes only its root generation", () =>
  Effect.gen(function* () {
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(
      () => {
        const index = clients.length
        const raw = client((args, callback) => {
          if (index === 0 && args[0] === "watch") return
          standard(args, callback)
        })
        clients.push(raw)
        return raw
      },
      { commandTimeout: "20 millis" },
    )
    const timedOut = yield* registry
      .subscribe({ type: "project", project: "/first" }, input("/first"))
      .pipe(Effect.exit, Effect.forkScoped({ startImmediately: true }))
    yield* Effect.sleep("2 millis")
    const second = yield* registry.subscribe({ type: "project", project: "/second" }, input("/second"))
    yield* Fiber.join(timedOut)

    expect(clients[0].ended()).toBe(1)
    expect(clients[1].ended()).toBe(0)
    yield* Effect.promise(() => second.unsubscribe())
  }),
)

it.live("resumes each subscription from its cursor after a socket restart", () =>
  Effect.gen(function* () {
    const resumed = yield* Deferred.make<readonly unknown[]>()
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(
      () => {
        const index = clients.length
        const raw = client((args, callback) => {
          standard(args, callback)
          if (index === 1 && args[0] === "subscribe") Deferred.doneUnsafe(resumed, Effect.succeed(args))
        })
        clients.push(raw)
        return raw
      },
      { retryBaseMs: 1, retryCapMs: 2 },
    )
    const subscription = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src"))
    clients[0].emit("subscription", {
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: false,
      files: [],
    })
    yield* Effect.sleep("5 millis")
    clients[0].emit("end")

    expect((yield* Deferred.await(resumed).pipe(Effect.timeout("1 second")))[3]).toMatchObject({
      since: "c:2",
      relative_root: "src",
    })
    expect(clients).toHaveLength(2)
    yield* Effect.promise(() => subscription.unsubscribe())
  }),
)

it.live("does not resurrect a subscription removed during an outage", () =>
  Effect.gen(function* () {
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(
      () => {
        if (clients.length) throw new Error("daemon unavailable")
        const raw = client()
        clients.push(raw)
        return raw
      },
      { retryBaseMs: 500, retryCapMs: 500 },
    )
    const subscription = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src"))
    clients[0].emit("end")

    yield* Effect.promise(() => subscription.unsubscribe()).pipe(Effect.timeout("100 millis"))
    yield* Effect.sleep("600 millis")
    expect(clients).toHaveLength(1)
  }),
)

it.live("runs one reconnect attempt sequence for all subscriptions on a root", () =>
  Effect.gen(function* () {
    const resumed = yield* Deferred.make<void>()
    const clients: TestClient[] = []
    let attempts = 0
    const registry = yield* makeRegistry(
      () => {
        attempts++
        if (attempts > 1 && attempts < 4) throw new Error("daemon unavailable")
        const raw = client((args, callback, current) => {
          standard(args, callback)
          if (attempts === 4 && current.commands.filter((command) => command[0] === "subscribe").length === 2)
            Deferred.doneUnsafe(resumed, Effect.void)
        })
        clients.push(raw)
        return raw
      },
      { retryBaseMs: 1, retryCapMs: 2 },
    )
    const intent = { type: "project" as const, project: "/repo" }
    const first = yield* registry.subscribe(intent, input("/repo/first"))
    const second = yield* registry.subscribe(intent, input("/repo/second"))
    clients[0].emit("end")

    yield* Deferred.await(resumed).pipe(Effect.timeout("1 second"))
    expect(attempts).toBe(4)
    expect(clients).toHaveLength(2)
    yield* Effect.promise(() => first.unsubscribe())
    yield* Effect.promise(() => second.unsubscribe())
  }),
)

it.live("holds command admission after the submitted caller is interrupted", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const raw = client((args, callback) => {
      if (args[1] === "/first") {
        controls.complete = callback
        Deferred.doneUnsafe(started, Effect.void)
        return
      }
      standard(args, callback)
    })
    const controls: { complete?: (error: Error | null, response?: unknown) => void } = {}
    const generation = makeGeneration(1, raw)
    const options = { close: () => Effect.void, timeout: "1 second" as const }
    const first = yield* command(generation, ["watch", "/first"], WatchResponse, "route", options).pipe(
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* Deferred.await(started)
    const interrupting = yield* Fiber.interrupt(first).pipe(Effect.forkScoped({ startImmediately: true }))
    const second = yield* command(generation, ["watch", "/second"], WatchResponse, "route", options).pipe(
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* Effect.sleep("10 millis")
    expect(raw.commands).toEqual([["watch", "/first"]])

    controls.complete?.(null, { watch: "/first" })
    yield* Fiber.join(interrupting)
    expect((yield* Fiber.join(second)).watch).toBe("/second")
    expect(raw.commands).toEqual([
      ["watch", "/first"],
      ["watch", "/second"],
    ])
  }),
)

it.live("recovers a canceled subscription without disturbing its sibling", () =>
  Effect.gen(function* () {
    const resubscribed = yield* Deferred.make<void>()
    const updates: Watcher.Update[][] = [[], []]
    const raw = client((args, callback, current) => {
      standard(args, callback)
      if (args[0] === "subscribe" && current.commands.filter((command) => command[0] === "subscribe").length === 3)
        Deferred.doneUnsafe(resubscribed, Effect.void)
    })
    const registry = yield* makeRegistry(() => raw)
    const intent = { type: "project" as const, project: "/repo" }
    const first = yield* registry.subscribe(intent, input("/repo/first", updates[0]))
    const second = yield* registry.subscribe(intent, input("/repo/second", updates[1]))
    raw.emit("subscription", {
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: true,
      files: [],
    })
    raw.emit("subscription", { subscription: "opencode-1-1", root: "/repo", canceled: true })
    yield* Deferred.await(resubscribed).pipe(Effect.timeout("1 second"))
    raw.emit("subscription", {
      subscription: "opencode-1-2",
      root: "/repo",
      clock: "c:3",
      is_fresh_instance: false,
      files: [{ name: "skill.md", exists: true, new: false, type: "f" }],
    })
    yield* Effect.sleep("5 millis")

    expect(updates[0]).toEqual([
      { path: "/repo/first", type: "update" },
      { path: "/repo/first", type: "update" },
    ])
    expect(updates[1]).toEqual([{ path: "/repo/second/skill.md", type: "update" }])
    expect(raw.commands.filter((args) => args[0] === "watch")).toHaveLength(1)
    yield* Effect.promise(() => first.unsubscribe())
    yield* Effect.promise(() => second.unsubscribe())
  }),
)
