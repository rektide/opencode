import { Bus } from "@opencode/core/bus"
import { Location } from "@opencode/core/location"
import { LocationServiceMap } from "@opencode/core/location-service-map"
import { Project } from "@opencode/core/project"
import { ServiceUnavailableError } from "@opencode/protocol/errors"
import { Cause, Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const LocationHandler = HttpApiBuilder.group(Api, "server.location", (handlers) =>
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
    return handlers
      .handle(
        "location.get",
        Effect.fn(function* () {
          const location = yield* Location.Service
          const project = yield* Project.Service
          const resolved = yield* project.resolve(location.directory)
          if (
            location.project.id !== resolved.id ||
            location.project.directory !== resolved.directory ||
            location.project.canonical !== resolved.canonical ||
            location.vcs?.type !== resolved.vcs?.type
          )
            yield* locations.invalidate(
              Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
            )
          const info = (yield* project.list()).find((item) => item.id === resolved.id)
          const bus = yield* Effect.serviceOption(Bus.Service)
          if (info && Option.isSome(bus)) yield* bus.value.publish(Project.Event.Updated, info)
          return new Location.Info({
            directory: location.directory,
            project: {
              id: resolved.id,
              directory: resolved.directory,
              canonical: resolved.canonical,
            },
          })
        }),
      )
      .handle("location.reload", () =>
        LocationServiceMap.reload().pipe(
          Effect.provideService(LocationServiceMap.Service, locations),
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.fail(new ServiceUnavailableError({ message: Cause.pretty(cause), service: "location" })),
          ),
        ),
      )
  }),
)
