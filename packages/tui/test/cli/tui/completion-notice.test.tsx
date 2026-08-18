/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { describe, expect, test } from "bun:test"
import { createEffect, createSignal } from "solid-js"
import { RouteProvider, useRoute, type Route } from "../../../src/context/route"
import { ThemeProvider } from "../../../src/context/theme"
import { ConfigProvider } from "../../../src/config"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { CompletionNoticeRow } from "../../../src/routes/session"
import { emptyThemeSource } from "../../fixture/fixture"
import { TestTuiContexts } from "../../fixture/tui-environment"

function RouteProbe(props: { onRoute: (route: Route) => void }) {
  createEffect(() => props.onRoute(useRoute().data))
  return <text></text>
}

async function renderNotice(input: { state?: string; childID?: string; onRoute: (route: Route) => void }) {
  return testRender(
    () => (
      <TestTuiContexts>
        <RouteProvider initialRoute={{ type: "session", sessionID: "ses_parent" }}>
          <ConfigProvider config={createTuiResolvedConfig({})}>
            <ThemeProvider mode="dark" source={emptyThemeSource}>
              <box flexDirection="column">
                <CompletionNoticeRow
                  width={72}
                  actor="Explore"
                  state={input.state}
                  description="Survey renderer lifecycle"
                  childID={input.childID}
                />
                <RouteProbe onRoute={input.onRoute} />
              </box>
            </ThemeProvider>
          </ConfigProvider>
        </RouteProvider>
      </TestTuiContexts>
    ),
    { width: 72, height: 3 },
  )
}

describe("TUI completion notice row", () => {
  test("clicking a subagent completion notice navigates to the child session", async () => {
    const [route, setRoute] = createSignal<Route>({ type: "session", sessionID: "ses_parent" })
    const app = await renderNotice({ state: "completed", childID: "ses_child", onRoute: setRoute })
    try {
      app.renderer.start()
      await app.waitForFrame((frame) => frame.includes("Explore finished"))
      await app.mockMouse.click(8, 0)
      expect(route()).toEqual({ type: "session", sessionID: "ses_child" })
    } finally {
      app.renderer.destroy()
    }
  })

  test("clicking failed and cancelled notices also navigates", async () => {
    for (const state of ["error", "cancelled"]) {
      const [route, setRoute] = createSignal<Route>({ type: "session", sessionID: "ses_parent" })
      const app = await renderNotice({ state, childID: "ses_child", onRoute: setRoute })
      try {
        app.renderer.start()
        await app.waitForFrame((frame) => frame.includes("Explore "))
        await app.mockMouse.click(8, 0)
        expect(route()).toEqual({ type: "session", sessionID: "ses_child" })
      } finally {
        app.renderer.destroy()
      }
    }
  })

  test("notices without a child session stay inert", async () => {
    const [route, setRoute] = createSignal<Route>({ type: "session", sessionID: "ses_parent" })
    const app = await renderNotice({ state: "completed", onRoute: setRoute })
    try {
      app.renderer.start()
      await app.waitForFrame((frame) => frame.includes("Explore finished"))
      await app.mockMouse.click(8, 0)
      expect(route()).toEqual({ type: "session", sessionID: "ses_parent" })
    } finally {
      app.renderer.destroy()
    }
  })
})
