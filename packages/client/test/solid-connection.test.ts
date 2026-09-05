import { expect, test } from "bun:test"
import type { OpenCodeClient, OpenCodeEvent } from "../src/promise"
import { createClientConnection } from "../src/solid/connection"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { OpenCode } from "../src/promise/index.ts"
import { createControlledEventFeed } from "../src/solid/controlled-event-feed.ts"

const connected = { type: "server.connected", data: {} } as OpenCodeEvent
const domainEvent = (id: string) => ({ type: "test.event", data: { id } }) as unknown as OpenCodeEvent
const browserTest = isServer ? test.skip : test

browserTest("client connection uses an injected event stream", async () => {
  const events: OpenCodeEvent[] = []
  let subscribed = 0
  const dispose = createRoot((dispose) => {
    createClientConnection({} as OpenCodeClient, {
      subscribe: async function* () {
        subscribed += 1
        yield connected
        await new Promise(() => {})
      },
      onEvent: (event) => events.push(event),
      flushInterval: 0,
    })
    return dispose
  })

  await Bun.sleep(20)
  dispose()

  expect(subscribed).toBe(1)
  expect(events).toEqual([connected])
})

browserTest("client connection uses the legacy event stream by default", async () => {
  const events: OpenCodeEvent[] = []
  let subscribed = 0
  const dispose = createRoot((dispose) => {
    createClientConnection(
      {
        event: {
          subscribe: async function* () {
            subscribed += 1
            yield connected
            await new Promise(() => {})
          },
        },
      } as OpenCodeClient,
      {
        onEvent: (event) => events.push(event),
        flushInterval: 0,
      },
    )
    return dispose
  })

  await Bun.sleep(20)
  dispose()

  expect(subscribed).toBe(1)
  expect(events).toEqual([connected])
})

browserTest("client connection retains domain event and reconnect diagnostics after recovery", async () => {
  const api = {} as OpenCodeClient
  let subscribed = 0
  let connection: ReturnType<typeof createClientConnection> | undefined
  const dispose = createRoot((dispose) => {
    connection = createClientConnection(api, {
      subscribe: async function* (_api, signal) {
        subscribed += 1
        yield connected
        if (subscribed === 1) {
          yield domainEvent("one")
          yield domainEvent("two")
          yield domainEvent("three")
          return
        }
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
      },
      reconnect: async () => api,
      onEvent: () => {},
      flushInterval: 0,
    })
    return dispose
  })

  while (subscribed < 2) await Bun.sleep(1)

  expect(connection?.status()).toBe("connected")
  expect(connection?.attempt()).toBe(0)
  expect(connection?.internal.diagnostics()).toEqual({ receivedDomainEvents: 3, reconnects: 1 })
  dispose()
})

browserTest(
  "declared interest rejection pauses the real adapter until a changed target or explicit event retry",
  async () => {
    let gets = 0
    let puts = 0
    let resolves = 0
    let valid = false
    const api = OpenCode.make({
      baseUrl: "http://test",
      fetch: async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init)
        if (request.method === "PUT") {
          puts++
          return valid
            ? new Response(null, { status: 204 })
            : Response.json({ _tag: "InvalidRequestError", field: "interest", message: "invalid" }, { status: 400 })
        }
        gets++
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ type: "event-feed.ready", data: { subscriptionID: "evsub_pause" } })}\n\ndata: ${JSON.stringify(connected)}\n\n`,
                ),
              )
              request.signal.addEventListener("abort", () => controller.error(new Error("aborted")), { once: true })
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        )
      },
    })
    const fixture = createRoot((dispose) => {
      const feed = createControlledEventFeed({ onDesiredChange: () => connection.wakeEvents() })
      const connection = createClientConnection(api, {
        subscribe: feed.subscribe,
        retry: feed.retry,
        reconnect: async () => {
          resolves++
          return api
        },
        onEvent: () => {},
      })
      return { feed, connection, dispose }
    })
    await until(() => fixture.connection.paused())
    await Bun.sleep(30)
    expect([gets, puts, resolves]).toEqual([1, 1, 0])
    fixture.feed.setDesired({ locations: [], sessions: [] })
    await Bun.sleep(10)
    expect(fixture.connection.paused()).toBe(true)
    valid = true
    fixture.feed.setDesired({ locations: [], sessions: ["ses_new"] })
    await until(() => fixture.connection.status() === "connected")
    expect([gets, puts, resolves]).toEqual([2, 2, 1])
    valid = false
    fixture.feed.setDesired({ locations: [], sessions: ["ses_new", "ses_bad"] })
    await until(() => fixture.connection.paused())
    expect(puts).toBe(3)
    valid = true
    fixture.connection.reconnectEvents()
    await until(() => fixture.connection.status() === "connected" && gets === 3)
    fixture.dispose()
  },
)

browserTest("wake during retry classification cannot be lost and teardown returns the iterator", async () => {
  let attempts = 0
  let returned = 0
  const fixture = createRoot((dispose) => {
    const connection = createClientConnection(OpenCode.make({ baseUrl: "http://unused" }), {
      subscribe: (_api, signal) => ({
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            if (++attempts === 1) throw new Error("reject")
            await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))
            return { done: true, value: undefined }
          },
          return: async () => {
            returned++
            return { done: true, value: undefined }
          },
        }),
      }),
      retry: () => {
        connection.wakeEvents()
        return "pause"
      },
      onEvent: () => {},
      reconnect: async () => OpenCode.make({ baseUrl: "http://unused" }),
    })
    return { connection, dispose }
  })
  await until(() => attempts === 2)
  expect(fixture.connection.paused()).toBe(false)
  fixture.dispose()
  await until(() => returned === 2)
})

async function until(check: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error("connection state timed out")
}
