import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client"
import { createFetch, json } from "../fixture/tui-client"
import { formatSessionReports } from "../../src/util/session-report"

test("formats every selected Session in stable order with complete pagination", async () => {
  const requests: string[] = []
  const calls = createFetch((url) => {
    requests.push(url.pathname + url.search)
    const sessionID = url.pathname.split("/")[3]
    if (!url.pathname.endsWith("/message"))
      return json({
        data: {
          id: sessionID,
          title: `Title ${sessionID}`,
          projectID: "project",
          location: { directory: "/tmp/project" },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          time: { created: 0, updated: 0 },
        },
      })
    const cursor = url.searchParams.get("cursor")
    if (!cursor)
      return json({
        data: [{ id: `${sessionID}-1`, sessionID, type: "user", text: `first ${sessionID}`, time: { created: 0 } }],
        cursor: { next: `${sessionID}-next` },
      })
    return json({
      data: [{ id: `${sessionID}-2`, sessionID, type: "user", text: `last ${sessionID}`, time: { created: 1 } }],
      cursor: {},
    })
  })
  const api = OpenCode.make({ baseUrl: "http://example.test", fetch: calls.fetch })

  const report = await formatSessionReports(api, ["second", "first"])

  expect(report.indexOf("Session ID:** second")).toBeLessThan(report.indexOf("Session ID:** first"))
  expect(report).toContain("first second")
  expect(report).toContain("last second")
  expect(report).toContain("first first")
  expect(report).toContain("last first")
  expect(requests.filter((request) => request.includes("/message"))).toEqual([
    "/api/session/second/message?limit=200&order=asc",
    "/api/session/second/message?limit=200&order=asc&cursor=second-next",
    "/api/session/first/message?limit=200&order=asc",
    "/api/session/first/message?limit=200&order=asc&cursor=first-next",
  ])
})
