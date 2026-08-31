import { expect, test } from "bun:test"
import { createRoot, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { createEpilogue, epilogueLimits, trackEpilogueRows } from "../../src/context/epilogue.tsx"
import type { EpilogueRow } from "../../src/util/presentation.ts"

test("tracks ordered projections from live dependencies without following renderer frames", () => {
  const [state, setState] = createStore({ first: "first", second: "second", active: true, unrelated: 0 })
  const [sessionID, setSessionID] = createSignal("ses_a")
  const [frame, setFrame] = createSignal(0)
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
  setFrame(frame() + 1)
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
