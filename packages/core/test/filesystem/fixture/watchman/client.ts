import { inspect, isDeepStrictEqual } from "node:util"
import { Deferred, Effect } from "effect"

export type CommandPayload = readonly unknown[]

export type ResponseCallback = (error: Error | null, response?: unknown) => void

export type CapabilityRequest = {
  readonly optional?: readonly string[]
  readonly required?: readonly string[]
}

/** The transport surface consumed by the production Watchman protocol wrapper. */
export type RawClient = {
  readonly end: () => void
  readonly command: (args: CommandPayload, callback: ResponseCallback) => void
  readonly capabilityCheck: (capabilities: CapabilityRequest, callback: ResponseCallback) => void
  readonly on: (event: string, listener: (value?: unknown) => void) => unknown
}

export type RawClientFactory = () => RawClient

export type CommandReply =
  | {
      readonly type: "response"
      readonly response: unknown
      readonly late: boolean
      readonly sequence: number
    }
  | {
      readonly type: "error"
      readonly error: Error
      readonly late: boolean
      readonly sequence: number
    }

export type ScriptedCommand = {
  readonly index: number
  readonly sequence: number
  readonly args: CommandPayload
  readonly state: () => "arrived" | "held" | "responded" | "failed"
  /** Leaves the callback pending so a test can advance TestClock or signal connection loss. */
  readonly hold: () => Effect.Effect<void>
  readonly respond: (response: unknown) => Effect.Effect<void>
  readonly fail: (error: Error) => Effect.Effect<void>
  /** Re-invokes a fenced callback after connection loss without changing queue state. */
  readonly lateRespond: (response: unknown) => Effect.Effect<void>
  readonly awaitReply: () => Effect.Effect<CommandReply>
}

export type ListenerRegistration = {
  readonly event: string
  readonly index: number
  readonly sequence: number
}

export type Termination = {
  readonly index: number
  readonly sequence: number
}

export type ScriptedClient = RawClient & {
  readonly construction: number
  /** Waits for a wire-visible command by absolute FIFO index. */
  readonly awaitCommand: (index: number) => Effect.Effect<ScriptedCommand>
  /** Waits for and fully compares the next wire-visible command. */
  readonly nextCommand: (expected: CommandPayload) => Effect.Effect<ScriptedCommand>
  readonly awaitListener: (event: string, index?: number) => Effect.Effect<ListenerRegistration>
  readonly awaitTermination: (index?: number) => Effect.Effect<Termination>
  readonly listeners: (event: string) => number
  readonly submitted: () => readonly CommandPayload[]
  readonly transcript: () => readonly CommandPayload[]
  readonly pending: () => number
  readonly ended: () => number
  readonly emitSubscription: (pdu: unknown) => void
  readonly emitLog: (pdu: unknown) => void
  readonly emitConnect: () => void
  readonly emitError: (error: Error) => void
  readonly emitEnd: () => void
  readonly assertListenersBefore: (command: ScriptedCommand, events: readonly string[]) => void
  readonly expectTranscript: (expected: readonly CommandPayload[]) => void
  readonly assertIdle: () => void
  readonly assertComplete: () => void
}

export type ClientPlan = {
  readonly type: "client"
  readonly commands: readonly CommandPayload[]
  /** Listener names that must already be registered when command zero arrives. */
  readonly listenersBeforeFirstCommand?: readonly string[]
}

export type FailedConstructionPlan = {
  readonly type: "failure"
  readonly error: Error
}

export type ConstructionPlan = ClientPlan | FailedConstructionPlan

export type Construction =
  | {
      readonly type: "client"
      readonly index: number
      readonly sequence: number
      readonly client: ScriptedClient
    }
  | {
      readonly type: "failure"
      readonly index: number
      readonly sequence: number
      readonly error: Error
    }

export type WatchmanActor = {
  readonly factory: RawClientFactory
  readonly awaitConstruction: (index: number) => Effect.Effect<Construction>
  readonly awaitClient: (index: number) => Effect.Effect<ScriptedClient>
  readonly constructions: () => number
  readonly constructionRecords: () => readonly Construction[]
  readonly clients: () => readonly ScriptedClient[]
  readonly assertComplete: () => void
}

export type WatchmanActorOptions = {
  /**
   * Optional strict script. It asserts construction count, construction
   * failures, complete command payloads, and missing or extra commands.
   */
  readonly plan?: readonly ConstructionPlan[]
}

export class WatchmanActorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WatchmanActorError"
  }
}

/**
 * Creates a synchronous raw-client factory with Effect Deferred barriers.
 * Commands are dispatched one at a time; capabilityCheck emits a normal
 * `version` command through that same FIFO queue.
 */
export function makeWatchmanActor(options: WatchmanActorOptions = {}): WatchmanActor {
  const constructions: Construction[] = []
  const clients: ScriptedClient[] = []
  const arrivals = new Map<number, Deferred.Deferred<Construction>>()
  const violations: WatchmanActorError[] = []
  let sequence = 0

  const nextSequence = () => sequence++
  const report = (error: WatchmanActorError) => {
    violations.push(error)
    return error
  }
  const factory = () => {
    const index = constructions.length
    const plan = options.plan?.[index]
    if (options.plan && !plan) {
      const error = report(
        new WatchmanActorError(
          `Unexpected Watchman client construction ${index}; the actor plan has ${options.plan.length} construction(s)`,
        ),
      )
      const construction = { type: "failure", index, sequence: nextSequence(), error } as const
      constructions.push(construction)
      complete(arrival(arrivals, index), construction)
      throw error
    }
    if (plan?.type === "failure") {
      const construction = { type: "failure", index, sequence: nextSequence(), error: plan.error } as const
      constructions.push(construction)
      complete(arrival(arrivals, index), construction)
      throw plan.error
    }

    const client = makeClient(index, plan, nextSequence, report)
    const construction = { type: "client", index, sequence: nextSequence(), client } as const
    constructions.push(construction)
    clients.push(client)
    complete(arrival(arrivals, index), construction)
    return client
  }

  return {
    factory,
    awaitConstruction: (index) => Deferred.await(arrival(arrivals, index)),
    awaitClient: (index) =>
      Deferred.await(arrival(arrivals, index)).pipe(
        Effect.flatMap((construction) =>
          construction.type === "client" ? Effect.succeed(construction.client) : Effect.die(construction.error),
        ),
      ),
    constructions: () => constructions.length,
    constructionRecords: () => [...constructions],
    clients: () => [...clients],
    assertComplete: () => {
      if (violations[0]) throw violations[0]
      if (options.plan && constructions.length !== options.plan.length)
        throw new WatchmanActorError(
          `Incomplete Watchman construction plan: expected ${options.plan.length}, observed ${constructions.length}`,
        )
      for (const client of clients) client.assertComplete()
    },
  }
}

type PendingCommand = {
  readonly index: number
  readonly args: CommandPayload
  readonly callback: ResponseCallback
  readonly reply: Deferred.Deferred<CommandReply>
  sequence: number
  state: "queued" | "arrived" | "held" | "responded" | "failed"
}

type RegisteredListener = ListenerRegistration & {
  readonly listener: (value?: unknown) => void
}

function makeClient(
  construction: number,
  plan: ClientPlan | undefined,
  nextSequence: () => number,
  report: (error: WatchmanActorError) => WatchmanActorError,
): ScriptedClient {
  const registered = new Map<string, RegisteredListener[]>()
  const listenerArrivals = new Map<string, Map<number, Deferred.Deferred<ListenerRegistration>>>()
  const commandArrivals = new Map<number, Deferred.Deferred<ScriptedCommand>>()
  const terminationArrivals = new Map<number, Deferred.Deferred<Termination>>()
  const submissions: PendingCommand[] = []
  const queue: PendingCommand[] = []
  const transcript: CommandPayload[] = []
  const terminations: Termination[] = []
  let active: PendingCommand | undefined
  let nextExpected = 0
  let latestDisruption = -1

  const listenersFor = (event: string) => {
    const current = listenerArrivals.get(event)
    if (current) return current
    const created = new Map<number, Deferred.Deferred<ListenerRegistration>>()
    listenerArrivals.set(event, created)
    return created
  }

  const listenersBeforeError = (command: ScriptedCommand, events: readonly string[]) => {
    for (const event of events) {
      const registration = registered.get(event)?.[0]
      if (!registration)
        return new WatchmanActorError(
          `Watchman client ${construction} command ${command.index} arrived before listener ${format(event)} was registered`,
        )
      if (registration.sequence >= command.sequence)
        return new WatchmanActorError(
          `Watchman client ${construction} listener ${format(event)} was registered after command ${command.index}`,
        )
    }
    return undefined
  }
  const assertListenersBefore = (command: ScriptedCommand, events: readonly string[]) => {
    const error = listenersBeforeError(command, events)
    if (error) throw error
  }

  const settle = (command: PendingCommand, reply: { readonly response: unknown } | { readonly error: Error }) =>
    Effect.sync(() => {
      if (active !== command || (command.state !== "arrived" && command.state !== "held"))
        throw new WatchmanActorError(
          `Watchman client ${construction} command ${command.index} cannot reply from state ${format(command.state)}`,
        )
      const sequence = nextSequence()
      const late = latestDisruption > command.sequence
      active = undefined
      if ("error" in reply) {
        command.state = "failed"
        command.callback(reply.error)
        complete(command.reply, { type: "error", error: reply.error, late, sequence })
      } else {
        command.state = "responded"
        command.callback(null, reply.response)
        complete(command.reply, { type: "response", response: reply.response, late, sequence })
      }
      dispatch()
    })

  const control = (command: PendingCommand): ScriptedCommand => ({
    index: command.index,
    sequence: command.sequence,
    args: command.args,
    state: () => {
      if (command.state === "queued")
        throw new WatchmanActorError(`Watchman client ${construction} command ${command.index} has not arrived`)
      return command.state
    },
    hold: () =>
      Effect.sync(() => {
        if (active !== command || (command.state !== "arrived" && command.state !== "held"))
          throw new WatchmanActorError(
            `Watchman client ${construction} command ${command.index} cannot be held from state ${format(command.state)}`,
          )
        command.state = "held"
      }),
    respond: (response) => settle(command, { response }),
    fail: (error) => settle(command, { error }),
    lateRespond: (response) =>
      Effect.sync(() => {
        if (latestDisruption <= command.sequence)
          throw new WatchmanActorError(
            `Watchman client ${construction} command ${command.index} cannot receive a late response before connection loss`,
          )
        if (command.state !== "responded" && command.state !== "failed")
          throw new WatchmanActorError(
            `Watchman client ${construction} command ${command.index} cannot receive a late response from state ${format(command.state)}`,
          )
        command.callback(null, response)
      }),
    awaitReply: () => Deferred.await(command.reply),
  })

  const cancel = (message: string) => {
    const commands = active ? [active, ...queue] : [...queue]
    const error = new Error(message)
    active = undefined
    queue.length = 0
    commands.forEach((command) => {
      const sequence = nextSequence()
      command.state = "failed"
      command.callback(error)
      complete(command.reply, { type: "error", error, late: latestDisruption > command.sequence, sequence })
    })
  }

  const dispatch = () => {
    if (active) return
    const command = queue.shift()
    if (!command) return
    command.state = "arrived"
    command.sequence = nextSequence()
    transcript.push(command.args)
    const scripted = control(command)
    const expected = plan?.commands[command.index]
    const errors: WatchmanActorError[] = []
    if (plan && !expected)
      errors.push(
        report(
          new WatchmanActorError(
            `Unexpected Watchman client ${construction} command ${command.index}: ${format(command.args)}; script has ${plan.commands.length} command(s)`,
          ),
        ),
      )
    if (expected && !isDeepStrictEqual(command.args, expected))
      errors.push(
        report(payloadError(`Watchman client ${construction} command ${command.index}`, expected, command.args)),
      )
    if (command.index === 0 && plan?.listenersBeforeFirstCommand) {
      const error = listenersBeforeError(scripted, plan.listenersBeforeFirstCommand)
      if (error) errors.push(report(error))
    }
    if (errors[0]) {
      command.state = "failed"
      complete(arrival(commandArrivals, command.index), scripted)
      throw errors[0]
    }
    active = command
    complete(arrival(commandArrivals, command.index), scripted)
  }

  const emit = (event: string, value?: unknown) => {
    if (event === "error") latestDisruption = nextSequence()
    const listeners = registered.get(event) ?? []
    if (event === "error" && listeners.length === 0)
      throw value instanceof Error ? value : new WatchmanActorError("Watchman error event emitted without a listener")
    listeners.slice().forEach((registration) => registration.listener(value))
  }

  const client: ScriptedClient = {
    construction,
    end: () => {
      const termination = { index: terminations.length, sequence: nextSequence() }
      latestDisruption = termination.sequence
      cancel("The client was ended")
      terminations.push(termination)
      complete(arrival(terminationArrivals, termination.index), termination)
    },
    command: (args, callback) => {
      const command: PendingCommand = {
        index: submissions.length,
        args: structuredClone(args),
        callback,
        reply: Deferred.makeUnsafe<CommandReply>(),
        sequence: -1,
        state: "queued",
      }
      submissions.push(command)
      queue.push(command)
      dispatch()
    },
    capabilityCheck: (capabilities, callback) =>
      client.command(
        [
          "version",
          {
            optional: [...(capabilities.optional ?? [])],
            required: [...(capabilities.required ?? [])],
          },
        ],
        callback,
      ),
    on: (event, listener) => {
      const listeners = registered.get(event) ?? []
      const registration = { event, index: listeners.length, sequence: nextSequence(), listener }
      listeners.push(registration)
      registered.set(event, listeners)
      complete(arrival(listenersFor(event), registration.index), {
        event: registration.event,
        index: registration.index,
        sequence: registration.sequence,
      })
      return client
    },
    awaitCommand: (index) => Deferred.await(arrival(commandArrivals, index)),
    nextCommand: (expected) => {
      const index = nextExpected++
      return Deferred.await(arrival(commandArrivals, index)).pipe(
        Effect.tap((command) =>
          Effect.sync(() => {
            if (!isDeepStrictEqual(command.args, expected))
              throw payloadError(`Watchman client ${construction} command ${index}`, expected, command.args)
          }),
        ),
      )
    },
    awaitListener: (event, index = 0) => Deferred.await(arrival(listenersFor(event), index)),
    awaitTermination: (index = 0) => Deferred.await(arrival(terminationArrivals, index)),
    listeners: (event) => registered.get(event)?.length ?? 0,
    submitted: () => submissions.map((command) => command.args),
    transcript: () => [...transcript],
    pending: () => queue.length + (active ? 1 : 0),
    ended: () => terminations.length,
    emitSubscription: (pdu) => emit("subscription", pdu),
    emitLog: (pdu) => emit("log", pdu),
    emitConnect: () => emit("connect"),
    emitError: (error) => emit("error", error),
    emitEnd: () => {
      latestDisruption = nextSequence()
      cancel("The watchman connection was closed")
      emit("end")
    },
    assertListenersBefore,
    expectTranscript: (expected) => {
      if (!isDeepStrictEqual(transcript, expected))
        throw payloadError(`Watchman client ${construction} transcript`, expected, transcript)
    },
    assertIdle: () => {
      if (!active && queue.length === 0) return
      throw new WatchmanActorError(
        `Watchman client ${construction} is not idle: ${active ? `command ${active.index} is ${active.state}` : "no active command"}, ${queue.length} queued`,
      )
    },
    assertComplete: () => {
      if (plan) {
        if (submissions.length !== plan.commands.length)
          throw new WatchmanActorError(
            `Incomplete Watchman client ${construction} command submissions: expected ${plan.commands.length}, observed ${submissions.length}`,
          )
        if (transcript.length !== plan.commands.length)
          throw new WatchmanActorError(
            `Incomplete Watchman client ${construction} command script: expected ${plan.commands.length}, observed ${transcript.length} (${submissions.length} submitted)`,
          )
        client.expectTranscript(plan.commands)
      }
      client.assertIdle()
    },
  }
  return client
}

function arrival<K, A>(entries: Map<K, Deferred.Deferred<A>>, key: K) {
  const existing = entries.get(key)
  if (existing) return existing
  const created = Deferred.makeUnsafe<A>()
  entries.set(key, created)
  return created
}

function complete<A>(deferred: Deferred.Deferred<A>, value: A) {
  Deferred.doneUnsafe(deferred, Effect.succeed(value))
}

function payloadError(label: string, expected: unknown, received: unknown) {
  return new WatchmanActorError(
    `${label} payload mismatch\nExpected: ${format(expected)}\nReceived: ${format(received)}`,
  )
}

function format(value: unknown) {
  return inspect(value, { breakLength: 120, depth: null, sorted: true })
}
