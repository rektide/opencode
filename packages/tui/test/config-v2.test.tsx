/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { Schema } from "effect"
import { animation, resolve, ConfigProvider, Info, useConfig, type Interface } from "../src/config"
import { settings } from "../src/component/dialog-config"

test("validates mini replay settings", () => {
  const decode = Schema.decodeUnknownSync(Info)

  expect(decode({ mini: { replay: false, replay_limit: 50 } })).toEqual({
    mini: { replay: false, replay_limit: 50 },
  })
  expect(() => decode({ mini: { replay_limit: 0 } })).toThrow()
  expect(() => decode({ mini: { replay_limit: 1.5 } })).toThrow()
})

test("validates the session tabs setting", () => {
  const decode = Schema.decodeUnknownSync(Info)

  expect(decode({ tabs: { enabled: true, layout: "vertical" } })).toEqual({
    tabs: { enabled: true, layout: "vertical" },
  })
  expect(() => decode({ tabs: { layout: true } })).toThrow()
  expect(() => decode({ tabs: { enabled: "on" } })).toThrow()
  expect(decode({ prompt: { image_preview: true } })).toEqual({ prompt: { image_preview: true } })
  expect(decode({ session: { image_preview: true } })).toEqual({ session: { image_preview: true } })
})

test("validates and resolves animation cadence", () => {
  const decode = Schema.decodeUnknownSync(Info)

  for (const animations of [false, true, 1.5, 59.998, 1000]) {
    expect(decode({ animations })).toEqual({ animations })
  }
  for (const animations of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    expect(() => decode({ animations })).toThrow()
  }

  expect(animation(undefined, 60)).toEqual({ enabled: true, fps: 60 })
  expect(animation(true, 30)).toEqual({ enabled: true, fps: 30 })
  expect(animation(false, 60)).toEqual({ enabled: false, fps: 60 })
  expect(animation(1.5, 60)).toEqual({ enabled: true, fps: 1.5 })
})

test("resolves nested config and keybind defaults", () => {
  const config = resolve(
    {
      keybinds: { leader: "ctrl+o" },
      leader: { timeout: 500 },
      scroll: { speed: 2, acceleration: true },
      diffs: { view: "split" },
      debug: { devtools: true },
    },
    { terminalSuspend: true },
  )

  expect(config.leader.timeout).toBe(500)
  expect(config.keybinds.get("leader")?.[0]?.key).toBe("ctrl+o")
  expect(config.scroll).toEqual({ speed: 2, acceleration: true })
  expect(config.diffs).toEqual({ view: "split" })
  expect(config.debug).toEqual({ devtools: true })
  expect(config.tabs).toEqual({ enabled: true, scope: "cwd", layout: "horizontal" })
})

test("shows resolved tab defaults in settings", () => {
  expect(settings.find((setting) => setting.path.join(".") === "tabs.enabled")?.default).toBe(true)
  expect(settings.find((setting) => setting.path.join(".") === "tabs.scope")?.default).toBe("cwd")
  expect(settings.find((setting) => setting.path.join(".") === "tabs.layout")?.default).toBe("horizontal")
})

test("provides config and its host interface", async () => {
  const config = resolve({}, { terminalSuspend: true })
  let current = {}
  const service: Interface = {
    get: async () => current,
    update: async (update) => {
      const draft: Record<string, any> = { ...current }
      update(draft)
      current = draft
      return draft
    },
  }
  let context: ReturnType<typeof useConfig> | undefined

  function Consumer() {
    context = useConfig()
    return <text>{`${context.data.mouse ? "mouse" : "none"} ${context.data.keybinds.get("leader")?.[0]?.key}`}</text>
  }

  const app = await testRender(() => (
    <ConfigProvider config={config} service={service}>
      <Consumer />
    </ConfigProvider>
  ))
  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("mouse ctrl+x")
    if (!context) throw new Error("Config context was not provided")
    await context.update((draft) => {
      draft.mouse = false
      draft.keybinds = { leader: "ctrl+o" }
    })
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("none ctrl+o")
  } finally {
    app.renderer.destroy()
  }
})
