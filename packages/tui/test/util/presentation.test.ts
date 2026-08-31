import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const now = 2_000_000_000_000
  const epilogue = sessionEpilogue(
    {
      title: "A session",
      sessionID: "ses_123",
      activity: {
        status: "idle",
        updated: now - (3 * 24 + 4) * 60 * 60_000,
      },
    },
    now,
  )
  expect(epilogue).toContain("A session")
  expect(Bun.stripANSI(epilogue)).toContain("Active    3d 4hr ago")
  expect(epilogue).toContain("opencode2 -s ses_123")
})

test("formats supplemental rows before Continue with one freeze clock", () => {
  const now = 2_000_000_000_000
  const epilogue = Bun.stripANSI(
    sessionEpilogue(
      {
        title: "A session",
        sessionID: "ses_123",
        activity: { status: "idle", updated: now },
      },
      now,
      [
        { label: "Cost", value: { type: "text", text: "$1.25" } },
        { label: "Last synchronized", value: { type: "relative-time", timestamp: now - 17 * 60_000 } },
      ],
    ),
  )
  const rows = epilogue.split("\n").filter((line) => /Session|Active|Cost|Last synchronized|Continue/.test(line))

  expect(rows).toEqual([
    "  Session   A session",
    "  Active    now",
    "  Cost      $1.25",
    "  Last synchronized 17m ago",
    "  Continue  opencode2 -s ses_123",
  ])
  expect(epilogue.match(/Active/g)).toHaveLength(1)
})

test.each([
  ["running activity", "running", 17 * 60_000, undefined, "running"],
  ["current activity", "idle", 0, undefined, "now"],
  ["minutes", "idle", 17 * 60_000, undefined, "17m ago"],
  ["later idle time", "idle", 17 * 60_000, 3 * 60_000, "3m ago"],
  ["later updated time", "idle", 3 * 60_000, 17 * 60_000, "3m ago"],
  ["hours and minutes", "idle", (4 * 60 + 17) * 60_000, undefined, "4hr 17m ago"],
  ["whole days", "idle", 3 * 24 * 60 * 60_000, undefined, "3d ago"],
  ["future activity", "idle", -60_000, undefined, "now"],
] as const)("formats %s", (_, status, updated, idle, expected) => {
  const now = 2_000_000_000_000
  const epilogue = sessionEpilogue(
    {
      title: "A session",
      sessionID: "ses_123",
      activity: {
        status,
        updated: now - updated,
        idle: idle === undefined ? undefined : now - idle,
      },
    },
    now,
  )
  expect(Bun.stripANSI(epilogue)).toContain(`Active    ${expected}`)
})
