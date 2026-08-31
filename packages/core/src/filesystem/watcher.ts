export * as Watcher from "./watcher.js"

// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"
import type ParcelWatcher from "@parcel/watcher"
import { FileSystem } from "@opencode-ai/schema/filesystem"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Cause, Context, Deferred, Effect, Layer, PubSub, RcMap, Schema, Scope, Stream } from "effect"
import { lazy } from "../util/lazy.js"
import { watch } from "node:fs"
import path from "path"
import loadBinding from "./watcher-binding.js"
import { WatcherInternal } from "./watcher/internal.js"

const SUBSCRIBE_TIMEOUT_MS = 10_000
export const Event = { Updated: FileSystem.Event.Changed }

const watcher = lazy((): typeof ParcelWatcher | undefined => {
  try {
    return createWrapper(loadBinding()) as typeof ParcelWatcher
  } catch {
    return
  }
})

function getBackend() {
  if (process.platform === "win32") return "windows"
  if (process.platform === "darwin") return "fs-events"
  if (process.platform === "linux") return "inotify"
}

export const hasNativeBinding = () => !!watcher()
export type Update = ParcelWatcher.Event

export type WatchInput =
  | { readonly path: string; readonly type: "file" }
  | { readonly path: string; readonly type: "directory"; readonly ignore?: readonly string[] }

export type Subscription = {
  readonly unsubscribe: () => Promise<void>
  /** Backend name for logging, e.g. "node" or "fs-events". */
  readonly backend?: string
}

export interface NativeInterface {
  /** Starts one OS-level watch, reporting events through `publish` until unsubscribed. */
  readonly subscribe: (input: {
    readonly type: WatchInput["type"]
    readonly target: string
    readonly ignore: readonly string[]
    readonly placement: WatcherInternal.Placement
    readonly publish: (update: Update) => void
    readonly fail: (error: Error) => void
  }) => Effect.Effect<Subscription | undefined, never, Scope.Scope>
}

/**
 * The OS-level watch implementation behind the Watcher service. The default
 * layer uses `node:fs.watch` for files and `@parcel/watcher` for directories;
 * tests provide implementations they can control.
 */
export class Native extends Context.Service<Native, NativeInterface>()("@opencode/Watcher/Native") {}

export interface Interface {
  readonly subscribe: (input: WatchInput) => Effect.Effect<Stream.Stream<Update, Error>>
}

export const Options = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  backend: Schema.optional(Schema.Literals(["watchman", "parcel"])),
  // Parcel acquisition deadline in millis.
  subscribeTimeoutMs: Schema.optional(Schema.Number),
  watchman: Schema.optional(
    Schema.Struct({
      commandTimeoutMs: Schema.optional(Schema.Number),
      retryBaseMs: Schema.optional(Schema.Number),
      retryCapMs: Schema.optional(Schema.Number),
      binary: Schema.optional(Schema.String),
      metricsIntervalMs: Schema.optional(Schema.Number),
      metricsMode: Schema.optional(Schema.Literals(["wide", "lines"])),
    }),
  ),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@opencode/Watcher") {}

export interface TestInterface extends Interface {
  /** Broadcasts one update to every subscriber. */
  readonly emit: (update: Update) => Effect.Effect<void>
  /** Returns every subscribe call observed so far, in order. */
  readonly subscriptions: () => Effect.Effect<readonly WatchInput[]>
}

export class Test extends Context.Service<Test, TestInterface>()("@opencode/Watcher/Test") {}

export const layer = (options?: Options) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      if (options?.enabled === false) {
        return Service.of({ subscribe: () => Effect.succeed(Stream.empty) })
      }
      const fallback = yield* Native
      const native =
        options?.backend === "watchman"
          ? yield* Effect.promise(() => import("./watcher/watchman/backend.js")).pipe(
              Effect.flatMap(({ make }) => make(fallback, options?.watchman)),
              Effect.catch((error) =>
                Effect.logWarning("watchman backend unavailable; using parcel watcher", { error }).pipe(
                  Effect.as(fallback),
                ),
              ),
            )
          : fallback

      // Keys compare structurally (effect Equal), so equivalent watches share one entry.
      type Key = {
        readonly type: WatchInput["type"]
        readonly target: string
        readonly ignore: readonly string[]
        readonly placement: WatcherInternal.Placement
      }
      const watchers = yield* RcMap.make({
        lookup: (key: Key) =>
          Effect.gen(function* () {
            const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<Update>(), (pubsub) => PubSub.shutdown(pubsub))
            const failure = Deferred.makeUnsafe<void, Error>()
            const subscription = yield* Effect.acquireRelease(
              native.subscribe({
                type: key.type,
                target: key.target,
                ignore: key.ignore,
                placement: key.placement,
                publish: (update) => PubSub.publishUnsafe(pubsub, update),
                fail: (error) => Deferred.doneUnsafe(failure, Effect.fail(error)),
              }),
              (subscription) =>
                subscription
                  ? Effect.promise(() => subscription.unsubscribe()).pipe(
                      Effect.ignoreCause,
                      Effect.andThen(Effect.logInfo("watcher stopped", { path: key.target, type: key.type })),
                    )
                  : Effect.void,
              // Native subscription may stay pending up to SUBSCRIBE_TIMEOUT_MS;
              // scope shutdown must not wait behind an uninterruptible acquisition.
              { interruptible: true },
            )
            if (!subscription) {
              // Unsupported backend: end subscriber streams instead of hanging them.
              yield* PubSub.shutdown(pubsub)
              return { pubsub, failure, active: false }
            }
            yield* Effect.logInfo("watcher started", {
              path: key.target,
              type: key.type,
              backend: subscription.backend,
              ignores: key.ignore.length,
            })
            return { pubsub, failure, active: true }
          }),
      })

      const subscribe = (input: WatchInput) => {
        const normalized = WatcherInternal.normalize(input)
        const target = normalized.path
        const ignore = normalized.type === "directory" ? (normalized.ignore ?? []) : []
        const metadata = WatcherInternal.read(input)
        const placement =
          input.type === "file" ? { type: "exact" as const } : (metadata?.placement ?? { type: "exact" as const })
        const ready = metadata?.ready
        let acknowledged = false
        return Effect.gen(function* () {
          yield* Effect.logInfo("watcher subscribe", {
            path: target,
            type: input.type,
            ignores: ignore.length,
          })
          return Stream.unwrap(
            Effect.gen(function* () {
              const entry = yield* RcMap.get(watchers, { type: input.type, target, ignore, placement })
              if (entry.active && !acknowledged) {
                acknowledged = true
                ready?.()
              }
              return Stream.fromPubSub(entry.pubsub).pipe(Stream.interruptWhen(Deferred.await(entry.failure)))
            }),
          )
        })
      }

      return Service.of({ subscribe })
    }),
  )

/**
 * Watcher for tests: the real lifecycle over an in-memory Native that records
 * acquired watches and broadcasts emitted updates to every active watch.
 */
export const testLayer = Layer.effectContext(
  Effect.gen(function* () {
    const subscriptions: WatchInput[] = []
    const active = new Set<(update: Update) => void>()
    const native = Native.of({
      subscribe: (input) =>
        Effect.sync(() => {
          subscriptions.push(
            input.type === "file"
              ? { path: input.target, type: "file" }
              : input.ignore.length > 0
                ? { path: input.target, type: "directory", ignore: input.ignore }
                : { path: input.target, type: "directory" },
          )
          active.add(input.publish)
          return {
            unsubscribe: () => {
              active.delete(input.publish)
              return Promise.resolve()
            },
          }
        }),
    })
    const context = yield* Layer.build(layer().pipe(Layer.provide(Layer.succeed(Native, native))))
    const test = Test.of({
      subscribe: Context.get(context, Service).subscribe,
      emit: (update) => Effect.sync(() => active.forEach((publish) => publish(update))),
      subscriptions: () => Effect.sync(() => [...subscriptions]),
    })
    return Context.empty().pipe(Context.add(Service, test), Context.add(Test, test))
  }),
)

export const nativeLayer = (subscribeTimeoutMs: number = SUBSCRIBE_TIMEOUT_MS) =>
  Layer.succeed(
    Native,
    Native.of({
      subscribe: (input) => {
        if (input.type === "file") {
          return Effect.sync(() => {
            const directory = path.dirname(input.target)
            const subscription = watch(directory, { recursive: false }, (_event, file) => {
              if (file && path.resolve(directory, file.toString()) !== input.target) return
              input.publish({ path: input.target, type: "update" } satisfies Update)
            })
            if ("on" in subscription && typeof subscription.on === "function") {
              subscription.on("error", (error: unknown) =>
                input.fail(
                  error instanceof Error ? error : new Error("File watcher callback failed", { cause: error }),
                ),
              )
            }
            return { unsubscribe: () => Promise.resolve(subscription.close()), backend: "node" }
          })
        }
        return subscribeDirectory(
          watcher(),
          getBackend(),
          input.target,
          input.ignore,
          input.publish,
          input.fail,
          subscribeTimeoutMs,
        )
      },
    }),
  )

const nativeNodeWith = (subscribeTimeoutMs: number) =>
  makeGlobalNode({ service: Native, layer: nativeLayer(subscribeTimeoutMs), deps: [] })

export const nativeNode = nativeNodeWith(SUBSCRIBE_TIMEOUT_MS)

export function configured(options?: Options) {
  return makeGlobalNode({
    service: Service,
    layer: layer(options),
    deps: [nativeNodeWith(options?.subscribeTimeoutMs ?? SUBSCRIBE_TIMEOUT_MS)],
  })
}

export const node = configured()

function subscribeDirectory(
  native: typeof ParcelWatcher | undefined,
  backend: ParcelWatcher.BackendType | undefined,
  directory: string,
  ignore: readonly string[],
  publish: (update: Update) => void,
  fail: (error: Error) => void,
  subscribeTimeoutMs: number,
): Effect.Effect<Subscription | undefined> {
  if (!native || !backend) {
    return Effect.logError("watcher backend not supported", { directory, platform: process.platform }).pipe(
      Effect.as(undefined),
    )
  }
  const callback: ParcelWatcher.SubscribeCallback = (error, updates) => {
    if (error) fail(error)
    for (const update of updates) publish(update)
  }
  // Copy `ignore`: it aliases the RcMap key, whose structural hash is cached,
  // so the array handed to native code must never be the mutable original.
  const pending = native.subscribe(directory, callback, { ignore: [...ignore], backend })
  return Effect.promise(() => pending).pipe(
    Effect.map((subscription) => ({ unsubscribe: () => subscription.unsubscribe(), backend })),
    // Interruption (including the timeout below) abandons the pending native
    // subscription, so close it once it eventually resolves.
    Effect.onInterrupt(() =>
      Effect.sync(() => {
        pending.then((subscription) => subscription.unsubscribe()).catch(() => {})
      }),
    ),
    Effect.timeout(subscribeTimeoutMs),
    Effect.catchCause((cause) =>
      Effect.logError("failed to subscribe", {
        directory,
        cause: Cause.pretty(cause),
      }).pipe(Effect.as(undefined)),
    ),
  )
}
