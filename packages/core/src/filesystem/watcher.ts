export * as Watcher from "./watcher.js"

// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper.js"
import type ParcelWatcher from "@parcel/watcher"
import { FileSystem } from "@opencode/schema/filesystem"
import { makeGlobalNode } from "@opencode/util/effect/app-node"
import { FSUtil } from "@opencode/util/fs-util"
import { Cause, Context, Effect, Exit, Layer, PubSub, RcMap, Schema, Scope, Stream } from "effect"
import { lazy } from "../util/lazy.js"
import { watch } from "node:fs"
import path from "path"
import { WatchmanDirectory } from "./watchman/directory.js"
import loadBinding from "./watcher-binding.js"

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
} & (
  | { readonly type: "entries"; readonly names: readonly string[] }
  | { readonly type: "file" | "directory"; readonly names?: readonly string[] }
)

export interface NativeInterface {
  readonly subscribe: (
    input: Target & {
      readonly publish: (update: Update) => void
      /** Signals cached state may be stale; reruns each subscriber's readiness before later updates. */
      readonly invalidate?: () => void
    },
  ) => Effect.Effect<Subscription | undefined>
}

type NativeSignal =
  | { readonly type: "update"; readonly update: Update }
  | { readonly type: "invalidation" }

/** Uses fs.watch for immediate entries and Parcel for recursive directories. */
export class Native extends Context.Service<Native, NativeInterface>()("@opencode/Watcher/Native") {}

export interface Interface {
  /** onReady runs after native acquisition and listener registration, when the stream is consumed. */
  readonly subscribe: (input: WatchInput, onReady?: Effect.Effect<void>) => Effect.Effect<Stream.Stream<Update>>
}

export const Options = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  watchman: Schema.optional(
    Schema.Struct({
      socket: Schema.String,
      commandTimeoutMs: Schema.optional(Schema.Number),
    }),
  ),
})
export type Options = typeof Options.Type

export class Service extends Context.Service<Service, Interface>()("@opencode/Watcher") {}

export interface TestInterface extends Interface {
  /** Delivers one update to every active watch whose target covers `update.path`. */
  readonly emit: (update: Update) => Effect.Effect<void>
  /** Runs the reacquisition readiness of every active watch. */
  readonly invalidate: () => Effect.Effect<void>
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
      const native = yield* Native

      // Keys compare structurally (effect Equal), so equivalent watches share one entry.
      const watchers = yield* RcMap.make({
        lookup: (key: Target) =>
          Effect.gen(function* () {
            const pubsub = yield* Effect.acquireRelease(PubSub.unbounded<NativeSignal>(), (pubsub) =>
              PubSub.shutdown(pubsub),
            )
            const subscription = yield* Effect.acquireRelease(
              native.subscribe({
                ...key,
                publish: (update) => PubSub.publishUnsafe(pubsub, { type: "update", update }),
                invalidate: () => PubSub.publishUnsafe(pubsub, { type: "invalidation" }),
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
              return pubsub
            }
            yield* Effect.logInfo("watcher started", {
              path: key.target,
              type: key.type,
              backend: subscription.backend,
              ignores: key.ignore.length,
            })
            return pubsub
          }),
      })

      const subscribe = Effect.fnUntraced(function* (input: WatchInput, onReady: Effect.Effect<void> = Effect.void) {
        const target = path.resolve(input.path)
        const ignore = [...new Set(input.type === "directory" ? (input.ignore ?? []) : [])].toSorted()
        const names = [...new Set(input.type === "entries" ? input.names : [])].toSorted()
        yield* Effect.logInfo("watcher subscribe", {
          path: target,
          type: input.type,
          ignores: ignore.length,
        })
        return Stream.unwrap(
          Effect.gen(function* () {
            const pubsub = yield* RcMap.get(watchers, { type: input.type, target, ignore, names })
            const subscription = yield* PubSub.subscribe(pubsub)
            if (yield* PubSub.isShutdown(pubsub)) return Stream.empty
            yield* onReady
            return Stream.fromSubscription(subscription).pipe(
              Stream.mapEffect((signal): Effect.Effect<NativeSignal> =>
                signal.type === "invalidation" ? onReady.pipe(Effect.as(signal)) : Effect.succeed(signal),
              ),
              Stream.filter(
                (signal): signal is Extract<NativeSignal, { readonly type: "update" }> => signal.type === "update",
              ),
              Stream.map((signal) => signal.update),
            )
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
    const invalidates = new Set<() => void>()
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
          // Ignore entries resolve against the target like the parcel wrapper's
          // literal paths. Glob entries resolve to paths nothing lives under, so
          // they are inert here rather than compiled the way parcel compiles them.
          const ignored = input.ignore.map((entry) => path.resolve(input.target, entry))
          active.set(input.publish, (target) => {
            if (input.type === "file") return target === input.target
            if (input.type === "entries")
              return path.dirname(target) === input.target && input.names.includes(path.basename(target))
            return FSUtil.contains(input.target, target) && !ignored.some((entry) => FSUtil.contains(entry, target))
          })
          if (input.invalidate) invalidates.add(input.invalidate)
          return {
            unsubscribe: () => {
              active.delete(input.publish)
              if (input.invalidate) invalidates.delete(input.invalidate)
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
      invalidate: () =>
        Effect.sync(() => {
          invalidates.forEach((invalidate) => invalidate())
        }),
      subscriptions: () => Effect.sync(() => [...subscriptions]),
    })
    return Context.empty().pipe(Context.add(Service, test), Context.add(Test, test))
  }),
)

export const nativeLayer = Layer.succeed(Native, Native.of({ subscribe: nativeSubscribe }))

export const nativeNode = makeGlobalNode({ service: Native, layer: nativeLayer, deps: [] })

function nativeSubscribe(input: Parameters<NativeInterface["subscribe"]>[0]): Effect.Effect<Subscription | undefined> {
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
      subscription.on("error", (error: unknown) =>
        Effect.runFork(Effect.logError("watcher callback failed", { path: directory, error })),
      )
      return { unsubscribe: () => Promise.resolve(subscription.close()), backend: "node" }
    })
  }
  return subscribeDirectory(watcher(), getBackend(), input.target, input.ignore, input.publish)
}

export function configured(options?: Options) {
  if (options?.watchman) {
    const validated = WatchmanDirectory.options(options.watchman)
    if (validated instanceof WatchmanDirectory.OptionsError) throw validated
    return makeGlobalNode({
      service: Service,
      layer: layer(options),
      deps: [
        makeGlobalNode({
          service: Native,
          layer: Layer.effect(
            Native,
            Effect.gen(function* () {
              // Supervisor fibers die with the backend; watches stop joined.
              const scope = yield* Scope.make()
              yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
              return Native.of({
                subscribe: (input) =>
                  input.type === "directory"
                    ? WatchmanDirectory.subscribe(validated, scope, input)
                    : nativeSubscribe(input),
              })
            }),
          ),
          deps: [],
        }),
      ],
    })
  }
  return makeGlobalNode({ service: Service, layer: layer(options), deps: [nativeNode] })
}

export const node = configured()

function subscribeDirectory(
  native: typeof ParcelWatcher | undefined,
  backend: ParcelWatcher.BackendType | undefined,
  directory: string,
  ignore: readonly string[],
  publish: (update: Update) => void,
): Effect.Effect<Subscription | undefined> {
  if (!native || !backend) {
    return Effect.logError("watcher backend not supported", { directory, platform: process.platform }).pipe(
      Effect.as(undefined),
    )
  }
  const callback: ParcelWatcher.SubscribeCallback = (error, updates) => {
    if (error) Effect.runFork(Effect.logError("watcher callback failed", { error }))
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
    Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
    Effect.catchCause((cause) =>
      Effect.logError("failed to subscribe", {
        directory,
        cause: Cause.pretty(cause),
      }).pipe(Effect.as(undefined)),
    ),
  )
}
