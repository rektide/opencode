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
            yield* supervise(input, options, openSession, nonce, gates).pipe(
              Effect.forkIn(scope, { startImmediately: true }),
            )
            return {
              backend: "watchman",
              unsubscribe: () => Effect.runPromise(Scope.close(scope, Exit.void)),
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
  input: Parameters<Watcher.NativeInterface["subscribe"]>[0],
  options: Options,
  openSession: WatchmanSession.Open,
  nonce: string,
  gates: Map<string, Semaphore.Semaphore>,
) {
  return Effect.gen(function* () {
    let generation = 0
    let attempt = 0
    for (;;) {
      generation++
      const failure = yield* runGeneration(input, options, openSession, nonce, generation, gates, () => (attempt = 0)).pipe(
        Effect.flip,
      )
      yield* Effect.logWarning("Watchman subscription unavailable", {
        path: input.target,
        reason: failure.reason,
        message: failure.message,
      })
      const cap = failure.reason === "rejection" ? 30_000 : failure.reason === "target" ? 1_000 : 10_000
      yield* Effect.sleep(Duration.millis(Math.min(cap, 100 * 2 ** Math.min(attempt++, 16))))
    }
  })
}

function runGeneration(
  input: Parameters<Watcher.NativeInterface["subscribe"]>[0],
  options: Options,
  openSession: WatchmanSession.Open,
  nonce: string,
  generation: number,
  gates: Map<string, Semaphore.Semaphore>,
  installed: () => void,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const canonicalRoot = yield* Effect.tryPromise(() => fs.realpath(input.target)).pipe(
        Effect.mapError((error) => new Failure({ reason: "target", message: String(error) })),
      )
      const gate = gates.get(canonicalRoot) ?? Semaphore.makeUnsafe(1)
      gates.set(canonicalRoot, gate)
      const attached = yield* gate.withPermit(
        Effect.gen(function* () {
          const signals = yield* Queue.unbounded<Signal>()
          const session = yield* openSession(
            options,
            (push) => Queue.offerUnsafe(signals, { type: "push", push }),
            (failure) => Queue.offerUnsafe(signals, { type: "lost", failure }),
          ).pipe(Effect.mapError(sessionFailure))
          const version = yield* session.request({ type: "version", required: capabilities }).pipe(
            Effect.mapError(sessionFailure),
          )
          if (version.type === "rejection")
            return yield* Effect.fail(new Failure({ reason: "rejection", message: version.message }))
          if (version.type !== "version")
            return yield* Effect.fail(new Failure({ reason: "protocol", message: "version reply had the wrong type" }))
          const missing = capabilities.filter((capability) => version.capabilities[capability] !== true)
          if (missing.length > 0)
            return yield* Effect.fail(
              new Failure({ reason: "protocol", message: `missing Watchman capabilities: ${missing.join(", ")}` }),
            )

          const watched = yield* session.request({ type: "watch", root: canonicalRoot }).pipe(
            Effect.mapError(sessionFailure),
          )
          if (watched.type === "rejection")
            return yield* Effect.fail(new Failure({ reason: "rejection", message: watched.message }))
          if (watched.type !== "watch" || watched.watch !== canonicalRoot || watched.relativePath)
            return yield* Effect.fail(
              new Failure({ reason: "protocol", message: "watch reply did not preserve the exact canonical root" }),
            )

          const clocked = yield* session.request({ type: "clock", root: canonicalRoot }).pipe(
            Effect.mapError(sessionFailure),
          )
          if (clocked.type === "rejection")
            return yield* Effect.fail(new Failure({ reason: "rejection", message: clocked.message }))
          if (clocked.type !== "clock")
            return yield* Effect.fail(new Failure({ reason: "protocol", message: "clock reply had the wrong type" }))

          const name = `opencode-${nonce}-${generation}`
          const subscribed = yield* session
            .request({ type: "subscribe", root: canonicalRoot, name, since: clocked.clock })
            .pipe(Effect.mapError(sessionFailure))
          if (subscribed.type === "rejection")
            return yield* Effect.fail(new Failure({ reason: "rejection", message: subscribed.message }))
          if (subscribed.type !== "subscribe" || subscribed.subscribe !== name)
            return yield* Effect.fail(
              new Failure({ reason: "protocol", message: "subscribe reply did not match the requested name" }),
            )
          while (Option.isSome(yield* Queue.poll(signals))) {}
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

      installed()
      yield* Effect.sync(() => input.invalidate?.())
      yield* Effect.sleep("30 seconds").pipe(
        Effect.andThen(Queue.offer(attached.signals, { type: "heartbeat" })),
        Effect.forever,
        Effect.forkScoped({ startImmediately: true }),
      )
      for (;;) {
        const signal = yield* Queue.take(attached.signals)
        if (signal.type === "lost") return yield* Effect.fail(sessionFailure(signal.failure))
        if (signal.type === "heartbeat") {
          const reply = yield* attached.session.request({ type: "clock", root: attached.canonicalRoot }).pipe(
            Effect.mapError(sessionFailure),
          )
          if (reply.type === "rejection")
            return yield* Effect.fail(new Failure({ reason: "rejection", message: reply.message }))
          if (reply.type !== "clock" || clockIdentity(reply.clock) !== attached.identity)
            return yield* Effect.fail(new Failure({ reason: "protocol", message: "Watchman root identity changed" }))
          continue
        }
        if (signal.push.subscription !== attached.name) continue
        if (signal.push.type === "canceled")
          return yield* Effect.fail(new Failure({ reason: "rejection", message: "Watchman canceled the subscription" }))
        if (signal.push.fresh) yield* Effect.sync(() => input.invalidate?.())
        for (const row of signal.push.files) {
          const result = WatchmanMapping.map(attached.mapping, row)
          if (result._tag === "Invalid")
            return yield* Effect.fail(new Failure({ reason: "protocol", message: result.reason }))
          if (result._tag === "Mapped") input.publish(result.update)
        }
      }
    }),
  )
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
