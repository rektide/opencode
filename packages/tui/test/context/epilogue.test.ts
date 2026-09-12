import { expect, test } from "bun:test"
import type { EpilogueSelectionRule } from "@opencode/plugin/tui/context"
import { createTestRenderer } from "@opentui/core/testing"
import { createComputed, createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import {
  createEpilogue,
  epilogueLimits,
  normalizeEpilogueContribution,
  normalizeEpilogueTitle,
  trackEpilogue,
  transformEpilogueSelection,
  type EpilogueContributionGroup,
} from "../../src/context/epilogue.tsx"
import type { RetainedEpilogue } from "../../src/util/presentation.ts"

test("tracks global projections once and isolates per-Session reactive recomputation", () => {
  const [state, setState] = createStore({ global: "global", a: "alpha", b: "beta", unrelated: 0 })
  const [sessionIDs, setSessionIDs] = createSignal<readonly string[]>(["ses_a", "ses_b"])
  const calls = { global: 0, a: 0, b: 0 }
  let retained!: RetainedEpilogue
  let dispose = () => {}

  createRoot((stop) => {
    dispose = stop
    trackEpilogue({
      currentID: () => "ses_a",
      sessionIDs,
      candidate: session,
      groups: () => [
        {
          plugin: "fixture",
          contributions: [
            {
              key: "global",
              contribution: {
                type: "projection",
                scope: "global",
                project: () => {
                  calls.global++
                  return row("Global", state.global)
                },
              },
            },
            {
              key: "session",
              contribution: {
                type: "projection",
                scope: "session",
                project: ({ sessionID }) => {
                  calls[sessionID === "ses_a" ? "a" : "b"]++
                  return row("Scoped", sessionID === "ses_a" ? state.a : state.b)
                },
              },
            },
          ],
        },
      ],
      publish: (value) => {
        retained = value
      },
      report: () => {},
    })
  })

  expect(calls).toEqual({ global: 1, a: 1, b: 1 })
  expect(retained.globalRows).toEqual([row("Global", "global")])
  expect(retained.sessions.map((item) => [item.candidate.sessionID, item.rows[0]?.value])).toEqual([
    ["ses_a", { type: "text", text: "alpha" }],
    ["ses_b", { type: "text", text: "beta" }],
  ])

  setState("a", "updated")
  expect(calls).toEqual({ global: 1, a: 2, b: 1 })
  setState("unrelated", 1)
  expect(calls).toEqual({ global: 1, a: 2, b: 1 })
  setState("global", "changed")
  expect(calls).toEqual({ global: 2, a: 2, b: 1 })

  setSessionIDs(["ses_b", "ses_a"])
  expect(calls).toEqual({ global: 2, a: 2, b: 1 })
  expect(retained.sessions.map((item) => item.candidate.sessionID)).toEqual(["ses_b", "ses_a"])
  dispose()
})

test("freezes selected candidates and cached projections while retained rows keep updating", () => {
  const [value, setValue] = createSignal("before")
  const [available, setAvailable] = createSignal(true)
  const [sessionIDs, setSessionIDs] = createSignal<readonly string[]>(["ses_a"])
  let calls = 0
  let retained!: RetainedEpilogue
  let dispose = () => {}
  const projection = {
    key: "projection",
    contribution: {
      type: "projection" as const,
      scope: "session" as const,
      project: () => {
        calls++
        return row("Projected", value())
      },
    },
  }
  const [groups, setGroups] = createSignal<readonly EpilogueContributionGroup[]>([
    { plugin: "fixture", contributions: [projection] },
  ])

  createRoot((stop) => {
    dispose = stop
    const tracked = trackEpilogue({
      currentID: () => "ses_a",
      sessionIDs,
      candidate: (sessionID) => (available() ? session(sessionID) : undefined),
      groups,
      publish: (value) => {
        retained = value
      },
      report: () => {},
    })

    expect(tracked.beginCollection()).toEqual(["ses_a"])
    setValue("too late")
    setAvailable(false)
    setSessionIDs(["ses_b"])
    setGroups([
      {
        plugin: "fixture",
        contributions: [
          projection,
          {
            key: "retained",
            contribution: { type: "retained", scope: "session", sessionID: "ses_a", value: row("Retained", "new") },
          },
        ],
      },
    ])
  })

  expect(calls).toBe(1)
  expect(retained.sessions).toEqual([
    { candidate: session("ses_a"), rows: [row("Projected", "before"), row("Retained", "new")] },
  ])
  dispose()
})

test("retained values normalize once at publication, remain scoped, and do not admit Sessions", async () => {
  const global = row("Global", "retained")
  const a = row("Scoped", "alpha")
  const b = row("Scoped", "beta")
  expect(() =>
    normalizeEpilogueContribution({
      type: "retained",
      scope: "session",
      sessionID: "ses_missing",
      value: Promise.reject(new Error("late")),
    }),
  ).toThrow("synchronous")
  const scans = { label: 0, value: 0 }
  const scanned = {
    get label() {
      scans.label++
      return "Scanned"
    },
    get value() {
      scans.value++
      return { type: "text", text: "once" }
    },
  }
  const storedGlobal = normalizeEpilogueContribution({ type: "retained", scope: "global", value: global })
  const storedScanned = normalizeEpilogueContribution({ type: "retained", scope: "global", value: scanned })
  const storedA = normalizeEpilogueContribution({
    type: "retained",
    scope: "session",
    sessionID: "ses_a",
    value: a,
  })
  const storedB = normalizeEpilogueContribution({
    type: "retained",
    scope: "session",
    sessionID: "ses_b",
    value: b,
  })
  const scansAtPublication = { ...scans }
  const [currentID, setCurrentID] = createSignal<string>()
  let retained!: RetainedEpilogue

  createRoot((dispose) => {
    trackEpilogue({
      currentID,
      sessionIDs: () => ["ses_a"],
      candidate: session,
      groups: () => [
        {
          plugin: "fixture",
          contributions: [
            { key: "global", contribution: storedGlobal },
            { key: "scanned", contribution: storedScanned },
            { key: "a", contribution: storedA },
            { key: "b", contribution: storedB },
          ],
        },
      ],
      publish: (value) => {
        retained = value
      },
      report: () => {},
    })
    setCurrentID("ses_a")
    setCurrentID("ses_other")
    dispose()
  })
  await Promise.resolve()

  global.value.text = "mutated"
  a.value.text = "mutated"
  expect(retained.globalRows).toEqual([row("Global", "retained"), row("Scanned", "once")])
  expect(retained.sessions).toEqual([{ candidate: session("ses_a"), rows: [row("Scoped", "alpha")] }])
  expect(retained.sessions.some((item) => item.candidate.sessionID === "ses_b")).toBe(false)
  expect(scans).toEqual(scansAtPublication)
  if (storedGlobal.type !== "retained") throw new Error("Expected retained contribution")
  const retainedValue = storedGlobal.value
  if (!retainedValue) throw new Error("Expected retained value")
  expect(retained.globalRows[0]).toBe(retainedValue)

  const calls: string[] = []
  createRoot((dispose) => {
    trackEpilogue({
      currentID: () => undefined,
      sessionIDs: () => ["ses_a"],
      candidate: session,
      groups: () => [
        {
          plugin: "budget",
          contributions: Array.from({ length: epilogueLimits.rowsPerPlugin + 2 }, (_, index) => ({
            key: String(index),
            contribution: {
              type: "projection" as const,
              scope: "session" as const,
              project: () => {
                calls.push(String(index))
                return row(`Row ${index}`, String(index))
              },
            },
          })),
        },
      ],
      publish: (value) => {
        retained = value
      },
      report: () => {},
    })
    dispose()
  })
  expect(calls).toEqual(Array.from({ length: epilogueLimits.rowsPerPlugin }, (_, index) => String(index)))
  expect(retained.sessions[0]?.rows).toHaveLength(epilogueLimits.rowsPerPlugin)
})

test("isolates malformed contributions and freezes projection scope", () => {
  const issues: string[] = []
  let mutation: boolean | undefined
  let retained!: RetainedEpilogue
  const groups: readonly EpilogueContributionGroup[] = [
    {
      plugin: "fixture",
      contributions: [
        {
          key: "mutate",
          contribution: {
            type: "projection",
            scope: "session",
            project: (scope) => {
              mutation = Reflect.set(scope, "sessionID", "ses_other")
              return undefined
            },
          },
        },
        {
          key: "reserved",
          contribution: {
            type: "projection",
            scope: "session",
            project: () => row("Session", "fake"),
          },
        },
        {
          key: "throw",
          contribution: {
            type: "projection",
            scope: "session",
            project: () => {
              throw new Error("boom")
            },
          },
        },
        {
          key: "later",
          contribution: {
            type: "projection",
            scope: "session",
            project: ({ sessionID }) => row("Observed", sessionID),
          },
        },
      ],
    },
  ]

  createRoot((dispose) => {
    trackEpilogue({
      currentID: () => "ses_a",
      sessionIDs: () => ["ses_a"],
      candidate: session,
      groups: () => groups,
      publish: (value) => {
        retained = value
      },
      report: (issue) => issues.push(`${issue.key}:${issue.type}`),
    })
    dispose()
  })

  expect(mutation).toBe(false)
  expect(retained.sessions[0]?.rows).toEqual([row("Observed", "ses_a")])
  expect(issues).toEqual(["reserved:validation", "throw:projection"])
})

test("selection transforms replay in order and discard throwing, asynchronous, or invalid edits", async () => {
  const issues: string[] = []
  const output = transformEpilogueSelection({
    base: [
      { type: "activity-within", within_ms: 10, terminating: true },
      { type: "limit", count: 3, terminating: false },
    ],
    groups: [
      {
        plugin: "first",
        transforms: [
          {
            key: "edit",
            transform(rules) {
              rules.reverse()
              rules[0]!.terminating = true
            },
          },
          {
            key: "throw",
            transform() {
              throw new Error("boom")
            },
          },
          {
            key: "async",
            transform: async (rules) => {
              await Promise.resolve()
              rules.push({ type: "limit", count: 0, terminating: true })
            },
          },
          {
            key: "invalid",
            transform(rules) {
              Object.assign(rules[0]!, { unexpected: true })
            },
          },
        ],
      },
      {
        plugin: "later",
        transforms: [
          {
            key: "append",
            transform(rules) {
              rules.push({ type: "limit", count: 1, terminating: false })
            },
          },
        ],
      },
    ],
    report: (issue) => issues.push(`${issue.key}:${issue.type}`),
  })
  await Promise.resolve()

  expect(output).toEqual([
    { type: "limit", count: 3, terminating: true },
    { type: "activity-within", within_ms: 10, terminating: true },
    { type: "limit", count: 1, terminating: false },
  ])
  expect(issues).toEqual(["throw:projection", "async:validation", "invalid:validation"])
  expect(Object.isFrozen(output)).toBe(true)
  expect(output.every(Object.isFrozen)).toBe(true)
})

test("contains hostile and rejected transform thenables before continuing the rule program", async () => {
  const issues: string[] = []
  let later = false
  const output = transformEpilogueSelection({
    base: [],
    groups: [
      {
        plugin: "fixture",
        transforms: [
          {
            key: "getter",
            transform: () =>
              Object.defineProperty({}, "then", {
                get() {
                  throw new Error("then getter failed")
                },
              }),
          },
          {
            key: "assimilation",
            transform: () => ({
              then(_resolve: (value: unknown) => void, reject: (error: unknown) => void) {
                reject(new Error("then failed"))
              },
            }),
          },
          {
            key: "rejected",
            transform: () => Promise.reject(new Error("rejected")),
          },
          {
            key: "later",
            transform(rules) {
              later = true
              rules.push({ type: "limit", count: 2, terminating: true })
            },
          },
        ],
      },
    ],
    report: (issue) => issues.push(`${issue.key}:${issue.type}`),
  })
  await Promise.resolve()

  expect(output).toEqual([{ type: "limit", count: 2, terminating: true }])
  expect(later).toBe(true)
  expect(issues).toEqual(["getter:validation", "assimilation:validation", "rejected:validation"])
})

test("config replacement resets the base and reapplies active transforms without mutating config", () => {
  const first = [{ type: "limit" as const, count: 3, terminating: false }]
  const second = [{ type: "activity-within" as const, within_ms: 20, terminating: true }]
  const [base, setBase] = createSignal<readonly EpilogueSelectionRule[]>(first)
  const [active, setActive] = createSignal(true)
  let output: readonly EpilogueSelectionRule[] = []
  let calls = 0

  createRoot((dispose) => {
    createComputed(() => {
      output = transformEpilogueSelection({
        base: base(),
        groups: active()
          ? [
              {
                plugin: "fixture",
                transforms: [
                  {
                    key: "append",
                    transform(rules) {
                      calls++
                      rules.push({ type: "limit", count: 1, terminating: true })
                    },
                  },
                ],
              },
            ]
          : [],
        report: () => {},
      })
    })

    expect(output).toEqual([
      { type: "limit", count: 3, terminating: false },
      { type: "limit", count: 1, terminating: true },
    ])
    setBase(second)
    expect(output).toEqual([
      { type: "activity-within", within_ms: 20, terminating: true },
      { type: "limit", count: 1, terminating: true },
    ])
    expect(first).toEqual([{ type: "limit", count: 3, terminating: false }])
    expect(second).toEqual([{ type: "activity-within", within_ms: 20, terminating: true }])
    expect(calls).toBe(2)

    setActive(false)
    expect(output).toEqual([{ type: "activity-within", within_ms: 20, terminating: true }])
    dispose()
  })
})

test("copies an atomic batch before freeze and never consults it after freeze", () => {
  const now = 2_000_000_000_000
  const epilogue = createEpilogue()
  const global = row("Global", "before")
  const scoped = row("Scoped", "before")
  const candidate = session("ses_a")
  let reads = 0
  const batch = {
    get globalRows() {
      reads++
      return [global]
    },
    get sessions() {
      reads++
      return [{ candidate, rows: [scoped] }]
    },
  }

  epilogue.setBatch(batch)
  const copiedAt = reads
  global.value.text = "after"
  scoped.value.text = "after"
  candidate.title = "After"
  epilogue.freeze(now)
  epilogue.setBatch({ globalRows: [], sessions: [] })

  const output = Bun.stripANSI(epilogue.take() ?? "")
  expect(reads).toBe(copiedAt)
  expect(output).toContain("Global    before")
  expect(output).toContain("Scoped    before")
  expect(output).toContain("Session   ses_a")
  expect(output).not.toContain("after")
  expect(epilogue.take()).toBeUndefined()
})

test("waits for batched collection and isolates callback failures", async () => {
  const epilogue = createEpilogue()
  const issues: string[] = []
  const seen: (readonly string[])[] = []
  epilogue.setBatch({
    globalRows: [row("Collected", "before")],
    sessions: [{ candidate: session("ses_a"), rows: [] }],
  })
  epilogue.setCollection(() => ({
    sessionIDs: ["ses_a", "ses_b"],
    groups: [
      {
        plugin: "first",
        collectors: [
          {
            key: "batch",
            collect(event) {
              seen.push(event.sessionIDs)
              event.waitUntil(
                Promise.resolve().then(() =>
                  epilogue.setBatch({
                    globalRows: [row("Collected", "after")],
                    sessions: [{ candidate: session("ses_a"), rows: [] }],
                  }),
                ),
              )
            },
          },
          {
            key: "rejected",
            collect: (event) => event.waitUntil(Promise.reject(new Error("no result"))),
          },
        ],
      },
      {
        plugin: "later",
        collectors: [
          {
            key: "throwing",
            collect() {
              throw new Error("broken collector")
            },
          },
        ],
      },
    ],
    report: (issue) => issues.push(`${issue.plugin}/${issue.key}:${issue.type}`),
  }))

  await epilogue.collect(100)
  epilogue.freeze(2)

  expect(seen).toEqual([["ses_a", "ses_b"]])
  expect(Object.isFrozen(seen[0])).toBe(true)
  expect(issues).toEqual(["later/throwing:collection", "first/rejected:collection"])
  expect(Bun.stripANSI(epilogue.take() ?? "")).toContain("Collected after")
})

test("aborts the shared collection window and ignores late publication", async () => {
  const epilogue = createEpilogue()
  const late = Promise.withResolvers<void>()
  let signal!: AbortSignal
  epilogue.setBatch({ globalRows: [row("Collected", "retained")], sessions: [] })
  epilogue.setCollection(() => ({
    sessionIDs: [],
    groups: [
      {
        plugin: "slow",
        collectors: [
          {
            key: "slow",
            collect(event) {
              signal = event.signal
              event.waitUntil(
                late.promise.then(() =>
                  epilogue.setBatch({ globalRows: [row("Collected", "too late")], sessions: [] }),
                ),
              )
            },
          },
        ],
      },
    ],
    report: () => {},
  }))

  await epilogue.collect(10)
  expect(signal.aborted).toBe(true)
  epilogue.freeze(2)
  late.resolve()
  await late.promise

  const output = Bun.stripANSI(epilogue.take() ?? "")
  expect(output).toContain("Collected retained")
  expect(output).not.toContain("too late")
})

test("does not dispatch later collectors after synchronous work exhausts the window", async () => {
  const epilogue = createEpilogue()
  let signal!: AbortSignal
  let later = false
  epilogue.setCollection(() => ({
    sessionIDs: [],
    groups: [
      {
        plugin: "blocking",
        collectors: [
          {
            key: "first",
            collect(event) {
              signal = event.signal
              const until = Date.now() + 10
              while (Date.now() < until) {}
            },
          },
          {
            key: "later",
            collect() {
              later = true
            },
          },
        ],
      },
    ],
    report: () => {},
  }))

  await epilogue.collect(1)

  expect(signal.aborted).toBe(true)
  expect(later).toBe(false)
})

test("flattens unsafe Session titles without discarding identity or readable Unicode", () => {
  expect(normalizeEpilogueTitle("Normal title")).toBe("Normal title")
  expect(normalizeEpilogueTitle("  Café 👩🏽‍💻\nمرحبا  ")).toBe("Café 👩🏽‍💻 مرحبا")
  expect(normalizeEpilogueTitle("normal\nEXTRA-LINE\u001b[31m\u0000")).toBe("normal EXTRA-LINE")

  const epilogue = createEpilogue()
  epilogue.setBatch({
    globalRows: [],
    sessions: [
      {
        candidate: {
          title: "normal\nEXTRA-LINE\u001b[31m",
          sessionID: "ses_safe",
          activity: { status: "idle", updated: 1 },
        },
        rows: [],
      },
    ],
  })
  epilogue.freeze(2)

  const output = epilogue.take() ?? ""
  const plain = Bun.stripANSI(output)
  expect(output).not.toContain("\u001b[31m")
  expect(plain.split("\n")).toContain("  Session   normal EXTRA-LINE")
  expect(plain.match(/EXTRA-LINE/g) ?? []).toHaveLength(1)
  expect(plain).toContain("Continue  opencode -s ses_safe")
})

test("row updates allocate no renderables or frames", async () => {
  const setup = await createTestRenderer({ width: 20, height: 5, useThread: false })
  const [value, setValue] = createSignal("before")
  let calls = 0
  let frames = 0
  let dispose = () => {}
  const onFrame = () => frames++

  createRoot((stop) => {
    dispose = stop
    trackEpilogue({
      currentID: () => "ses_a",
      sessionIDs: () => ["ses_a"],
      candidate: session,
      groups: () => [
        {
          plugin: "fixture",
          contributions: [
            {
              key: "row",
              contribution: {
                type: "projection",
                scope: "session",
                project: () => {
                  calls++
                  return row("Fixture", value())
                },
              },
            },
          ],
        },
      ],
      publish: () => {},
      report: () => {},
    })
  })

  try {
    await setup.renderOnce()
    setup.renderer.on("frame", onFrame)
    const nativeFrames = setup.getNativeStats().nativeFrameCount
    setValue("after")
    await Bun.sleep(25)

    expect(calls).toBe(2)
    expect(setup.renderer.root.getChildren()).toHaveLength(0)
    expect(setup.getNativeStats().nativeFrameCount).toBe(nativeFrames)
    expect(frames).toBe(0)
  } finally {
    setup.renderer.off("frame", onFrame)
    dispose()
    setup.renderer.destroy()
  }
})

function row(label: string, text: string) {
  return { label, value: { type: "text" as const, text } }
}

function session(sessionID: string) {
  return { title: sessionID, sessionID, activity: { status: "idle" as const, updated: 1 } }
}
