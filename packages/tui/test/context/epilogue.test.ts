import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createEpilogue, epilogueLimits, trackEpilogueRows } from "../../src/context/epilogue.tsx"
import type { EpilogueRow } from "../../src/util/presentation.ts"

test("tracks ordered projections through cache, route, and activation changes", () => {
  const [state, setState] = createStore({ first: "first", second: "second", active: true, unrelated: 0 })
  const [sessionID, setSessionID] = createSignal("ses_a")
  const calls: string[] = []
  let rows: readonly EpilogueRow[] = []
  let dispose = () => {}

  createRoot((stop) => {
    dispose = stop
    trackEpilogueRows({
      sessionID,
      groups: () => [
        ...(state.active
          ? [
              {
                plugin: "first",
                projections: [
                  {
                    key: "first#0",
                    project: (scope: { readonly sessionID: string }) => {
                      calls.push(`first:${scope.sessionID}`)
                      return { label: "First", value: { type: "text", text: state.first } }
                    },
                  },
                  {
                    key: "first#1",
                    project: (scope: { readonly sessionID: string }) => {
                      calls.push(`duplicate-a:${scope.sessionID}`)
                      return { label: "Duplicate", value: { type: "text", text: state.second } }
                    },
                  },
                ],
              },
            ]
          : []),
        {
          plugin: "second",
          projections: [
            {
              key: "second#0",
              project: (scope: { readonly sessionID: string }) => {
                calls.push(`duplicate-b:${scope.sessionID}`)
                return { label: "Duplicate", value: { type: "text", text: "third" } }
              },
            },
          ],
        },
      ],
      publish: (retained) => {
        rows = retained?.rows ?? []
      },
      report: () => {},
    })
  })

  expect(rows.map((row) => `${row.label}:${row.value.type === "text" ? row.value.text : "time"}`)).toEqual([
    "First:first",
    "Duplicate:second",
    "Duplicate:third",
  ])
  expect(calls).toEqual(["first:ses_a", "duplicate-a:ses_a", "duplicate-b:ses_a"])

  setState("unrelated", 1)
  expect(calls).toHaveLength(3)

  setState("first", "updated")
  expect(rows[0]).toEqual({ label: "First", value: { type: "text", text: "updated" } })
  expect(calls).toHaveLength(6)

  setState("active", false)
  expect(rows).toEqual([{ label: "Duplicate", value: { type: "text", text: "third" } }])
  setState("first", "replacement")
  expect(rows).toEqual([{ label: "Duplicate", value: { type: "text", text: "third" } }])
  setState("active", true)
  expect(rows[0]).toEqual({ label: "First", value: { type: "text", text: "replacement" } })

  setSessionID("ses_b")
  expect(calls.slice(-3)).toEqual(["first:ses_b", "duplicate-a:ses_b", "duplicate-b:ses_b"])
  dispose()
})

test("row updates allocate no renderables or frames, and renderer frames do not rerun projections", async () => {
  const setup = await createTestRenderer({ width: 20, height: 5, useThread: false })
  const [value, setValue] = createSignal("before")
  let calls = 0
  let rows: readonly EpilogueRow[] = []
  let frames = 0
  let dispose = () => {}
  const onFrame = () => frames++

  createRoot((stop) => {
    dispose = stop
    trackEpilogueRows({
      sessionID: () => "ses_test",
      groups: () => [
        {
          plugin: "fixture",
          projections: [
            {
              key: "fixture#0",
              project: () => {
                calls++
                return { label: "Fixture", value: { type: "text", text: value() } }
              },
            },
          ],
        },
      ],
      publish: (retained) => {
        rows = retained?.rows ?? []
      },
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
    expect(rows).toEqual([{ label: "Fixture", value: { type: "text", text: "after" } }])
    expect(setup.renderer.root.getChildren()).toHaveLength(0)
    expect(setup.getNativeStats().nativeFrameCount).toBe(nativeFrames)
    expect(frames).toBe(0)

    await setup.renderOnce()
    expect(calls).toBe(2)
    expect(frames).toBe(1)
  } finally {
    setup.renderer.off("frame", onFrame)
    dispose()
    setup.renderer.destroy()
  }
})

test("isolates invalid projections, copies rows, and enforces per-plugin budgets", () => {
  const source = { label: "Before", value: { type: "text", text: "copied" } }
  const issues: string[] = []
  let rows: readonly EpilogueRow[] = []
  let overBudgetCalls = 0
  const valid = Array.from({ length: epilogueLimits.rowsPerPlugin + 2 }, (_, index) => ({
    key: `budget#${index}`,
    project: () => {
      overBudgetCalls++
      return { label: `Row ${index}`, value: { type: "text", text: String(index) } }
    },
  }))

  createRoot((dispose) => {
    trackEpilogueRows({
      sessionID: () => "ses_test",
      groups: () => [
        {
          plugin: "malformed",
          projections: [
            { key: "before", project: () => source },
            {
              key: "throw",
              project: () => {
                throw new Error("boom")
              },
            },
            { key: "promise", project: () => Promise.resolve(source) },
            { key: "newline", project: () => ({ label: "Bad", value: { type: "text", text: "two\nlines" } }) },
            { key: "ansi", project: () => ({ label: "\x1b[31mBad", value: { type: "text", text: "ansi" } }) },
            {
              key: "oversized",
              project: () => ({ label: "Long", value: { type: "text", text: "x".repeat(epilogueLimits.text + 1) } }),
            },
            { key: "reserved", project: () => ({ label: "Active", value: { type: "text", text: "fake" } }) },
            { key: "after", project: () => ({ label: "After", value: { type: "relative-time", timestamp: 42 } }) },
          ],
        },
        { plugin: "budget", projections: valid },
      ],
      publish: (retained) => {
        rows = retained?.rows ?? []
      },
      report: (issue) => issues.push(`${issue.key}:${issue.type}`),
    })
    dispose()
  })

  source.label = "Mutated"
  source.value.text = "mutated"
  expect(rows.slice(0, 2)).toEqual([
    { label: "Before", value: { type: "text", text: "copied" } },
    { label: "After", value: { type: "relative-time", timestamp: 42 } },
  ])
  expect(issues).toEqual([
    "throw:projection",
    "promise:validation",
    "newline:validation",
    "ansi:validation",
    "oversized:validation",
    "reserved:validation",
  ])
  expect(rows.slice(2)).toHaveLength(epilogueLimits.rowsPerPlugin)
  expect(overBudgetCalls).toBe(epilogueLimits.rowsPerPlugin)
  expect(Object.isFrozen(rows)).toBe(true)
  expect(rows.every((row) => Object.isFrozen(row) && Object.isFrozen(row.value))).toBe(true)
})

test("freezes matching Session rows before cleanup and rejects stale epochs", () => {
  const now = 2_000_000_000_000
  const epilogue = createEpilogue()
  const [sessionID, setSessionID] = createSignal("ses_a")
  const [value, setValue] = createSignal("retained")
  let dispose = () => {}

  epilogue.set({
    title: "Session A",
    sessionID: "ses_a",
    activity: { status: "idle", updated: now },
  })
  createRoot((stop) => {
    dispose = stop
    trackEpilogueRows({
      sessionID,
      groups: () => [
        {
          plugin: "fixture",
          projections: [
            { key: "fixture#0", project: () => ({ label: "Fixture", value: { type: "text", text: value() } }) },
          ],
        },
      ],
      publish: (retained) => epilogue.setRows(retained),
      report: () => {},
    })
  })

  epilogue.freeze(now)
  setValue("too late")
  setSessionID("ses_b")
  epilogue.clear("ses_a")
  dispose()
  const output = Bun.stripANSI(epilogue.take() ?? "")
  expect(output).toContain("Fixture   retained")
  expect(output).not.toContain("too late")

  const stale = createEpilogue()
  stale.set({
    title: "Session B",
    sessionID: "ses_b",
    activity: { status: "idle", updated: now },
  })
  stale.setRows({
    sessionID: "ses_a",
    rows: [{ label: "Stale", value: { type: "text", text: "leaked" } }],
  })
  stale.freeze(now)
  expect(Bun.stripANSI(stale.take() ?? "")).not.toContain("Stale")
})

test("freeze during the hot-reload replacement interval retains the documented missing row", () => {
  const now = 2_000_000_000_000
  const epilogue = createEpilogue()
  const [active, setActive] = createSignal(true)
  let dispose = () => {}

  epilogue.set({
    title: "A session",
    sessionID: "ses_a",
    activity: { status: "idle", updated: now },
  })
  createRoot((stop) => {
    dispose = stop
    trackEpilogueRows({
      sessionID: () => "ses_a",
      groups: () =>
        active()
          ? [
              {
                plugin: "fixture",
                projections: [
                  {
                    key: "fixture#0",
                    project: () => ({ label: "Fixture", value: { type: "text", text: "old generation" } }),
                  },
                ],
              },
            ]
          : [],
      publish: (retained) => epilogue.setRows(retained),
      report: () => {},
    })
  })

  setActive(false)
  epilogue.freeze(now)
  setActive(true)
  dispose()

  const output = Bun.stripANSI(epilogue.take() ?? "")
  expect(output).not.toContain("Fixture")
  expect(output).toContain("Continue  opencode2 -s ses_a")
})
