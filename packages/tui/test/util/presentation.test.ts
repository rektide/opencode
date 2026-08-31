import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const now = 2_000_000_000_000
  const epilogue = sessionEpilogue(
    {
      title: "A session",
      sessionID: "ses_123",
      updated: now - (3 * 24 + 4) * 60 * 60_000,
    },
    now,
  )
  expect(epilogue).toContain("A session")
  expect(Bun.stripANSI(epilogue)).toContain("Active    3d 4hr ago")
  expect(epilogue).toContain("opencode2 -s ses_123")
})

test.each([
  ["current activity", 0, "now"],
  ["minutes", 17 * 60_000, "17m ago"],
  ["hours and minutes", (4 * 60 + 17) * 60_000, "4hr 17m ago"],
  ["whole days", 3 * 24 * 60 * 60_000, "3d ago"],
])("formats %s", (_, elapsed, expected) => {
  const now = 2_000_000_000_000
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123", updated: now - elapsed }, now)
  expect(Bun.stripANSI(epilogue)).toContain(`Active    ${expected}`)
})
