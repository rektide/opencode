import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import type { Watcher } from "@opencode-ai/core/filesystem/watcher"
import type { RawClient } from "@opencode-ai/core/filesystem/watcher/watchman/client"
import { makeRegistry } from "@opencode-ai/core/filesystem/watcher/watchman/root"
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

it.effect("does not let a pending route block another root intent", () =>
  Effect.gen(function* () {
    const routeStarted = yield* Deferred.make<void>()
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(() => {
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
    })
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
