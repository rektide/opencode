export * as WatchmanDirectory from "./directory.js"

import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import { Duration, Effect, Exit, Layer, Option, Queue, Schema, Scope, Semaphore } from "effect"
import { Watcher } from "../../watcher.js"
import { WatchmanMapping } from "./mapping.js"
import { WatchmanProtocol } from "./protocol.js"
import { WatchmanSession } from "./session.js"

export const capabilities = [
  "cmd-watch",
  "cmd-clock",
  "cmd-subscribe",
  "cmd-unsubscribe",
  "field-name",
  "field-exists",
  "field-type",
] as const

export type Options = {
  readonly socket: string
  readonly commandTimeoutMs: number
}

class Failure extends Schema.TaggedError<Failure>()("WatchmanControllerFailure", {
  reason: Schema.Literals(["target", "availability", "rejection", "protocol"]),
  message: Schema.String,
}) {}

type Signal =
  | { readonly type: "push"; readonly push: WatchmanProtocol.Push }
  | { readonly type: "lost"; readonly failure: WatchmanSession.Failure }
  | { readonly type: "heartbeat" }

type ControllerState = {
  generation: number
  released: boolean
}

type Input = Parameters<Watcher.NativeInterface["subscribe"]>[0]

type Attached = {
  readonly canonicalRoot: string
  readonly identity: string
  readonly mapping: WatchmanMapping.Compiled
  readonly name: string
  readonly session: WatchmanSession.Interface
  readonly signals: Queue.Queue<Signal>
}

export const make = (
  inherited: Watcher.NativeInterface,
  options: Options,
  openSession: WatchmanSession.Open = WatchmanSession.open,
): Effect.Effect<Watcher.NativeInterface> =>
  Effect.sync(() => {
    const gates = new Map<string, Semaphore.Semaphore>()
    const nonce = randomUUID()
    return Watcher.Native.of({
      subscribe: (input) => {
        if (input.type !== "directory") return inherited.subscribe(input)
        return Effect.uninterruptible(
          Effect.gen(function* () {
            const scope = yield* Scope.make()
            const state: ControllerState = { generation: 0, released: false }
            yield* supervise(input, options, openSession, nonce, gates, state).pipe(
              Effect.forkIn(scope, { startImmediately: true }),
            )
            return {
              backend: "watchman",
              unsubscribe: () => {
                state.released = true
                return Effect.runPromise(Scope.close(scope, Exit.void))
              },
            }
          }),
        )
      },
    })
  })

export const layer = (options: Options, openSession: WatchmanSession.Open = WatchmanSession.open) =>
  Layer.effect(
    Watcher.Native,
    Effect.gen(function* () {
      const inherited = yield* Watcher.Native
      return yield* make(inherited, options, openSession)
    }),
  )

function supervise(
  input: Input,
  options: Options,
  openSession: WatchmanSession.Open,
  nonce: string,
  gates: Map<string, Semaphore.Semaphore>,
  state: ControllerState,
) {
  return Effect.gen(function* () {
    let attempt = 0
    for (;;) {
      const generation = ++state.generation
      const failure = yield* runGeneration(
        input,
        options,
        openSession,
        nonce,
        generation,
        gates,
        state,
        () => (attempt = 0),
      ).pipe(Effect.flip)
      yield* Effect.logWarning("Watchman subscription unavailable", {
        path: input.target,
        reason: failure.reason,
        message: failure.message,
      })
      const delay =
        failure.reason === "target"
          ? 1_000
          : Math.min(failure.reason === "rejection" ? 30_000 : 10_000, 100 * 2 ** Math.min(attempt++, 16))
      yield* Effect.sleep(Duration.millis(delay))
    }
  })
}

function runGeneration(
  input: Input,
  options: Options,
  openSession: WatchmanSession.Open,
  nonce: string,
  generation: number,
  gates: Map<string, Semaphore.Semaphore>,
  state: ControllerState,
  installed: () => void,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const attached = yield* attach(input, options, openSession, nonce, generation, gates, state)

      yield* Effect.addFinalizer(() =>
        attached.session
          .send({ type: "unsubscribe", root: attached.canonicalRoot, name: attached.name })
          .pipe(Effect.ignore),
      )
      yield* ensureCurrent(state, generation)
      installed()
      yield* Effect.sync(() => input.invalidate?.())
      yield* Effect.sleep("30 seconds").pipe(
        Effect.andThen(Queue.offer(attached.signals, { type: "heartbeat" })),
        Effect.forever,
        Effect.forkScoped({ startImmediately: true }),
      )
      for (;;) {
        const signal = yield* Queue.take(attached.signals)
        yield* ensureCurrent(state, generation)
        if (signal.type === "lost") return yield* Effect.fail(sessionFailure(signal.failure))
        if (signal.type === "heartbeat") {
          yield* checkHeartbeat(attached)
          continue
        }
        yield* publish(input, attached, signal.push, state, generation)
      }
    }),
  )
}

function attach(
  input: Input,
  options: Options,
  openSession: WatchmanSession.Open,
  nonce: string,
  generation: number,
  gates: Map<string, Semaphore.Semaphore>,
  state: ControllerState,
): Effect.Effect<Attached, Failure, Scope.Scope> {
  return Effect.gen(function* () {
    const canonicalRoot = yield* Effect.tryPromise(() => fs.realpath(input.target)).pipe(
      Effect.mapError((error) => new Failure({ reason: "target", message: String(error) })),
    )
    yield* ensureCurrent(state, generation)
    const gate = gates.get(canonicalRoot) ?? Semaphore.makeUnsafe(1)
    gates.set(canonicalRoot, gate)
    return yield* gate.withPermit(
      Effect.gen(function* () {
        yield* ensureCurrent(state, generation)
        const signals = yield* Queue.unbounded<Signal>()
        const session = yield* openSession(
          options,
          (push) => Queue.offerUnsafe(signals, { type: "push", push }),
          (failure) => Queue.offerUnsafe(signals, { type: "lost", failure }),
        ).pipe(Effect.mapError(sessionFailure))
        yield* ensureCurrent(state, generation)
        const version = yield* session.request({ type: "version", required: capabilities }).pipe(
          Effect.mapError(sessionFailure),
        )
        yield* ensureCurrent(state, generation)
        if (version.type === "rejection")
          return yield* Effect.fail(new Failure({ reason: "rejection", message: version.message }))
        if (version.type !== "version")
          return yield* Effect.fail(new Failure({ reason: "protocol", message: "version reply had the wrong type" }))
        const missing = capabilities.filter((capability) => !version.capabilities[capability])
        if (missing.length > 0)
          return yield* Effect.fail(
            new Failure({ reason: "protocol", message: `missing Watchman capabilities: ${missing.join(", ")}` }),
          )

        const watched = yield* session.request({ type: "watch", root: canonicalRoot }).pipe(
          Effect.mapError(sessionFailure),
        )
        yield* ensureCurrent(state, generation)
        if (watched.type === "rejection")
          return yield* Effect.fail(new Failure({ reason: "rejection", message: watched.message }))
        if (watched.type !== "watch" || watched.watch !== canonicalRoot || watched.relativePath)
          return yield* Effect.fail(
            new Failure({ reason: "protocol", message: "watch reply did not preserve the exact canonical root" }),
          )

        const clocked = yield* session.request({ type: "clock", root: canonicalRoot }).pipe(
          Effect.mapError(sessionFailure),
        )
        yield* ensureCurrent(state, generation)
        if (clocked.type === "rejection")
          return yield* Effect.fail(new Failure({ reason: "rejection", message: clocked.message }))
        if (clocked.type !== "clock")
          return yield* Effect.fail(new Failure({ reason: "protocol", message: "clock reply had the wrong type" }))

        const name = `opencode-${nonce}-${generation}`
        const subscribed = yield* session
          .request({ type: "subscribe", root: canonicalRoot, name, since: clocked.clock })
          .pipe(Effect.mapError(sessionFailure))
        yield* ensureCurrent(state, generation)
        if (subscribed.type === "rejection")
          return yield* Effect.fail(new Failure({ reason: "rejection", message: subscribed.message }))
        if (subscribed.type !== "subscribe" || subscribed.subscribe !== name)
          return yield* Effect.fail(
            new Failure({ reason: "protocol", message: "subscribe reply did not match the requested name" }),
          )
        yield* discardPreinstall(signals, name)
        yield* ensureCurrent(state, generation)
        return {
          canonicalRoot,
          identity: clockIdentity(clocked.clock),
          mapping: WatchmanMapping.compile({
            logicalRoot: input.target,
            canonicalRoot,
            ignore: input.ignore,
          }),
          name,
          session,
          signals,
        }
      }),
    )
  })
}

function checkHeartbeat(attached: Attached) {
  return Effect.gen(function* () {
    const reply = yield* attached.session.request({ type: "clock", root: attached.canonicalRoot }).pipe(
      Effect.mapError(sessionFailure),
    )
    if (reply.type === "rejection")
      return yield* Effect.fail(new Failure({ reason: "rejection", message: reply.message }))
    if (reply.type !== "clock" || clockIdentity(reply.clock) !== attached.identity)
      return yield* Effect.fail(new Failure({ reason: "protocol", message: "Watchman root identity changed" }))
    return undefined
  })
}

function publish(
  input: Input,
  attached: Attached,
  push: WatchmanProtocol.Push,
  state: ControllerState,
  generation: number,
) {
  if (push.subscription !== attached.name) return Effect.void
  if (push.type === "canceled")
    return Effect.fail(new Failure({ reason: "rejection", message: "Watchman canceled the subscription" }))
  return Effect.gen(function* () {
    if (push.fresh) yield* Effect.sync(() => input.invalidate?.())
    yield* Effect.forEach(push.files, (row) => {
      const result = WatchmanMapping.map(attached.mapping, row)
      if (result._tag === "Invalid") return Effect.fail(new Failure({ reason: "protocol", message: result.reason }))
      if (result._tag === "Ignored") return Effect.void
      return ensureCurrent(state, generation).pipe(Effect.andThen(Effect.sync(() => input.publish(result.update))))
    })
  })
}

function discardPreinstall(signals: Queue.Queue<Signal>, name: string) {
  return Effect.gen(function* () {
    for (;;) {
      const signal = yield* Queue.poll(signals)
      if (Option.isNone(signal)) return
      if (signal.value.type === "lost") {
        yield* Effect.fail(sessionFailure(signal.value.failure))
        return
      }
      if (signal.value.type === "heartbeat") continue
      if (signal.value.push.type === "canceled" && signal.value.push.subscription === name) {
        yield* Effect.fail(new Failure({ reason: "rejection", message: "Watchman canceled the subscription" }))
        return
      }
    }
  })
}

function ensureCurrent(state: ControllerState, generation: number) {
  return !state.released && state.generation === generation ? Effect.void : Effect.interrupt
}

function sessionFailure(failure: WatchmanSession.Failure) {
  return new Failure({
    reason: failure.reason === "protocol" ? "protocol" : "availability",
    message: failure.message,
  })
}

function clockIdentity(clock: string) {
  const parts = clock.split(":")
  return parts.length > 2 ? parts.slice(0, -1).join(":") : clock
}
