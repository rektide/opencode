import { expect, test } from "bun:test"
import { interestSize } from "../../src/devtools/event-interest"

test("summarizes desired and installed event interest dimensions", () => {
  expect(interestSize({ locations: [{ directory: "/a" }, { directory: "/b" }], sessions: ["one"] })).toBe(
    "2 locations, 1 session",
  )
  expect(interestSize({ locations: [], sessions: [] })).toBe("0 locations, 0 sessions")
  expect(interestSize()).toBe("Pending")
})
