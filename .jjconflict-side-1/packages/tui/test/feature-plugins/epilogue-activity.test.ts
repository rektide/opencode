import { expect, test } from "bun:test"
import type { Context, EpilogueRow } from "@opencode/plugin/tui/context"
import Activity from "../../src/feature-plugins/epilogue/activity.ts"

test("reports historical last activity separately from running status", async () => {
  const projections: Array<(scope: { readonly sessionID: string }) => EpilogueRow | undefined> = []
  await Activity.setup({
    data: {
      session: {
        get: () => ({ time: { updated: 10, idle: 20 } }),
        status: () => "running",
      },
    },
    ui: {
      epilogue: {
        registerSession(project: (typeof projections)[number]) {
          projections.push(project)
          return () => {}
        },
      },
    },
  } as unknown as Context)

  expect(projections.map((project) => project({ sessionID: "ses_a" }))).toEqual([
    { label: "Last active", value: { type: "relative-time", timestamp: 20 } },
    { label: "Status", value: { type: "text", text: "running" } },
  ])
})

test("does not fabricate a running clock or status for idle Sessions", async () => {
  const projections: Array<(scope: { readonly sessionID: string }) => EpilogueRow | undefined> = []
  await Activity.setup({
    data: {
      session: {
        get: () => ({ time: { updated: 30 } }),
        status: () => "idle",
      },
    },
    ui: {
      epilogue: {
        registerSession(project: (typeof projections)[number]) {
          projections.push(project)
          return () => {}
        },
      },
    },
  } as unknown as Context)

  expect(projections.map((project) => project({ sessionID: "ses_a" }))).toEqual([
    { label: "Last active", value: { type: "relative-time", timestamp: 30 } },
    undefined,
  ])
})
