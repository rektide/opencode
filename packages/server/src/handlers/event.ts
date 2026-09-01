import { Bus } from "@opencode-ai/core/bus"
import { InvalidRequestError } from "@opencode-ai/protocol/errors"
import { EventInterest } from "@opencode-ai/protocol/groups/event"
import { Event } from "@opencode-ai/schema/event"
import { Effect, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
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
      .handleRaw("event.controlled.replaceInterests", (ctx) =>
        readInterest(ctx.request).pipe(
          Effect.flatMap((interest) =>
            controlled.replaceInterests({ subscriptionID: ctx.params.subscriptionID, interest }),
          ),
          Effect.as(HttpApiSchema.NoContent.make()),
        ),
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

const decodeInterest = Schema.decodeUnknownEffect(Schema.fromJsonString(EventInterest))

function readInterest(request: HttpServerRequest.HttpServerRequest) {
  return request.stream.pipe(
    Stream.runFoldEffect(
      () => ({ bytes: 0, chunks: new Array<Uint8Array>() }),
      (body, chunk) => {
        const bytes = body.bytes + chunk.byteLength
        if (bytes > ControlledEventFeed.InterestByteCapacity)
          return Effect.fail(
            new InvalidRequestError({
              message: `Interest exceeds ${ControlledEventFeed.InterestByteCapacity} request bytes`,
              field: "interest",
            }),
          )
        return Effect.succeed({ bytes, chunks: [...body.chunks, chunk] })
      },
    ),
    Effect.map((body) => {
      const bytes = new Uint8Array(body.bytes)
      body.chunks.reduce((offset, chunk) => {
        bytes.set(chunk, offset)
        return offset + chunk.byteLength
      }, 0)
      return new TextDecoder().decode(bytes)
    }),
    Effect.flatMap(decodeInterest),
    Effect.mapError((error) =>
      error instanceof InvalidRequestError
        ? error
        : new InvalidRequestError({ message: "Invalid event interest request body", field: "interest" }),
    ),
  )
}
