/** @jsxImportSource @opentui/solid */
import { testRender } from "@opentui/solid"
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { DEFAULT_THEME, selectTheme } from "@opencode-ai/theme/tui"
import { createSignal } from "solid-js"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { DEFAULT_THEMES, setCustomThemes } from "../../../src/theme"
import { ConfigProvider, type Info, type Interface, useConfig } from "../../../src/config"
import { ThemeContextProvider, ThemeProvider, type ThemeError, useTheme, useThemes } from "../../../src/context/theme"

async function wait(fn: () => boolean) {
  const started = Date.now()
  while (!fn()) {
    if (Date.now() - started > 2000) throw new Error("timed out waiting for theme mode")
    await Bun.sleep(10)
  }
}

test("uses an available mode while retaining the pinned preference", async () => {
  const lightOnly = structuredClone(DEFAULT_THEMES.opencode)
  lightOnly.theme.background = "#eeeeee"
  lightOnly.theme.text = "#111111"
  const dual = structuredClone(DEFAULT_THEMES.opencode)
  dual.theme.background = { light: "#eeeeee", dark: "#111111" }
  dual.theme.text = { light: "#111111", dark: "#eeeeee" }
  const darkOnly = structuredClone(DEFAULT_THEMES.opencode)
  darkOnly.theme.background = "#111111"
  darkOnly.theme.text = "#eeeeee"
  const native = { version: 2, dark: { text: { default: "#abcdef" } } } as const
  let themes: ReturnType<typeof useThemes> | undefined

  function Probe() {
    const value = useThemes()
    themes = value
    return <text>{value.mode()}</text>
  }

  function current() {
    if (!themes) throw new Error("Theme provider is not mounted")
    return themes
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "light-only", mode: "dark" } })}>
        <ThemeProvider
          mode="dark"
          source={{ discover: () => Promise.resolve({ "light-only": lightOnly, "dark-only": darkOnly, dual, native }) }}
        >
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    expect(current().mode()).toBe("light")
    expect(current().modes()).toEqual(["light"])
    expect(current().supports("dark")).toBeFalse()
    expect(current().setMode("dark")).toBeFalse()
    expect(current().set("dark-only")).toBeTrue()
    await wait(() => current().mode() === "dark")
    expect(current().modes()).toEqual(["dark"])
    expect(current().set("light-only")).toBeTrue()
    await wait(() => current().mode() === "light")
    expect(current().set("dual")).toBeTrue()
    await wait(() => current().mode() === "dark")
    expect(current().modes()).toEqual(["light", "dark"])
    expect(current().set("native")).toBeTrue()
    await wait(() => current().selected === "native")
    expect(current().modes()).toEqual(["dark"])
    expect(current().current.text.default.equals(RGBA.fromHex("#abcdef"))).toBeTrue()
  } finally {
    app.renderer.destroy()
  }
})

test("runtime theme overrides compose and dispose to the latest configured theme", async () => {
  let themes: ReturnType<typeof useThemes> | undefined
  let tuiConfig: ReturnType<typeof useConfig> | undefined
  let config: Info = { theme: { name: "opencode", mode: "dark" } }
  let updates = 0
  let rejectUpdates = false
  const service: Interface = {
    get: async () => config,
    update: async (update) => {
      updates++
      if (rejectUpdates) throw new Error("config write failed")
      const draft = structuredClone(config)
      update(draft)
      config = draft
      return config
    },
  }
  const [first, setFirst] = createSignal<string | undefined>("first")
  const [second, setSecond] = createSignal<string | undefined>("second")
  const restored = `restored-${crypto.randomUUID()}`
  const discovered = {
    first: structuredClone(DEFAULT_THEMES.opencode),
    second: structuredClone(DEFAULT_THEMES.opencode),
    configured: structuredClone(DEFAULT_THEMES.opencode),
  }
  const restoredTheme = structuredClone(DEFAULT_THEMES.opencode)
  restoredTheme.theme.background = "#123456"
  const replacedTheme = structuredClone(DEFAULT_THEMES.opencode)
  replacedTheme.theme.background = "#654321"

  function Probe() {
    themes = useThemes()
    tuiConfig = useConfig()
    return <text>{themes.selected}</text>
  }

  function current() {
    if (!themes) throw new Error("Theme provider is not mounted")
    return themes
  }

  function currentConfig() {
    if (!tuiConfig) throw new Error("Config provider is not mounted")
    return tuiConfig
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig(config)} service={service}>
        <ThemeProvider
          mode="dark"
          source={{
            discover: () => Promise.resolve(discovered),
          }}
        >
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    const disposeFirst = current().override(first)
    expect(current().selected).toBe("first")
    expect(current().configured).toBe("opencode")
    expect(current().locked()).toBeTrue()
    expect(updates).toBe(0)

    const disposeSecond = current().override(second)
    expect(current().selected).toBe("second")
    expect(updates).toBe(0)

    setSecond(undefined)
    expect(current().selected).toBe("first")
    setSecond(restored)
    expect(current().selected).toBe("first")
    expect(updates).toBe(0)

    const restoredThemes = { ...discovered, [restored]: restoredTheme }
    setCustomThemes(restoredThemes)
    expect(current().selected).toBe(restored)
    expect(current().current.background.default.equals(RGBA.fromHex("#123456"))).toBeTrue()
    expect(current().configured).toBe("opencode")
    expect(current().locked()).toBeTrue()
    expect(updates).toBe(0)

    const replacedThemes = { ...discovered, [restored]: replacedTheme }
    setCustomThemes(replacedThemes)
    expect(current().selected).toBe(restored)
    expect(current().current.background.default.equals(RGBA.fromHex("#654321"))).toBeTrue()

    setCustomThemes(discovered)
    expect(current().selected).toBe("first")
    setCustomThemes(replacedThemes)
    expect(current().selected).toBe(restored)

    expect(current().set("configured")).toBeTrue()
    await wait(() => current().configured === "configured")
    expect(updates).toBe(1)
    expect(current().configured).toBe("configured")
    expect(current().selected).toBe(restored)
    expect(current().locked()).toBeTrue()

    await currentConfig().update((draft) => {
      delete draft.theme.name
    })
    await wait(() => current().configured === "opencode")
    expect(current().selected).toBe(restored)
    expect(current().locked()).toBeTrue()

    disposeSecond()
    expect(current().selected).toBe("first")
    setFirst(undefined)
    expect(current().selected).toBe("opencode")
    setFirst("first")
    expect(current().selected).toBe("first")
    disposeFirst()
    expect(current().selected).toBe("opencode")
    disposeFirst()
    expect(current().selected).toBe("opencode")
    expect(updates).toBe(2)

    rejectUpdates = true
    expect(current().set("second")).toBeTrue()
    await wait(() => updates === 3)
    expect(current().configured).toBe("opencode")
    expect(config.theme?.name).toBeUndefined()
  } finally {
    app.renderer.destroy()
    setCustomThemes({})
  }
})

test.each([
  ["schema", { version: 2, light: { categorical: [] } }],
  ["mode merging", { version: 2, light: { mergeMode: true } }],
  ["token reference", { version: 2, light: { text: { default: "$missing" } } }],
] as const)("falls back to OpenCode when configured V2 theme %s is invalid", async (_label, source) => {
  let themes: ReturnType<typeof useThemes> | undefined
  let failure: ThemeError | undefined
  let unsubscribe: (() => void) | undefined
  const discovery = Promise.withResolvers<Record<string, unknown>>()

  function Probe() {
    const value = useThemes()
    themes = value
    unsubscribe = value.onError((error) => (failure = error))
    return <text>{value.selected}</text>
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "invalid" } })}>
        <ThemeProvider mode="dark" source={{ discover: () => discovery.promise }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()
  discovery.resolve({ invalid: source })

  try {
    await wait(() => themes?.ready === true)
    expect(themes?.selected).toBe("opencode")
    expect(failure?.name).toBe("invalid")
    expect(failure?.error).toBeInstanceOf(Error)
    expect(failure?.error.message.length).toBeGreaterThan(0)
  } finally {
    unsubscribe?.()
    app.renderer.destroy()
  }
})

test("contextual hooks resolve overrides and fall back to a standalone theme's base view", async () => {
  const standalone = {
    version: 2,
    standalone: true,
    dark: {
      hue: selectTheme(DEFAULT_THEME, "dark").hue,
      "@context:elevated": { text: { default: "#abcdef" } },
    },
  } as const
  let themes: ReturnType<typeof useThemes> | undefined
  let theme: ReturnType<typeof useTheme> | undefined
  let explicit: ReturnType<typeof useTheme> | undefined

  function ContextProbe() {
    theme = useTheme()
    explicit = useTheme("elevated")
    return <text>{theme.text.default.toString()}</text>
  }

  function Probe() {
    themes = useThemes()
    return (
      <ThemeContextProvider context="elevated">
        <ContextProbe />
      </ThemeContextProvider>
    )
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "standalone", mode: "dark" } })}>
        <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve({ standalone }) }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    if (!themes) throw new Error("Theme provider is not mounted")
    if (!theme) throw new Error("Contextual theme is not mounted")
    if (!explicit) throw new Error("Explicit contextual theme is not mounted")
    expect(theme.text.default.equals(RGBA.fromHex("#abcdef"))).toBeTrue()
    expect(theme).toBe(explicit)
    expect(theme.text.default).toBe(themes.current.contextual.elevated.text.default)
    expect(themes.current.contextual.overlay.background.default).toBe(themes.current.background.default)
  } finally {
    app.renderer.destroy()
  }
})
