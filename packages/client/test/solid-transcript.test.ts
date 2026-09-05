import { expect, test } from "bun:test"
import { createMemo, createRoot, createSignal } from "solid-js"
import { isServer } from "solid-js/web"
import { OpenCode, isSessionNotFoundError, type OpenCodeEvent, type SessionMessageInfo } from "../src/promise/index.ts"
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

function fixture(
  read: (url: URL) => Response | Promise<Response>,
  options: Partial<Pick<CreateDataInput, "connection" | "onError">> = {},
) {
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
      ...options,
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

function historyFixture(total: number, strictCursor = false, lazyEnd = false) {
  const row = (n: number): SessionMessageInfo => ({
    id: `msg_${String(n).padStart(4, "0")}`,
    type: "user",
    text: String(n),
    time: { created: n },
  })
  let rows = Array.from({ length: total }, (_, index) => row(index + 1))
  const pages: URL[] = []
  const probes: string[] = []
  const f = fixture((url) => {
    if (!url.pathname.endsWith("/message")) {
      const id = url.pathname.split("/").at(-1) ?? ""
      probes.push(id)
      const data = rows.find((item) => item.id === id)
      return data
        ? Response.json({ data })
        : Response.json(
            { _tag: "MessageNotFoundError", sessionID: "ses_test", messageID: id, message: "missing" },
            { status: 404 },
          )
    }
    pages.push(url)
    if (strictCursor) expect(url.searchParams.has("cursor") && url.searchParams.has("order")).toBe(false)
    const before = Number(url.searchParams.get("cursor") ?? rows.length)
    const start = Math.max(0, before - Number(url.searchParams.get("limit") ?? 20))
    return Response.json({
      data: rows.slice(start, before).toReversed(),
      cursor: start > 0 || (lazyEnd && before > start) ? { next: String(start) } : {},
    })
  })
  return {
    ...f,
    pages,
    probes,
    row,
    replace: (next: SessionMessageInfo[]) => {
      rows = next
    },
    rows: () => rows,
  }
}

test.each([false, true])(
  "repair retains 1–40 after 20 offline additions and keeps exhausted pagination (empty-page end: %s)",
  async (lazyEnd) => {
    const f = historyFixture(40, false, lazyEnd)
    try {
      await f.data.session.message.sync("ses_test")
      await f.data.session.message.loadMore("ses_test", { all: true })
      expect(f.data.session.message.list("ses_test")).toHaveLength(40)
      expect(f.data.session.message.more("ses_test")).toBe(false)
      f.replace(Array.from({ length: 60 }, (_, i) => f.row(i + 1)))
      f.data.session.message.invalidate("ses_test")
      await f.data.session.message.sync("ses_test")
      expect(f.data.session.message.list("ses_test").map((row) => row.id)).toEqual(f.rows().map((row) => row.id))
      expect(f.data.session.message.more("ses_test")).toBe(false)
      expect(f.pages).toHaveLength(lazyEnd ? 7 : 5)
    } finally {
      f.dispose()
    }
  },
)

test.each([false, true])(
  "bounded history stops at the surviving retained boundary (deleted oldest: %s)",
  async (removed) => {
    const f = historyFixture(1000)
    try {
      await f.data.session.message.sync("ses_test")
      f.replace(
        Array.from({ length: 1020 }, (_, i) => f.row(i + 1)).filter((row) => !removed || row.id !== f.row(981).id),
      )
      f.data.session.message.invalidate("ses_test")
      await f.data.session.message.sync("ses_test")
      expect(f.data.session.message.list("ses_test")[0]?.id).toBe(f.row(removed ? 980 : 981).id)
      expect(f.data.session.message.list("ses_test")).toHaveLength(40)
      expect(f.data.session.message.more("ses_test")).toBe(true)
      expect(f.pages).toHaveLength(3)
      expect(f.probes).toEqual(removed ? [f.row(981).id, f.row(982).id] : [f.row(981).id])
      await f.data.session.message.loadMore("ses_test")
      expect(f.data.session.message.list("ses_test")).toHaveLength(60)
    } finally {
      f.dispose()
    }
  },
)

test("repair follows opaque cursors without combining cursor and order", async () => {
  const f = historyFixture(40, true)
  try {
    await f.data.session.message.sync("ses_test")
    await f.data.session.message.loadMore("ses_test")
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(f.data.session.message.list("ses_test")).toHaveLength(40)
  } finally {
    f.dispose()
  }
})

test("an offline-deleted retained window does not scan older unobserved history", async () => {
  const f = historyFixture(1000)
  try {
    await f.data.session.message.sync("ses_test")
    f.replace([...f.rows().slice(0, 980), ...Array.from({ length: 20 }, (_, i) => f.row(1001 + i))])
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(f.data.session.message.list("ses_test").map((row) => row.id)).toEqual(
      f
        .rows()
        .slice(-20)
        .map((row) => row.id),
    )
    expect(f.pages).toHaveLength(2)
    expect(f.probes).toHaveLength(20)
  } finally {
    f.dispose()
  }
})

test("retained history uses server order rather than lexical message IDs", async () => {
  const f = historyFixture(1000)
  f.replace(f.rows().map((row, i) => ({ ...row, id: f.row(1000 - i).id })))
  try {
    await f.data.session.message.sync("ses_test")
    const oldest = f.data.session.message.list("ses_test")[0]?.id
    f.replace([...f.rows(), ...Array.from({ length: 20 }, (_, i) => f.row(1001 + i))])
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(f.data.session.message.list("ses_test")[0]?.id).toBe(oldest)
    expect(f.data.session.message.list("ses_test")).toHaveLength(40)
    expect(f.pages).toHaveLength(3)
  } finally {
    f.dispose()
  }
})

test("repair after a committed revert does not chase a deleted retained suffix into old unobserved history", async () => {
  const f = historyFixture(1000)
  try {
    await f.data.session.message.sync("ses_test")
    f.replace(f.rows().filter((row) => row.id < f.row(981).id))
    f.emit({
      type: "session.revert.committed",
      id: "evt_revert",
      created: 1001,
      durable: { aggregateID: "ses_test", seq: 1001, version: 1 },
      data: { sessionID: "ses_test", to: f.row(981).id },
    })
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(f.data.session.message.list("ses_test").map((row) => row.id)).toEqual(
      f
        .rows()
        .slice(-20)
        .map((row) => row.id),
    )
    expect(f.pages).toHaveLength(2)
    expect(f.probes).toEqual([])
  } finally {
    f.dispose()
  }
})

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

test("committed revert invalidates a captured pending input before it can materialize", async () => {
  const late = Promise.withResolvers<Response>()
  let reads = 0
  const f = fixture(() => (++reads === 1 ? late.promise : Response.json({ data: [] })))
  try {
    const pending = f.data.session.pending.sync("ses_test")
    f.emit({
      type: "session.revert.committed",
      id: "evt_reverted",
      created: 5,
      durable: { aggregateID: "ses_test", seq: 5, version: 1 },
      data: { sessionID: "ses_test", to: "msg_002" },
    })
    late.resolve(
      Response.json({
        data: [
          {
            id: "msg_003",
            sessionID: "ses_test",
            type: "user",
            timeCreated: 3,
            delivery: "steer",
            payload: { text: "reverted prompt" },
          },
        ],
      }),
    )
    await pending
    expect({
      pending: f.data.session.pending.list("ses_test"),
      messages: f.data.session.message.list("ses_test"),
    }).toEqual({ pending: [], messages: [] })
    expect(reads).toBe(2)
  } finally {
    f.dispose()
  }
})

test("continued inbox mutation cannot turn one pending sync into an unbounded read loop", async () => {
  let reads = 0
  let mutate = true
  const f = fixture(() => {
    reads++
    if (mutate && reads <= 10)
      f.emit({
        type: "session.inbox.delivery.changed",
        id: `evt_delivery${reads}`,
        created: reads,
        durable: { aggregateID: "ses_test", seq: reads, version: 1 },
        data: { sessionID: "ses_test", inboxID: "msg_003", delivery: reads % 2 === 0 ? "steer" : "queue" },
      })
    return Response.json({ data: [] })
  })
  try {
    await f.data.session.pending.sync("ses_test")
    expect(reads).toBe(2)
    mutate = false
    await f.data.session.pending.sync("ses_test")
    expect(reads).toBe(3)
  } finally {
    f.dispose()
  }
})
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

test("viewed metadata overlapping every GET does not drive transcript repair", async () => {
  let reads = 0
  const f = fixture(() => {
    reads++
    if (reads <= 10)
      f.emit({
        type: "session.viewed",
        id: `evt_viewed${reads}`,
        created: reads,
        durable: { aggregateID: "ses_test", seq: reads, version: 1 },
        data: { sessionID: "ses_test", idle: reads },
      })
    return Response.json({ data: [assistant("unchanged")], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    expect(reads).toBe(1)
  } finally {
    f.dispose()
  }
})
;(isServer ? test.skip : test).each([false, true])(
  "offline Session deletion ends one automatic episode, but explicit reads/reconnect can retry (probe: %s)",
  async (probe) => {
    const [status, setStatus] = createSignal("connected")
    const absent = { _tag: "SessionNotFoundError", sessionID: "ses_test", message: "Session no longer exists" }
    let missing = false
    let failures = 0
    const errors: unknown[] = []
    const f = fixture(
      (url) => {
        if (!url.pathname.includes("/message")) return Response.json({ data: [], cursor: {} })
        if (missing) {
          failures++
          return Response.json(absent, { status: 404 })
        }
        if (!url.pathname.endsWith("/message")) return Response.json({ data: assistant("kept") })
        return Response.json({ data: [assistant("kept")], cursor: probe ? { next: "older" } : {} })
      },
      {
        connection: { status },
        onError: (error) => {
          errors.push(error)
        },
      },
    )
    try {
      f.emit({ type: "server.connected", id: "evt_connected", data: {} })
      await f.data.session.message.sync("ses_test")
      setStatus("disconnected")
      missing = true // Deleted while offline: no deletion event will be replayed.
      setStatus("connected")
      f.emit({ type: "server.connected", id: "evt_reconnected", data: {} })
      await until(() => failures >= 1)
      await Bun.sleep(180)
      expect(failures).toBe(1)
      expect(errors.filter(isSessionNotFoundError)).toHaveLength(1)
      expect(f.data.session.message.list("ses_test")).toEqual([assistant("kept")])
      await expect(f.data.session.message.sync("ses_test")).rejects.toEqual(absent)
      await Bun.sleep(25)
      expect(failures).toBe(2)
      f.emit({ type: "server.connected", id: "evt_reconnected_again", data: {} })
      await until(() => failures >= 3)
      await Bun.sleep(25)
      expect(failures).toBe(3)
      missing = false
      await f.data.session.message.sync("ses_test")
      expect(f.data.session.message.list("ses_test")).toEqual([assistant("kept")])
    } finally {
      f.dispose()
    }
  },
)

test.each(["arbitrary 404", "transport"])(
  "%s is not decoded Session absence and retains transient repair",
  async (kind) => {
    let reads = 0
    const errors: unknown[] = []
    const f = fixture(
      () => {
        reads++
        if (reads === 2) {
          if (kind === "transport") throw new Error("upstream network failed with 404")
          return Response.json({ message: "proxy route missing" }, { status: 404 })
        }
        return Response.json({ data: [assistant(reads === 1 ? "ephemeral" : "canonical")], cursor: {} })
      },
      {
        onError: (error) => {
          errors.push(error)
        },
      },
    )
    try {
      await f.data.session.message.sync("ses_test")
      f.emit(failed)
      await until(() => reads === 3)
      await Bun.sleep(0)
      expect(f.data.session.message.list("ses_test")).toEqual([assistant("canonical")])
      expect(errors).toHaveLength(1)
      await Bun.sleep(25)
      expect(reads).toBe(3)
    } finally {
      f.dispose()
    }
  },
)

test("terminal floods retain one automatic failure observer on a held repair", async () => {
  const captured = Promise.withResolvers<Response>()
  const errors: unknown[] = []
  let reads = 0
  const canonical = assistant("", 3)
  const f = fixture(
    () =>
      ++reads === 2
        ? captured.promise
        : Response.json({ data: [reads === 1 ? assistant("ephemeral") : canonical], cursor: {} }),
    {
      onError: (error) => {
        errors.push(error)
      },
    },
  )
  try {
    await f.data.session.message.sync("ses_test")
    f.emit(failed)
    await until(() => reads === 2)
    for (let i = 0; i < 100; i++) f.emit(failed)
    captured.resolve(Response.json({ message: "unavailable" }, { status: 503 }))
    await until(() => errors.length > 0)
    expect(errors).toHaveLength(1)
    await until(() => reads === 3)
    await Bun.sleep(0)
    expect(f.data.session.message.get("ses_test", "msg_assistant")).toEqual(canonical)
  } finally {
    captured.resolve(Response.json({ data: [], cursor: {} }))
    f.dispose()
  }
})

test("terminal repair survives ordinary admit-only input superseding its last scan", async () => {
  let reads = 0
  const canonical = {
    ...assistant("", 3),
    finish: "error",
    error: { type: "unknown", message: "failure" },
  } satisfies SessionMessageInfo
  const f = fixture(() => {
    reads++
    if (reads === 2) f.emit({ ...failed, data: { ...failed.data, error: { type: "unknown", message: "failure" } } })
    if (reads === 3)
      f.emit({
        type: "session.inbox.enqueued",
        id: "evt_input",
        created: 4,
        durable: { aggregateID: "ses_test", seq: 5, version: 1 },
        data: {
          sessionID: "ses_test",
          inboxID: "msg_input",
          item: { type: "user", delivery: "queue", payload: { text: "admit only" } },
        },
      })
    return Response.json({ data: [reads >= 3 ? canonical : assistant("")], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    f.emit({
      type: "session.text.delta",
      id: "evt_delta",
      created: 2,
      data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: 0, delta: "ephemeral suffix" },
    })
    f.data.session.message.invalidate("ses_test")
    await f.data.session.message.sync("ses_test")
    expect(reads).toBe(3)
    await until(() => f.data.session.message.get("ses_test", "msg_assistant")?.type === "assistant" && reads === 4)
    await Bun.sleep(0)
    expect(f.data.session.message.get("ses_test", "msg_assistant")).toEqual(canonical)
    expect(f.data.session.pending.list("ses_test").map((item) => item.id)).toEqual(["msg_input"])
  } finally {
    f.dispose()
  }
})

test("outstanding repair backs off under sustained mutations and terminal floods, then reconciles quietly", async () => {
  let mutate = false
  const times: number[] = []
  const canonical = assistant("", 3)
  const f = fixture(() => {
    times.push(performance.now())
    if (mutate)
      f.emit({
        type: "session.inbox.enqueued",
        id: `evt_input${times.length}`,
        created: times.length,
        durable: { aggregateID: "ses_test", seq: times.length, version: 1 },
        data: {
          sessionID: "ses_test",
          inboxID: "msg_input",
          item: { type: "user", delivery: "queue", payload: { text: "admit only" } },
        },
      })
    return Response.json({ data: [times.length === 1 ? assistant("ephemeral") : canonical], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    mutate = true
    f.emit(failed)
    await f.data.session.message.sync("ses_test")
    expect(times).toHaveLength(3)
    for (let i = 0; i < 50; i++) f.emit(failed)
    await Bun.sleep(2)
    expect(times).toHaveLength(3)
    await until(() => times.length >= 9)
    expect(times).toHaveLength(9)
    expect(times[3]! - times[2]!).toBeGreaterThanOrEqual(8)
    expect(times[5]! - times[4]!).toBeGreaterThanOrEqual(18)
    expect(times[7]! - times[6]!).toBeGreaterThanOrEqual(38)
    mutate = false
    await until(() => times.length === 10)
    await Bun.sleep(0)
    expect(f.data.session.message.get("ses_test", "msg_assistant")).toEqual(canonical)
    await Bun.sleep(30)
    expect(times).toHaveLength(10)
  } finally {
    f.dispose()
  }
})

test.each(["evict", "delete", "dispose"])("outstanding scheduled repair is revoked by %s", async (action) => {
  let reads = 0
  const f = fixture(() => {
    reads++
    if (reads > 1)
      f.emit({
        ...ended,
        type: "session.text.started",
        data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: reads },
      })
    return Response.json({ data: [assistant("")], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    f.emit(failed)
    await f.data.session.message.sync("ses_test")
    expect(reads).toBe(3)
    if (action === "evict") f.data.session.evict("ses_test")
    if (action === "delete")
      f.emit({
        type: "session.deleted",
        id: "evt_delete",
        created: 4,
        durable: { aggregateID: "ses_test", seq: 4, version: 1 },
        data: { sessionID: "ses_test" },
      })
    if (action === "dispose") f.dispose()
    await Bun.sleep(35)
    expect(reads).toBe(3)
  } finally {
    f.dispose()
  }
})

test("HTTP failure retains repair duty and a slow retry owns no overlapping timer", async () => {
  const late = Promise.withResolvers<Response>()
  let reads = 0
  const errors: unknown[] = []
  const canonical = assistant("", 3)
  const f = fixture(
    () => {
      reads++
      if (reads === 2) return Response.json({ message: "unavailable" }, { status: 503 })
      if (reads === 3) return late.promise
      return Response.json({ data: [reads === 1 ? assistant("ephemeral") : canonical], cursor: {} })
    },
    {
      onError: (error) => {
        errors.push(error)
      },
    },
  )
  try {
    await f.data.session.message.sync("ses_test")
    f.emit(failed)
    await expect(f.data.session.message.sync("ses_test")).rejects.toBeDefined()
    await until(() => reads === 3)
    for (let i = 0; i < 50; i++) f.emit(failed)
    await Bun.sleep(45)
    expect(reads).toBe(3)
    late.resolve(Response.json({ data: [assistant("stale")], cursor: {} }))
    await until(() => reads === 4)
    await Bun.sleep(0)
    expect(f.data.session.message.get("ses_test", "msg_assistant")).toEqual(canonical)
    expect(errors).toHaveLength(1)
    await Bun.sleep(30)
    expect(reads).toBe(4)
  } finally {
    late.resolve(Response.json({ data: [], cursor: {} }))
    f.dispose()
  }
})
;(isServer ? test.skip : test)(
  "disconnect suspends outstanding duty until reconnect, without forgetting it",
  async () => {
    const [status, setStatus] = createSignal("connected")
    let reads = 0
    let mutate = true
    const canonical = assistant("", 3)
    const f = fixture(
      (url) => {
        if (!url.pathname.endsWith("/message")) return Response.json({ data: [], cursor: {} })
        reads++
        if (mutate && reads > 1)
          f.emit({
            ...ended,
            type: "session.text.started",
            data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: reads },
          })
        return Response.json({ data: [reads === 1 ? assistant("ephemeral") : canonical], cursor: {} })
      },
      { connection: { status }, onError: () => {} },
    )
    try {
      f.emit({ type: "server.connected", id: "evt_connected", data: {} })
      await f.data.session.message.sync("ses_test")
      f.emit(failed)
      await f.data.session.message.sync("ses_test")
      expect(reads).toBe(3)
      setStatus("disconnected")
      await Bun.sleep(35)
      expect(reads).toBe(3)
      mutate = false
      setStatus("connected")
      f.emit({ type: "server.connected", id: "evt_reconnected", data: {} })
      await until(() => reads === 4)
      await Bun.sleep(0)
      expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    } finally {
      f.dispose()
    }
  },
)

test("new terminal mutations coalesce without extending the original sync until quiescence", async () => {
  const late = Promise.withResolvers<Response>()
  let reads = 0
  const canonical = assistant("", 3)
  const f = fixture(() => {
    reads++
    if (reads === 2 || reads === 3) f.emit(ended)
    if (reads === 4) return late.promise
    return Response.json({ data: [reads === 5 ? canonical : assistant("captured")], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    f.data.session.message.invalidate("ses_test")
    const reading = f.data.session.message.sync("ses_test")
    await until(() => reads === 4)
    // The separately re-armed terminal job is held; the original two-scan job
    // must settle anyway, rather than append another attempt to its promise.
    expect(await Promise.race([reading.then(() => true), Bun.sleep(25).then(() => false)])).toBe(true)
    expect(f.data.session.message.list("ses_test")).not.toEqual([assistant("captured")])
    f.emit(failed)
    late.resolve(Response.json({ data: [assistant("stale")], cursor: {} }))
    await until(() => reads === 5)
    await Bun.sleep(0)
    expect(f.data.session.message.list("ses_test")).toEqual([canonical])
  } finally {
    late.resolve(Response.json({ data: [], cursor: {} }))
    f.dispose()
  }
})
;(isServer ? test.skip : test)(
  "a terminal event between snapshot publication and promise cleanup still repairs",
  async () => {
    let reads = 0
    const canonical = assistant("", 3)
    const f = fixture(() => Response.json({ data: [++reads === 1 ? assistant("captured") : canonical], cursor: {} }))
    const observer = createRoot((dispose) => {
      createMemo(() => {
        const row = f.data.session.message.list("ses_test")[0]
        if (row?.type === "assistant" && row.content.some((part) => part.type === "text" && part.text === "captured"))
          queueMicrotask(() => f.emit(failed))
      })
      return dispose
    })
    try {
      await f.data.session.message.sync("ses_test")
      await until(() => reads === 2)
      await Bun.sleep(0)
      expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    } finally {
      observer()
      f.dispose()
    }
  },
)

test.each([false, true])(
  "continued transcript mutation has a two-scan budget and preserves the final repair (terminal during last scan: %s)",
  async (during) => {
    let reads = 0
    let mutate = false
    const canonical = assistant("", 3)
    const f = fixture(() => {
      reads++
      if (mutate && reads < 12) {
        f.emit({
          type: "session.text.started",
          id: `evt_started${reads}`,
          created: reads,
          durable: { aggregateID: "ses_test", seq: reads, version: 1 },
          data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: reads },
        })
        if (during && reads === 3) {
          mutate = false
          f.emit(failed)
        }
        return Response.json({ data: [assistant("stale running")], cursor: {} })
      }
      return Response.json({ data: [reads === 1 ? assistant("baseline") : canonical], cursor: {} })
    })
    try {
      await f.data.session.message.sync("ses_test")
      mutate = true
      f.data.session.message.invalidate("ses_test")
      await f.data.session.message.sync("ses_test")
      if (!during) {
        expect(reads).toBe(3)
        await Bun.sleep(10)
        expect(reads).toBe(3)
        expect(f.data.session.message.list("ses_test")[0]).not.toEqual(assistant("stale running"))
        mutate = false
        f.emit(failed)
      }
      await until(() => reads === 4)
      await Bun.sleep(0)
      expect(f.data.session.message.list("ses_test")).toEqual([canonical])
      expect(reads).toBe(4)
    } finally {
      f.dispose()
    }
  },
)

test.each([false, true])(
  "optimistic creation guards transcript reads until the POST settles (failure: %s)",
  async (failure) => {
    const creation = Promise.withResolvers<Response>()
    let reads = 0
    const f = fixture((url) => {
      if (url.pathname === "/api/session") return creation.promise
      reads++
      return Response.json({ data: [], cursor: {} })
    })
    const info = {
      id: "ses_creating",
      projectID: "project",
      location: { directory: "/project" },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 1, updated: 1 },
    }
    try {
      const created = f.data.session.create({ id: info.id })
      const request = created.request.catch(() => undefined)
      await f.data.session.message.sync(created.id)
      f.data.session.message.invalidate(created.id)
      await f.data.session.message.sync(created.id)
      expect(f.data.session.creating(created.id)).toBe(true)
      expect(reads).toBe(0)
      creation.resolve(
        failure ? Response.json({ message: "rejected" }, { status: 500 }) : Response.json({ data: info }),
      )
      await request
      expect(f.data.session.creating(created.id)).toBe(false)
      if (failure) {
        expect(f.data.session.get(created.id)).toBeUndefined()
        expect(f.data.session.message.list(created.id)).toEqual([])
        return
      }
      await f.data.session.message.sync(created.id)
      expect(reads).toBe(1)
    } finally {
      creation.resolve(Response.json({ data: info }))
      f.dispose()
    }
  },
)

test("a foreign create does not enroll an unread transcript in terminal repair", async () => {
  let transcriptReads = 0
  const f = fixture((url) => {
    if (url.pathname.endsWith("/message")) transcriptReads++
    return Response.json({
      data: { id: "ses_test", location: { directory: "/project" }, time: { created: 1, updated: 1 } },
    })
  })
  try {
    f.emit({
      type: "session.created",
      id: "evt_created",
      created: 1,
      durable: { aggregateID: "ses_test", seq: 1, version: 1 },
      data: { sessionID: "ses_test", slug: "test", projectID: "project", location: { directory: "/project" } },
    })
    f.emit(failed)
    await Bun.sleep(0)
    expect(transcriptReads).toBe(0)
  } finally {
    f.dispose()
  }
})

test.each([false, true])(
  "an explicitly observed optimistic transcript repairs even when the terminal precedes POST settlement (%s)",
  async (before) => {
    const creation = Promise.withResolvers<Response>()
    let reads = 0
    const canonical = assistant("", 3)
    const f = fixture((url) => {
      if (url.pathname === "/api/session") return creation.promise
      reads++
      return Response.json({ data: [canonical], cursor: {} })
    })
    try {
      const created = f.data.session.create({ id: "ses_test" })
      await f.data.session.message.sync(created.id)
      expect(reads).toBe(0)
      if (before) f.emit(failed)
      creation.resolve(
        Response.json({
          data: {
            id: created.id,
            projectID: "project",
            location: { directory: "/project" },
            time: { created: 1, updated: 1 },
            cost: 0,
            tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          },
        }),
      )
      await created.request
      if (!before) f.emit(failed)
      await until(() => reads === 1)
      await Bun.sleep(0)
      expect(f.data.session.message.list(created.id)).toEqual([canonical])
    } finally {
      f.dispose()
    }
  },
)
