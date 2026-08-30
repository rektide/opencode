import isGlob from "is-glob"
import micromatch from "micromatch"
import path from "node:path"
import { Deferred, Duration, Effect, Fiber, Queue, RcMap, Schema, Scope, Semaphore } from "effect"
import type { Watcher } from "../../watcher.js"
import { capabilities, command, makeGeneration, type Generation, type RawClientFactory } from "./client.js"
import { resolve, subscription, type RootIntent, type Route, type SubscriptionRoute } from "./route.js"
import {
  ClockResponse,
  GenerationClosed,
  SubscribeResponse,
  SubscriptionPdu,
  UnsubscribeResponse,
  WatchmanError,
} from "./schema.js"

type Input = Parameters<Watcher.NativeInterface["subscribe"]>[0]

type RootGeneration = {
  readonly generation: Generation
  readonly route: Route
}

type Established = {
  readonly root: RootGeneration
  readonly route: SubscriptionRoute
  readonly name: string
}

type SubscriptionState = {
  readonly id: number
  readonly input: Input
  readonly queue: Queue.Queue<unknown>
  readonly stop: Deferred.Deferred<void>
  clock?: string
  established?: Established
}

export type Options = {
  readonly commandTimeout?: Duration.Input
  readonly retryBaseMs?: number
  readonly retryCapMs?: number
}

export type Registry = {
  readonly subscribe: (
    intent: RootIntent,
    input: Input,
  ) => Effect.Effect<Watcher.Subscription, WatchmanError, Scope.Scope>
}

const RETRY_BASE_MS = 100
const RETRY_CAP_MS = 3200

export const makeRegistry = (factory: RawClientFactory, options?: Options) =>
  Effect.gen(function* () {
    const roots = yield* RcMap.make({
      lookup: (intent: RootIntent) => makeConnection(intent, factory, options),
    })
    return {
      subscribe: (intent, input) =>
        Effect.gen(function* () {
          const connection = yield* RcMap.get(roots, intent)
          return yield* connection.subscribe(input)
        }),
    } satisfies Registry
  })

const makeConnection = (intent: RootIntent, factory: RawClientFactory, options?: Options) =>
  Effect.gen(function* () {
    const generations = new Set<Generation>()
    const subscriptions = new Map<number, SubscriptionState>()
    const connection = Semaphore.makeUnsafe(1)
    const scope = yield* Effect.scope
    const state: {
      active?: RootGeneration
      fatal?: WatchmanError
      recovering?: Deferred.Deferred<RootGeneration, WatchmanError>
    } = {}
    let nextGeneration = 0
    let nextSubscription = 0

    const close = (generation: Generation, cause?: unknown) =>
      Effect.sync(() => {
        if (Deferred.isDoneUnsafe(generation.closed)) return
        Deferred.doneUnsafe(generation.closed, Effect.void)
        generation.client.end()
        generation.subscriptions.clear()
        generations.delete(generation)
        if (state.active?.generation === generation) state.active = undefined
        if (cause)
          Effect.runFork(
            Effect.logWarning("watchman root connection closed", {
              intent,
              generation: generation.id,
              cause,
            }),
          )
      })

    const requestOptions = (generation: Generation) => ({
      close: (cause?: unknown) => close(generation, cause),
      timeout: options?.commandTimeout,
    })

    const create = Effect.gen(function* () {
      const client = yield* Effect.try({
        try: factory,
        catch: (cause) => new WatchmanError("connect", "Failed to create Watchman client", cause),
      })
      const generation = makeGeneration(++nextGeneration, client)
      generations.add(generation)
      const disconnect = (cause?: unknown) => Effect.runFork(close(generation, cause))
      client.on("subscription", (value: unknown) => {
        if (!value || typeof value !== "object" || !("subscription" in value)) return
        const name = Reflect.get(value, "subscription")
        if (typeof name === "string") generation.subscriptions.get(name)?.(value)
      })
      client.on("log", (value: unknown) => Effect.runFork(Effect.logDebug("watchman log", { intent, value })))
      client.on("connect", () => {
        if (Deferred.isDoneUnsafe(generation.closed)) client.end()
      })
      client.on("error", disconnect)
      client.on("end", disconnect)
      return yield* Effect.gen(function* () {
        const capability = yield* capabilities(generation, requestOptions(generation))
        if (capability.warning)
          yield* Effect.logWarning("watchman capability warning", { intent, warning: capability.warning })
        const route = yield* resolve(generation, intent, requestOptions(generation))
        const active = { generation, route } satisfies RootGeneration
        state.active = active
        yield* Effect.logInfo("watchman root connected", { intent, generation: generation.id, root: route.root })
        return active
      }).pipe(Effect.onError(() => close(generation)))
    })

    const current = () =>
      connection.withPermit(
        Effect.gen(function* () {
          if (state.fatal) return yield* Effect.fail(state.fatal)
          if (state.active && !Deferred.isDoneUnsafe(state.active.generation.closed)) return state.active
          if (state.recovering) return yield* Deferred.await(state.recovering)
          return yield* create.pipe(
            Effect.tapError((error) =>
              Effect.sync(() => {
                if (error.stage === "decode" || error.stage === "route") state.fatal = error
              }),
            ),
          )
        }),
      )

    const establish = (item: SubscriptionState, root: RootGeneration, previous?: Established) =>
      Effect.gen(function* () {
        const route = yield* Effect.try({
          try: () => subscription(root.route, intent, item.input.target),
          catch: (cause) =>
            cause instanceof WatchmanError ? cause : new WatchmanError("route", "Invalid subscription route", cause),
        })
        const compatible =
          previous?.route.root === route.root && previous.route.relativeRoot === route.relativeRoot && !!item.clock
        const initialClock = compatible
          ? item.clock!
          : (yield* command(
              root.generation,
              ["clock", route.root],
              ClockResponse,
              "subscribe",
              requestOptions(root.generation),
            )).clock
        if (previous && !compatible) item.input.publish({ path: item.input.target, type: "update" })
        const name = `opencode-${root.generation.id}-${item.id}`
        root.generation.subscriptions.set(name, (value) => Queue.offerUnsafe(item.queue, value))
        const subscribe = (clock: string) =>
          command(
            root.generation,
            [
              "subscribe",
              route.root,
              name,
              {
                since: clock,
                ...(route.relativeRoot ? { relative_root: route.relativeRoot } : {}),
                expression: expression(route, item.input.ignore),
                fields: ["name", "exists", "new", "type"],
              },
            ],
            SubscribeResponse,
            "subscribe",
            requestOptions(root.generation),
          ).pipe(Effect.map((response) => ({ response, clock })))
        return yield* subscribe(initialClock).pipe(
          Effect.catch((error) => {
            if (!compatible || Deferred.isDoneUnsafe(root.generation.closed)) return Effect.fail(error)
            return command(
              root.generation,
              ["clock", route.root],
              ClockResponse,
              "subscribe",
              requestOptions(root.generation),
            ).pipe(
              Effect.tap(() => Effect.sync(() => item.input.publish({ path: item.input.target, type: "update" }))),
              Effect.flatMap((clock) => subscribe(clock.clock)),
            )
          }),
          Effect.tap(({ response, clock }) =>
            Effect.sync(() => {
              item.clock = clock
              if (response.warning)
                Effect.runFork(Effect.logWarning("watchman subscription warning", { name, warning: response.warning }))
            }),
          ),
          Effect.map(() => ({ root, route, name }) satisfies Established),
          Effect.tap((established) => Effect.sync(() => (item.established = established))),
          Effect.onError(() => Effect.sync(() => root.generation.subscriptions.delete(name))),
        )
      })

    const detach = (item: SubscriptionState, established: Established, unsubscribe: boolean) =>
      Effect.sync(() => {
        established.root.generation.subscriptions.delete(established.name)
        if (item.established === established) item.established = undefined
        if (!unsubscribe || Deferred.isDoneUnsafe(established.root.generation.closed)) return
        Effect.runFork(
          command(
            established.root.generation,
            ["unsubscribe", established.route.root, established.name],
            UnsubscribeResponse,
            "command",
            requestOptions(established.root.generation),
          ).pipe(Effect.ignore),
        )
      })

    const recoverable = (error: WatchmanError) =>
      error instanceof GenerationClosed ||
      error.stage === "connect" ||
      error.stage === "command" ||
      error.stage === "reconnect" ||
      (error.stage === "subscribe" &&
        !!state.active?.generation &&
        Deferred.isDoneUnsafe(state.active.generation.closed))

    const recoverRoot = (attempt = 0): Effect.Effect<RootGeneration, WatchmanError> => {
      const interval = Math.min(
        options?.retryCapMs ?? RETRY_CAP_MS,
        (options?.retryBaseMs ?? RETRY_BASE_MS) * 2 ** attempt,
      )
      return Effect.sync(() => interval * (0.7 + Math.random() * 0.6)).pipe(
        Effect.flatMap(Effect.sleep),
        Effect.andThen(create),
        Effect.catch((error) => {
          if (error.stage === "decode" || error.stage === "route") {
            state.fatal = error
            return Effect.fail(error)
          }
          return recoverRoot(attempt + 1)
        }),
      )
    }

    const replacement = () =>
      Effect.gen(function* () {
        const result = yield* connection.withPermit(
          Effect.gen(function* () {
            if (state.fatal) return yield* Effect.fail(state.fatal)
            if (state.active && !Deferred.isDoneUnsafe(state.active.generation.closed))
              return { type: "active" as const, root: state.active }
            if (state.recovering) return { type: "pending" as const, deferred: state.recovering }
            const deferred = Deferred.makeUnsafe<RootGeneration, WatchmanError>()
            state.recovering = deferred
            yield* recoverRoot().pipe(
              Deferred.into(deferred),
              Effect.ensuring(
                Effect.sync(() => {
                  if (state.recovering === deferred) state.recovering = undefined
                }),
              ),
              Effect.forkIn(scope),
            )
            return { type: "pending" as const, deferred }
          }),
        )
        if (result.type === "active") return result.root
        return yield* Deferred.await(result.deferred)
      })

    const reconnect = (item: SubscriptionState, previous: Established): Effect.Effect<Established, WatchmanError> =>
      replacement().pipe(
        Effect.flatMap((root) => establish(item, root, previous)),
        Effect.catch((error) => (recoverable(error) ? reconnect(item, previous) : Effect.fail(error))),
      )

    const wait = (item: SubscriptionState, established: Established) =>
      Effect.raceFirst(
        Queue.take(item.queue).pipe(Effect.map((value) => ({ type: "event" as const, value }))),
        Deferred.await(established.root.generation.closed).pipe(Effect.as({ type: "closed" as const })),
      ).pipe(Effect.raceFirst(Deferred.await(item.stop).pipe(Effect.as({ type: "stop" as const }))))

    const loop = (item: SubscriptionState, established: Established): Effect.Effect<void, WatchmanError> =>
      Effect.gen(function* () {
        const result = yield* wait(item, established)
        if (result.type === "stop") return yield* detach(item, established, true)
        if (result.type === "closed") {
          yield* detach(item, established, false)
          const next = yield* Effect.raceFirst(
            reconnect(item, established).pipe(Effect.map((established) => ({ type: "resumed" as const, established }))),
            Deferred.await(item.stop).pipe(Effect.as({ type: "stopped" as const })),
          )
          if (next.type === "stopped") return yield* Effect.void
          return yield* loop(item, next.established)
        }
        const pdu = yield* Schema.decodeUnknownEffect(SubscriptionPdu)(result.value).pipe(
          Effect.mapError((error) => new WatchmanError("decode", "Invalid Watchman subscription event", error)),
        )
        if (pdu.warning)
          yield* Effect.logWarning("watchman subscription warning", { name: established.name, warning: pdu.warning })
        if ("canceled" in pdu) {
          item.input.publish({ path: item.input.target, type: "update" })
          yield* detach(item, established, false)
          const root = yield* current()
          const next = yield* establish(item, root, established).pipe(
            Effect.catch((error) => (recoverable(error) ? reconnect(item, established) : Effect.fail(error))),
          )
          return yield* loop(item, next)
        }
        item.clock = pdu.clock
        if (pdu.is_fresh_instance) {
          item.input.publish({ path: item.input.target, type: "update" })
          return yield* loop(item, established)
        }
        publishFiles(item.input, established.route, pdu.files)
        return yield* loop(item, established)
      })

    const subscribe = (input: Input) =>
      Effect.gen(function* () {
        const item: SubscriptionState = {
          id: ++nextSubscription,
          input,
          queue: yield* Queue.unbounded<unknown>(),
          stop: Deferred.makeUnsafe<void>(),
        }
        subscriptions.set(item.id, item)
        return yield* Effect.gen(function* () {
          const initial = yield* current().pipe(Effect.flatMap((root) => establish(item, root)))
          const fiber = yield* loop(item, initial).pipe(
            Effect.catch((error) => Effect.sync(() => input.fail(error))),
            Effect.ensuring(
              Effect.suspend(() => (item.established ? detach(item, item.established, true) : Effect.void)).pipe(
                Effect.andThen(Effect.sync(() => subscriptions.delete(item.id))),
                Effect.andThen(Queue.shutdown(item.queue)),
              ),
            ),
            Effect.forkScoped({ startImmediately: true }),
          )
          return {
            backend: "watchman",
            unsubscribe: () =>
              Effect.runPromise(
                Deferred.succeed(item.stop, undefined).pipe(Effect.andThen(Fiber.join(fiber)), Effect.asVoid),
              ),
          } satisfies Watcher.Subscription
        }).pipe(
          Effect.onError(() =>
            Effect.sync(() => subscriptions.delete(item.id)).pipe(Effect.andThen(Queue.shutdown(item.queue))),
          ),
        )
      })

    yield* Effect.addFinalizer(() => Effect.forEach(generations, (generation) => close(generation)).pipe(Effect.asVoid))
    return { subscribe }
  })

function expression(route: SubscriptionRoute, ignore: readonly string[]): readonly unknown[] {
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
  input: Input,
  route: SubscriptionRoute,
  files: readonly { readonly name: string; readonly exists: boolean; readonly new: boolean; readonly type: string }[],
) {
  const globs = input.ignore.filter((value) => isGlob(value))
  const paths = input.ignore.filter((value) => !isGlob(value)).map((value) => path.resolve(route.eventRoot, value))
  files
    .flatMap((file) => {
      const target = path.resolve(route.eventRoot, file.name)
      const relative = path.relative(route.eventRoot, target).split(path.sep).join("/")
      if (paths.some((ignored) => target === ignored || target.startsWith(ignored + path.sep))) return []
      if (micromatch.isMatch(relative, globs, { dot: true })) return []
      const type: Watcher.Update["type"] | undefined =
        file.new && file.exists
          ? "create"
          : file.exists && file.type !== "d"
            ? "update"
            : !file.new && !file.exists
              ? "delete"
              : undefined
      return type ? [{ path: target, type }] : []
    })
    .forEach(input.publish)
}
