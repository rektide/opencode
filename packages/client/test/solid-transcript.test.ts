import { expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { OpenCode, type OpenCodeEvent, type SessionMessageInfo } from "../src/promise/index.ts"
import { createData, type CreateDataInput } from "../src/solid/data.ts"

const assistant = (text: string, completed?: number): SessionMessageInfo => ({
  id: "msg_assistant",
  type: "assistant",
  agent: "build",
  model: { id: "model", providerID: "provider" },
  content: [{ type: "text", text }],
  time: { created: 1, ...(completed ? { completed } : {}) },
})
const ended: OpenCodeEvent = {
  id: "evt_ended",
  created: 2,
  type: "session.text.ended",
  durable: { aggregateID: "ses_test", seq: 2, version: 1 },
  data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: 0, text: "canonical" },
}
const failed: OpenCodeEvent = {
  id: "evt_failed",
  created: 3,
  type: "session.step.failed",
  durable: { aggregateID: "ses_test", seq: 3, version: 1 },
  data: {
    sessionID: "ses_test",
    assistantMessageID: "msg_assistant",
    error: { name: "UnknownError", data: { message: "failed" } },
  },
}

function fixture(read: (url: URL) => Response | Promise<Response>) {
  const listeners = new Set<Parameters<CreateDataInput["event"]["listen"]>[0]>()
  const api = OpenCode.make({
    baseUrl: "http://test",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      return read(new URL(request.url))
    },
  })
  return createRoot((dispose) => ({
    data: createData({
      api: () => api,
      directory: "/project",
      event: {
        on: () => () => {},
        listen: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    }),
    emit: (event: OpenCodeEvent) => listeners.forEach((listener) => listener({ name: event.type, details: event })),
    dispose,
  }))
}

test.each(["terminal", "failure"])("rejects stale running GET after %s with no later event", async (mode) => {
  const stale = Promise.withResolvers<Response>()
  let reads = 0
  const canonical = assistant(mode === "failure" ? "" : "canonical", 3)
  const f = fixture(() =>
    ++reads === 2
      ? stale.promise
      : Response.json({ data: [reads === 1 ? assistant("prefix") : canonical], cursor: {} }),
  )
  try {
    await f.data.session.message.sync("ses_test")
    f.data.session.message.invalidate("ses_test")
    const pending = f.data.session.message.sync("ses_test")
    await until(() => reads === 2)
    f.emit(mode === "failure" ? failed : ended)
    stale.resolve(Response.json({ data: [assistant("old running")], cursor: {} }))
    await pending
    await until(() => reads === 3)
    expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    await Bun.sleep(10)
    expect(reads).toBe(3)
  } finally {
    f.dispose()
  }
})

test("failed partial live text repairs once, while deltas cause no HTTP reads", async () => {
  let reads = 0
  const canonical = assistant("", 3)
  const f = fixture(() => Response.json({ data: [++reads === 1 ? assistant("") : canonical], cursor: {} }))
  try {
    await f.data.session.message.sync("ses_test")
    for (let i = 0; i < 100; i++)
      f.emit({
        id: `evt_delta${i}`,
        created: 2,
        type: "session.text.delta",
        data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: 0, delta: "suffix" },
      })
    expect(reads).toBe(1)
    f.emit(failed)
    f.emit({ ...failed, id: "evt_failed_again" })
    await until(() => reads === 2)
    await Bun.sleep(0)
    expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    expect(reads).toBe(2)
  } finally {
    f.dispose()
  }
})

test.each(["evict", "delete"])("late transcript and history pages cannot resurrect after %s", async (mode) => {
  const late = Promise.withResolvers<Response>()
  let reads = 0
  const f = fixture(() =>
    ++reads === 1
      ? Response.json({ data: [assistant("first")], cursor: { next: "older" } })
      : late.promise.then((response) => response.clone()),
  )
  try {
    await f.data.session.message.sync("ses_test")
    const more = f.data.session.message.loadMore("ses_test")
    f.data.session.message.invalidate("ses_test")
    const sync = f.data.session.message.sync("ses_test")
    await until(() => reads === 3)
    if (mode === "evict") f.data.session.evict("ses_test")
    if (mode === "delete")
      f.emit({
        id: "evt_delete",
        created: 4,
        type: "session.deleted",
        durable: { aggregateID: "ses_test", seq: 4, version: 2 },
        data: { sessionID: "ses_test" },
      })
    late.resolve(Response.json({ data: [assistant("stale")], cursor: {} }))
    await Promise.all([more, sync])
    expect(f.data.session.message.list("ses_test")).toEqual([])
    expect(reads).toBe(3)
  } finally {
    f.dispose()
  }
})

test("canonical repair retains loaded older pages and their pagination cursor", async () => {
  let reads = 0
  const older: SessionMessageInfo = { id: "msg_older", type: "user", text: "older", time: { created: 0 } }
  const f = fixture((url) => {
    reads++
    return Response.json({
      data: url.searchParams.has("cursor") ? [older] : [assistant(reads === 1 ? "" : "canonical")],
      cursor: url.searchParams.has("cursor") ? {} : { next: "older" },
    })
  })
  try {
    await f.data.session.message.sync("ses_test")
    await f.data.session.message.loadMore("ses_test")
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(f.data.session.message.list("ses_test").map((row) => row.id)).toEqual(["msg_older", "msg_assistant"])
    expect(f.data.session.message.more("ses_test")).toBe(false)
  } finally {
    f.dispose()
  }
})

test("compaction failure discards a stale partial summary, with no later event", async () => {
  const late = Promise.withResolvers<Response>()
  let reads = 0
  const running = {
    id: "msg_compaction",
    type: "compaction",
    status: "running",
    reason: "manual",
    summary: "partial",
    recent: "",
    time: { created: 1 },
  }
  const canonical = {
    id: "msg_compaction",
    type: "compaction",
    status: "failed",
    reason: "manual",
    error: failed.data.error,
    time: { created: 1, completed: 3 },
  }
  const f = fixture(() =>
    ++reads === 2 ? late.promise : Response.json({ data: [reads === 1 ? running : canonical], cursor: {} }),
  )
  try {
    await f.data.session.message.sync("ses_test")
    f.data.session.message.invalidate("ses_test")
    const pending = f.data.session.message.sync("ses_test")
    await until(() => reads === 2)
    f.emit({
      id: "evt_compaction_failed",
      type: "session.compaction.failed",
      created: 3,
      durable: { aggregateID: "ses_test", seq: 3, version: 1 },
      data: { sessionID: "ses_test", reason: "manual", error: failed.data.error },
    })
    late.resolve(Response.json({ data: [running], cursor: {} }))
    await pending
    expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    expect(reads).toBe(3)
  } finally {
    f.dispose()
  }
})

test.each(["evict", "delete", "delivery"])(
  "pending hydration cannot resurrect stale transcript input after %s",
  async (mode) => {
    const late = Promise.withResolvers<Response>()
    let reads = 0
    const f = fixture(() => (++reads === 1 ? late.promise : Response.json({ data: [] })))
    try {
      const pending = f.data.session.pending.sync("ses_test")
      await until(() => reads === 1)
      if (mode === "evict") f.data.session.evict("ses_test")
      if (mode === "delete")
        f.emit({
          id: "evt_delete",
          type: "session.deleted",
          created: 3,
          durable: { aggregateID: "ses_test", seq: 3, version: 2 },
          data: { sessionID: "ses_test" },
        })
      if (mode === "delivery")
        f.emit({
          id: "evt_delivery",
          type: "session.inbox.delivered",
          created: 3,
          durable: { aggregateID: "ses_test", seq: 3, version: 1 },
          data: { sessionID: "ses_test", inboxID: "msg_input" },
        })
      late.resolve(
        Response.json({
          data: [
            {
              id: "msg_input",
              sessionID: "ses_test",
              type: "user",
              timeCreated: 1,
              delivery: "steer",
              payload: { text: "old input" },
            },
          ],
        }),
      )
      await pending
      expect(f.data.session.pending.list("ses_test")).toEqual([])
      expect(f.data.session.message.list("ses_test")).toEqual([])
      expect(reads).toBe(mode === "delivery" ? 2 : 1)
    } finally {
      f.dispose()
    }
  },
)
;(isServer ? test.skip : test)("missing assistant edits do not allocate transcript state", () => {
  const f = fixture(() => {
    throw new Error("unexpected read")
  })
  const state = createRoot((dispose) => ({ list: createMemo(() => f.data.session.message.list("ses_test")), dispose }))
  const before = state.list()
  f.emit(ended)
  expect(state.list()).toBe(before)
  state.dispose()
  f.dispose()
})

async function until(check: () => boolean) {
  for (let i = 0; i < 1000; i++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error("transcript state timed out")
}
