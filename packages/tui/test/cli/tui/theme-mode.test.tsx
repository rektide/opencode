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
  let config: Info = { theme: { name: "light-only", mode: "dark" } }
  const service: Interface = {
    get: async () => config,
    update: async (update) => {
      const draft = structuredClone(config)
      update(draft)
      config = draft
      return config
    },
  }
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
      <ConfigProvider config={createTuiResolvedConfig(config)} service={service}>
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
        <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve(discovered) }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    const firstClaim = current().override(first)
    expect(current().selected).toBe("first")
    expect(firstClaim.status()).toEqual({ type: "selected", name: "first" })
    expect(current().configured).toBe("opencode")
    expect(current().locked()).toBeTrue()
    expect(updates).toBe(0)

    const secondClaim = current().override(second)
    expect(current().selected).toBe("second")
    expect(secondClaim.status()).toEqual({ type: "selected", name: "second" })
    expect(firstClaim.status()).toEqual({ type: "masked", name: "first", selected: "second" })
    expect(updates).toBe(0)

    setSecond(undefined)
    expect(current().selected).toBe("first")
    expect(secondClaim.status()).toEqual({ type: "transparent" })
    setSecond(restored)
    expect(current().selected).toBe("first")
    expect(secondClaim.status()).toEqual({ type: "skipped", name: restored, reason: "missing" })
    expect(updates).toBe(0)

    const restoredThemes = { ...discovered, [restored]: restoredTheme }
    setCustomThemes(restoredThemes)
    expect(current().selected).toBe(restored)
    expect(secondClaim.status()).toEqual({ type: "selected", name: restored })
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

    secondClaim()
    expect(secondClaim.status()).toEqual({ type: "disposed" })
    expect(current().selected).toBe("first")
    setFirst(undefined)
    expect(current().selected).toBe("opencode")
    setFirst("first")
    expect(current().selected).toBe("first")
    firstClaim()
    expect(firstClaim.status()).toEqual({ type: "disposed" })
    expect(current().selected).toBe("opencode")
    firstClaim()
    expect(current().selected).toBe("opencode")
    expect(updates).toBe(2)

    rejectUpdates = true
    expect(current().set("second")).toBeTrue()
    await wait(() => updates === 3)
    expect(current().configured).toBe("opencode")
    await wait(() => current().selected === "opencode")
    expect(config.theme?.name).toBeUndefined()
  } finally {
    app.renderer.destroy()
    setCustomThemes({})
  }
})

test("runtime claim failures are isolated, attributed, and recoverable", async () => {
  let themes: ReturnType<typeof useThemes> | undefined
  const failures: ThemeError[] = []
  let unsubscribe: (() => void) | undefined
  const [state, setState] = createSignal<"throw" | "invalid" | "broken" | "first" | "second" | undefined>("throw")
  const discovered = {
    first: structuredClone(DEFAULT_THEMES.opencode),
    second: structuredClone(DEFAULT_THEMES.opencode),
    broken: { version: 2, dark: { categorical: [] } },
  }

  function Probe() {
    themes = useThemes()
    unsubscribe = themes.onError((error) => failures.push(error))
    return <text>{themes.selected}</text>
  }

  function current() {
    if (!themes) throw new Error("Theme provider is not mounted")
    return themes
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "opencode", mode: "dark" } })}>
        <ThemeProvider mode="dark" source={{ discover: () => Promise.resolve(discovered) }}>
          <Probe />
        </ThemeProvider>
      </ConfigProvider>
    ),
    { width: 20, height: 2 },
  )
  app.renderer.start()

  try {
    await wait(() => themes?.ready === true)
    const lower = current().override(() => "first", "lower-plugin")
    const upper = current().override(() => {
      const value = state()
      if (value === "throw") throw new Error("claim failed")
      if (value === "invalid") return 42
      return value
    }, "upper-plugin")

    expect(current().selected).toBe("first")
    expect(upper.status()).toMatchObject({ type: "skipped", reason: "accessor-error" })
    expect(lower.status()).toEqual({ type: "selected", name: "first" })
    expect(failures).toHaveLength(1)
    expect(failures[0].owner).toBe("upper-plugin")

    setCustomThemes({ ...discovered })
    expect(current().selected).toBe("first")
    expect(failures).toHaveLength(1)

    setState("invalid")
    expect(current().selected).toBe("first")
    expect(upper.status()).toMatchObject({ type: "skipped", reason: "invalid-value" })
    expect(failures).toHaveLength(2)

    setState("broken")
    expect(current().selected).toBe("first")
    expect(upper.status()).toMatchObject({ type: "skipped", name: "broken", reason: "theme-error" })
    expect(failures).toHaveLength(3)

    setCustomThemes({ ...discovered })
    expect(current().selected).toBe("first")
    expect(failures).toHaveLength(3)

    setState(undefined)
    expect(current().selected).toBe("first")
    expect(upper.status()).toEqual({ type: "transparent" })

    setState("second")
    expect(current().selected).toBe("second")
    expect(upper.status()).toEqual({ type: "selected", name: "second" })
    expect(lower.status()).toEqual({ type: "masked", name: "first", selected: "second" })

    setState("first")
    expect(current().selected).toBe("first")
    expect(upper.status()).toEqual({ type: "selected", name: "first" })
    expect(lower.status()).toEqual({ type: "masked", name: "first", selected: "first" })

    upper()
    expect(upper.status()).toEqual({ type: "disposed" })
    expect(current().selected).toBe("first")
    expect(lower.status()).toEqual({ type: "selected", name: "first" })
    lower()
  } finally {
    unsubscribe?.()
    app.renderer.destroy()
    setCustomThemes({})
  }
})

test("malformed override named like the fallback reveals the configured theme", async () => {
  let themes: ReturnType<typeof useThemes> | undefined
  let failure: ThemeError | undefined
  let unsubscribe: (() => void) | undefined
  const configured = structuredClone(DEFAULT_THEMES.opencode)
  configured.theme.background = "#123456"

  function Probe() {
    themes = useThemes()
    unsubscribe = themes.onError((error) => (failure = error))
    return <text>{themes.selected}</text>
  }

  const app = await testRender(
    () => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "configured", mode: "dark" } })}>
        <ThemeProvider
          mode="dark"
          source={{
            discover: () => Promise.resolve({ configured, opencode: { version: 2, dark: { categorical: [] } } }),
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
    if (!themes) throw new Error("Theme provider is not mounted")
    const claim = themes.override(() => "opencode")
    expect(themes.selected).toBe("configured")
    expect(claim.status()).toMatchObject({ type: "skipped", name: "opencode", reason: "theme-error" })
    expect(themes.current.background.default.equals(RGBA.fromHex("#123456"))).toBeTrue()
    expect(failure?.name).toBe("opencode")
    claim()
  } finally {
    unsubscribe?.()
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
    expect(theme.text.default).toBe(explicit.text.default)
    expect(theme.text.default).toBe(themes.current.contextual.elevated.text.default)
    expect(themes.current.contextual.overlay.background.default).toBe(themes.current.background.default)
  } finally {
    app.renderer.destroy()
  }
})

test.each(["dark", "light"] as const)(
  "reactive %s theme contexts change without remounting their contents",
  async (mode) => {
    const [context, setContext] = createSignal<"elevated" | undefined>("elevated")
    const [parent, setParent] = createSignal<"overlay" | undefined>()
    let theme: ReturnType<typeof useTheme> | undefined
    let themes: ReturnType<typeof useThemes> | undefined
    let mounts = 0
    function Probe() {
      mounts++
      theme = useTheme()
      themes = useThemes()
      return <text fg={theme.text.default}>probe</text>
    }
    const app = await testRender(() => (
      <ConfigProvider config={createTuiResolvedConfig({ theme: { name: "opencode", mode } })}>
        <ThemeProvider mode={mode} source={{ discover: async () => ({}) }}>
          <ThemeContextProvider context={parent()}>
            <ThemeContextProvider context={context()}>
              <Probe />
            </ThemeContextProvider>
          </ThemeContextProvider>
        </ThemeProvider>
      </ConfigProvider>
    ))
    app.renderer.start()
    try {
      await wait(() => themes?.ready === true)
      if (!theme || !themes) throw new Error("Theme provider is not mounted")
      const view = theme
      expect(view.background.default).toBe(themes.current.contextual.elevated.background.default)
      setContext(undefined)
      await app.flush()
      expect(view.background.default).toBe(themes.current.background.default)
      setParent("overlay")
      await app.flush()
      expect(view.background.default).toBe(themes.current.contextual.overlay.background.default)
      setContext("elevated")
      await app.flush()
      expect(view.text.default).toBe(themes.current.contextual.elevated.text.default)
      expect(theme).toBe(view)
      expect(mounts).toBe(1)
    } finally {
      app.renderer.destroy()
    }
  },
)
