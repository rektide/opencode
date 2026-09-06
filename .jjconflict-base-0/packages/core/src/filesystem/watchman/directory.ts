export * as WatchmanDirectory from "./directory.js"

import { randomUUID } from "node:crypto"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Scope } from "effect"
import type { Watcher } from "../watcher.js"
import { Mapping } from "./mapping.js"
import { Protocol } from "./protocol.js"
import { Session } from "./session.js"

/**
 * The Watchman directory backend.
 *
 * One controller per watch key runs a single supervisor fiber: resolve the
 * canonical root, serialize the attach sequence per canonical root, install
 * the subscription, then serve pushes until something disturbs it — socket
 * loss, heartbeat identity change, daemon cancellation, or release. Every
 * install emits one invalidation through the W1 seam, so each subscriber's
 * readiness rescans authoritative state; daemon rows are only hints.
 *
 * `subscribe` returns immediately. Before the first install the watch is
 * pending; during daemon loss it is stale-but-live with bounded backoff.
 * There is no fallback to Parcel and the stream never ends.
 */

export interface Options {
  readonly socket: string
  readonly commandTimeoutMs: number
  /** Test seam: heartbeat cadence, 30 s in production. */
  readonly heartbeatMs?: number
}

export class OptionsError extends Schema.TaggedError<OptionsError>()("WatchmanOptionsError", {
  reason: Schema.String,
}) {
  override get message() {
    return `invalid watchman options: ${this.reason}`
  }
}

const DEFAULT_HEARTBEAT_MS = 30_000
const MISSING_POLL_MS = 1_000

type DirectoryInput = Parameters<Watcher.NativeInterface["subscribe"]>[0]

interface Live {
  readonly session: Session.Session
  readonly compiled: Mapping.Compiled
  readonly subscription: string
  readonly root: string
  readonly identity: string
}

/** Validates raw options once; a failure must fail construction loudly. */
export const options = (input: {
  readonly socket?: string | undefined
  readonly commandTimeoutMs?: number | undefined
}): Options | OptionsError => {
  const socket = input.socket ?? ""
  if (socket === "") return new OptionsError({ reason: "socket path is required" })
  if (!path.isAbsolute(socket)) return new OptionsError({ reason: `socket path must be absolute: ${socket}` })
  const timeout = input.commandTimeoutMs
  if (timeout !== undefined && (!Number.isInteger(timeout) || timeout < 1))
    return new OptionsError({ reason: `commandTimeoutMs must be a positive integer: ${timeout}` })
  return { socket, commandTimeoutMs: timeout ?? 10_000 }
}

/** Serializes attach sequences per canonical root so same-root construction cannot race. */
const rootLocks = new Map<string, Deferred.Deferred<void>>()
const nonce = randomUUID().split("-")[0]
let counter = 0

/**
 * Subscribes one directory watch. Returns immediately with a subscription
 * whose supervisor attaches in the background; `unsubscribe` stops it and
 * awaits joined cleanup. `scope` owns supervisor fibers for backend shutdown.
 */
export const subscribe = (
  options: Options,
  scope: Scope.Scope,
  input: DirectoryInput,
): Effect.Effect<Watcher.Subscription> =>
  Effect.gen(function* () {
    const supervisor = yield* supervise(options, `opencode-${nonce}`, input).pipe(Effect.forkIn(scope))
    let stopped = false
    return {
      backend: "watchman",
      unsubscribe: () => {
        if (stopped) return Promise.resolve()
        stopped = true
        return Effect.runPromise(Fiber.interrupt(supervisor))
      },
    }
  })

/** Attach, serve until disturbed, close; the supervisor loop classifies failures and backs off. */
const supervise = (options: Options, prefix: string, input: DirectoryInput): Effect.Effect<void> =>
  Effect.gen(function* () {
    let attempt = 0
    while (true) {
      // A fresh subscription name per attempt cannot collide with a
      // daemon-retained predecessor session after reconnects.
      const subscription = `${prefix}-${++counter}`
      const exit = yield* attemptOnce(options, subscription, input).pipe(Effect.exit)
      if (Exit.isSuccess(exit)) {
        attempt = 0
        continue
      }
      const failure = Option.getOrElse(Cause.findErrorOption(exit.cause), () =>
        new Session.TransportError({ reason: "attach failed without a classified error" }),
      )
      yield* Effect.logWarning("watchman watch disturbed", {
        target: input.target,
        failure: failure.message,
      })
      const cap = failure._tag === "WatchmanRejected" ? 30_000 : 10_000
      yield* Effect.sleep(Math.min(cap, 100 * 2 ** Math.min(attempt, 8)))
      attempt++
    }
  })

const attemptOnce = (
  options: Options,
  subscription: string,
  input: DirectoryInput,
): Effect.Effect<void, Session.Failure> =>
  Effect.gen(function* () {
    const target = path.resolve(input.target)
    const canonical = yield* resolveCanonical(target)
    if (canonical === undefined) {
      yield* Effect.logDebug("watchman watch target missing", { target })
      yield* Effect.sleep(MISSING_POLL_MS)
      return
    }
    const compiled = Mapping.compile(target, canonical, input.ignore)
    const disturb = yield* Deferred.make<Session.Failure>()
    let live: Live | undefined

    // Socket callbacks run on the node event loop; they only latch the
    // disturbance deferred, never mutate state directly.
    const disturbFromCallback = (failure: Session.Failure) => {
      if (live) Effect.runFork(Deferred.succeed(disturb, failure))
    }

    yield* Session.open(
      { socket: options.socket, commandTimeoutMs: options.commandTimeoutMs },
      (frame) => {
        if (frame.type === "canceled") {
          disturbFromCallback(new Session.TransportError({ reason: "subscription canceled by daemon" }))
          return
        }
        if (frame.type !== "push" || !live) return
        if (frame.subscription !== live.subscription) return
        // A fresh instance is a complete set that omits recrawl deletions:
        // rerun subscriber readiness before this batch's rows.
        if (frame.fresh) input.invalidate?.()
        for (const update of Mapping.rows(live.compiled, frame.files)) input.publish(update)
      },
      disturbFromCallback,
    ).pipe(
      Effect.flatMap((session) =>
        Effect.gen(function* () {
          const clock = yield* withRootLock(canonical, attach(session, canonical, subscription))
          live = { session, compiled, subscription, root: canonical, identity: Protocol.identity(clock) }
          // The one rule: every install reruns subscriber readiness, which
          // also covers writes made before the first attach.
          input.invalidate?.()
          yield* Effect.logInfo("watchman watch attached", { target, canonical, subscription })
          const heartbeat = yield* heartbeatLoop(disturb, () => live, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS).pipe(
            Effect.forkChild({ startImmediately: true }),
          )
          yield* Deferred.await(disturb)
          yield* Fiber.interrupt(heartbeat)
        }),
      ),
      Effect.ensuring(
        Effect.suspend(() =>
          live
            ? live.session.close({ type: "unsubscribe", root: live.root, name: live.subscription })
            : Effect.void,
        ),
      ),
    )
  })

const attach = (
  session: Session.Session,
  canonical: string,
  subscription: string,
): Effect.Effect<string, Session.Failure> =>
  Effect.gen(function* () {
    const version = yield* session.request({ type: "version", required: [...Protocol.REQUIRED_CAPABILITIES] })
    const missing = Protocol.REQUIRED_CAPABILITIES.filter((capability) => version.capabilities[capability] !== true)
    if (missing.length > 0)
      return yield* new Session.RejectedError({ error: `daemon lacks capabilities: ${missing.join(", ")}` })
    const watched = yield* session.request({ type: "watch", root: canonical })
    if (watched.type !== "watch" || watched.watch !== canonical)
      return yield* new Session.ProtocolError({ reason: `watch returned a different root: ${watched.watch}` })
    const clocked = yield* session.request({ type: "clock", root: canonical })
    if (clocked.type !== "clock") return yield* new Session.ProtocolError({ reason: "clock reply missing" })
    yield* session.request({ type: "subscribe", root: canonical, name: subscription, since: clocked.clock })
    return clocked.clock
  })

const heartbeatLoop = (
  disturb: Deferred.Deferred<Session.Failure>,
  live: () => Live | undefined,
  heartbeatMs: number,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep(heartbeatMs)
      const current = live()
      if (!current) return
      const exit = yield* current.session.request({ type: "clock", root: current.root }).pipe(Effect.exit)
      if (Exit.isFailure(exit)) {
        yield* Deferred.succeed(
          disturb,
          Option.getOrElse(Cause.findErrorOption(exit.cause), () =>
            new Session.TransportError({ reason: "heartbeat failed" }),
          ),
        )
        return
      }
      if (Protocol.identity(exit.value.clock) !== current.identity) {
        yield* Deferred.succeed(disturb, new Session.TransportError({ reason: "daemon root identity changed" }))
        return
      }
    }
  })

/** Serializes attach sequences per canonical root so same-root construction cannot race. */
const withRootLock = <A, E>(canonical: string, effect: Effect.Effect<A, E>): Effect.Effect<A, E> =>
  Deferred.make<void>().pipe(
    Effect.flatMap((mine) => {
      const previous = rootLocks.get(canonical)
      rootLocks.set(canonical, mine)
      const release = Effect.suspend(() => {
        if (rootLocks.get(canonical) === mine) rootLocks.delete(canonical)
        return Deferred.succeed(mine, undefined)
      })
      return (previous ? Deferred.await(previous) : Effect.void).pipe(Effect.andThen(effect), Effect.ensuring(release))
    }),
  )

const resolveCanonical = (target: string) =>
  Effect.option(Effect.tryPromise(() => realpath(target))).pipe(
    Effect.map((result) => Option.getOrUndefined(result)),
  )
