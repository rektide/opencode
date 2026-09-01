import { expect, test } from "bun:test"
import { Location } from "@opencode-ai/schema/location"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { SessionID } from "@opencode-ai/schema/session-id"
import { createRoot } from "solid-js"
import { OpenCode } from "../src/promise"
import { createControlledEventFeed, type ControlledEventFeedOptions } from "../src/solid/controlled-event-feed"

const a = Location.Ref.make({ directory: AbsolutePath.make("/a") })
const b = Location.Ref.make({ directory: AbsolutePath.make("/b") })
const c = Location.Ref.make({ directory: AbsolutePath.make("/c") })
const sessionID = SessionID.make("ses_controlled")

const ready = (id: string) => ({ type: "event-feed.ready", data: { subscriptionID: id } })
const connected = { id: "evt_connected", type: "server.connected", data: {} }
const updated = { id: "evt_updated", created: 1, type: "agent.updated", data: {} }

function sse(...events: unknown[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  })
}

function request(input: RequestInfo | URL, init?: RequestInit) {
  return input instanceof Request ? input : new Request(input, init)
}

function setup(options?: ControlledEventFeedOptions) {
  return createRoot((dispose) => ({ feed: createControlledEventFeed(options), dispose }))
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error("Timed out waiting for controlled feed state")
}

test("installs desired interest before yielding the first domain event", async () => {
  const puts: unknown[] = []
  let legacy = 0
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      const url = new URL(next.url)
      if (url.pathname === "/api/experimental/event") {
        return sse(ready("evsub_first"), connected, updated)
      }
      if (url.pathname === "/api/event") {
        legacy += 1
        return sse(connected)
      }
      puts.push(await next.json())
      return new Response(null, { status: 204 })
    },
  })
  const fixture = setup()
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  const abort = new AbortController()
  const iterator = fixture.feed.subscribe(api, abort.signal)[Symbol.asyncIterator]()

  expect(await iterator.next()).toEqual({ done: false, value: connected })
  expect(fixture.feed.mode()).toBe("controlled")
  expect(fixture.feed.installed()).toEqual({ locations: [a], sessions: [sessionID] })
  expect(puts).toEqual([{ locations: [a], sessions: [sessionID] }])
  expect(await iterator.next()).toEqual({ done: false, value: updated })
  expect(legacy).toBe(0)

  await iterator.return?.()
  fixture.dispose()
})

test("falls back once on a pre-ready 404 and keeps desired interest visible", async () => {
  const logs: string[] = []
  let legacy = 0
  let controlled = 0
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const url = new URL(request(input, init).url)
      if (url.pathname === "/api/experimental/event") {
        controlled += 1
        return new Response(null, { status: 404 })
      }
      legacy += 1
      return sse(connected)
    },
  })
  const fixture = setup({ log: { info: (message) => logs.push(message) } })
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  const iterator = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()

  expect(await iterator.next()).toEqual({ done: false, value: connected })
  expect(fixture.feed.mode()).toBe("legacy")
  expect(fixture.feed.desired()).toEqual({ locations: [a], sessions: [sessionID] })
  expect(fixture.feed.installed()).toBeUndefined()
  await fixture.feed.flush()
  expect(legacy).toBe(1)
  expect(logs).toEqual(["controlled event feed unavailable; using legacy event stream"])

  await iterator.return?.()
  const retry = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()
  expect(await retry.next()).toEqual({ done: false, value: connected })
  expect(controlled).toBe(2)
  expect(legacy).toBe(2)
  expect(logs).toHaveLength(1)
  await retry.return?.()
  fixture.dispose()
})

test("coalesces rapid additions behind one in-flight replacement", async () => {
  const puts: unknown[] = []
  let release = () => {}
  const blocked = new Promise<void>((resolve) => (release = resolve))
  let concurrent = 0
  let maximum = 0
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_coalesce"), connected)
      }
      const body: unknown = await next.json()
      puts.push(body)
      concurrent += 1
      maximum = Math.max(maximum, concurrent)
      if (puts.length === 1) await blocked
      concurrent -= 1
      return new Response(null, { status: 204 })
    },
  })
  const fixture = setup()
  const iterator = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()
  const opening = iterator.next()
  await waitFor(() => puts.length === 1)

  fixture.feed.setDesired({ locations: [a], sessions: [] })
  fixture.feed.setDesired({ locations: [a, b], sessions: [] })
  fixture.feed.setDesired({ locations: [a, b, c], sessions: [sessionID] })
  expect(puts).toHaveLength(1)
  release()

  expect(await opening).toEqual({ done: false, value: connected })
  expect(maximum).toBe(1)
  expect(puts).toEqual([
    { locations: [], sessions: [] },
    { locations: [a, b, c], sessions: [sessionID] },
  ])
  await fixture.feed.flush()

  await iterator.return?.()
  fixture.dispose()
})

test("delays removals and cancels their grace window on re-add", async () => {
  const puts: unknown[] = []
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_grace"), connected)
      }
      puts.push(await next.json())
      return new Response(null, { status: 204 })
    },
  })
  const fixture = setup({ removalGrace: 20 })
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  const iterator = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()
  await iterator.next()

  fixture.feed.setDesired({ locations: [], sessions: [] })
  expect(fixture.feed.desired()).toEqual({ locations: [], sessions: [] })
  expect(fixture.feed.installed()).toEqual({ locations: [a], sessions: [sessionID] })
  await fixture.feed.flush()
  expect(puts).toHaveLength(1)
  await Bun.sleep(5)
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  await Bun.sleep(30)
  expect(puts).toHaveLength(1)

  fixture.feed.setDesired({ locations: [], sessions: [] })
  await Bun.sleep(30)
  await fixture.feed.flush()
  expect(puts).toEqual([
    { locations: [a], sessions: [sessionID] },
    { locations: [], sessions: [] },
  ])

  await iterator.return?.()
  fixture.dispose()
})

test("reconnects after an indeterminate PUT without claiming installation", async () => {
  let puts = 0
  const firstApi = OpenCode.make({
    baseUrl: "http://first:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_old"), connected)
      }
      puts += 1
      if (puts > 1) throw new Error("response lost")
      return new Response(null, { status: 204 })
    },
  })
  const fixture = setup()
  const first = fixture.feed.subscribe(firstApi, new AbortController().signal)[Symbol.asyncIterator]()
  await first.next()
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  const flushed = fixture.feed.flush()
  await waitFor(() => fixture.feed.error() !== undefined)

  expect(fixture.feed.mode()).toBe("connecting")
  expect(fixture.feed.installed()).toBeUndefined()
  expect(fixture.feed.error()).toBe("Transport: response lost")
  await first.return?.()

  const restored: unknown[] = []
  const secondApi = OpenCode.make({
    baseUrl: "http://second:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_new"), connected)
      }
      restored.push(await next.json())
      return new Response(null, { status: 204 })
    },
  })
  const second = fixture.feed.subscribe(secondApi, new AbortController().signal)[Symbol.asyncIterator]()
  expect(await second.next()).toEqual({ done: false, value: connected })
  await flushed

  expect(restored).toEqual([{ locations: [a], sessions: [sessionID] }])
  expect(fixture.feed.mode()).toBe("controlled")
  expect(fixture.feed.installed()).toEqual({ locations: [a], sessions: [sessionID] })

  await second.return?.()
  fixture.dispose()
})

test("ignores late responses and frames from an obsolete generation", async () => {
  const late = Promise.withResolvers<Response>()
  const started = Promise.withResolvers<void>()
  const firstApi = OpenCode.make({
    baseUrl: "http://first:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_old"), connected, { ...updated, id: "evt_old" })
      }
      started.resolve()
      return late.promise
    },
  })
  const fixture = setup()
  fixture.feed.setDesired({ locations: [a], sessions: [sessionID] })
  const first = fixture.feed.subscribe(firstApi, new AbortController().signal)[Symbol.asyncIterator]()
  const oldOpening = first.next()
  await started.promise

  const secondApi = OpenCode.make({
    baseUrl: "http://second:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_new"), connected, { ...updated, id: "evt_new" })
      }
      return new Response(null, { status: 204 })
    },
  })
  const second = fixture.feed.subscribe(secondApi, new AbortController().signal)[Symbol.asyncIterator]()
  expect(await second.next()).toEqual({ done: false, value: connected })
  expect(fixture.feed.mode()).toBe("controlled")
  expect(fixture.feed.installed()).toEqual({ locations: [a], sessions: [sessionID] })

  late.resolve(new Response(null, { status: 204 }))
  expect(await oldOpening).toEqual({ done: true, value: undefined })
  expect(fixture.feed.mode()).toBe("controlled")
  expect(fixture.feed.installed()).toEqual({ locations: [a], sessions: [sessionID] })
  expect(await second.next()).toEqual({ done: false, value: { ...updated, id: "evt_new" } })

  await first.return?.()
  await second.return?.()
  fixture.dispose()
})

test("treats replacement 404 as rejection rather than legacy fallback", async () => {
  let legacy = 0
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      const path = new URL(next.url).pathname
      if (path === "/api/experimental/event") return sse(ready("evsub_missing"), connected)
      if (path === "/api/event") {
        legacy += 1
        return sse(connected)
      }
      return Response.json(
        {
          _tag: "EventSubscriptionNotFoundError",
          subscriptionID: "evsub_missing",
          message: "subscription closed",
        },
        { status: 404 },
      )
    },
  })
  const fixture = setup()
  const iterator = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()

  await expect(iterator.next()).rejects.toMatchObject({
    _tag: "EventSubscriptionNotFoundError",
    subscriptionID: "evsub_missing",
  })
  expect(fixture.feed.mode()).toBe("connecting")
  expect(fixture.feed.installed()).toBeUndefined()
  expect(fixture.feed.error()).toBe("subscription closed")
  expect(legacy).toBe(0)

  await iterator.return?.()
  fixture.dispose()
})

test("surfaces determinate replacement rejection without legacy fallback", async () => {
  let puts = 0
  const api = OpenCode.make({
    baseUrl: "http://localhost:3000",
    fetch: async (input, init) => {
      const next = request(input, init)
      if (new URL(next.url).pathname === "/api/experimental/event") {
        return sse(ready("evsub_rejected"), connected)
      }
      puts += 1
      if (puts === 1) return new Response(null, { status: 204 })
      return Response.json(
        { _tag: "InvalidRequestError", message: "too much interest", field: "interest" },
        { status: 400 },
      )
    },
  })
  const fixture = setup()
  const iterator = fixture.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()
  await iterator.next()
  fixture.feed.setDesired({ locations: [a], sessions: [] })

  await expect(fixture.feed.flush()).rejects.toMatchObject({
    _tag: "InvalidRequestError",
    field: "interest",
  })
  expect(fixture.feed.mode()).toBe("connecting")
  expect(fixture.feed.installed()).toBeUndefined()
  expect(fixture.feed.error()).toBe("too much interest")

  await iterator.return?.()
  fixture.dispose()
})
