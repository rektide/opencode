import { expect, test } from "bun:test"
import { OpenCode } from "@opencode-ai/client"
import { assertStartupSessionTabs, resolveStartupSessions } from "../src/app"
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
  expect(await resolveStartupSessions(api, ["child", "other", "root", "child"])).toEqual(["root", "other"])
  expect(calls).toEqual(["child", "root", "other"])
})

test("fails when any explicitly named session is unknown", async () => {
  const fetch = createFetch((url) => {
    const sessionID = url.pathname.match(/^\/api\/session\/([^/]+)$/)?.[1]
    if (!sessionID) return
    if (sessionID === "known") return json({ data: session("known") })
    return json({ message: "not found" }, { status: 404 })
  }).fetch

  const api = OpenCode.make({ baseUrl: "http://localhost", fetch })
  expect(resolveStartupSessions(api, ["known", "missing"])).rejects.toThrow()
})

test("requires tabs for repeated startup sessions", () => {
  expect(() => assertStartupSessionTabs(false, ["one"])).not.toThrow()
  expect(() => assertStartupSessionTabs(true, ["one", "two"])).not.toThrow()
  expect(() => assertStartupSessionTabs(false, ["one", "one"])).toThrow(
    "Multiple --session values require tabs to be enabled",
  )
})
