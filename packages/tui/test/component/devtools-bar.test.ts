import { expect, test } from "bun:test"
import { eventsPerSecond } from "../../src/component/devtools-bar.tsx"
import { interestSize } from "../../src/devtools/event-interest"

test("summarizes desired and installed event interest dimensions", () => {
  expect(interestSize({ locations: [{ directory: "/a" }, { directory: "/b" }], sessions: ["one"] })).toBe(
    "2 locations, 1 session",
  )
  expect(interestSize({ locations: [], sessions: [] })).toBe("0 locations, 0 sessions")
  expect(interestSize()).toBe("Pending")
})

test("calculates received domain events per second between process samples", () => {
  expect(eventsPerSecond(undefined, 10, 2_000)).toBe(0)
  expect(eventsPerSecond(10, 16, 2_000)).toBe(3)
  expect(eventsPerSecond(16, 20, 0)).toBe(0)
  expect(eventsPerSecond(20, 16, 2_000)).toBe(0)
})
