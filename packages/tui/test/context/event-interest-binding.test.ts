import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { OpenCode } from "@opencode-ai/client"
import { createControlledEventFeed, createData } from "@opencode-ai/client/solid"
import { createEventInterestBinding } from "../../src/context/event-interest-binding.ts"

test("policy is pulled synchronously and PUT acknowledgment precedes generated transcript GET", async () => {
  const put = Promise.withResolvers<void>()
  const installed: unknown[] = []
  const order: string[] = []
  const api = OpenCode.make({
    baseUrl: "http://test",
    fetch: Object.assign(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init)
        if (request.method === "PUT") {
          installed.push(await request.json())
          await put.promise
          order.push("installed")
          return new Response(null, { status: 204 })
        }
        if (request.url.endsWith("/api/experimental/event"))
          return new Response(
            [
              { type: "event-feed.ready", data: { subscriptionID: "evsub_test", profiles: ["session-streaming"] } },
              { type: "server.connected", id: "evt_connected", data: {} },
            ]
              .map((event) => `data: ${JSON.stringify(event)}\n\n`)
              .join(""),
            { headers: { "content-type": "text/event-stream" } },
          )
        order.push("transcript")
        return Response.json({ data: [], cursor: {} })
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const f = createRoot((dispose) => {
    const feed = createControlledEventFeed()
    const data = createData({
      api: () => api,
      directory: "/project",
      event: { on: () => () => {}, listen: () => () => {} },
    })
    return { feed, data, interest: createEventInterestBinding(feed, () => true), dispose }
  })
  f.interest.bind(() => ({ profile: "session-streaming", locations: [], sessions: ["ses_selected"] }))
  let current = true
  const read = f.interest.adoptTranscript("ses_selected", f.data.session.message, { current: () => current })
  expect(f.feed.desired().sessions).toEqual(["ses_selected"])
  const iterator = f.feed.subscribe(api, new AbortController().signal)[Symbol.asyncIterator]()
  const opening = iterator.next()
  await Bun.sleep(10)
  expect(order).toEqual([])
  expect(installed).toEqual([{ profile: "session-streaming", locations: [], sessions: ["ses_selected"] }])
  put.resolve()
  await Promise.all([read, opening])
  expect(order).toEqual(["installed", "transcript"])
  const stale = f.interest.adoptTranscript("ses_selected", f.data.session.message, { current: () => current })
  current = false
  await stale
  expect(order).toEqual(["installed", "transcript"])
  current = true
  await f.interest.adoptTranscript("ses_selected", f.data.session.message, { current: () => current })
  expect(order).toEqual(["installed", "transcript", "transcript"])
  await iterator.return?.()
  f.dispose()
})

test("legacy is intentional by default; disabling releases pending adoption without provider or service replacement", async () => {
  let focused = false
  const f = createRoot((dispose) => {
    const feed = createControlledEventFeed()
    return { feed, interest: createEventInterestBinding(feed, () => focused), dispose }
  })
  expect(f.interest.mode()).toBe("legacy")
  expect(f.interest.fallback()).toBe("disabled")
  await f.interest.flush()
  focused = true
  await expect(f.interest.flush()).rejects.toThrow("not bound")
  const unbind = f.interest.bind(() => ({ locations: [], sessions: [], profile: "session-streaming" }))
  const pending = f.interest.flush()
  focused = false
  f.interest.changed()
  await pending
  unbind()
  f.dispose()
})

test("intentional legacy adoption preserves the cache and skips obsolete readers", async () => {
  let reads = 0
  const api = OpenCode.make({
    baseUrl: "http://test",
    fetch: Object.assign(
      async () => {
        reads++
        return Response.json({ data: [], cursor: {} })
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const f = createRoot((dispose) => {
    const data = createData({
      api: () => api,
      directory: "/project",
      event: { on: () => () => {}, listen: () => () => {} },
    })
    return { dispose, data, interest: createEventInterestBinding(createControlledEventFeed(), () => false) }
  })
  try {
    await f.interest.adoptTranscript("ses_selected", f.data.session.message, { current: () => true })
    await f.interest.adoptTranscript("ses_selected", f.data.session.message, { current: () => true })
    const abort = new AbortController()
    abort.abort()
    await f.interest.adoptTranscript("ses_obsolete", f.data.session.message, {
      signal: abort.signal,
      current: () => true,
    })
    await f.interest.adoptTranscript("ses_obsolete", f.data.session.message, { current: () => false })
    expect(reads).toBe(1)
  } finally {
    f.dispose()
  }
})

test("cancelling adoption while installation is pending cannot start a transcript GET", async () => {
  let reads = 0
  const api = OpenCode.make({
    baseUrl: "http://test",
    fetch: Object.assign(
      async () => {
        reads++
        return Response.json({ data: [], cursor: {} })
      },
      { preconnect: fetch.preconnect },
    ),
  })
  const f = createRoot((dispose) => {
    const data = createData({
      api: () => api,
      directory: "/project",
      event: { on: () => () => {}, listen: () => () => {} },
    })
    return { dispose, data, interest: createEventInterestBinding(createControlledEventFeed(), () => true) }
  })
  try {
    f.interest.bind(() => ({ profile: "session-streaming", locations: [], sessions: ["ses_selected"] }))
    const abort = new AbortController()
    const read = f.interest.adoptTranscript("ses_selected", f.data.session.message, {
      signal: abort.signal,
      current: () => true,
    })
    abort.abort(new Error("obsolete reader"))
    await expect(read).rejects.toThrow("obsolete reader")
    expect(reads).toBe(0)
  } finally {
    f.dispose()
  }
})
