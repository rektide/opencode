import path from "node:path"
import { Effect } from "effect"
import { command, type Generation, type RequestOptions } from "./client.js"
import { WatchResponse, WatchmanError } from "./schema.js"

export type RootIntent =
  | { readonly type: "project"; readonly project: string }
  | { readonly type: "exact"; readonly target: string }

export type Route = {
  readonly root: string
  readonly requested: string
}

export type SubscriptionRoute = Route & {
  readonly relativeRoot: string
  readonly eventRoot: string
}

export function resolve(generation: Generation, intent: RootIntent, options: RequestOptions) {
  const requested = intent.type === "project" ? intent.project : intent.target
  return command(generation, ["watch", requested], WatchResponse, "route", options).pipe(
    Effect.map((response) => ({ root: response.watch, requested }) satisfies Route),
  )
}

export function subscription(route: Route, intent: RootIntent, target: string): SubscriptionRoute {
  if (intent.type === "exact") {
    if (path.resolve(target) !== path.resolve(intent.target))
      throw new WatchmanError("route", "Exact Watchman intent cannot serve another target")
    return { ...route, relativeRoot: "", eventRoot: path.resolve(target) }
  }
  const relativeRoot = path.relative(intent.project, target)
  if (relativeRoot === ".." || relativeRoot.startsWith(`..${path.sep}`))
    throw new WatchmanError("route", "Project Watchman intent cannot serve a target outside the project")
  return {
    ...route,
    relativeRoot: relativeRoot.split(path.sep).join("/"),
    eventRoot: path.resolve(target),
  }
}
