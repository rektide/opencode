import { expect, test } from "bun:test"
/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { createSignal } from "solid-js"
import {
  CompactSessionTitle,
  compactSessionTabs,
  EMPTY_SESSION_TAB_STATUS,
  type SessionTabsController,
} from "../../src/component/session-tabs"

test("compact title remains visible across resize, navigation, and agent recomputation", async () => {
  const [width, setWidth] = createSignal(7)
  const [active, setActive] = createSignal("first")
  const [agent, setAgent] = createSignal("build")
  const controller = {
    tabs: () => {
      agent()
      return [
        { sessionID: "first", title: "First review" },
        { sessionID: "second", title: "Second review" },
      ]
    },
    current: active,
    status: () => EMPTY_SESSION_TAB_STATUS,
    select: () => {},
    close: () => {},
    move: () => {},
  } satisfies SessionTabsController
  const app = await testRender(() => <CompactSessionTitle controller={controller} width={width()} />, {
    width: 7,
    height: 1,
  })

  try {
    expect(compactSessionTabs(width())).toBe(true)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("First r")

    setWidth(5)
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("First")

    setActive("second")
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Secon")

    setAgent("plan")
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Secon")
  } finally {
    app.renderer.destroy()
  }
})

test("normal tab strip remains selected at its minimum width", () => {
  expect(compactSessionTabs(7)).toBe(true)
  expect(compactSessionTabs(8)).toBe(false)
})
