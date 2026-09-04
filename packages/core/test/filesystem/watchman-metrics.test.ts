import { expect } from "bun:test"
import { Deferred, Effect, Fiber, Schedule } from "effect"
import { TestClock } from "effect/testing"
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
    const acquisition = registry.metrics.event("interval", 1000).acquisition
    expect(acquisition).toMatchObject({
      limit: 4,
      in_flight: 0,
      admission_waiting: 0,
      circuit_waiting: 0,
      circuit_state: "closed",
    })

    yield* Effect.promise(() => subscription.unsubscribe())
    const after = registry.metrics.event("interval", 1000).channels[0]
    expect(after.cumulative.unsubscribes).toBe(1)
    expect(after.subscriptions).toBe(0)
    expect(after.subs).toHaveLength(0)
  }),
)

it.effect("reports shared admission pressure", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    let capability: ((error: Error | null, response?: unknown) => void) | undefined
    const registry = yield* makeRegistry(
      () => ({
        ...client(),
        capabilityCheck: (_capabilities, callback) => {
          capability = callback
          Deferred.doneUnsafe(started, Effect.void)
        },
      }),
      { metricsIntervalMs: 0, maxConcurrentAcquisitions: 1 },
    )
    const admitted = yield* registry
      .subscribe({ type: "project", project: "/admitted" }, input("/admitted"))
      .pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(started)
    const queued = yield* registry
      .subscribe({ type: "project", project: "/queued" }, input("/queued"))
      .pipe(Effect.scoped, Effect.forkScoped({ startImmediately: true }))
    yield* Effect.yieldNow

    expect(registry.metrics.event("interval", 1000).acquisition).toMatchObject({
      limit: 1,
      in_flight: 1,
      admission_waiting: 1,
      circuit_waiting: 0,
      circuit_state: "closed",
    })

    yield* Fiber.interrupt(queued)
    if (!capability) throw new Error("Capability callback was not installed")
    capability(null, { capabilities: { relative_root: true } })
    const subscription = yield* Fiber.join(admitted)
    expect(registry.metrics.event("interval", 1000).acquisition.admission_waiting).toBe(0)
    yield* Effect.promise(() => subscription.unsubscribe())
  }),
)

it.effect("reports open, half-open, and recovered circuit transitions", () =>
  Effect.gen(function* () {
    const failed = yield* Deferred.make<void>()
    const probe = yield* Deferred.make<void>()
    let capability: ((error: Error | null, response?: unknown) => void) | undefined
    let attempts = 0
    const registry = yield* makeRegistry(
      () => {
        attempts++
        if (attempts === 1) {
          Deferred.doneUnsafe(failed, Effect.void)
          throw new Error("daemon unavailable")
        }
        return {
          ...client(),
          capabilityCheck: (_capabilities, callback) => {
            capability = callback
            Deferred.doneUnsafe(probe, Effect.void)
          },
        }
      },
      { metricsIntervalMs: 0, maxConcurrentAcquisitions: 1, retryBaseMs: 100, retryCapMs: 400 },
    )
    const pending = yield* registry
      .subscribe({ type: "project", project: "/repo" }, input("/repo"))
      .pipe(Effect.forkScoped({ startImmediately: true }))
    yield* Deferred.await(failed)
    yield* Effect.yieldNow

    expect(registry.metrics.event("interval", 1000).acquisition).toMatchObject({
      in_flight: 0,
      circuit_waiting: 1,
      circuit_state: "open",
      connect_failures: 1,
      circuit_opens: 1,
      half_open_probes: 0,
      circuit_recoveries: 0,
    })

    yield* TestClock.adjust("100 millis")
    yield* Deferred.await(probe)
    expect(registry.metrics.event("interval", 1000).acquisition).toMatchObject({
      in_flight: 1,
      circuit_waiting: 0,
      circuit_state: "half_open",
      connect_failures: 1,
      circuit_opens: 1,
      half_open_probes: 1,
      circuit_recoveries: 0,
    })

    if (!capability) throw new Error("Probe capability callback was not installed")
    capability(null, { capabilities: { relative_root: true } })
    const subscription = yield* Fiber.join(pending)
    const recovered = registry.metrics.event("interval", 1000)
    expect(recovered.acquisition).toMatchObject({
      in_flight: 0,
      circuit_waiting: 0,
      circuit_state: "closed",
      connect_failures: 1,
      circuit_opens: 1,
      half_open_probes: 1,
      circuit_recoveries: 1,
    })
    expect("fallbacks" in recovered.totals).toBe(false)
    yield* Effect.promise(() => subscription.unsubscribe())
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
    yield* Effect.sync(() => registry.metrics.channels.get("project:/repo")?.pdus_in).pipe(
      Effect.filterOrFail((count) => count === 1),
      Effect.retry(Schedule.spaced("1 millis")),
      Effect.timeout("1 second"),
    )
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
      if (args[0] === "watch") return callback(null, {})
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
