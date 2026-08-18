import { describe, expect, test } from "bun:test"
import type { SessionInfo, SessionMessageAssistant, SessionMessageInfo } from "@opencode-ai/client"
import { formatSessionTranscript } from "../../../src/routes/session"

const session = {
  id: "ses_test",
  projectID: "prj_test",
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
  location: { directory: "/tmp" },
  title: "Export fixture",
} as SessionInfo

function questionMessage(input: unknown, metadata?: Record<string, unknown>) {
  const message = {
    type: "assistant",
    id: "msg_1",
    agent: "build",
    model: { id: "model", providerID: "provider" },
    content: [
      {
        type: "tool",
        id: "tool_1",
        name: "question",
        state: {
          status: "completed",
          input,
          content: [{ type: "text", text: "User has answered your questions." }],
          ...(metadata ? { metadata } : {}),
        },
        time: { created: 1 },
      },
    ],
    time: { created: 1 },
  } as SessionMessageAssistant
  return message
}

function transcript(content: SessionMessageInfo[]) {
  return formatSessionTranscript(session, content, false)
}

describe("question transcript export", () => {
  test("emits a question with its answer instead of generic tool output", () => {
    const output = transcript([
      questionMessage(
        { questions: [{ question: "Which database?", header: "Database", options: [{ label: "SQLite", description: "Embedded" }] }] },
        { answers: [["SQLite"]] },
      ),
    ])

    expect(output).toContain("**Question:** Which database?")
    expect(output).toContain("**Answer:** SQLite")
    expect(output).not.toContain("**Tool: question**")
  })

  test("emits every question of a multi-part prompt in order", () => {
    const output = transcript([
      questionMessage(
        {
          questions: [
            { question: "First?", header: "A", options: [] },
            { question: "Second?", header: "B", options: [] },
          ],
        },
        { answers: [["one"], ["two"]] },
      ),
    ])

    const first = output.indexOf("**Question:** First?")
    const second = output.indexOf("**Question:** Second?")
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
    expect(output).toContain("**Answer:** one")
    expect(output).toContain("**Answer:** two")
  })

  test("joins multi-select answers", () => {
    const output = transcript([
      questionMessage(
        { questions: [{ question: "Which features?", header: "Features", multiple: true, options: [] }] },
        { answers: [["tests", "docs"]] },
      ),
    ])

    expect(output).toContain("**Answer:** tests, docs")
  })

  test("marks unanswered questions explicitly", () => {
    const output = transcript([questionMessage({ questions: [{ question: "Skipped?", header: "S", options: [] }] }, { answers: [[]] })])

    expect(output).toContain("**Answer:** (no answer)")
  })

  test("falls back to generic tool output when answers metadata is missing", () => {
    const output = transcript([questionMessage({ questions: [{ question: "Legacy?", header: "L", options: [] }] })])

    expect(output).toContain("**Tool: question**")
    expect(output).not.toContain("**Question:** Legacy?")
  })
})
