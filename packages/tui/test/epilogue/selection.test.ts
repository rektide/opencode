import { expect, test } from "bun:test"
import {
  orderEpilogueSessions,
  selectEpilogueSessions,
  type EpilogueSelectionRule,
  type EpilogueSession,
} from "../../src/epilogue/selection.ts"

test("pins current separately and sorts distinct additional sessions by activity and stable ID", () => {
  const source = orderEpilogueSessions({
    currentID: "ses_current",
    sessions: [
      session("ses_z", 10),
      session("ses_current", -10),
      session("ses_running", 0, "running"),
      session("ses_a", 10),
      session("ses_idle", 3, "idle", 12),
      undefined,
      session("ses_z", 100),
      session("ses_current", 200),
    ],
  })

  expect(Array.from(selectEpilogueSessions({ source, now: 20 })).map((item) => item.sessionID)).toEqual([
    "ses_current",
    "ses_running",
    "ses_idle",
    "ses_a",
    "ses_z",
  ])
})

test("runs stages lazily in written order and ignores unauthorized stops for both kept and dropped inputs", () => {
  const calls: string[] = []
  const source = orderEpilogueSessions({ sessions: [session("ses_a", 3), session("ses_b", 2), session("ses_c", 1)] })
  const selected = selectEpilogueSessions({
    source: {
      ...source,
      additional: (function* () {
        for (const item of source.additional) {
          calls.push(`input:${item.sessionID}`)
          yield item
        }
      })(),
    },
    now: 42,
    rules: [
      {
        type: "filter",
        terminating: false,
        evaluate(item, scope) {
          calls.push(`first:${item.sessionID}:${scope.index}:${scope.now}`)
          return { keep: item.sessionID !== "ses_b", terminate: true }
        },
      },
      {
        type: "filter",
        terminating: false,
        evaluate(item, scope) {
          calls.push(`second:${item.sessionID}:${scope.index}`)
          return { keep: true }
        },
      },
    ],
  })

  expect(calls).toEqual([])
  expect(selected.next().value?.sessionID).toBe("ses_a")
  expect(calls).toEqual(["input:ses_a", "first:ses_a:0:42", "second:ses_a:0"])
  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(["ses_c"])
  expect(calls).toEqual([
    "input:ses_a",
    "first:ses_a:0:42",
    "second:ses_a:0",
    "input:ses_b",
    "first:ses_b:1:42",
    "input:ses_c",
    "first:ses_c:2:42",
    "second:ses_c:1",
  ])
})

test.each([true, false])("authorized stop preserves keep=%s and closes upstream without visiting its tail", (keep) => {
  const visits: string[] = []
  let closed = false
  const source = orderEpilogueSessions({ sessions: [session("ses_a", 3), session("ses_b", 2), session("ses_c", 1)] })
  const selected = selectEpilogueSessions({
    source: {
      ...source,
      additional: (function* () {
        try {
          for (const item of source.additional) {
            visits.push(item.sessionID)
            yield item
          }
        } finally {
          closed = true
        }
      })(),
    },
    now: 42,
    rules: [
      {
        type: "filter",
        terminating: true,
        evaluate: () => ({ keep, terminate: true }),
      },
    ],
  })

  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(keep ? ["ses_a"] : [])
  expect(visits).toEqual(["ses_a"])
  expect(closed).toBe(true)
})

test("membership narrows additional sessions without admitting missing metadata or filtering current", () => {
  const evaluated: string[] = []
  const source = orderEpilogueSessions({
    currentID: "ses_current",
    sessions: [session("ses_other", 3), session("ses_tab", 2), session("ses_current", 1), undefined],
  })
  const selected = selectEpilogueSessions({
    source,
    now: 42,
    rules: [
      {
        type: "filter",
        terminating: false,
        evaluate(item) {
          evaluated.push(item.sessionID)
          return { keep: true }
        },
      },
      { type: "membership", sessionIDs: new Set(["ses_tab", "ses_missing"]), terminating: false },
    ],
  })

  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(["ses_current", "ses_tab"])
  expect(evaluated).toEqual(["ses_other", "ses_tab"])
})

test.each([true, false])("the inclusive 2d cutoff stops safely in activity order with authority=%s", (terminating) => {
  const now = 2_000_000_000_000
  const within = 172_800_000
  const visits: string[] = []
  const source = orderEpilogueSessions({
    currentID: "ses_current",
    sessions: [
      session("ses_old", now - within - 1),
      session("ses_tail", now - within - 2),
      session("ses_edge", now - within),
      session("ses_current", 0),
      session("ses_running", 0, "running"),
      session("ses_idle", 0, "idle", now - 1),
      session("ses_not_member", now),
    ],
  })
  const selected = Array.from(
    selectEpilogueSessions({
      source: {
        ...source,
        additional: (function* () {
          for (const item of source.additional) {
            visits.push(item.sessionID)
            yield item
          }
        })(),
      },
      now,
      rules: [
        {
          type: "membership",
          sessionIDs: new Set(["ses_running", "ses_idle", "ses_edge", "ses_old", "ses_tail"]),
          terminating: false,
        },
        { type: "activity-within", within_ms: within, terminating },
      ],
    }),
  )

  expect(selected.map((item) => item.sessionID)).toEqual(["ses_current", "ses_running", "ses_idle", "ses_edge"])
  expect(selected[1]?.activity).toEqual({ status: "running", updated: 0, idle: undefined })
  expect(visits).toEqual([
    "ses_running",
    "ses_not_member",
    "ses_idle",
    "ses_edge",
    "ses_old",
    ...(terminating ? [] : ["ses_tail"]),
  ])
})

test("limit counts preceding-stage inputs so filter then limit differs from limit then filter", () => {
  const membership: EpilogueSelectionRule = {
    type: "membership",
    sessionIDs: new Set(["ses_b", "ses_c"]),
    terminating: false,
  }
  const limit: EpilogueSelectionRule = { type: "limit", count: 1, terminating: true }
  const source = orderEpilogueSessions({
    currentID: "ses_current",
    sessions: [session("ses_a", 3), session("ses_b", 2), session("ses_c", 1), session("ses_current", 0)],
  })
  const run = (rules: readonly EpilogueSelectionRule[]) => {
    const visits: string[] = []
    const selected = selectEpilogueSessions({
      source: {
        ...source,
        additional: (function* () {
          for (const item of source.additional) {
            visits.push(item.sessionID)
            yield item
          }
        })(),
      },
      now: 42,
      rules,
    })
    return { ids: Array.from(selected).map((item) => item.sessionID), visits }
  }

  expect(run([membership, limit])).toEqual({ ids: ["ses_current", "ses_b"], visits: ["ses_a", "ses_b"] })
  expect(run([limit, membership])).toEqual({ ids: ["ses_current"], visits: ["ses_a"] })
})

test.each([0, 1])("a non-terminating limit of %s drops excess items but keeps consuming upstream", (count) => {
  const visits: string[] = []
  const source = orderEpilogueSessions({ sessions: [session("ses_a", 3), session("ses_b", 2), session("ses_c", 1)] })
  const selected = selectEpilogueSessions({
    source: {
      ...source,
      additional: (function* () {
        for (const item of source.additional) {
          visits.push(item.sessionID)
          yield item
        }
      })(),
    },
    now: 42,
    rules: [{ type: "limit", count, terminating: false }],
  })

  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(count === 0 ? [] : ["ses_a"])
  expect(visits).toEqual(["ses_a", "ses_b", "ses_c"])
})

test.each(["ses_current", undefined])("zero limit never opens upstream and still preserves current=%s", (currentID) => {
  const source = orderEpilogueSessions({ sessions: [session("ses_current", 0)], currentID })
  const selected = selectEpilogueSessions({
    source: {
      ...source,
      additional: (function* () {
        throw new Error("zero limit must not pull its upstream")
      })(),
    },
    now: 42,
    rules: [{ type: "limit", count: 0, terminating: true }],
  })

  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(currentID ? [currentID] : [])
})

test.each([
  { now: Number.NaN, rules: [], error: "Epilogue selection requires a finite now" },
  { now: Infinity, rules: [], error: "Epilogue selection requires a finite now" },
  {
    now: 42,
    rules: [{ type: "activity-within", within_ms: -1, terminating: true }],
    error: "Epilogue activity window must be finite and nonnegative",
  },
  {
    now: 42,
    rules: [{ type: "activity-within", within_ms: Infinity, terminating: true }],
    error: "Epilogue activity window must be finite and nonnegative",
  },
  {
    now: 42,
    rules: [{ type: "limit", count: -1, terminating: true }],
    error: "Epilogue limit must be a nonnegative integer",
  },
  {
    now: 42,
    rules: [{ type: "limit", count: 1.5, terminating: true }],
    error: "Epilogue limit must be a nonnegative integer",
  },
] satisfies { now: number; rules: EpilogueSelectionRule[]; error: string }[])(
  "rejects invalid selection parameters before yielding current",
  (input) => {
    const source = orderEpilogueSessions({ sessions: [session("ses_current", 0)], currentID: "ses_current" })
    expect(() => selectEpilogueSessions({ source, now: input.now, rules: input.rules }).next()).toThrow(input.error)
  },
)

test.each([
  { sessions: [], currentID: undefined, expected: [] },
  { sessions: [undefined], currentID: "ses_missing", expected: [] },
  { sessions: [session("ses_a", 0), undefined], currentID: "ses_missing", expected: ["ses_a"] },
  { sessions: [session("ses_a", 0)], currentID: undefined, expected: ["ses_a"] },
])("empty or missing current metadata never fabricates a pinned session", (input) => {
  const source = orderEpilogueSessions(input)
  expect(Array.from(selectEpilogueSessions({ source, now: 42 })).map((item) => item.sessionID)).toEqual([...input.expected])
})

test("ties use stable ID order within both running and idle groups without changing timestamps", () => {
  const source = orderEpilogueSessions({
    sessions: [
      session("ses_running_z", 1, "running", 5),
      session("ses_idle_z", 100),
      session("ses_running_a", 5, "running"),
      session("ses_idle_a", 1, "idle", 100),
    ],
  })

  expect(Array.from(selectEpilogueSessions({ source, now: 1_000 })).map((item) => item.sessionID)).toEqual([
    "ses_running_a",
    "ses_running_z",
    "ses_idle_a",
    "ses_idle_z",
  ])
})

test("sorting scans all metadata even when lazy selection only visits the first additional session", () => {
  const discovered: string[] = []
  const evaluated: string[] = []
  const source = orderEpilogueSessions({
    sessions: (function* () {
      for (const item of [session("ses_old", 1), session("ses_new", 3), session("ses_middle", 2)]) {
        discovered.push(item.sessionID)
        yield item
      }
    })(),
  })
  expect(discovered).toEqual(["ses_old", "ses_new", "ses_middle"])
  const selected = selectEpilogueSessions({
    source,
    now: 42,
    rules: [
      {
        type: "filter",
        terminating: false,
        evaluate(item) {
          evaluated.push(item.sessionID)
          return { keep: true }
        },
      },
      { type: "limit", count: 1, terminating: true },
    ],
  })
  expect(evaluated).toEqual([])
  expect(Array.from(selected).map((item) => item.sessionID)).toEqual(["ses_new"])
  expect(evaluated).toEqual(["ses_new"])
})

test("yielding only pinned current does not start additional-session traversal", () => {
  const source = orderEpilogueSessions({ sessions: [session("ses_current", 0)], currentID: "ses_current" })
  const selected = selectEpilogueSessions({
    source: {
      ...source,
      additional: (function* () {
        throw new Error("additional sessions must remain lazy")
      })(),
    },
    now: 42,
  })
  expect(selected.next().value?.sessionID).toBe("ses_current")
  expect(selected.return(undefined)).toEqual({ value: undefined, done: true })
})

test("zero activity window uses explicit now inclusively, admits future activity, and always keeps running", () => {
  const source = orderEpilogueSessions({
    sessions: [
      session("ses_now", 42),
      session("ses_past", 41),
      session("ses_future", 43),
      session("ses_running", 0, "running"),
    ],
  })
  const rules: readonly EpilogueSelectionRule[] = [{ type: "activity-within", within_ms: 0, terminating: true }]
  expect(Array.from(selectEpilogueSessions({ source, now: 42, rules })).map((item) => item.sessionID)).toEqual([
    "ses_running",
    "ses_future",
    "ses_now",
  ])
  expect(Array.from(selectEpilogueSessions({ source, now: 43, rules })).map((item) => item.sessionID)).toEqual([
    "ses_running",
    "ses_future",
  ])
})

function session(
  sessionID: string,
  updated: number,
  status: "idle" | "running" = "idle",
  idle?: number,
): EpilogueSession {
  return { sessionID, activity: { status, updated, idle } }
}
