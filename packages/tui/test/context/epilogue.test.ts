import { expect, test } from "bun:test"
import type { EpilogueSelectionRule } from "@opencode/plugin/tui/context"
import { createTestRenderer } from "@opentui/core/testing"
import { createComputed, createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import {
  createEpilogue,
  epilogueLimits,
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

test("retained values are scoped, copied, budgeted, and do not admit Sessions", async () => {
  const global = row("Global", "retained")
  const a = row("Scoped", "alpha")
  const b = row("Scoped", "beta")
  const rejected = Promise.reject(new Error("late"))
  const issues: string[] = []
  let retained!: RetainedEpilogue

  createRoot((dispose) => {
    trackEpilogue({
      currentID: () => undefined,
      sessionIDs: () => ["ses_a"],
      candidate: session,
      groups: () => [
        {
          plugin: "fixture",
          contributions: [
            { key: "global", contribution: { type: "retained", scope: "global", value: global } },
            {
              key: "a",
              contribution: { type: "retained", scope: "session", sessionID: "ses_a", value: a },
            },
            {
              key: "b",
              contribution: { type: "retained", scope: "session", sessionID: "ses_b", value: b },
            },
            {
              key: "async",
              contribution: { type: "retained", scope: "global", value: rejected },
            },
          ],
        },
      ],
      publish: (value) => {
        retained = value
      },
      report: (issue) => issues.push(`${issue.key}:${issue.type}`),
    })
    dispose()
  })
  await Promise.resolve()

  global.value.text = "mutated"
  a.value.text = "mutated"
  expect(retained.globalRows).toEqual([row("Global", "retained")])
  expect(retained.sessions).toEqual([{ candidate: session("ses_a"), rows: [row("Scoped", "alpha")] }])
  expect(retained.sessions.some((item) => item.candidate.sessionID === "ses_b")).toBe(false)
  expect(issues).toEqual(["async:validation"])

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
