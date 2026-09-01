import { Bus } from "@opencode-ai/core/bus"
import { Event } from "@opencode-ai/schema/event"
import { Effect, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { ControlledEventFeed } from "../controlled-event-feed"
import { EventFeed } from "../event-feed"

export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const feed = yield* EventFeed.Service
    const controlled = yield* ControlledEventFeed.Service
    return handlers
      .handleRaw("event.subscribe", () =>
        Effect.gen(function* () {
          const connected = {
            id: Event.ID.create(),
            type: "server.connected",
            data: {},
          } as const
          return response(
            Stream.unwrap(
              feed.subscribe.pipe(
                Effect.map((live) => Stream.make(EventFeed.frame(connected)).pipe(Stream.concat(live))),
              ),
            ),
          )
        }),
      )
      .handleRaw("event.controlled.subscribe", () => controlled.subscribe.pipe(Effect.map(response)))
      .handle("event.controlled.replaceInterests", (ctx) =>
        controlled
          .replaceInterests({
            subscriptionID: ctx.params.subscriptionID,
            interest: ctx.payload,
          })
          .pipe(Effect.as(HttpApiSchema.NoContent.make())),
      )
  }),
)

function response(output: Stream.Stream<string, Error>) {
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return HttpServerResponse.stream(output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText), {
    contentType: "text/event-stream",
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
