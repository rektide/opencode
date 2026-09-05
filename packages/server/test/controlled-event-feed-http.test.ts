import { expect } from "bun:test"
import { ControlledFeedItem } from "@opencode-ai/protocol/groups/event"
import { Effect, Schema } from "effect"
import { it } from "../../core/test/lib/effect"
import { ControlledEventFeed } from "../src/controlled-event-feed"
import { ServerFetch } from "../src/fetch"

it.live("negotiates the controlled feed without changing the legacy opening frame", () =>
  Effect.gen(function* () {
    const handler = yield* ServerFetch.make({
      app: { version: "test" },
      database: { path: ":memory:" },
      fs: { filewatcher: false },
    })

    yield* Effect.promise(async () => {
      const controlled = await handler(new Request("http://opencode.local/api/experimental/event"))
      expect(controlled.status).toBe(200)
      expect(controlled.headers.get("content-type")).toBe("text/event-stream")
      if (!controlled.body) throw new Error("Controlled event response has no body")
      const controlledReader = controlled.body.getReader()
      const nextControlled = nextEvent(controlledReader)
      const ready = Schema.decodeUnknownSync(ControlledFeedItem)(await nextControlled())
      expect(ready.type).toBe("event-feed.ready")
      if (ready.type !== "event-feed.ready") throw new Error("Controlled feed did not start with ready")
      expect(ready.data.profiles).toEqual(["location", "session-streaming"])
      for (const profile of ["unknown", "location", "session-streaming"]) {
        const response = await handler(
          new Request(
            `http://opencode.local/api/experimental/event/subscriptions/${ready.data.subscriptionID}/interests`,
            {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ locations: [], sessions: [], profile }),
            },
          ),
        )
        expect(response.status).toBe(profile === "unknown" ? 400 : 204)
      }

      const oversized = await handler(
        new Request(
          `http://opencode.local/api/experimental/event/subscriptions/${ready.data.subscriptionID}/interests`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body:
              " ".repeat(ControlledEventFeed.InterestByteCapacity) + JSON.stringify({ locations: [], sessions: [] }),
          },
        ),
      )
      expect(oversized.status).toBe(400)

      const replacement = await handler(
        new Request(
          `http://opencode.local/api/experimental/event/subscriptions/${ready.data.subscriptionID}/interests`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ locations: [], sessions: [] }),
          },
        ),
      )
      expect(replacement.status).toBe(204)
      expect(Schema.decodeUnknownSync(ControlledFeedItem)(await nextControlled()).type).toBe("server.connected")
      await controlledReader.cancel()
      const closed = await handler(
        new Request(
          `http://opencode.local/api/experimental/event/subscriptions/${ready.data.subscriptionID}/interests`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ locations: [], sessions: [] }),
          },
        ),
      )
      expect(closed.status).toBe(404)

      const legacy = await handler(new Request("http://opencode.local/api/event"))
      expect(legacy.status).toBe(200)
      if (!legacy.body) throw new Error("Legacy event response has no body")
      const legacyReader = legacy.body.getReader()
      expect(Schema.decodeUnknownSync(ControlledFeedItem)(await nextEvent(legacyReader)()).type).toBe(
        "server.connected",
      )
      await legacyReader.cancel()
    })
  }).pipe(Effect.scoped),
)

function nextEvent(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffered = ""
  return async () => {
    while (true) {
      const boundary = buffered.indexOf("\n\n")
      if (boundary >= 0) {
        const frame = buffered.slice(0, boundary)
        buffered = buffered.slice(boundary + 2)
        const data = frame
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice("data: ".length)
        if (data) {
          const parsed: unknown = JSON.parse(data)
          return parsed
        }
        continue
      }
      const chunk = await reader.read()
      if (chunk.done) throw new Error("Event stream ended before the next data frame")
      buffered += decoder.decode(chunk.value, { stream: true })
    }
  }
}
