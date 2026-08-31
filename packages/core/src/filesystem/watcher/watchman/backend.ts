import { Effect } from "effect"
import { Watcher } from "../../watcher.js"
import { loadFactory } from "./client.js"
import { DEFAULT_METRICS_INTERVAL_MS } from "./metrics.js"
import { makeRegistry, type Options } from "./root.js"

export const make = (fallback: Watcher.NativeInterface, options?: Options) =>
  Effect.gen(function* () {
    const factory = yield* loadFactory(options?.binary)
    const registry = yield* makeRegistry(factory, {
      ...options,
      // Watchman is opt-in, so its users get channel metrics by default; direct
      // registry callers (tests) opt in explicitly.
      metricsIntervalMs: options?.metricsIntervalMs ?? DEFAULT_METRICS_INTERVAL_MS,
    })
    return Watcher.Native.of({
      subscribe: (input) => {
        if (input.type === "file") return fallback.subscribe(input)
        const intent =
          input.placement.type === "project"
            ? { type: "project" as const, project: input.placement.root }
            : { type: "exact" as const, target: input.target }
        return registry.subscribe(intent, input).pipe(
          Effect.catch((error) => {
            registry.metrics.fallback()
            return Effect.logWarning("watchman acquisition failed; using parcel watcher", {
              path: input.target,
              intent,
              error,
            }).pipe(Effect.andThen(fallback.subscribe(input)))
          }),
        )
      },
    })
  })
