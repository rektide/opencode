/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { Keymap } from "../../src/context/keymap"
import { TestTuiContexts } from "../fixture/tui-environment"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

// The keybind schema accepts command ids outside the built-in Definitions so
// cli.json can rebind plugin-registered keymap commands. createLayer prefers
// config.keybinds.get(command.id) over a layer's declared bind, so the
// configured key must fire and the declared bind must not.

// NOTE: keys stay ctrl-only because the test renderer's kitty encoder cannot
// express the alt modifier.
function PluginLayer(props: { readonly hits: string[] }) {
  Keymap.createLayer(() => ({
    mode: "global",
    commands: [
      {
        id: "plugin.test.action",
        title: "Plugin action",
        bind: "ctrl+y",
        run: () => {
          props.hits.push("run")
        },
      },
    ],
  }))
  return null
}

test("named plugin commands dispatch on their configured override, not the declared bind", async () => {
  const hits: string[] = []
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <Keymap.Provider config={createTuiResolvedConfig({ keybinds: { "plugin.test.action": "ctrl+q" } })}>
          <PluginLayer hits={hits} />
        </Keymap.Provider>
      </TestTuiContexts>
    ),
    { kittyKeyboard: true },
  )
  try {
    await app.renderOnce()
    app.mockInput.pressKey("q", { ctrl: true })
    await app.renderOnce()
    expect(hits).toEqual(["run"])

    app.mockInput.pressKey("y", { ctrl: true })
    await app.renderOnce()
    expect(hits).toEqual(["run"])
  } finally {
    app.renderer.destroy()
  }
})

test("named plugin commands fall back to their declared bind without an override", async () => {
  const hits: string[] = []
  const app = await testRender(
    () => (
      <TestTuiContexts>
        <Keymap.Provider config={createTuiResolvedConfig({})}>
          <PluginLayer hits={hits} />
        </Keymap.Provider>
      </TestTuiContexts>
    ),
    { kittyKeyboard: true },
  )
  try {
    await app.renderOnce()
    app.mockInput.pressKey("y", { ctrl: true })
    await app.renderOnce()
    expect(hits).toEqual(["run"])
  } finally {
    app.renderer.destroy()
  }
})
