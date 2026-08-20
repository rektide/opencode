import { expect } from "bun:test"
import { Deferred, Effect, Schema } from "effect"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import type { Generation, Manager } from "../../src/filesystem/watchman/client.ts"
import { makeNativeWith } from "../../src/filesystem/watchman/native.ts"
import { resolve } from "../../src/filesystem/watchman/route.ts"
import { WatchmanError } from "../../src/filesystem/watchman/schema.ts"
import { it } from "../lib/effect.ts"

function generation(id = 1): Generation {
  const client = {
    end: () => {},
    command: (_args: readonly unknown[], _callback: (error: Error | null, response?: unknown) => void) => {},
    capabilityCheck: (
      _capabilities: { readonly required: readonly string[] },
      _callback: (error: Error | null, response?: unknown) => void,
    ) => {},
    on: (_event: string, _listener: (value?: unknown) => void) => client,
  }
  return {
    id,
    client,
    closed: Deferred.makeUnsafe<void>(),
    routes: new Map(),
    subscriptions: new Map(),
    adopted: new Set<string>(),
  }
}

function manager(
  current: () => Generation,
  respond: (generation: Generation, args: readonly unknown[]) => Effect.Effect<unknown, WatchmanError>,
): Manager {
  const claimed = new Set<string>()
  return {
    current: () => Effect.succeed(current()),
    command: (generation, args, schema) =>
      respond(generation, args).pipe(
        Effect.flatMap((value) => Schema.decodeUnknownEffect(schema)(value)),
        Effect.mapError((error) =>
          error instanceof WatchmanError ? error : new WatchmanError("decode", "invalid test response", error),
        ),
      ),
    retire: (generation) => Effect.sync(() => Deferred.doneUnsafe(generation.closed, Effect.void)).pipe(Effect.asVoid),
    roots: {
      acquire: (_generation, root) => Effect.sync(() => claimed.add(root)),
      release: (root) => Effect.sync(() => claimed.delete(root)),
      orphans: () => new Set(claimed),
      demand: () => claimed.size,
    },
  }
}

function fallback(onSubscribe: () => void = () => {}): Watcher.NativeInterface {
  return {
    subscribe: () =>
      Effect.sync(() => {
        onSubscribe()
        return { backend: "parcel", unsubscribe: () => Promise.resolve() }
      }),
  }
}

it.effect("memoizes project routes within a connection generation", () => {
  const active = generation()
  let commands = 0
  const transport = manager(
    () => active,
    (_generation, args) => {
      commands++
      expect(args).toEqual(["watch-project", "/repo/.opencode"])
      return Effect.succeed({ watch: "/repo", relative_path: ".opencode" })
    },
  )
  return Effect.gen(function* () {
    const routes = yield* Effect.all(
      [
        resolve(transport, active, "/repo/.opencode", "project"),
        resolve(transport, active, "/repo/.opencode", "project"),
      ],
      { concurrency: "unbounded" },
    )
    expect(routes).toEqual([
      { root: "/repo", relativeRoot: ".opencode", eventRoot: "/repo/.opencode" },
      { root: "/repo", relativeRoot: ".opencode", eventRoot: "/repo/.opencode" },
    ])
    expect(commands).toBe(1)
  })
})

it.effect("routes one project interest and filters Watchman events locally", () => {
  const active = generation()
  const commands: (readonly unknown[])[] = []
  const transport = manager(
    () => active,
    (_generation, args) => {
      commands.push(args)
      if (args[0] === "watch-project") return Effect.succeed({ watch: "/repo", relative_path: ".opencode" })
      if (args[0] === "clock") return Effect.succeed({ clock: "c:1" })
      if (args[0] === "subscribe") return Effect.succeed({ subscribe: args[2] })
      return Effect.succeed({ unsubscribe: args[2], deleted: true })
    },
  )
  const updates: Watcher.Update[] = []
  return Effect.gen(function* () {
    const subscription = yield* makeNativeWith(transport, fallback()).subscribe({
      type: "directory",
      target: "/repo/.opencode",
      routing: "project",
      ignore: ["node_modules", "**/.git/**"],
      publish: (update) => updates.push(update),
      fail: () => {},
    })
    const publish = active.subscriptions.values().next().value
    expect(publish).toBeDefined()
    publish?.({
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: false,
      files: [
        { name: "config.json", exists: true, new: false, type: "f" },
        { name: "node_modules/pkg/index.js", exists: true, new: true, type: "f" },
        { name: ".git/index", exists: true, new: false, type: "f" },
      ],
    })
    yield* Effect.yieldNow
    expect(updates).toEqual([{ path: "/repo/.opencode/config.json", type: "update" }])
    expect(commands.find((command) => command[0] === "subscribe")?.[3]).toMatchObject({
      expression: ["not", ["anyof", ["name", "node_modules", "wholename"], ["dirname", "node_modules"]]],
    })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
    expect(commands.some((command) => command[0] === "watch-del")).toBe(false)
    expect(commands.some((command) => command[0] === "unsubscribe")).toBe(true)
  })
})

it.effect("falls back only when initial Watchman acquisition fails", () => {
  const active = generation()
  let fallbacks = 0
  const transport = manager(
    () => active,
    () => Effect.fail(new WatchmanError("connect", "watchman unavailable")),
  )
  return Effect.gen(function* () {
    const subscription = yield* makeNativeWith(
      transport,
      fallback(() => fallbacks++),
    ).subscribe({
      type: "directory",
      target: "/repo",
      routing: "project",
      ignore: [],
      publish: () => {},
      fail: () => {},
    })
    expect(subscription?.backend).toBe("parcel")
    expect(fallbacks).toBe(1)
  })
})

it.effect("resumes an interest cursor on a new connection generation", () => {
  const first = generation(1)
  const second = generation(2)
  const resumed = Deferred.makeUnsafe<readonly unknown[]>()
  let current = first
  const transport = manager(
    () => current,
    (generation, args) => {
      if (args[0] === "watch-project") return Effect.succeed({ watch: "/repo", relative_path: "src" })
      if (args[0] === "clock") return Effect.succeed({ clock: "c:1" })
      if (args[0] === "subscribe") {
        if (generation === second) Deferred.doneUnsafe(resumed, Effect.succeed(args))
        return Effect.succeed({ subscribe: args[2] })
      }
      return Effect.succeed({ unsubscribe: args[2], deleted: true })
    },
  )
  return Effect.gen(function* () {
    const subscription = yield* makeNativeWith(transport, fallback()).subscribe({
      type: "directory",
      target: "/repo/src",
      routing: "project",
      ignore: [],
      publish: () => {},
      fail: () => {},
    })
    first.subscriptions.values().next().value?.({
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: false,
      files: [],
    })
    yield* Effect.yieldNow
    current = second
    Deferred.doneUnsafe(first.closed, Effect.void)
    const command = yield* Deferred.await(resumed)
    expect(command[0]).toBe("subscribe")
    expect(command[3]).toMatchObject({ since: "c:2", relative_root: "src" })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  })
})

it.effect("stores the replacement cursor after a resume cursor is rejected", () => {
  const first = generation(1)
  const second = generation(2)
  const resumed = Deferred.makeUnsafe<readonly unknown[]>()
  let current = first
  let attempts = 0
  const transport = manager(
    () => current,
    (generation, args) => {
      if (args[0] === "watch-project") return Effect.succeed({ watch: "/repo", relative_path: "src" })
      if (args[0] === "clock") return Effect.succeed({ clock: generation === first ? "c:1" : "c:3" })
      if (args[0] === "subscribe" && generation === second) {
        attempts++
        if (attempts === 1) return Effect.fail(new WatchmanError("subscribe", "cursor rejected"))
        Deferred.doneUnsafe(resumed, Effect.succeed(args))
      }
      if (args[0] === "subscribe") return Effect.succeed({ subscribe: args[2] })
      return Effect.succeed({ unsubscribe: args[2], deleted: true })
    },
  )
  return Effect.gen(function* () {
    const subscription = yield* makeNativeWith(transport, fallback()).subscribe({
      type: "directory",
      target: "/repo/src",
      routing: "project",
      ignore: [],
      publish: () => {},
      fail: () => {},
    })
    first.subscriptions.values().next().value?.({
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: false,
      files: [],
    })
    yield* Effect.yieldNow
    current = second
    Deferred.doneUnsafe(first.closed, Effect.void)
    expect((yield* Deferred.await(resumed))[3]).toMatchObject({ since: "c:3" })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  })
})

it.live("retries forever and resumes once the daemon returns", () => {
  const first = generation(1)
  const second = generation(2)
  const resumed = Deferred.makeUnsafe<readonly unknown[]>()
  let current: () => ReturnType<typeof generation> = () => first
  let failures = 0
  const transport = manager(
    () => current(),
    (generation, args) => {
      if (args[0] === "watch-project") return Effect.succeed({ watch: "/repo", relative_path: "src" })
      if (args[0] === "clock") return Effect.succeed({ clock: generation === first ? "c:1" : "c:9" })
      if (args[0] === "subscribe") {
        if (generation === second) Deferred.doneUnsafe(resumed, Effect.succeed(args))
        return Effect.succeed({ subscribe: args[2] })
      }
      return Effect.succeed({ unsubscribe: args[2], deleted: true })
    },
  )
  // current() succeeds initially; after gen1 dies it fails 20 times, then
  // recovers: the old 6-attempt budget would have failed the subscription
  // permanently.
  const connect = () => {
    if (Deferred.isDoneUnsafe(first.closed)) {
      if (failures < 20) return Effect.sync(() => failures++).pipe(Effect.andThen(Effect.fail(new WatchmanError("connect", "daemon down"))))
      return Effect.sync(() => {
        current = () => second
        return second
      })
    }
    return Effect.succeed(first)
  }
  const failing = { ...transport, current: () => connect() }
  return Effect.gen(function* () {
    const subscription = yield* makeNativeWith(failing, fallback(), { retryBaseMs: 1, retryCapMs: 5 }).subscribe({
      type: "directory",
      target: "/repo/src",
      routing: "project",
      ignore: [],
      publish: () => {},
      fail: () => {},
    })
    first.subscriptions.values().next().value?.({
      subscription: "opencode-1-1",
      root: "/repo",
      clock: "c:2",
      is_fresh_instance: false,
      files: [],
    })
    yield* Effect.yieldNow
    Deferred.doneUnsafe(first.closed, Effect.void)
    const command = yield* Deferred.await(resumed)
    expect(failures).toBe(20)
    expect(command[3]).toMatchObject({ since: "c:2", relative_root: "src" })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  })
})
