import { expect, test } from "bun:test"
import type { OpenCodeClient, OpenCodeEvent } from "../src/promise"
import { createClientConnection } from "../src/solid/connection"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"

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
