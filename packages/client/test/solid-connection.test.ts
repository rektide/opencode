import { expect, test } from "bun:test"
import type { OpenCodeClient, OpenCodeEvent } from "../src/promise"
import { createClientConnection } from "../src/solid/connection"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"

const connected = { type: "server.connected", data: {} } as OpenCodeEvent
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
