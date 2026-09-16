import { expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Deferred, Effect, Queue } from "effect"
import { Watcher } from "@opencode-ai/core/filesystem/watcher"
import { WatchmanDirectory } from "@opencode-ai/core/filesystem/watcher/watchman/directory"
import { WatchmanProtocol } from "@opencode-ai/core/filesystem/watcher/watchman/protocol"
import { WatchmanSession } from "@opencode-ai/core/filesystem/watcher/watchman/session"
import { tmpdirScoped } from "../../fixture/tmpdir"
import { advance } from "../../lib/clock"
import { it } from "../../lib/effect"

it.effect("returns immediately, invalidates on install, and maps later rows", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const version = yield* Deferred.make<WatchmanProtocol.Reply>()
    const versionRequested = yield* Deferred.make<void>()
    const installed = yield* Deferred.make<void>()
    const commands: WatchmanProtocol.Command[] = []
    const updates: Watcher.Update[] = []
    let deliver: ((push: WatchmanProtocol.Push) => void) | undefined
    let closes = 0
    const open: WatchmanSession.Open = (_options, receive) => {
      deliver = receive
      const session: WatchmanSession.Interface = {
        request: (command) => {
          commands.push(command)
          if (command.type === "version") {
            Deferred.doneUnsafe(versionRequested, Effect.void)
            return Deferred.await(version)
          }
          if (command.type === "watch") return Effect.succeed({ type: "watch", watch: directory.path })
          if (command.type === "clock") return Effect.succeed({ type: "clock", clock: "c:1:2:3:4" })
          if (command.type === "subscribe")
            return Effect.succeed({ type: "subscribe", subscribe: command.name, clock: "c:1:2:3:4" })
          return Effect.succeed({ type: "unsubscribe", subscription: command.name, deleted: true })
        },
        close: () => Effect.sync(() => closes++),
      }
      return Effect.acquireRelease(Effect.succeed(session), (session) => session.close())
    }
    const inherited = Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) })
    const native = yield* WatchmanDirectory.make(inherited, { socket: "/private/watchman.sock", commandTimeoutMs: 1_000 }, open)

    const subscription = yield* native.subscribe({
      type: "directory",
      target: directory.path,
      ignore: [],
      names: [],
      publish: (update) => updates.push(update),
      invalidate: () => Deferred.doneUnsafe(installed, Effect.void),
    })
    expect(subscription?.backend).toBe("watchman")
    yield* Deferred.await(versionRequested)
    expect(commands).toEqual([{ type: "version", required: WatchmanDirectory.capabilities }])

    yield* Deferred.succeed(version, {
      type: "version",
      version: "2026.09.05",
      capabilities: Object.fromEntries(WatchmanDirectory.capabilities.map((capability) => [capability, true])),
    })
    yield* Deferred.await(installed)
    expect(commands.map((command) => command.type)).toEqual(["version", "watch", "clock", "subscribe"])

    deliver?.({
      type: "batch",
      subscription: (commands[3] as Extract<WatchmanProtocol.Command, { readonly type: "subscribe" }>).name,
      clock: "c:1:2:3:5",
      fresh: false,
      files: [
        { name: "src/index.ts", exists: true, type: "f" },
        { name: "old", exists: false, type: "d" },
      ],
    })
    yield* Effect.yieldNow
    expect(updates).toEqual([
      { path: `${directory.path}/src/index.ts`, type: "update" },
      { path: `${directory.path}/old`, type: "delete" },
    ])

    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
    yield* Effect.yieldNow
    expect(closes).toBe(1)
  }),
)

it.effect("reconnects with a new name and fences the retired generation", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const invalidations = yield* Queue.unbounded<void>()
    const receives: Array<(push: WatchmanProtocol.Push) => void> = []
    const commands: WatchmanProtocol.Command[][] = []
    const closes: number[] = []
    const events: string[] = []
    const open: WatchmanSession.Open = (_options, receive) => {
      const index = commands.length
      receives.push(receive)
      commands.push([])
      closes.push(0)
      const session: WatchmanSession.Interface = {
        request: (command) => {
          commands[index]?.push(command)
          if (command.type === "version")
            return Effect.succeed({
              type: "version",
              version: "2026.09.05",
              capabilities: Object.fromEntries(WatchmanDirectory.capabilities.map((capability) => [capability, true])),
            })
          if (command.type === "watch") return Effect.succeed({ type: "watch", watch: directory.path })
          if (command.type === "clock") return Effect.succeed({ type: "clock", clock: "c:1:2:3:4" })
          if (command.type === "subscribe")
            return Effect.succeed({ type: "subscribe", subscribe: command.name, clock: "c:1:2:3:4" })
          return Effect.succeed({ type: "unsubscribe", subscription: command.name, deleted: true })
        },
        close: () => Effect.sync(() => closes[index]++),
      }
      return Effect.acquireRelease(Effect.succeed(session), (session) => session.close())
    }
    const native = yield* WatchmanDirectory.make(
      Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) }),
      { socket: "/private/watchman.sock", commandTimeoutMs: 1_000 },
      open,
    )
    const subscription = yield* native.subscribe({
      type: "directory",
      target: directory.path,
      ignore: [],
      names: [],
      publish: () => events.push("update"),
      invalidate: () => {
        events.push("invalidate")
        Queue.offerUnsafe(invalidations, undefined)
      },
    })

    yield* Queue.take(invalidations)
    const first = commands[0]?.find(
      (command): command is Extract<WatchmanProtocol.Command, { readonly type: "subscribe" }> =>
        command.type === "subscribe",
    )
    if (!first) return yield* Effect.die("first subscription was not requested")
    receives[0]?.({ type: "canceled", subscription: first.name })
    yield* advance(() => commands.length === 2)
    yield* Queue.take(invalidations)
    const second = commands[1]?.find(
      (command): command is Extract<WatchmanProtocol.Command, { readonly type: "subscribe" }> =>
        command.type === "subscribe",
    )
    if (!second) return yield* Effect.die("second subscription was not requested")
    expect(second.name).not.toBe(first.name)
    expect(closes[0]).toBe(1)

    events.length = 0
    receives[0]?.({
      type: "batch",
      subscription: first.name,
      fresh: false,
      files: [{ name: "stale.ts", exists: true, type: "f" }],
    })
    receives[1]?.({
      type: "batch",
      subscription: second.name,
      fresh: true,
      files: [{ name: "current.ts", exists: true, type: "f" }],
    })
    yield* Effect.yieldNow
    expect(events).toEqual(["invalidate", "update"])

    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
    expect(closes).toEqual([1, 1])
  }),
)

it.effect("serializes attachment for keys sharing one canonical root", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const versions = [yield* Deferred.make<WatchmanProtocol.Reply>(), yield* Deferred.make<WatchmanProtocol.Reply>()]
    const requested = [yield* Deferred.make<void>(), yield* Deferred.make<void>()]
    const invalidations = yield* Queue.unbounded<void>()
    const closes = [0, 0]
    let opens = 0
    const open: WatchmanSession.Open = () => {
      const index = opens++
      const session: WatchmanSession.Interface = {
        request: (command) => {
          if (command.type === "version") {
            Deferred.doneUnsafe(requested[index]!, Effect.void)
            return Deferred.await(versions[index]!)
          }
          if (command.type === "watch") return Effect.succeed({ type: "watch", watch: directory.path })
          if (command.type === "clock") return Effect.succeed({ type: "clock", clock: "c:1:2:3:4" })
          if (command.type === "subscribe")
            return Effect.succeed({ type: "subscribe", subscribe: command.name, clock: "c:1:2:3:4" })
          return Effect.succeed({ type: "unsubscribe", subscription: command.name, deleted: true })
        },
        close: () => Effect.sync(() => closes[index]++),
      }
      return Effect.acquireRelease(Effect.succeed(session), (session) => session.close())
    }
    const native = yield* WatchmanDirectory.make(
      Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) }),
      { socket: "/private/watchman.sock", commandTimeoutMs: 1_000 },
      open,
    )
    const subscribe = (ignore: readonly string[]) =>
      native.subscribe({
        type: "directory",
        target: directory.path,
        ignore,
        names: [],
        publish: () => {},
        invalidate: () => Queue.offerUnsafe(invalidations, undefined),
      })
    const first = yield* subscribe([])
    const second = yield* subscribe(["node_modules"])

    yield* Deferred.await(requested[0]!)
    yield* Effect.yieldNow
    expect(opens).toBe(1)
    yield* Deferred.succeed(versions[0]!, {
      type: "version",
      version: "2026.09.05",
      capabilities: Object.fromEntries(WatchmanDirectory.capabilities.map((capability) => [capability, true])),
    })
    yield* Queue.take(invalidations)
    yield* Deferred.await(requested[1]!)
    expect(opens).toBe(2)
    yield* Deferred.succeed(versions[1]!, {
      type: "version",
      version: "2026.09.05",
      capabilities: Object.fromEntries(WatchmanDirectory.capabilities.map((capability) => [capability, true])),
    })
    yield* Queue.take(invalidations)

    yield* Effect.promise(() => Promise.all([first?.unsubscribe(), second?.unsubscribe()]))
    expect(closes).toEqual([1, 1])
  }),
)

it.effect("reconnects when the heartbeat observes a new root identity", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const invalidations = yield* Queue.unbounded<void>()
    const clocks = [0, 0]
    const receives: Array<(push: WatchmanProtocol.Push) => void> = []
    let opens = 0
    const open: WatchmanSession.Open = (_options, receive) => {
      const index = opens++
      receives.push(receive)
      const session: WatchmanSession.Interface = {
        request: (command) => {
          if (command.type === "version")
            return Effect.succeed({
              type: "version",
              version: "2026.09.05",
              capabilities: Object.fromEntries(WatchmanDirectory.capabilities.map((capability) => [capability, true])),
            })
          if (command.type === "watch") return Effect.succeed({ type: "watch", watch: directory.path })
          if (command.type === "clock") {
            clocks[index]++
            const root = index === 0 && clocks[index] === 1 ? 3 : 9
            return Effect.succeed({ type: "clock", clock: `c:1:2:${root}:4` })
          }
          if (command.type === "subscribe")
            return Effect.succeed({ type: "subscribe", subscribe: command.name, clock: "c:1:2:3:4" })
          return Effect.succeed({ type: "unsubscribe", subscription: command.name, deleted: true })
        },
        close: () => Effect.void,
      }
      return Effect.succeed(session)
    }
    const native = yield* WatchmanDirectory.make(
      Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) }),
      { socket: "/private/watchman.sock", commandTimeoutMs: 1_000 },
      open,
    )
    const subscription = yield* native.subscribe({
      type: "directory",
      target: directory.path,
      ignore: [],
      names: [],
      publish: () => {},
      invalidate: () => Queue.offerUnsafe(invalidations, undefined),
    })

    yield* Queue.take(invalidations)
    yield* Effect.sleep("1 second").pipe(
      Effect.andThen(
        Effect.sync(() =>
          receives[0]?.({
            type: "batch",
            subscription: "unrelated",
            fresh: false,
            files: [],
          }),
        ),
      ),
      Effect.forever,
      Effect.forkScoped({ startImmediately: true }),
    )
    yield* advance(() => opens === 2)
    yield* Queue.take(invalidations)
    expect(clocks).toEqual([2, 1])

    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  }),
)

const live = process.env.OPENCODE_TEST_WATCHMAN_SOCK ? it.live : it.live.skip

live("observes real file updates and deletes", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const updates = yield* Queue.unbounded<Watcher.Update>()
    const installed = yield* Deferred.make<void>()
    const native = yield* WatchmanDirectory.make(
      Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) }),
      { socket: process.env.OPENCODE_TEST_WATCHMAN_SOCK!, commandTimeoutMs: 10_000 },
    )
    const subscription = yield* native.subscribe({
      type: "directory",
      target: directory.path,
      ignore: [],
      names: [],
      publish: (update) => Queue.offerUnsafe(updates, update),
      invalidate: () => Deferred.doneUnsafe(installed, Effect.void),
    })
    yield* Deferred.await(installed).pipe(Effect.timeout("10 seconds"))

    const file = path.join(directory.path, "live.txt")
    yield* Effect.promise(() => fs.writeFile(file, "one"))
    expect(yield* Queue.take(updates).pipe(Effect.timeout("10 seconds"))).toEqual({ path: file, type: "update" })

    yield* Effect.promise(() => fs.rm(file))
    expect(yield* Queue.take(updates).pipe(Effect.timeout("10 seconds"))).toEqual({ path: file, type: "delete" })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  }),
)

const restartLive =
  process.env.OPENCODE_TEST_WATCHMAN_SOCK && process.env.OPENCODE_TEST_WATCHMAN_RESTART_MARKER ? it.live : it.live.skip

restartLive("recovers after a private daemon restart", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const updates = yield* Queue.unbounded<Watcher.Update>()
    const invalidations = yield* Queue.unbounded<void>()
    const native = yield* WatchmanDirectory.make(
      Watcher.Native.of({ subscribe: () => Effect.succeed(undefined) }),
      { socket: process.env.OPENCODE_TEST_WATCHMAN_SOCK!, commandTimeoutMs: 2_000 },
    )
    const subscription = yield* native.subscribe({
      type: "directory",
      target: directory.path,
      ignore: [],
      names: [],
      publish: (update) => Queue.offerUnsafe(updates, update),
      invalidate: () => Queue.offerUnsafe(invalidations, undefined),
    })
    yield* Queue.take(invalidations).pipe(Effect.timeout("10 seconds"))
    yield* Effect.promise(() => fs.writeFile(process.env.OPENCODE_TEST_WATCHMAN_RESTART_MARKER!, directory.path))
    yield* Queue.take(invalidations).pipe(Effect.timeout("20 seconds"))

    const file = path.join(directory.path, "after-restart.txt")
    yield* Effect.promise(() => fs.writeFile(file, "ready"))
    expect(yield* Queue.take(updates).pipe(Effect.timeout("10 seconds"))).toEqual({ path: file, type: "update" })
    yield* Effect.promise(() => subscription?.unsubscribe() ?? Promise.resolve())
  }),
)
