import { Deferred, Duration, Effect, Schema, Semaphore } from "effect"
import { CapabilityResponse, GenerationClosed, WatchmanError } from "./schema.js"

const TRANSPORT = "@superbfowle/fb-watchman-esm"
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

export type RawClientFactory = () => RawClient

export type Generation = {
  readonly id: number
  readonly client: RawClient
  readonly command: Semaphore.Semaphore
  readonly closed: Deferred.Deferred<void>
  readonly subscriptions: Map<string, (value: unknown) => void>
}

export type RequestOptions = {
  readonly close: (cause?: unknown) => Effect.Effect<void>
  readonly timeout?: Duration.Input
}

export const loadFactory = Effect.gen(function* () {
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => import(TRANSPORT) as Promise<unknown>,
    catch: (cause) => new WatchmanError("connect", "Failed to load Watchman transport", cause),
  })
  if (!loaded || typeof loaded !== "object")
    return yield* Effect.fail(new WatchmanError("connect", "Invalid Watchman transport module"))
  const Client = Reflect.get(loaded, "Client")
  if (typeof Client !== "function")
    return yield* Effect.fail(new WatchmanError("connect", "Watchman transport has no client export"))
  return () => {
    const client: unknown = Reflect.construct(Client, [])
    if (!isRawClient(client)) throw new WatchmanError("connect", "Watchman transport returned an invalid client")
    return client
  }
})

export function makeGeneration(id: number, client: RawClient): Generation {
  return {
    id,
    client,
    command: Semaphore.makeUnsafe(1),
    closed: Deferred.makeUnsafe<void>(),
    subscriptions: new Map(),
  }
}

export function command<A>(
  generation: Generation,
  args: readonly unknown[],
  schema: Schema.Codec<A, unknown>,
  stage: WatchmanError["stage"],
  options: RequestOptions,
) {
  return admitted(
    generation,
    String(args[0]),
    (callback) => generation.client.command(args, callback),
    schema,
    stage,
    options,
  )
}

export function capabilities(generation: Generation, options: RequestOptions) {
  return admitted(
    generation,
    "capabilityCheck",
    (callback) => generation.client.capabilityCheck({ required: ["relative_root"] }, callback),
    CapabilityResponse,
    "connect",
    options,
  )
}

function admitted<A>(
  generation: Generation,
  label: string,
  submit: (callback: (error: Error | null, response?: unknown) => void) => void,
  schema: Schema.Codec<A, unknown>,
  stage: WatchmanError["stage"],
  options: RequestOptions,
) {
  const closed = (submitted: boolean) =>
    Deferred.await(generation.closed).pipe(Effect.andThen(Effect.fail(new GenerationClosed(submitted))))
  const execute = Effect.gen(function* () {
    if (Deferred.isDoneUnsafe(generation.closed)) return yield* Effect.fail(new GenerationClosed(false))
    const response = Effect.callback<unknown, WatchmanError>((resume) => {
      submit((error, value) => {
        if (error) return resume(Effect.fail(new WatchmanError(stage, error.message, error)))
        resume(Effect.succeed(value))
      })
    }).pipe(
      Effect.timeoutOrElse({
        duration: options.timeout ?? COMMAND_TIMEOUT,
        orElse: () =>
          options
            .close(`${label} timed out`)
            .pipe(Effect.andThen(Effect.fail(new WatchmanError(stage, `Watchman command timed out: ${label}`)))),
      }),
      Effect.flatMap((value) =>
        Schema.decodeUnknownEffect(schema)(value).pipe(
          Effect.mapError((error) => new WatchmanError("decode", `Invalid Watchman ${label} response`, error)),
        ),
      ),
    )
    return yield* Effect.raceFirst(response, closed(true))
  })
  return Effect.raceFirst(generation.command.withPermit(execute), closed(false))
}

function isRawClient(value: unknown): value is RawClient {
  return (
    !!value &&
    typeof value === "object" &&
    typeof Reflect.get(value, "end") === "function" &&
    typeof Reflect.get(value, "command") === "function" &&
    typeof Reflect.get(value, "capabilityCheck") === "function" &&
    typeof Reflect.get(value, "on") === "function"
  )
}
