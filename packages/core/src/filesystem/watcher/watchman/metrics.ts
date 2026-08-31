import type { RootIntent } from "./route.js"

// Temp wide-event telemetry for the root-scoped Watchman backend. Counters
// only grow, gauges hold the latest value, and every dump reports cumulative
// totals plus a delta since the previous dump. Output goes to console.log
// until real OTEL export exists; keep it cheap and honest over clever.

export const DEFAULT_METRICS_INTERVAL_MS = 900_000
export type MetricsMode = "wide" | "lines"
export type MetricsKind = "interval" | "final"

export type Counters = {
  commands_out: number
  commands: Record<string, number>
  command_errors: number
  command_timeouts: number
  command_ms: number
  command_max_ms: number
  generations: number
  reconnect_attempts: number
  connections: number
  established: number
  resubscribes: number
  unsubscribes: number
  acquisition_failures: number
  pdus_in: number
  canceled_pdus: number
  fresh_instances: number
  files_in: number
  updates_out: number
}

export type SubEvent = {
  readonly id: number
  readonly target: string
  readonly pdus_in: number
  readonly canceled_pdus: number
  readonly fresh_instances: number
  readonly files_in: number
  readonly updates_out: number
  readonly resubscribes: number
  readonly clock?: string
}

export type ChannelEvent = {
  readonly id: string
  readonly intent: "project" | "exact"
  readonly root: string
  readonly open: boolean
  readonly generation: number
  readonly recovering: boolean
  readonly fatal: boolean
  readonly age_ms: number
  readonly subscriptions: number
  readonly cumulative: Counters & { readonly command_avg_ms: number }
  readonly delta: Counters
  readonly subs: readonly SubEvent[]
}

export type MetricsEvent = {
  readonly event: "watchman_metrics"
  readonly v: 1
  readonly kind: MetricsKind
  readonly ts: string
  readonly interval_ms: number
  readonly uptime_ms: number
  readonly totals: Counters & {
    readonly acquires: number
    readonly fallbacks: number
    readonly channels: number
    readonly channels_open: number
    readonly command_avg_ms: number
  }
  readonly totals_delta: Counters
  readonly channels: readonly ChannelEvent[]
}

/** One live subscription inside a channel; removed once the subscription ends. */
export class SubMetrics {
  pdus_in = 0
  canceled_pdus = 0
  fresh_instances = 0
  files_in = 0
  updates_out = 0
  resubscribes = 0
  clock?: string

  constructor(
    readonly id: number,
    readonly target: string,
    private readonly channel: ChannelMetrics,
  ) {}

  /** One decoded subscription PDU: files received and updates published after ignore filtering. */
  pdu(info: { readonly canceled: boolean; readonly fresh: boolean; readonly files: number; readonly published: number }) {
    this.channel.pduIn(info)
    this.pdus_in++
    if (info.canceled) this.canceled_pdus++
    if (info.fresh) this.fresh_instances++
    this.files_in += info.files
    this.updates_out += info.published
  }

  resubscribed() {
    this.resubscribes++
  }

  atClock(clock: string) {
    this.clock = clock
  }

  end() {
    this.channel.subEnded(this)
  }
}

/** Counters and gauges for one channel: a single root intent's watchman connection. */
export class ChannelMetrics {
  readonly created = performance.now()
  commands_out = 0
  readonly commands: Record<string, number> = {}
  command_errors = 0
  command_timeouts = 0
  command_ms = 0
  command_max_ms = 0
  generations = 0
  reconnect_attempts = 0
  connections = 0
  established = 0
  resubscribes = 0
  unsubscribes = 0
  acquisition_failures = 0
  pdus_in = 0
  canceled_pdus = 0
  fresh_instances = 0
  files_in = 0
  updates_out = 0
  open = false
  generation = 0
  recovering = false
  fatal = false
  readonly subs = new Map<number, SubMetrics>()

  private window_command_max_ms = 0
  private previous?: Counters

  constructor(readonly intent: RootIntent) {}

  get id() {
    return this.intent.type === "project" ? `project:${this.intent.project}` : `exact:${this.intent.target}`
  }

  commandOut(label: string) {
    this.commands_out++
    this.commands[label] = (this.commands[label] ?? 0) + 1
  }

  commandOk(ms: number) {
    this.command_ms += ms
    this.command_max_ms = Math.max(this.command_max_ms, ms)
    this.window_command_max_ms = Math.max(this.window_command_max_ms, ms)
  }

  commandError() {
    this.command_errors++
  }

  commandTimeout() {
    this.command_timeouts++
  }

  connection() {
    this.connections++
    this.open = true
  }

  closed() {
    this.open = false
  }

  generationStart(id: number) {
    this.generations++
    this.generation = id
  }

  generationEnd() {
    this.generation = 0
  }

  recoveringChange(on: boolean) {
    this.recovering = on
  }

  attempt() {
    this.reconnect_attempts++
  }

  fatalChange() {
    this.fatal = true
  }

  establishedOnce(resubscribe: boolean) {
    this.established++
    if (resubscribe) this.resubscribes++
  }

  unsubscribed() {
    this.unsubscribes++
  }

  acquisitionFailure() {
    this.acquisition_failures++
  }

  sub(id: number, target: string) {
    const existing = this.subs.get(id)
    if (existing) return existing
    const created = new SubMetrics(id, target, this)
    this.subs.set(id, created)
    return created
  }

  pduIn(info: { readonly canceled: boolean; readonly fresh: boolean; readonly files: number; readonly published: number }) {
    this.pdus_in++
    if (info.canceled) this.canceled_pdus++
    if (info.fresh) this.fresh_instances++
    this.files_in += info.files
    this.updates_out += info.published
  }

  subEnded(sub: SubMetrics) {
    if (this.subs.get(sub.id) === sub) this.subs.delete(sub.id)
  }

  /** Cumulative counters plus derived averages; advances delta bookkeeping. */
  snapshot(): ChannelEvent {
    const delta = this.delta()
    return {
      id: this.id,
      intent: this.intent.type,
      root: this.intent.type === "project" ? this.intent.project : this.intent.target,
      open: this.open,
      generation: this.generation,
      recovering: this.recovering,
      fatal: this.fatal,
      age_ms: Math.round(performance.now() - this.created),
      subscriptions: this.subs.size,
      cumulative: {
        commands_out: this.commands_out,
        commands: { ...this.commands },
        command_errors: this.command_errors,
        command_timeouts: this.command_timeouts,
        command_ms: Math.round(this.command_ms),
        command_max_ms: Math.round(this.command_max_ms),
        command_avg_ms: this.commands_out ? Math.round(this.command_ms / this.commands_out) : 0,
        generations: this.generations,
        reconnect_attempts: this.reconnect_attempts,
        connections: this.connections,
        established: this.established,
        resubscribes: this.resubscribes,
        unsubscribes: this.unsubscribes,
        acquisition_failures: this.acquisition_failures,
        pdus_in: this.pdus_in,
        canceled_pdus: this.canceled_pdus,
        fresh_instances: this.fresh_instances,
        files_in: this.files_in,
        updates_out: this.updates_out,
      },
      delta,
      subs: [...this.subs.values()].map((sub) => ({
        id: sub.id,
        target: sub.target,
        pdus_in: sub.pdus_in,
        canceled_pdus: sub.canceled_pdus,
        fresh_instances: sub.fresh_instances,
        files_in: sub.files_in,
        updates_out: sub.updates_out,
        resubscribes: sub.resubscribes,
        ...(sub.clock === undefined ? {} : { clock: sub.clock }),
      })),
    }
  }

  private delta(): Counters {
    const previous = this.previous
    const commands: Record<string, number> = {}
    for (const [label, count] of Object.entries(this.commands)) {
      const value = count - (previous?.commands[label] ?? 0)
      if (value > 0) commands[label] = value
    }
    this.previous = {
      commands_out: this.commands_out,
      commands: { ...this.commands },
      command_errors: this.command_errors,
      command_timeouts: this.command_timeouts,
      command_ms: this.command_ms,
      command_max_ms: this.command_max_ms,
      generations: this.generations,
      reconnect_attempts: this.reconnect_attempts,
      connections: this.connections,
      established: this.established,
      resubscribes: this.resubscribes,
      unsubscribes: this.unsubscribes,
      acquisition_failures: this.acquisition_failures,
      pdus_in: this.pdus_in,
      canceled_pdus: this.canceled_pdus,
      fresh_instances: this.fresh_instances,
      files_in: this.files_in,
      updates_out: this.updates_out,
    }
    this.window_command_max_ms = 0
    const diff = (current: number, before: number) => Math.max(0, current - before)
    return previous === undefined
      ? {
          commands_out: this.commands_out,
          commands: { ...this.commands },
          command_errors: this.command_errors,
          command_timeouts: this.command_timeouts,
          command_ms: Math.round(this.command_ms),
          command_max_ms: Math.round(this.command_max_ms),
          generations: this.generations,
          reconnect_attempts: this.reconnect_attempts,
          connections: this.connections,
          established: this.established,
          resubscribes: this.resubscribes,
          unsubscribes: this.unsubscribes,
          acquisition_failures: this.acquisition_failures,
          pdus_in: this.pdus_in,
          canceled_pdus: this.canceled_pdus,
          fresh_instances: this.fresh_instances,
          files_in: this.files_in,
          updates_out: this.updates_out,
        }
      : {
          commands_out: diff(this.commands_out, previous.commands_out),
          commands,
          command_errors: diff(this.command_errors, previous.command_errors),
          command_timeouts: diff(this.command_timeouts, previous.command_timeouts),
          command_ms: Math.round(diff(this.command_ms, previous.command_ms)),
          command_max_ms: Math.round(this.window_command_max_ms),
          generations: diff(this.generations, previous.generations),
          reconnect_attempts: diff(this.reconnect_attempts, previous.reconnect_attempts),
          connections: diff(this.connections, previous.connections),
          established: diff(this.established, previous.established),
          resubscribes: diff(this.resubscribes, previous.resubscribes),
          unsubscribes: diff(this.unsubscribes, previous.unsubscribes),
          acquisition_failures: diff(this.acquisition_failures, previous.acquisition_failures),
          pdus_in: diff(this.pdus_in, previous.pdus_in),
          canceled_pdus: diff(this.canceled_pdus, previous.canceled_pdus),
          fresh_instances: diff(this.fresh_instances, previous.fresh_instances),
          files_in: diff(this.files_in, previous.files_in),
          updates_out: diff(this.updates_out, previous.updates_out),
        }
  }
}

/** Registry-level metrics: every channel plus process-wide counters. */
export class WatchmanMetrics {
  readonly created = performance.now()
  readonly channels = new Map<string, ChannelMetrics>()
  acquires = 0
  fallbacks = 0

  constructor(readonly log: (line: string) => void = (line) => console.log(line)) {}

  acquire() {
    this.acquires++
  }

  fallback() {
    this.fallbacks++
  }

  channel(intent: RootIntent) {
    const id = intent.type === "project" ? `project:${intent.project}` : `exact:${intent.target}`
    const existing = this.channels.get(id)
    if (existing) return existing
    const created = new ChannelMetrics(intent)
    this.channels.set(id, created)
    return created
  }

  event(kind: MetricsKind, intervalMs: number): MetricsEvent {
    const snapshots = [...this.channels.values()].map((channel) => channel.snapshot())
    const totals = snapshots.reduce(sumChannel, emptyCounters())
    for (const channel of snapshots) {
      for (const [label, count] of Object.entries(channel.cumulative.commands)) {
        totals.commands[label] = (totals.commands[label] ?? 0) + count
      }
    }
    const totals_delta = snapshots.reduce(sumDelta, emptyCounters())
    return {
      event: "watchman_metrics",
      v: 1,
      kind,
      ts: new Date().toISOString(),
      interval_ms: intervalMs,
      uptime_ms: Math.round(performance.now() - this.created),
      totals: {
        ...totals,
        acquires: this.acquires,
        fallbacks: this.fallbacks,
        channels: snapshots.length,
        channels_open: snapshots.filter((channel) => channel.open).length,
        command_avg_ms: totals.commands_out ? Math.round(totals.command_ms / totals.commands_out) : 0,
      },
      totals_delta,
      channels: snapshots,
    }
  }

  render(kind: MetricsKind, intervalMs: number, mode: MetricsMode): string[] {
    const event = this.event(kind, intervalMs)
    if (mode === "wide") return [JSON.stringify(event)]
    const { channels, ...header } = event
    return [
      JSON.stringify({ ...header, channels_count: channels.length }),
      ...channels.map((channel) =>
        JSON.stringify({ event: "watchman_metrics_channel", v: 1, kind, ts: event.ts, channel }),
      ),
    ]
  }

  emit(kind: MetricsKind, intervalMs: number, mode: MetricsMode) {
    for (const line of this.render(kind, intervalMs, mode)) this.log(line)
  }
}

function emptyCounters(): Counters {
  return {
    commands_out: 0,
    commands: {},
    command_errors: 0,
    command_timeouts: 0,
    command_ms: 0,
    command_max_ms: 0,
    generations: 0,
    reconnect_attempts: 0,
    connections: 0,
    established: 0,
    resubscribes: 0,
    unsubscribes: 0,
    acquisition_failures: 0,
    pdus_in: 0,
    canceled_pdus: 0,
    fresh_instances: 0,
    files_in: 0,
    updates_out: 0,
  }
}

function sumChannel(totals: Counters, channel: ChannelEvent): Counters {
  const c = channel.cumulative
  return {
    commands_out: totals.commands_out + c.commands_out,
    commands: totals.commands,
    command_errors: totals.command_errors + c.command_errors,
    command_timeouts: totals.command_timeouts + c.command_timeouts,
    command_ms: totals.command_ms + c.command_ms,
    command_max_ms: Math.max(totals.command_max_ms, c.command_max_ms),
    generations: totals.generations + c.generations,
    reconnect_attempts: totals.reconnect_attempts + c.reconnect_attempts,
    connections: totals.connections + c.connections,
    established: totals.established + c.established,
    resubscribes: totals.resubscribes + c.resubscribes,
    unsubscribes: totals.unsubscribes + c.unsubscribes,
    acquisition_failures: totals.acquisition_failures + c.acquisition_failures,
    pdus_in: totals.pdus_in + c.pdus_in,
    canceled_pdus: totals.canceled_pdus + c.canceled_pdus,
    fresh_instances: totals.fresh_instances + c.fresh_instances,
    files_in: totals.files_in + c.files_in,
    updates_out: totals.updates_out + c.updates_out,
  }
}

function sumDelta(totals: Counters, channel: ChannelEvent): Counters {
  const d = channel.delta
  for (const [label, count] of Object.entries(d.commands)) {
    totals.commands[label] = (totals.commands[label] ?? 0) + count
  }
  return {
    commands_out: totals.commands_out + d.commands_out,
    commands: totals.commands,
    command_errors: totals.command_errors + d.command_errors,
    command_timeouts: totals.command_timeouts + d.command_timeouts,
    command_ms: totals.command_ms + d.command_ms,
    command_max_ms: Math.max(totals.command_max_ms, d.command_max_ms),
    generations: totals.generations + d.generations,
    reconnect_attempts: totals.reconnect_attempts + d.reconnect_attempts,
    connections: totals.connections + d.connections,
    established: totals.established + d.established,
    resubscribes: totals.resubscribes + d.resubscribes,
    unsubscribes: totals.unsubscribes + d.unsubscribes,
    acquisition_failures: totals.acquisition_failures + d.acquisition_failures,
    pdus_in: totals.pdus_in + d.pdus_in,
    canceled_pdus: totals.canceled_pdus + d.canceled_pdus,
    fresh_instances: totals.fresh_instances + d.fresh_instances,
    files_in: totals.files_in + d.files_in,
    updates_out: totals.updates_out + d.updates_out,
  }
}
