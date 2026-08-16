import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client"
import { assertStartupSessionTabs } from "../src/app"
import {
  nextSessionReview,
  parseSessionReview,
  resolveSessionIDs,
  resolveSessionReview,
  selectSessionReviewCursor,
} from "../src/context/session-review"
import { createFetch, json } from "./fixture/tui-client"

function session(id: string, parentID?: string) {
  return {
    id,
    parentID,
    title: id,
    projectID: "project",
    location: { directory: "/project" },
    cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  }
}

test("normalizes roots and de-duplicates startup sessions in argument order", async () => {
  const calls: string[] = []
  const sessions = {
    child: session("child", "root"),
    root: session("root"),
    other: session("other"),
  }
  const fetch = createFetch((url) => {
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (!sessionID) return
    calls.push(sessionID)
    const value = sessions[sessionID as keyof typeof sessions]
    return value ? json({ data: value }) : json({ message: "not found" }, { status: 404 })
  }).fetch

  const api = OpenCode.make({ baseUrl: "http://localhost", fetch })
  expect(await resolveSessionIDs(api, ["child", "other", "root", "child"])).toEqual(["root", "other"])
  expect(calls).toEqual(["child", "other", "root"])
})

test("fails when any explicitly named session is unknown", async () => {
  const fetch = createFetch((url) => {
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (!sessionID) return
    if (sessionID === "known") return json({ data: session("known") })
    return json({ message: "not found" }, { status: 404 })
  }).fetch

  const api = OpenCode.make({ baseUrl: "http://localhost", fetch })
  expect(resolveSessionIDs(api, ["known", "missing"])).rejects.toThrow()
})

test("parses only the first word of review data lines", () => {
  expect(parseSessionReview("\n # note\nses_first annotation ignored\n\tses_second\tmore words\n")).toEqual([
    { reference: "ses_first", line: 3 },
    { reference: "ses_second", line: 4 },
  ])
})

test("resolves exact IDs before unique prefixes with line errors", async () => {
  const sessions = [session("ses_exact"), session("ses_exact_more"), session("ses_unique")]
  const fetch = createFetch((url) => {
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (sessionID) {
      const value = sessions.find((item) => item.id === sessionID)
      return value ? json({ data: value }) : json({ message: "not found" }, { status: 404 })
    }
    if (url.pathname === "/api/session") return json({ data: sessions, cursor: {} })
  }).fetch
  const api = OpenCode.make({ baseUrl: "http://localhost", fetch })

  expect(
    await resolveSessionReview(api, "review.txt", parseSessionReview("ses_exact note\nses_u annotation")),
  ).toEqual(["ses_exact", "ses_unique"])
  expect(resolveSessionReview(api, "review.txt", parseSessionReview("ses_"))).rejects.toThrow(
    "review.txt:1: ambiguous prefix",
  )
  expect(resolveSessionReview(api, "review.txt", parseSessionReview("missing"))).rejects.toThrow(
    "review.txt:1: unknown session: missing",
  )
  expect(resolveSessionReview(api, "review.txt", parseSessionReview("# only comments"))).rejects.toThrow(
    "review.txt: review list contains no sessions",
  )
})

test("normalizes review children to roots and keeps the first occurrence", async () => {
  const sessions = [session("child", "root"), session("root"), session("other")]
  const fetch = createFetch((url) => {
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (sessionID) return json({ data: sessions.find((item) => item.id === sessionID) })
    if (url.pathname === "/api/session") return json({ data: sessions, cursor: {} })
  }).fetch
  const api = OpenCode.make({ baseUrl: "http://localhost", fetch })

  expect(await resolveSessionReview(api, "review.txt", parseSessionReview("child\nother\nroot"))).toEqual([
    "root",
    "other",
  ])
})

test("review cursor prefers explicit identity, persisted identity, then first", () => {
  const sessions = ["first", "second", "third"]
  expect(selectSessionReviewCursor(sessions, ["third", "second"], "third")).toBe("second")
  expect(selectSessionReviewCursor(sessions, ["outside"], "third")).toBe("third")
  expect(selectSessionReviewCursor(sessions, [], "removed")).toBe("first")
})

test("review navigation enters at first from outside and stops without wrapping", () => {
  const sessions = ["first", "second"]
  expect(nextSessionReview(sessions, "outside")).toBe("first")
  expect(nextSessionReview(sessions, "first")).toBe("second")
  expect(nextSessionReview(sessions, "second")).toBeUndefined()
})

test("requires tabs for repeated startup sessions", () => {
  expect(() => assertStartupSessionTabs(false, ["one"])).not.toThrow()
  expect(() => assertStartupSessionTabs(true, ["one", "two"])).not.toThrow()
  expect(() => assertStartupSessionTabs(false, ["one", "one"])).toThrow(
    "Multiple --session values require tabs to be enabled",
  )
})
