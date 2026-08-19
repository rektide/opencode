import isGlob from "is-glob"
import micromatch from "micromatch"
import path from "node:path"
import { Deferred, Effect, Fiber, Queue, Schema, Scope } from "effect"
import type { NativeInterface, Subscription, Update } from "../watcher.js"
import { make, type Generation, type Manager, type Route } from "./client.js"
import { resolve } from "./route.js"
import { ClockResponse, SubscribeResponse, SubscriptionPdu, UnsubscribeResponse, WatchmanError } from "./schema.js"

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
      return yield* Effect.gen(function* () {
        const route = yield* resolve(manager, generation, input.target, input.routing)
        const compatible = previous?.route.root === route.root && previous.route.relativeRoot === route.relativeRoot
        const clock = compatible
          ? previous.clock
          : (yield* manager.command(generation, ["clock", route.root], ClockResponse, "subscribe")).clock
        if (previous && !compatible) input.publish({ path: input.target, type: "update" })
        const name = `opencode-${generation.id}-${id}`
        const queue = yield* Queue.unbounded<unknown>()
        generation.subscriptions.set(name, (value) => Queue.offerUnsafe(queue, value))
        const pending = { subscribed: false }
        const options = {
          since: clock,
          ...(route.relativeRoot ? { relative_root: route.relativeRoot } : {}),
          expression: expression(route, input.ignore),
          fields: ["name", "exists", "new", "type"],
        }
        return yield* Effect.gen(function* () {
          const subscribed = yield* manager
            .command(generation, ["subscribe", route.root, name, options], SubscribeResponse, "subscribe")
            .pipe(
              Effect.map((response) => ({ response, clock })),
              Effect.catch((error) =>
                compatible
                  ? Effect.gen(function* () {
                      const current = (yield* manager.command(
                        generation,
                        ["clock", route.root],
                        ClockResponse,
                        "subscribe",
                      )).clock
                      input.publish({ path: input.target, type: "update" })
                      const response = yield* manager.command(
                        generation,
                        ["subscribe", route.root, name, { ...options, since: current }],
                        SubscribeResponse,
                        "subscribe",
                      )
                      return { response, clock: current }
                    })
                  : Effect.fail(error),
              ),
              Effect.tap(() => Effect.sync(() => (pending.subscribed = true))),
            )
          if (subscribed.response.warning)
            yield* Effect.logWarning("watchman subscription warning", {
              name,
              warning: subscribed.response.warning,
            })
          return { generation, route, name, queue, clock: subscribed.clock, closed: false } satisfies State
        }).pipe(
          Effect.onError(() =>
            Effect.gen(function* () {
              generation.subscriptions.delete(name)
              yield* Queue.shutdown(queue)
              if (!pending.subscribed || Deferred.isDoneUnsafe(generation.closed)) return
              yield* manager
                .command(generation, ["unsubscribe", route.root, name], UnsubscribeResponse)
                .pipe(Effect.catchCause(() => Effect.void))
            }),
          ),
        )
      }).pipe(Effect.tapError((error) => manager.retire(generation, error)))
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
          return Effect.sleep("100 millis").pipe(Effect.andThen(reconnect(state, attempt + 1)))
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
            yield* manager.retire(state.generation, "subscription canceled")
          } else {
            state.clock = pdu.clock
            if (pdu.is_fresh_instance) input.publish({ path: input.target, type: "update" })
            else publishFiles(input, state.route, pdu.files)
            return yield* loop(state)
          }
        }
        yield* close(state)
        const next = yield* Effect.raceFirst(
          reconnect(state).pipe(Effect.map((state) => ({ type: "resumed" as const, state }))),
          Deferred.await(stop).pipe(Effect.as({ type: "stopped" as const })),
        )
        if (next.type === "stopped") return
        yield* Effect.logInfo("watchman subscription resumed", {
          path: input.target,
          generation: next.state.generation.id,
          clock: next.state.clock,
        })
        return yield* loop(next.state)
      }).pipe(Effect.onError(() => close(state)))
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

function expression(route: Route, ignore: readonly string[]): readonly unknown[] {
  const terms = ignore.flatMap((value) => {
    if (isGlob(value)) return []
    const relative = path.relative(route.eventRoot, path.resolve(route.eventRoot, value)).split(path.sep).join("/")
    if (!relative || relative === ".." || relative.startsWith("../")) return []
    return [
      ["name", relative, "wholename"],
      ["dirname", relative],
    ]
  })
  return terms.length === 0 ? ["true"] : ["not", ["anyof", ...terms]]
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
