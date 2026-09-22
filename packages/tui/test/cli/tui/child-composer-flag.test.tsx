import { expect, test } from "bun:test"
import { TextareaRenderable } from "@opentui/core"
import type { Config } from "../../../src/config"
import { createAppFixture } from "../../fixture/app"
import { tmpdir } from "../../fixture/fixture"
import { directory, json } from "../../fixture/tui-client"

const location = { directory, project: { id: "proj_test", directory, canonical: directory } }

const parent = {
  id: "ses_flag_parent",
  projectID: "proj_test",
  title: "Flag parent",
  agent: "build",
  location,
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 0, updated: 0 },
}

const child = {
  ...parent,
  id: "ses_flag_child",
  title: "Flag child",
  parentID: "ses_flag_parent",
}

function message(sessionID: string, text: string) {
  return { id: `msg_${sessionID}`, type: "user" as const, text, time: { created: 0 } }
}

async function mountChildSession(config: Config.Info) {
  const state = await tmpdir()
  const setup = await createAppFixture({
    state: state.path,
    config,
    args: { sessionID: child.id },
    fetch: (url) => {
      if (url.pathname === "/api/session") {
        if (url.searchParams.get("parentID")) return json({ data: [], cursor: {} })
        return json({ data: [parent, child], cursor: {} })
      }
      if (url.pathname === `/api/session/${parent.id}`) return json({ data: parent })
      if (url.pathname === `/api/session/${child.id}`) return json({ data: child })
      if (url.pathname === `/api/session/${parent.id}/message`)
        return json({ data: [message(parent.id, "parent transcript marker")], cursor: {} })
      if (url.pathname === `/api/session/${child.id}/message`)
        return json({ data: [message(child.id, "child transcript marker")], cursor: {} })
      if (/^\/api\/session\/[^/]+\/(inbox|permission)$/.test(url.pathname)) return json({ data: [] })
      if (url.pathname === "/api/agent")
        return json({ location, data: [{ id: "build", mode: "primary", hidden: false, permissions: [] }] })
      if (url.pathname === "/api/provider") return json({ location, data: [{ id: "demo", name: "Demo" }] })
      if (url.pathname === "/api/model")
        return json({
          location,
          data: [
            {
              id: "demo-model",
              providerID: "demo",
              name: "Demo model",
              variants: [],
              cost: [],
              time: { released: 0 },
            },
          ],
        })
      return undefined
    },
  })
  await setup.ready
  return {
    setup,
    async [Symbol.asyncDispose]() {
      await setup[Symbol.asyncDispose]()
      await state[Symbol.asyncDispose]()
    },
  }
}

test("default config keeps the child composer interactive", async () => {
  await using harness = await mountChildSession({ animations: false })
  const { setup } = harness
  await setup.waitForFrame((frame) => frame.includes("child transcript marker"))
  expect(setup.captureCharFrame()).not.toContain("No active subagents")
  expect(setup.renderer.currentFocusedRenderable).toBeInstanceOf(TextareaRenderable)
  setup.mockInput.pressArrow("up")
  await setup.waitForFrame((frame) => frame.includes("parent transcript marker"))
})

test("session.interactive_children=false restores stock child masking", async () => {
  await using harness = await mountChildSession({ animations: false, session: { interactive_children: false } })
  const { setup } = harness
  await setup.waitForFrame((frame) => frame.includes("child transcript marker"))
  await setup.waitForFrame((frame) => frame.includes("No active subagents"))
  expect(setup.captureCharFrame()).toContain("Subagents")
  expect(setup.renderer.currentFocusedRenderable).not.toBeInstanceOf(TextareaRenderable)
  setup.mockInput.pressEscape()
  await setup.waitForFrame((frame) => frame.includes("parent transcript marker"))
})
