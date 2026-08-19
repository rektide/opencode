import isGlob from "is-glob"
import micromatch from "micromatch"
import path from "node:path"
import { Deferred, Effect, Fiber, Queue, Schema, Scope } from "effect"
import type { NativeInterface, Subscription, Update } from "../watcher"
import { make, type Generation, type Manager, type Route } from "./client"
import { resolve } from "./route"
import { ClockResponse, SubscribeResponse, SubscriptionPdu, UnsubscribeResponse, WatchmanError } from "./schema"

type State = {
  readonly generation: Generation
  readonly route: Route
  readonly name: string
  readonly queue: Queue.Queue<unknown>
  clock: string
  closed: boolean
}

export const makeNative = (fallback: NativeInterface) =>
  Effect.gen(function* () {
    const manager = yield* make
    return makeNativeWith(manager, fallback)
  })

export function makeNativeWith(manager: Manager, fallback: NativeInterface): NativeInterface {
  let subscriptionID = 0
  return {
    subscribe: (input) => {
      if (input.type === "file") return fallback.subscribe(input)
      return watchmanSubscribe(manager, input, ++subscriptionID).pipe(
        Effect.catch((error) =>
          Effect.logWarning("watchman acquisition failed; using parcel watcher", {
            path: input.target,
            routing: input.routing,
            error,
          }).pipe(Effect.andThen(fallback.subscribe(input))),
        ),
      )
    },
  }
}

function watchmanSubscribe(
  manager: Manager,
  input: Parameters<NativeInterface["subscribe"]>[0],
  id: number,
): Effect.Effect<Subscription, WatchmanError, Scope.Scope> {
  const stop = Deferred.makeUnsafe<void>()

  const establish = (previous?: State) =>
    Effect.gen(function* () {
      const generation = yield* manager.current()
      const route = yield* resolve(manager, generation, input.target, input.routing)
      const compatible = previous?.route.root === route.root && previous.route.relativeRoot === route.relativeRoot
      const clock = compatible
        ? previous.clock
        : (yield* manager.command(generation, ["clock", route.root], ClockResponse, "subscribe")).clock
      if (previous && !compatible) input.publish({ path: input.target, type: "update" })
      const name = `opencode-${generation.id}-${id}`
      const queue = yield* Queue.unbounded<unknown>()
      generation.subscriptions.set(name, (value) => Queue.offerUnsafe(queue, value))
      const options = {
        since: clock,
        ...(route.relativeRoot ? { relative_root: route.relativeRoot } : {}),
        expression: ["true"],
        fields: ["name", "exists", "new", "type"],
      }
      const request = ["subscribe", route.root, name, options]
      const subscribed = yield* manager.command(generation, request, SubscribeResponse, "subscribe").pipe(
        Effect.catch((error) =>
          compatible
            ? Effect.gen(function* () {
                const current = (yield* manager.command(generation, ["clock", route.root], ClockResponse, "subscribe"))
                  .clock
                input.publish({ path: input.target, type: "update" })
                return yield* manager.command(
                  generation,
                  ["subscribe", route.root, name, { ...options, since: current }],
                  SubscribeResponse,
                  "subscribe",
                )
              })
            : Effect.fail(error),
        ),
        Effect.tapError(() =>
          Effect.sync(() => {
            generation.subscriptions.delete(name)
            Effect.runFork(Queue.shutdown(queue))
          }),
        ),
      )
      if (subscribed.warning)
        yield* Effect.logWarning("watchman subscription warning", { name, warning: subscribed.warning })
      return { generation, route, name, queue, clock, closed: false } satisfies State
    })

  const close = (state: State) =>
    Effect.gen(function* () {
      if (state.closed) return
      state.closed = true
      state.generation.subscriptions.delete(state.name)
      yield* Queue.shutdown(state.queue)
      if (Deferred.isDoneUnsafe(state.generation.closed)) return
      yield* manager
        .command(state.generation, ["unsubscribe", state.route.root, state.name], UnsubscribeResponse)
        .pipe(Effect.catchCause(() => Effect.void))
    })

  const wait = (state: State) =>
    Effect.raceFirst(
      Queue.take(state.queue).pipe(Effect.map((value) => ({ type: "event" as const, value }))),
      Deferred.await(state.generation.closed).pipe(Effect.as({ type: "closed" as const })),
    ).pipe(Effect.raceFirst(Deferred.await(stop).pipe(Effect.as({ type: "stop" as const }))))

  const run = (initial: State) => {
    const reconnect = (state: State, attempt = 0): Effect.Effect<State, WatchmanError> =>
      establish(state).pipe(
        Effect.catch((error) => {
          if (attempt >= 6) return Effect.fail(error)
          return manager
            .retire(state.generation, error)
            .pipe(Effect.andThen(Effect.sleep("100 millis")), Effect.andThen(reconnect(state, attempt + 1)))
        }),
      )
    const loop = (state: State): Effect.Effect<void, WatchmanError> =>
      Effect.gen(function* () {
        const result = yield* wait(state)
        if (result.type === "stop") return yield* close(state)
        if (result.type === "event") {
          const pdu = yield* Schema.decodeUnknownEffect(SubscriptionPdu)(result.value).pipe(
            Effect.mapError((error) => new WatchmanError("decode", "Invalid Watchman subscription event", error)),
          )
          if (pdu.warning)
            yield* Effect.logWarning("watchman subscription warning", { name: state.name, warning: pdu.warning })
          if ("canceled" in pdu) {
            input.publish({ path: input.target, type: "update" })
          } else {
            state.clock = pdu.clock
            if (pdu.is_fresh_instance) input.publish({ path: input.target, type: "update" })
            else publishFiles(input, state.route, pdu.files)
            return yield* loop(state)
          }
        }
        yield* close(state)
        const next = yield* reconnect(state)
        yield* Effect.logInfo("watchman subscription resumed", {
          path: input.target,
          generation: next.generation.id,
          clock: next.clock,
        })
        return yield* loop(next)
      })
    return loop(initial)
  }

  return Effect.gen(function* () {
    const initial = yield* establish()
    const fiber = yield* run(initial).pipe(
      Effect.catch((error) =>
        Effect.logError("watchman subscription recovery exhausted", { path: input.target, error }).pipe(
          Effect.andThen(Effect.sync(() => input.fail(error))),
        ),
      ),
      Effect.forkScoped({ startImmediately: true }),
    )
    return {
      backend: "watchman",
      unsubscribe: () =>
        Effect.runPromise(Deferred.succeed(stop, undefined).pipe(Effect.andThen(Fiber.join(fiber)), Effect.asVoid)),
    }
  })
}

function publishFiles(
  input: Parameters<NativeInterface["subscribe"]>[0],
  route: Route,
  files: readonly { readonly name: string; readonly exists: boolean; readonly new: boolean; readonly type: string }[],
) {
  const globs = input.ignore.filter((value) => isGlob(value))
  const paths = input.ignore.filter((value) => !isGlob(value)).map((value) => path.resolve(route.eventRoot, value))
  for (const file of files) {
    const target = path.resolve(route.eventRoot, file.name)
    const relative = path.relative(route.eventRoot, target).split(path.sep).join("/")
    if (paths.some((ignored) => target === ignored || target.startsWith(ignored + path.sep))) continue
    if (micromatch.isMatch(relative, globs, { dot: true })) continue
    const type: Update["type"] | undefined =
      file.new && file.exists
        ? "create"
        : file.exists && file.type !== "d"
          ? "update"
          : !file.new && !file.exists
            ? "delete"
            : undefined
    if (type) input.publish({ path: target, type })
  }
}
