import { Effect } from "effect"
import { Watcher } from "../../watcher.js"
import { loadFactory } from "./client.js"
import { makeRegistry, type Options } from "./root.js"

export const make = (fallback: Watcher.NativeInterface, options?: Options) =>
  Effect.gen(function* () {
    const factory = yield* loadFactory(options?.binary)
    const registry = yield* makeRegistry(factory, options)
    return Watcher.Native.of({
      subscribe: (input) => {
        if (input.type === "file") return fallback.subscribe(input)
        const intent =
          input.placement.type === "project"
            ? { type: "project" as const, project: input.placement.root }
            : { type: "exact" as const, target: input.target }
        return registry.subscribe(intent, input).pipe(
          Effect.catch((error) =>
            Effect.logWarning("watchman acquisition failed; using parcel watcher", {
              path: input.target,
              intent,
              error,
            }).pipe(Effect.andThen(fallback.subscribe(input))),
          ),
        )
      },
    })
  })
