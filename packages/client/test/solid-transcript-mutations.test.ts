import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { OpenCode, type OpenCodeEvent, type SessionMessageInfo } from "../src/promise/index.ts"
import { createData, type CreateDataInput } from "../src/solid/data.ts"

// This matrix comes from the Core updater/projector audit in implementation-review-fixes2.
// Responses are canonical fixtures, not copies of the Client projection algorithm.
function fixture(read: (url: URL) => Response | Promise<Response>) {
  const listeners = new Set<Parameters<CreateDataInput["event"]["listen"]>[0]>()
  const api = OpenCode.make({
    baseUrl: "http://test",
    fetch: async (input, init) => read(new URL((input instanceof Request ? input : new Request(input, init)).url)),
  })
  return createRoot((dispose) => ({
    data: createData({
      api: () => api,
      directory: "/project",
      onError: () => {},
      event: {
        on: () => () => {},
        listen: (listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      },
    }),
    emit: (details: OpenCodeEvent) => listeners.forEach((listener) => listener({ name: details.type, details })),
    dispose,
  }))
}

const envelope = { id: "evt_change", created: 2, durable: { aggregateID: "ses_test", seq: 2, version: 1 as const } }
const skill: SessionMessageInfo = {
  id: "msg_change",
  type: "skill",
  skill: "review",
  name: "review",
  text: "Review instructions",
  time: { created: 2 },
}
const user: SessionMessageInfo = { id: "msg_input", type: "user", text: "admitted elsewhere", time: { created: 2 } }
const repaired: { event: OpenCodeEvent; canonical: SessionMessageInfo[] }[] = [
  {
    event: {
      ...envelope,
      type: "session.skill.activated",
      data: { sessionID: "ses_test", id: "review", name: "review", text: "Review instructions" },
    },
    canonical: [skill],
  },
  {
    event: {
      ...envelope,
      type: "session.created",
      data: { sessionID: "ses_test", slug: "import", projectID: "project", location: { directory: "/project" } },
    },
    canonical: [user],
  },
  {
    event: {
      ...envelope,
      durable: { ...envelope.durable, version: 2 },
      type: "session.forked",
      data: { sessionID: "ses_test", parentID: "ses_parent", boundary: { type: "after", messageID: "msg_parent" } },
    },
    canonical: [user],
  },
  {
    event: { ...envelope, type: "session.inbox.delivered", data: { sessionID: "ses_test", inboxID: user.id } },
    canonical: [user],
  },
  {
    event: {
      ...envelope,
      metadata: { source: "selection" },
      type: "session.agent.selected",
      data: { sessionID: "ses_test", agent: "build", previous: "plan" },
    },
    canonical: [
      {
        id: "msg_change",
        type: "agent-switched",
        agent: "build",
        previous: "plan",
        metadata: { source: "selection" },
        time: { created: 2 },
      },
    ],
  },
  {
    event: {
      ...envelope,
      type: "session.moved",
      data: { sessionID: "ses_test", location: { directory: "/destination" }, projectID: "project" },
    },
    canonical: [
      {
        id: "msg_change",
        type: "location-switched",
        location: { directory: "/destination" },
        projectID: "project",
        previous: { location: { directory: "/project" }, projectID: "project" },
        time: { created: 2 },
      },
    ],
  },
]

for (const scenario of repaired) {
  test.each([false, true])(
    `${scenario.event.type} repairs an observed cache without a later terminal (pending: %s)`,
    async (pending) => {
      const captured = Promise.withResolvers<Response>()
      let reads = 0
      const f = fixture((url) => {
        if (!url.pathname.endsWith("/message")) return Response.json({ data: {} })
        reads++
        return reads === 1 ? captured.promise : Response.json({ data: scenario.canonical, cursor: {} })
      })
      try {
        const reading = f.data.session.message.sync("ses_test")
        await until(() => reads === 1)
        if (!pending) {
          captured.resolve(Response.json({ data: [], cursor: {} }))
          await reading
        }
        // Skill mirrors Session.skill({ resume: false }); no execution or content replacement follows.
        f.emit(scenario.event)
        captured.resolve(Response.json({ data: [], cursor: {} }))
        await reading
        await until(() => reads === 2)
        await Bun.sleep(0)
        expect(f.data.session.message.list("ses_test")).toEqual(scenario.canonical)
        expect(f.data.session.message.list("ses_parent")).toEqual([])
        expect(reads).toBe(2)
      } finally {
        captured.resolve(Response.json({ data: [], cursor: {} }))
        f.dispose()
      }
    },
  )
  test(`${scenario.event.type} does not enroll a foreign transcript in repair`, async () => {
    let reads = 0
    const f = fixture((url) => {
      if (url.pathname.endsWith("/message")) reads++
      return Response.json({ data: {} })
    })
    try {
      f.emit(scenario.event)
      await Bun.sleep(15)
      expect(reads).toBe(0)
    } finally {
      f.dispose()
    }
  })
}

test("committed revert repairs canonical order instead of depending on lexical message IDs", async () => {
  let reads = 0
  const retained = { ...user, id: "msg_z" }
  const f = fixture(() =>
    Response.json({ data: ++reads === 1 ? [{ ...user, id: "msg_a" }, retained] : [retained], cursor: {} }),
  )
  try {
    await f.data.session.message.sync("ses_test")
    f.emit({ ...envelope, type: "session.revert.committed", data: { sessionID: "ses_test", to: "msg_a" } })
    await until(() => reads === 2)
    await Bun.sleep(0)
    expect(f.data.session.message.list("ses_test")).toEqual([retained])
  } finally {
    f.dispose()
  }
})

test("delivery of a known durable admission stays direct when the cache is complete", async () => {
  let reads = 0
  const f = fixture(() => {
    reads++
    return Response.json({ data: [], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    f.emit({
      ...envelope,
      created: 1,
      type: "session.inbox.enqueued",
      data: {
        sessionID: "ses_test",
        inboxID: user.id,
        item: { type: "user", delivery: "queue", payload: { text: user.text } },
      },
    })
    f.emit({ ...envelope, type: "session.inbox.delivered", data: { sessionID: "ses_test", inboxID: user.id } })
    await Bun.sleep(15)
    expect(reads).toBe(1)
    expect(f.data.session.message.list("ses_test")).toEqual([user])
    expect(f.data.session.pending.list("ses_test")).toEqual([])
  } finally {
    f.dispose()
  }
})

test("direct terminal fields project without another content update or authoritative GET", async () => {
  let reads = 0
  const f = fixture(() => {
    reads++
    return Response.json({
      data: [
        {
          id: "msg_assistant",
          type: "assistant",
          agent: "build",
          model: { id: "model", providerID: "provider" },
          content: [{ type: "text", text: "", state: { prior: true } }],
          snapshot: { start: "before" },
          time: { created: 1 },
        },
      ],
      cursor: {},
    })
  })
  try {
    await f.data.session.message.sync("ses_test")
    f.emit({
      ...envelope,
      type: "session.text.ended",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_assistant",
        ordinal: 0,
        text: "canonical",
        state: { signature: "new" },
      },
    })
    f.emit({
      ...envelope,
      type: "session.step.ended",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_assistant",
        finish: "stop",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        files: ["edited.ts"],
      },
    })
    const completed = f.data.session.message.get("ses_test", "msg_assistant")
    expect(completed?.type === "assistant" && completed.content).toEqual([
      { type: "text", text: "canonical", state: { signature: "new" } },
    ])
    expect(completed?.type === "assistant" && completed.snapshot).toEqual({ start: "before", files: ["edited.ts"] })
    f.emit({
      ...envelope,
      type: "session.text.ended",
      data: { sessionID: "ses_test", assistantMessageID: "msg_assistant", ordinal: 0, text: "canonical" },
    })
    const row = f.data.session.message.get("ses_test", "msg_assistant")
    expect(row?.type === "assistant" && row.content[0]?.type === "text" && row.content[0].state).toBeUndefined()
    await Bun.sleep(0)
    expect(reads).toBe(1)
  } finally {
    f.dispose()
  }
})

test.each([false, true])("direct compaction preserves event metadata (started first: %s)", async (started) => {
  let reads = 0
  const f = fixture(() => {
    reads++
    return Response.json({ data: [], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    if (started)
      f.emit({
        ...envelope,
        metadata: { origin: "control" },
        type: "session.compaction.started",
        data: { sessionID: "ses_test", reason: "manual" },
      })
    f.emit({
      ...envelope,
      metadata: { origin: "control" },
      type: "session.compaction.ended",
      data: { sessionID: "ses_test", reason: "manual", text: "summary", recent: "" },
    })
    expect(f.data.session.message.list("ses_test")).toEqual([
      {
        id: "msg_change",
        type: "compaction",
        status: "completed",
        reason: "manual",
        summary: "summary",
        recent: "",
        metadata: { origin: "control" },
        time: { created: 2 },
      },
    ])
    await Bun.sleep(0)
    expect(reads).toBe(1)
  } finally {
    f.dispose()
  }
})

test("an overlapping direct settlement repairs canonical fields without a content replacement", async () => {
  const captured = Promise.withResolvers<Response>()
  let reads = 0
  const canonical: SessionMessageInfo = {
    id: "msg_assistant",
    type: "assistant",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [{ type: "text", text: "canonical", state: { signature: "new" } }],
    snapshot: { start: "before", files: ["edited.ts"] },
    finish: "stop",
    time: { created: 1, completed: 2 },
  }
  const f = fixture(() => (++reads === 1 ? captured.promise : Response.json({ data: [canonical], cursor: {} })))
  try {
    const reading = f.data.session.message.sync("ses_test")
    await until(() => reads === 1)
    f.emit({
      ...envelope,
      type: "session.text.ended",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_assistant",
        ordinal: 0,
        text: "canonical",
        state: { signature: "new" },
      },
    })
    f.emit({
      ...envelope,
      type: "session.step.ended",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_assistant",
        finish: "stop",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        files: ["edited.ts"],
      },
    })
    captured.resolve(Response.json({ data: [], cursor: {} }))
    await reading
    expect(f.data.session.message.list("ses_test")).toEqual([canonical])
    expect(reads).toBe(2)
  } finally {
    captured.resolve(Response.json({ data: [], cursor: {} }))
    f.dispose()
  }
})

async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await Bun.sleep(1)
  }
  throw new Error("canonical mutation was not reconciled")
}

test.each(["current", "load-more", "evict", "delete", "dispose", "recreate"])(
  "model-selection point hydration respects existing row lifetime (%s)",
  async (action) => {
    const response = Promise.withResolvers<Response>()
    let points = 0
    const model = { id: "model", providerID: "provider" }
    const canonical: SessionMessageInfo = {
      id: "msg_model",
      type: "model-switched",
      model,
      previous: { id: "old", providerID: "provider" },
      time: { created: 2 },
    }
    const selection: OpenCodeEvent = {
      ...envelope,
      id: "evt_model",
      type: "session.model.selected",
      data: { sessionID: "ses_test", model },
    }
    const f = fixture((url) => {
      if (url.pathname.endsWith("/message/msg_model")) {
        points++
        return points === 1
          ? response.promise
          : Response.json({ data: { ...canonical, previous: { id: "new-owner", providerID: "provider" } } })
      }
      if (url.searchParams.has("cursor")) return Response.json({ data: [user], cursor: {} })
      return Response.json({ data: [], cursor: action === "load-more" ? { next: "older" } : {} })
    })
    try {
      await f.data.session.message.sync("ses_test")
      f.emit(selection)
      await until(() => points === 1)
      if (action === "load-more") await f.data.session.message.loadMore("ses_test")
      if (action === "evict" || action === "recreate") f.data.session.evict("ses_test")
      if (action === "delete") f.emit({ ...envelope, type: "session.deleted", data: { sessionID: "ses_test" } })
      if (action === "recreate") {
        await f.data.session.message.sync("ses_test")
        f.emit(selection)
        await until(() => {
          const row = f.data.session.message.get("ses_test", "msg_model")
          return row?.type === "model-switched" && row.previous?.id === "new-owner"
        })
      }
      const before = JSON.stringify(f.data.session.message.list("ses_test"))
      if (action === "dispose") f.dispose()
      response.resolve(Response.json({ data: canonical }))
      await Bun.sleep(15)
      if (action === "current" || action === "load-more") {
        expect(f.data.session.message.get("ses_test", "msg_model")).toEqual(canonical)
        expect(points).toBe(1)
        return
      }
      expect(JSON.stringify(f.data.session.message.list("ses_test"))).toBe(before)
    } finally {
      response.resolve(Response.json({ data: canonical }))
      f.dispose()
    }
  },
)

test.each(["user", "synthetic"] as const)(
  "canonical %s input acknowledgment survives a late optimistic POST failure",
  async (type) => {
    const response = Promise.withResolvers<Response>()
    let posted = false
    let reads = 0
    const canonical: SessionMessageInfo = {
      id: "msg_input",
      type,
      text: "server-admitted payload",
      time: { created: 2 },
    }
    const f = fixture((url) => {
      if (url.pathname.endsWith("/prompt")) {
        posted = true
        return response.promise
      }
      return Response.json({ data: ++reads === 1 ? [] : [canonical], cursor: {} })
    })
    try {
      await f.data.session.message.sync("ses_test")
      const posting = f.data.session
        .prompt({ sessionID: "ses_test", id: canonical.id, text: "local optimistic payload" })
        .catch((error: unknown) => error)
      await until(() => posted)
      // The enqueue was missed. Canonical input identity/payload is authoritative,
      // even if this POST was a conflicting retry of an earlier synthetic admission.
      f.emit({ ...envelope, type: "session.inbox.delivered", data: { sessionID: "ses_test", inboxID: canonical.id } })
      await until(() => reads === 2)
      await f.data.session.message.sync("ses_test")
      expect(f.data.session.message.list("ses_test")).toEqual([canonical])
      expect(f.data.session.pending.list("ses_test")).toEqual([])
      response.reject(new Error("POST response lost after server admission"))
      expect(await posting).toHaveProperty("reason", "Transport")
      expect(f.data.session.message.list("ses_test")).toEqual([canonical])
      expect(f.data.session.pending.list("ses_test")).toEqual([])
    } finally {
      response.resolve(new Response(null, { status: 204 }))
      f.dispose()
    }
  },
)

test.each(["absent", "failed", "superseded"])(
  "%s canonical read does not acknowledge an unconfirmed optimistic input",
  async (kind) => {
    const response = Promise.withResolvers<Response>()
    let posted = false
    let reads = 0
    const other: SessionMessageInfo = {
      id: "msg_other",
      type: "synthetic",
      text: "unrelated canonical input",
      time: { created: 2 },
    }
    const f = fixture((url) => {
      if (url.pathname.endsWith("/prompt")) {
        posted = true
        return response.promise
      }
      reads++
      if (reads === 1) return Response.json({ data: [], cursor: {} })
      if (reads === 2 && kind === "failed") return Response.json({ message: "snapshot failed" }, { status: 503 })
      if (reads === 2 && kind === "superseded") {
        f.emit({
          ...envelope,
          type: "session.text.started",
          data: { sessionID: "ses_test", assistantMessageID: "msg_missing", ordinal: 0 },
        })
        return Response.json({
          data: [{ id: "msg_input", type: "user", text: "superseded snapshot", time: { created: 1 } }],
          cursor: {},
        })
      }
      return Response.json({ data: [other], cursor: {} })
    })
    try {
      await f.data.session.message.sync("ses_test")
      const posting = f.data.session
        .prompt({ sessionID: "ses_test", id: "msg_input", text: "still unconfirmed" })
        .catch((error: unknown) => error)
      await until(() => posted)
      f.data.session.message.invalidate("ses_test")
      await f.data.session.message.sync("ses_test").catch(() => undefined)
      expect(f.data.session.message.get("ses_test", "msg_input")).toHaveProperty("text", "still unconfirmed")
      expect(f.data.session.pending.list("ses_test").map((row) => row.id)).toEqual(["msg_input"])
      response.reject(new Error("admission failed"))
      expect(await posting).toHaveProperty("reason", "Transport")
      expect(f.data.session.message.get("ses_test", "msg_input")).toBeUndefined()
      expect(f.data.session.pending.list("ses_test")).toEqual([])
      expect(f.data.session.message.list("ses_test")).toEqual(kind === "failed" ? [] : [other])
    } finally {
      response.resolve(new Response(null, { status: 204 }))
      f.dispose()
    }
  },
)

test("canonical input in another Session does not acknowledge this Session's optimistic retry", async () => {
  const response = Promise.withResolvers<Response>()
  let posted = false
  const f = fixture((url) => {
    if (url.pathname.endsWith("/prompt")) {
      posted = true
      return response.promise
    }
    return Response.json({ data: url.pathname.includes("/ses_other/") ? [user] : [], cursor: {} })
  })
  try {
    await f.data.session.message.sync("ses_test")
    const posting = f.data.session
      .prompt({ sessionID: "ses_test", id: user.id, text: "unconfirmed here" })
      .catch((error: unknown) => error)
    await until(() => posted)
    await f.data.session.message.sync("ses_other")
    response.reject(new Error("conflicting Session admission failed"))
    expect(await posting).toHaveProperty("reason", "Transport")
    expect(f.data.session.message.list("ses_test")).toEqual([])
    expect(f.data.session.pending.list("ses_test")).toEqual([])
    expect(f.data.session.message.list("ses_other")).toEqual([user])
  } finally {
    response.resolve(new Response(null, { status: 204 }))
    f.dispose()
  }
})

test("metadata and textless instructions neither supersede a GET nor schedule transcript work", async () => {
  const captured = Promise.withResolvers<Response>()
  let reads = 0
  const f = fixture((url) => {
    if (!url.pathname.endsWith("/message")) return Response.json({ data: {} })
    reads++
    return captured.promise
  })
  try {
    const reading = f.data.session.message.sync("ses_test")
    await until(() => reads === 1)
    f.emit({ ...envelope, type: "session.viewed", data: { sessionID: "ses_test", idle: 2 } })
    f.emit({ ...envelope, type: "session.renamed", data: { sessionID: "ses_test", title: "metadata" } })
    f.emit({
      ...envelope,
      type: "session.usage.recorded",
      data: {
        sessionID: "ses_test",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    })
    f.emit({ ...envelope, type: "session.instructions.updated", data: { sessionID: "ses_test", delta: {} } })
    f.emit({
      ...envelope,
      type: "session.inbox.delivery.changed",
      data: { sessionID: "ses_test", inboxID: "msg_input", delivery: "queue" },
    })
    captured.resolve(Response.json({ data: [user], cursor: {} }))
    await reading
    await Bun.sleep(25)
    expect(f.data.session.message.list("ses_test")).toEqual([user])
    expect(reads).toBe(1)
  } finally {
    captured.resolve(Response.json({ data: [], cursor: {} }))
    f.dispose()
  }
})
