import path from "node:path"
import { Deferred, Effect } from "effect"
import type { Generation, Manager, Route } from "./client.ts"
import { WatchResponse, WatchmanError } from "./schema.ts"

export function resolve(
  manager: Manager,
  generation: Generation,
  target: string,
  routing: "project" | "exact",
): Effect.Effect<Route, WatchmanError> {
  const key = `${routing}:${target}`
  const found = generation.routes.get(key)
  if (found) return Deferred.await(found)
  const deferred = Deferred.makeUnsafe<Route, WatchmanError>()
  generation.routes.set(key, deferred)
  return Deferred.complete(
    deferred,
    manager
      .command(generation, [routing === "project" ? "watch-project" : "watch", target], WatchResponse, "route")
      .pipe(
        Effect.map((response) => {
          const relativeRoot = routing === "project" ? (response.relative_path ?? "") : ""
          return {
            root: response.watch,
            relativeRoot,
            eventRoot: path.resolve(response.watch, relativeRoot),
          }
        }),
        Effect.tapError(() => Effect.sync(() => generation.routes.delete(key))),
      ),
  ).pipe(Effect.andThen(Deferred.await(deferred)))
}
