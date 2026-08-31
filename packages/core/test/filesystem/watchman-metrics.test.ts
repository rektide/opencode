import { expect } from "bun:test"
import { Effect } from "effect"
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

function input(target: string, updates: Watcher.Update[] = [], ignore: readonly string[] = []) {
  return {
    type: "directory" as const,
    target,
    ignore,
    placement: { type: "project" as const, root: "/repo" },
    publish: (update: Watcher.Update) => updates.push(update),
    fail: (_error: Error) => {},
  }
}

function pdu(overrides: Record<string, unknown> = {}) {
  return {
    subscription: "opencode-1-1",
    root: "/repo",
    clock: "c:2",
    is_fresh_instance: false,
    files: [],
    ...overrides,
  }
}

const file = (name: string) => ({ name, exists: true, new: true, type: "f" })

it.live("records commands, pdus, and filtered updates per channel", () =>
  Effect.gen(function* () {
    const raw = client()
    const registry = yield* makeRegistry(() => raw, { metricsIntervalMs: 0 })
    const updates: Watcher.Update[] = []
    const subscription = yield* registry.subscribe(
      { type: "project", project: "/repo" },
      input("/repo/.opencode", updates, ["dropped.ts"]),
    )
    raw.emit("subscription", pdu({ files: [file("kept.ts"), file("dropped.ts")] }))
    yield* Effect.sleep("10 millis")

    const channel = registry.metrics.event("interval", 1000).channels[0]
    expect(channel.id).toBe("project:/repo")
    expect(channel.open).toBe(true)
    expect(channel.generation).toBe(1)
    expect(channel.subscriptions).toBe(1)
    expect(channel.cumulative.commands_out).toBe(4)
    expect(channel.cumulative.commands).toEqual({ capabilityCheck: 1, watch: 1, clock: 1, subscribe: 1 })
    expect(channel.cumulative.command_max_ms).toBeGreaterThanOrEqual(0)
    expect(channel.cumulative.pdus_in).toBe(1)
    expect(channel.cumulative.files_in).toBe(2)
    expect(channel.cumulative.updates_out).toBe(1)
    expect(updates).toEqual([{ path: "/repo/.opencode/kept.ts", type: "create" }])
    expect(channel.subs).toHaveLength(1)
    expect(channel.subs[0].target).toBe(".opencode")
    expect(channel.subs[0].clock).toBe("c:2")
    expect(channel.subs[0].files_in).toBe(2)
    expect(channel.subs[0].updates_out).toBe(1)

    yield* Effect.promise(() => subscription.unsubscribe())
    const after = registry.metrics.event("interval", 1000).channels[0]
    expect(after.cumulative.unsubscribes).toBe(1)
    expect(after.subscriptions).toBe(0)
    expect(after.subs).toHaveLength(0)
  }),
)

it.live("reports per-window deltas", () =>
  Effect.gen(function* () {
    const raw = client()
    const registry = yield* makeRegistry(() => raw, { metricsIntervalMs: 0 })
    const subscription = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src"))
    registry.metrics.event("interval", 1000)
    const idle = registry.metrics.event("interval", 1000)
    expect(idle.totals_delta.commands_out).toBe(0)
    expect(idle.totals_delta.pdus_in).toBe(0)

    raw.emit("subscription", pdu({ files: [file("a.ts")] }))
    yield* Effect.sleep("10 millis")
    const active = registry.metrics.event("interval", 1000)
    expect(active.totals_delta.pdus_in).toBe(1)
    expect(active.totals_delta.files_in).toBe(1)
    expect(active.totals_delta.updates_out).toBe(1)
    expect(active.totals_delta.commands).toEqual({})
    expect(active.totals.pdus_in).toBe(1)

    yield* Effect.promise(() => subscription.unsubscribe())
  }),
)

it.live("counts reconnects, generations, and resubscribes after a socket restart", () =>
  Effect.gen(function* () {
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(
      () => {
        const raw = client()
        clients.push(raw)
        return raw
      },
      { metricsIntervalMs: 0, retryBaseMs: 1, retryCapMs: 2 },
    )
    const subscription = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src"))
    clients[0].emit("subscription", pdu())
    yield* Effect.sleep("10 millis")
    clients[0].emit("end")
    yield* Effect.sleep("50 millis")

    const channel = registry.metrics.event("interval", 1000).channels[0]
    expect(channel.cumulative.generations).toBe(2)
    expect(channel.generation).toBe(2)
    expect(channel.cumulative.reconnect_attempts).toBeGreaterThanOrEqual(1)
    expect(channel.cumulative.established).toBe(2)
    expect(channel.cumulative.resubscribes).toBe(1)
    expect(channel.subs).toHaveLength(1)
    expect(channel.subs[0].resubscribes).toBe(1)
    expect(channel.subs[0].clock).toBe("c:2")

    yield* Effect.promise(() => subscription.unsubscribe())
  }),
)

it.live("counts acquisition failures and fatal channels", () =>
  Effect.gen(function* () {
    const raw = client((args, callback) => {
      if (args[0] === "watch") return callback(new Error("daemon refused"))
      standard(args, callback)
    })
    const registry = yield* makeRegistry(() => raw, { metricsIntervalMs: 0 })
    const failed = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src")).pipe(
      Effect.exit,
    )
    expect(failed._tag).toBe("Failure")

    const event = registry.metrics.event("interval", 1000)
    expect(event.totals.acquires).toBe(1)
    expect(event.channels[0].cumulative.acquisition_failures).toBe(1)
    expect(event.channels[0].fatal).toBe(true)
    expect(event.channels[0].open).toBe(true)
    expect(event.channels[0].generation).toBe(0)
    expect(event.channels[0].subs).toHaveLength(0)
  }),
)

it.live("renders wide and line-per-channel modes", () =>
  Effect.gen(function* () {
    const clients: TestClient[] = []
    const registry = yield* makeRegistry(() => {
      const raw = client()
      clients.push(raw)
      return raw
    })
    const first = yield* registry.subscribe({ type: "project", project: "/first" }, input("/first/src"))
    const second = yield* registry.subscribe({ type: "exact", target: "/outside" }, {
      ...input("/outside"),
      placement: { type: "exact" },
    })

    const wide = registry.metrics.render("final", 900_000, "wide")
    expect(wide).toHaveLength(1)
    const parsed = JSON.parse(wide[0])
    expect(parsed.event).toBe("watchman_metrics")
    expect(parsed.kind).toBe("final")
    expect(parsed.channels.map((channel: { id: string }) => channel.id)).toEqual(["project:/first", "exact:/outside"])
    expect(wide[0].length).toBeLessThan(10_000)

    const lines = registry.metrics.render("interval", 900_000, "lines")
    expect(lines).toHaveLength(3)
    const header = JSON.parse(lines[0])
    expect(header.event).toBe("watchman_metrics")
    expect(header.channels_count).toBe(2)
    for (const line of lines.slice(1)) {
      const channelLine = JSON.parse(line)
      expect(channelLine.event).toBe("watchman_metrics_channel")
      expect(channelLine.channel.cumulative.commands_out).toBeGreaterThan(0)
    }

    yield* Effect.promise(() => first.unsubscribe())
    yield* Effect.promise(() => second.unsubscribe())
  }),
)

it.live("emits interval dumps and one final dump through the log sink", () =>
  Effect.gen(function* () {
    const lines: string[] = []
    yield* Effect.gen(function* () {
      const registry = yield* makeRegistry(() => client(), {
        metricsIntervalMs: 15,
        metricsLog: (line) => lines.push(line),
      })
      const subscription = yield* registry.subscribe({ type: "project", project: "/repo" }, input("/repo/src"))
      yield* Effect.sleep("60 millis")
      yield* Effect.promise(() => subscription.unsubscribe())
    }).pipe(Effect.scoped)

    const kinds = lines.map((line) => JSON.parse(line).kind)
    expect(kinds.filter((kind: string) => kind === "interval").length).toBeGreaterThanOrEqual(1)
    expect(kinds.filter((kind: string) => kind === "final")).toEqual(["final"])
  }),
)
