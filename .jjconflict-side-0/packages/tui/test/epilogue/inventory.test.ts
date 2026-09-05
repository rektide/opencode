import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { trackEpilogue } from "../../src/context/epilogue.tsx"
import { epilogueInventoryIDs, hydratedEpilogueSessionID } from "../../src/epilogue/inventory.ts"

test("deduplicates current and visible tabs without replacing routed children with roots", () => {
  expect(
    epilogueInventoryIDs({
      currentID: "ses_child",
      tabsEnabled: true,
      visibleTabIDs: ["ses_root", "ses_child", "ses_other", "ses_root"],
    }),
  ).toEqual(["ses_child", "ses_root", "ses_other"])
})

test("uses current only when tabs are disabled", () => {
  expect(epilogueInventoryIDs({ currentID: "ses_current", tabsEnabled: false, visibleTabIDs: ["ses_shared"] })).toEqual(
    ["ses_current"],
  )
})

test("keeps visible shared tabs available on Home without claiming ownership", () => {
  expect(epilogueInventoryIDs({ tabsEnabled: true, visibleTabIDs: ["ses_shared", "ses_other"] })).toEqual([
    "ses_shared",
    "ses_other",
  ])
})

test("hydrates global reporters by Session identity without subscribing them to incidental metadata", () => {
  const [host, setHost] = createStore<{
    currentID: string
    declared: string
    sessions: Record<
      string,
      | {
          id: string
          title: string
          status: "idle" | "running"
          time: { updated: number; idle?: number }
        }
      | undefined
    >
  }>({
    currentID: "ses_a",
    declared: "first",
    sessions: {
      ses_a: { id: "ses_a", title: "Title", status: "idle", time: { updated: 1 } },
    },
  })
  let calls = 0

  createRoot((dispose) => {
    trackEpilogue({
      currentID: () => hydratedEpilogueSessionID({ currentID: host.currentID, session: host.sessions[host.currentID] }),
      sessionIDs: () => ["ses_a"],
      candidate: (sessionID) => {
        const value = host.sessions[sessionID]
        if (!value) return undefined
        return {
          title: value.title,
          sessionID: value.id,
          activity: { status: value.status, updated: value.time.updated, idle: value.time.idle },
        }
      },
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
                  calls++
                  return { label: "Declared", value: { type: "text", text: host.declared } }
                },
              },
            },
          ],
        },
      ],
      publish: () => {},
      report: () => {},
    })

    expect(calls).toBe(1)
    setHost("sessions", "ses_a", "title", "Renamed")
    setHost("sessions", "ses_a", "time", "updated", 2)
    setHost("sessions", "ses_a", "status", "running")
    expect(calls).toBe(1)

    setHost("declared", "second")
    expect(calls).toBe(2)
    setHost("sessions", "ses_a", undefined)
    expect(calls).toBe(2)
    setHost("sessions", "ses_a", { id: "ses_a", title: "Back", status: "idle", time: { updated: 3 } })
    expect(calls).toBe(3)
    dispose()
  })
})
