import { Deferred, Effect, Schema, Semaphore } from "effect"
import { Client } from "./fb-watchman-esm.js"
import { CapabilityResponse, WatchmanError } from "./schema.js"

const COMMAND_TIMEOUT = "10 seconds"

export type RawClient = {
  readonly end: () => void
  readonly command: (args: readonly unknown[], callback: (error: Error | null, response?: unknown) => void) => void
  readonly capabilityCheck: (
    capabilities: { readonly required: readonly string[] },
    callback: (error: Error | null, response?: unknown) => void,
  ) => void
  readonly on: (event: string, listener: (value?: unknown) => void) => unknown
}

export type Generation = {
  readonly id: number
  readonly client: RawClient
  readonly closed: Deferred.Deferred<void>
  readonly routes: Map<string, Deferred.Deferred<Route, WatchmanError>>
  readonly subscriptions: Map<string, (value: unknown) => void>
}

export type Route = {
  readonly root: string
  readonly relativeRoot: string
  readonly eventRoot: string
}

export type Manager = {
  readonly current: () => Effect.Effect<Generation, WatchmanError>
  readonly command: <A>(
    generation: Generation,
    args: readonly unknown[],
    schema: Schema.Codec<A, unknown, never, never>,
    stage?: WatchmanError["stage"],
  ) => Effect.Effect<A, WatchmanError>
  readonly retire: (generation: Generation, cause?: unknown) => Effect.Effect<void>
}

export const make = Effect.gen(function* () {
  const lock = Semaphore.makeUnsafe(1)
  const generations = new Set<Generation>()
  let active: Generation | undefined
  let next = 0

  const retire = (generation: Generation, cause?: unknown) =>
    Effect.sync(() => {
      if (Deferred.isDoneUnsafe(generation.closed)) return
      Deferred.doneUnsafe(generation.closed, Effect.void)
      generation.client.end()
      generation.routes.clear()
      generation.subscriptions.clear()
      generations.delete(generation)
      if (active === generation) active = undefined
      if (cause) Effect.runFork(Effect.logWarning("watchman connection retired", { generation: generation.id, cause }))
    })

  const command = <A>(
    generation: Generation,
    args: readonly unknown[],
    schema: Schema.Codec<A, unknown, never, never>,
    stage: WatchmanError["stage"] = "command",
  ) =>
    Effect.callback<unknown, WatchmanError>((resume) => {
      generation.client.command(args, (error, value) => {
        if (error) {
          resume(Effect.fail(new WatchmanError(stage, error.message, error)))
          return
        }
        resume(Effect.succeed(value))
      })
    }).pipe(
      Effect.timeoutOrElse({
        duration: COMMAND_TIMEOUT,
        orElse: () =>
          retire(generation, `command timed out: ${String(args[0])}`).pipe(
            Effect.andThen(Effect.fail(new WatchmanError(stage, `Watchman command timed out: ${String(args[0])}`))),
          ),
      }),
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError(
            (error) => new WatchmanError("decode", `Invalid Watchman ${String(args[0])} response`, error),
          ),
        ),
      ),
    )

  const capabilityCheck = (generation: Generation) =>
    Effect.callback<unknown, WatchmanError>((resume) => {
      generation.client.capabilityCheck({ required: ["cmd-watch-project", "relative_root"] }, (error, value) => {
        if (error) {
          resume(Effect.fail(new WatchmanError("connect", error.message, error)))
          return
        }
        resume(Effect.succeed(value))
      })
    }).pipe(
      Effect.timeoutOrElse({
        duration: COMMAND_TIMEOUT,
        orElse: () =>
          retire(generation, "capability check timed out").pipe(
            Effect.andThen(Effect.fail(new WatchmanError("connect", "Watchman capability check timed out"))),
          ),
      }),
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(CapabilityResponse)(value).pipe(
          Effect.mapError((error) => new WatchmanError("decode", "Invalid Watchman capability response", error)),
        ),
      ),
    )

  const create = Effect.gen(function* () {
    const generation: Generation = {
      id: ++next,
      client: new Client(),
      closed: Deferred.makeUnsafe<void>(),
      routes: new Map(),
      subscriptions: new Map(),
    }
    generations.add(generation)
    const disconnect = (cause?: unknown) => Effect.runFork(retire(generation, cause))
    generation.client.on("subscription", (value: unknown) => {
      if (!value || typeof value !== "object" || !("subscription" in value)) return
      const name = Reflect.get(value, "subscription")
      if (typeof name === "string") generation.subscriptions.get(name)?.(value)
    })
    generation.client.on("log", (value: unknown) => Effect.runFork(Effect.logDebug("watchman log", { value })))
    generation.client.on("connect", () => {
      if (Deferred.isDoneUnsafe(generation.closed)) generation.client.end()
    })
    generation.client.on("error", disconnect)
    generation.client.on("end", disconnect)
    yield* capabilityCheck(generation).pipe(Effect.tapError((error) => retire(generation, error)))
    active = generation
    yield* Effect.logInfo("watchman connected", { generation: generation.id })
    return generation
  })

  const current = () =>
    lock.withPermit(
      Effect.gen(function* () {
        if (active && !Deferred.isDoneUnsafe(active.closed)) return active
        return yield* create
      }),
    )

  yield* Effect.addFinalizer(() => Effect.forEach(generations, (generation) => retire(generation)).pipe(Effect.asVoid))
  return { current, command, retire } satisfies Manager
})
