import { expect, test } from "bun:test"
import { epilogueOutput, sessionEpilogue } from "../../src/util/presentation.ts"

test("formats one Session envelope with ordered retained rows", () => {
  const now = 2_000_000_000_000
  const epilogue = Bun.stripANSI(
    sessionEpilogue(
      {
        title: "A session",
        sessionID: "ses_123",
        activity: { status: "idle", updated: now - 17 * 60_000 },
      },
      now,
      [
        { label: "Last active", value: { type: "relative-time", timestamp: now - 17 * 60_000 } },
        { label: "Cost", value: { type: "text", text: "$1.25" } },
      ],
    ),
  )

  expect(epilogue.split("\n").filter((line) => /Session|Last active|Cost|Continue/.test(line))).toEqual([
    "  Session   A session",
    "  Last active 17m ago",
    "  Cost      $1.25",
    "  Continue  opencode -s ses_123",
  ])
})

test("prints global rows once before distinct Session envelopes and one wordmark", () => {
  const now = 2_000_000_000_000
  const output = Bun.stripANSI(
    epilogueOutput(
      {
        globalRows: [{ label: "Client", value: { type: "text", text: "retained" } }],
        sessions: [
          {
            candidate: { title: "Current", sessionID: "ses_current", activity: { status: "idle", updated: now } },
            rows: [{ label: "Field", value: { type: "text", text: "current" } }],
          },
          {
            candidate: { title: "Other", sessionID: "ses_other", activity: { status: "running", updated: 0 } },
            rows: [{ label: "Field", value: { type: "text", text: "other" } }],
          },
        ],
      },
      now,
    ) ?? "",
  )

  expect(output.match(/█▀▀█ █▀▀█ █▀▀█/g) ?? []).toHaveLength(2)
  expect(output.match(/Client\s+retained/g) ?? []).toHaveLength(1)
  expect(output.match(/Session\s+/g) ?? []).toHaveLength(2)
  expect(output.match(/Continue\s+opencode -s/g) ?? []).toHaveLength(2)
  expect(output.indexOf("Client")).toBeLessThan(output.indexOf("Current"))
  expect(output.indexOf("Current")).toBeLessThan(output.indexOf("Other"))
})

test.each([
  [0, "now"],
  [17 * 60_000, "17m ago"],
  [(4 * 60 + 17) * 60_000, "4hr 17m ago"],
  [3 * 24 * 60 * 60_000, "3d ago"],
  [-60_000, "now"],
] as const)("formats semantic relative time offset %s", (offset, expected) => {
  const now = 2_000_000_000_000
  const epilogue = sessionEpilogue(
    { title: "A session", sessionID: "ses_123", activity: { status: "idle", updated: now } },
    now,
    [{ label: "Observed", value: { type: "relative-time", timestamp: now - offset } }],
  )
  expect(Bun.stripANSI(epilogue)).toContain(`Observed  ${expected}`)
})

test("omits an entirely empty batch", () => {
  expect(epilogueOutput({ globalRows: [], sessions: [] }, Date.now())).toBeUndefined()
})
