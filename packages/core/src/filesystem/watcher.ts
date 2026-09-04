export * as Watcher from "./watcher.js"

// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"
import type ParcelWatcher from "@parcel/watcher"
import { FileSystem } from "@opencode-ai/schema/filesystem"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { FSUtil } from "@opencode-ai/util/fs-util"
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
  | { readonly path: string; readonly type: "entries"; readonly names: readonly string[] }
  | { readonly path: string; readonly type: "directory"; readonly ignore?: readonly string[] }

export type Subscription = {
  readonly unsubscribe: () => Promise<void>
  /** Backend name for logging, e.g. "node" or "fs-events". */
  readonly backend?: string
}

type Target = {
  readonly target: string
  readonly ignore: readonly string[]
  readonly placement: WatcherInternal.Placement
} & (
  | { readonly type: "entries"; readonly names: readonly string[] }
  | { readonly type: "file" | "directory"; readonly names?: readonly string[] }
)

export interface NativeInterface {
  /** Starts one OS-level watch, reporting events through `publish` until unsubscribed. */
  readonly subscribe: (
    input: Target & {
      readonly publish: (update: Update) => void
      readonly invalidate: (reason: WatcherInternal.ContinuityReason) => void
      readonly fail: (error: Error) => void
    },
  ) => Effect.Effect<Subscription | undefined, never, Scope.Scope>
}

/**
 * The OS-level watch implementation behind the Watcher service. The default
 * layer uses `node:fs.watch` for files and `@parcel/watcher` for directories;
 * tests provide implementations they can control.
 */
export class Native extends Context.Service<Native, NativeInterface>()("@opencode/Watcher/Native") {}

export interface Interface {
  /** onReady runs after native acquisition and listener registration, when the stream is consumed. */
  readonly subscribe: (input: WatchInput, onReady?: Effect.Effect<void>) => Effect.Effect<Stream.Stream<Update, Error>>
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
  /** Delivers one update to every active watch whose target covers `update.path`. */
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
      const watchers = yield* RcMap.make({
        lookup: (key: Target) =>
          Effect.gen(function* () {
            const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<Update>(), (pubsub) => PubSub.shutdown(pubsub))
            const invalidations = yield* Effect.acquireRelease(
              PubSub.unbounded<WatcherInternal.ContinuityReason>(),
              (pubsub) => PubSub.shutdown(pubsub),
            )
            const failure = Deferred.makeUnsafe<void, Error>()
            const subscription = yield* Effect.acquireRelease(
              native.subscribe({
                ...key,
                publish: (update) => PubSub.publishUnsafe(pubsub, update),
                invalidate: (reason) => PubSub.publishUnsafe(invalidations, reason),
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
              return { pubsub, invalidations, failure, active: false }
            }
            yield* Effect.logInfo("watcher started", {
              path: key.target,
              type: key.type,
              backend: subscription.backend,
              ignores: key.ignore.length,
            })
            return { pubsub, invalidations, failure, active: true }
          }),
      })

      const subscribe = Effect.fnUntraced(function* (input: WatchInput, onReady: Effect.Effect<void> = Effect.void) {
        const normalized = WatcherInternal.normalize(input)
        const target = normalized.path
        const ignore = normalized.type === "directory" ? (normalized.ignore ?? []) : []
        const names = normalized.type === "entries" ? normalized.names : []
        const metadata = WatcherInternal.read(input)
        const placement =
          input.type === "directory" ? (metadata?.placement ?? { type: "exact" as const }) : { type: "exact" as const }
        const ready = metadata?.ready
        const invalidated = metadata?.invalidated
        let acknowledged = false
        yield* Effect.logInfo("watcher subscribe", {
          path: target,
          type: input.type,
          ignores: ignore.length,
        })
        const key: Target =
          normalized.type === "entries"
            ? { type: normalized.type, target, ignore, names, placement }
            : { type: normalized.type, target, ignore, placement }
        return Stream.unwrap(
          Effect.gen(function* () {
            const entry = yield* RcMap.get(watchers, key)
            const subscription = yield* PubSub.subscribe(entry.pubsub)
            if (invalidated) {
              const controls = yield* PubSub.subscribe(entry.invalidations)
              yield* Stream.fromSubscription(controls).pipe(
                Stream.runForEach((reason) => Effect.sync(() => invalidated(reason))),
                Effect.forkScoped({ startImmediately: true }),
              )
            }
            if (yield* PubSub.isShutdown(entry.pubsub)) return Stream.empty
            if (entry.active && !acknowledged) {
              acknowledged = true
              ready?.()
              yield* onReady
            }
            return Stream.fromSubscription(subscription).pipe(Stream.interruptWhen(Deferred.await(entry.failure)))
          }),
        )
      })

      return Service.of({ subscribe })
    }),
  )

/** Real subscription lifecycle with in-memory, path-filtered event delivery. */
export const testLayer = Layer.effectContext(
  Effect.gen(function* () {
    const subscriptions: WatchInput[] = []
    const active = new Map<(update: Update) => void, (path: string) => boolean>()
    const native = Native.of({
      subscribe: (input) =>
        Effect.sync(() => {
          subscriptions.push(
            input.type === "file"
              ? { path: input.target, type: "file" }
              : input.type === "entries"
                ? { path: input.target, type: "entries", names: input.names }
                : input.ignore.length > 0
                  ? { path: input.target, type: "directory", ignore: input.ignore }
                  : { path: input.target, type: "directory" },
          )
          const ignored = input.ignore.map((entry) => path.resolve(input.target, entry))
          active.set(input.publish, (target) => {
            if (input.type === "file") return target === input.target
            if (input.type === "entries")
              return path.dirname(target) === input.target && input.names.includes(path.basename(target))
            return FSUtil.contains(input.target, target) && !ignored.some((entry) => FSUtil.contains(entry, target))
          })
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
      emit: (update) =>
        Effect.sync(() => {
          const target = path.resolve(update.path)
          active.forEach((matches, publish) => {
            if (matches(target)) publish(update)
          })
        }),
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
        if (input.type === "file" || input.type === "entries") {
          return Effect.sync(() => {
            const directory = input.type === "file" ? path.dirname(input.target) : input.target
            const names = new Set(input.type === "file" ? [path.basename(input.target)] : input.names)
            const subscription = watch(directory, { recursive: false }, (_event, file) => {
              if (file && !names.has(file)) return
              for (const name of file ? [file] : names) {
                input.publish({ path: path.join(directory, name), type: "update" })
              }
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
