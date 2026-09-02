import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { Project } from "@opencode-ai/core/project"
import { Bus } from "@opencode-ai/core/bus"
import { Effect, Option } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ProjectNotFoundError } from "@opencode-ai/protocol/errors"

export const ProjectHandler = HttpApiBuilder.group(Api, "server.project", (handlers) =>
  handlers
    .handle("project.list", () => Project.Service.use((project) => project.list()))
    .handle("project.update", (ctx) =>
      Project.Service.use((project) =>
        project.update({ ...ctx.payload, projectID: ctx.params.projectID }).pipe(
          Effect.mapError(
            () =>
              new ProjectNotFoundError({
                projectID: ctx.params.projectID,
                message: `Project not found: ${ctx.params.projectID}`,
              }),
          ),
        ),
      ),
    )
    .handle("project.current", () =>
      Effect.gen(function* () {
        const location = yield* Location.Service
        const project = yield* Project.Service
        const resolved = yield* project.resolve(location.directory)
        if (
          location.project.id !== resolved.id ||
          location.project.directory !== resolved.directory ||
          location.project.canonical !== resolved.canonical ||
          location.vcs?.type !== resolved.vcs?.type
        ) {
          const locations = yield* Effect.serviceOption(LocationServiceMap.Service)
          if (Option.isSome(locations))
            yield* locations.value.invalidate(
              Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
            )
        }
        const info = (yield* project.list()).find((item) => item.id === resolved.id)
        const bus = yield* Effect.serviceOption(Bus.Service)
        if (info && Option.isSome(bus)) yield* bus.value.publish(Project.Event.Updated, info)
        return {
          id: resolved.id,
          directory: resolved.directory,
          canonical: resolved.canonical,
          vcs: resolved.vcs?.type,
        }
      }),
    ),
)
