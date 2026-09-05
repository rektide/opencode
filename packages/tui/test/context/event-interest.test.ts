import { expect, test } from "bun:test"
import type { LocationRef } from "@opencode-ai/client"
import { eventInterest } from "../../src/context/event-interest"

const launch = { directory: "/launch", workspaceID: "wrk_launch" }
const current = { directory: "/current" }
const home = { directory: "/home", workspaceID: "wrk_home" }

test("holds launch, current, and explicit Home Locations with workspace identity", () => {
  expect(
    eventInterest({
      launch,
      current,
      route: { type: "home", location: home },
      tabs: [],
      root: (sessionID) => sessionID,
      family: () => [],
      sessionLocation: () => undefined,
    }),
  ).toEqual({ locations: [launch, current, home], sessions: [], profile: "session-streaming" })
})

test("follows visible and open-tab families with every known member Location", () => {
  const locations: Record<string, LocationRef> = {
    visible: { directory: "/visible" },
    "visible-child": { directory: "/visible-child" },
    tab: { directory: "/tab", workspaceID: "wrk_tab" },
    "tab-child": { directory: "/tab-child" },
  }
  const result = eventInterest({
    launch,
    route: { type: "session", sessionID: "visible-child" },
    tabs: [{ sessionID: "tab" }, { sessionID: "unknown" }],
    root: (sessionID) => (sessionID === "visible-child" ? "visible" : sessionID),
    family: (sessionID) =>
      sessionID === "visible" ? ["visible", "visible-child"] : sessionID === "tab" ? ["tab", "tab-child"] : [],
    sessionLocation: (sessionID) => locations[sessionID],
  })

  expect(result).toEqual({
    locations: [launch, locations["visible-child"], locations.visible, locations.tab, locations["tab-child"]],
    sessions: ["visible-child", "visible", "tab", "tab-child", "unknown"],
    profile: "session-streaming",
  })
})

test("deduplicates shared Locations and ignores the temporary dummy route", () => {
  const shared = { directory: "/shared", workspaceID: "wrk_shared" }
  expect(
    eventInterest({
      launch: shared,
      current: shared,
      route: { type: "session", sessionID: "dummy" },
      tabs: [{ sessionID: "one" }, { sessionID: "two" }],
      root: (sessionID) => sessionID,
      family: () => [],
      sessionLocation: () => shared,
    }),
  ).toEqual({ locations: [shared], sessions: ["one", "two"], profile: "session-streaming" })
})

test("includes an optimistic visible Session before family metadata resolves", () => {
  const optimistic = { directory: "/optimistic" }
  expect(
    eventInterest({
      launch,
      route: { type: "session", sessionID: "ses_optimistic" },
      tabs: [],
      root: (sessionID) => sessionID,
      family: () => [],
      sessionLocation: (sessionID) => (sessionID === "ses_optimistic" ? optimistic : undefined),
    }),
  ).toEqual({ locations: [launch, optimistic], sessions: ["ses_optimistic"], profile: "session-streaming" })
})

test("keeps the directly selected child before family indexing, plus every hidden open family", () => {
  const result = eventInterest({
    launch,
    route: { type: "session", sessionID: "new-child" },
    tabs: Array.from({ length: 12 }, (_, i) => ({ sessionID: `tab${i}` })),
    root: (id) => (id === "new-child" ? "root" : id),
    family: (id) => (id === "root" ? [] : [id, `${id}-child`]),
    sessionLocation: () => undefined,
  })
  expect(result.sessions).toEqual([
    "new-child",
    "root",
    ...Array.from({ length: 12 }, (_, i) => [`tab${i}`, `tab${i}-child`]).flat(),
  ])
})
