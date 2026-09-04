import { CliRenderEvents, SyntaxStyle, type TerminalColors } from "@opentui/core"
import { useRenderer } from "@opentui/solid"
import {
  generateSyntax,
  resolveThemeDocument,
  themeModes,
  type ResolvedTheme,
  type ContextName,
} from "@opencode-ai/theme/tui"
import {
  DEFAULT_THEMES,
  addTheme,
  allThemes,
  hasTheme,
  parseTheme,
  selectedForeground,
  setCustomThemes,
  setSystemTheme,
  subscribeThemes,
  upsertTheme,
  type Theme,
  type ThemeDocumentSource,
} from "../theme"
import { generateSystem, terminalMode } from "../theme/system"
import { discoverThemes } from "../theme/discovery"
import { createComponentTheme, type ComponentTheme } from "../theme/component"
import { createEffect, createMemo, createSignal, onCleanup, onMount, type Accessor, type ParentProps } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "./helper"
import { useConfig } from "../config"
import { DevTools } from "../devtools"
import { configDirectories } from "../util/config-directories"

const themePerformance = DevTools.register({ id: "theme-performance", title: "Theme performance" })
export type ThemeError = { name: string; error: Error; owner?: string }
type ThemeErrorHandler = (event: ThemeError) => void

function createThemeErrors() {
  let handler: ThemeErrorHandler | undefined
  let pending: ThemeError | undefined

  return {
    emit(name: string, cause: unknown, owner?: string) {
      const event = { name, error: cause instanceof Error ? cause : new Error(String(cause)), owner }
      if (handler) {
        handler(event)
        return
      }
      pending = event
    },
    onError(next: ThemeErrorHandler) {
      handler = next
      if (pending) {
        next(pending)
        pending = undefined
      }
      return () => {
        if (handler === next) handler = undefined
      }
    },
  }
}

const themeErrors = createThemeErrors()

export type ThemeSource = Readonly<{
  discover(): Promise<Record<string, unknown>>
  subscribeRefresh?(refresh: () => void): () => void
}>

export const createThemeSource = (config: string): ThemeSource => ({
  async discover() {
    return discoverThemes(configDirectories(config, process.cwd()))
  },
  subscribeRefresh(refresh) {
    process.on("SIGUSR2", refresh)
    return () => process.off("SIGUSR2", refresh)
  },
})

export { discoverThemes } from "../theme/discovery"

export {
  DEFAULT_THEMES,
  addTheme,
  allThemes,
  generateSyntax,
  hasTheme,
  selectedForeground,
  upsertTheme,
  type Theme,
} from "../theme"

const THEME_REFRESH_DELAYS = [250, 1000] as const

type State = {
  mode: "dark" | "light"
  lock: "dark" | "light" | undefined
  active: string
  ready: boolean
}

export type ThemeClaimStatus =
  | { readonly type: "transparent" }
  | { readonly type: "selected"; readonly name: string }
  | { readonly type: "masked"; readonly name: string; readonly selected: string }
  | {
      readonly type: "skipped"
      readonly name?: string
      readonly reason: "missing" | "accessor-error" | "invalid-value" | "theme-error"
      readonly message?: string
    }
  | { readonly type: "disposed" }

export interface ThemeClaim {
  (): void
  status(): ThemeClaimStatus
}

type ThemeClaimRegistration = {
  readonly source: Accessor<unknown>
  readonly owner?: string
}

type ThemeCandidate =
  | {
      readonly name: string
      readonly kind: "override"
      readonly source: ThemeDocumentSource
      readonly claim: ThemeClaimRegistration
    }
  | {
      readonly name: string
      readonly kind: "configured" | "fallback"
      readonly source: ThemeDocumentSource
    }

type Themes = {
  current: ComponentTheme
  currentTokens: Accessor<ResolvedTheme>
  readonly selected: string
  readonly configured: string
  all: typeof allThemes
  names(): readonly string[]
  has(name: string): boolean
  currentSyntax: Accessor<SyntaxStyle>
  mode: Accessor<"dark" | "light">
  modes: Accessor<readonly ("dark" | "light")[]>
  supports(mode: "dark" | "light"): boolean
  locked: Accessor<boolean>
  lock(): void
  unlock(): void
  setMode(mode?: "dark" | "light", persist?: boolean): boolean
  set(theme: string): boolean
  override(source: Accessor<unknown>, owner?: string): ThemeClaim
  onError(handler: ThemeErrorHandler): () => void
  readonly ready: boolean
}

type ThemeContextValue = {
  current: ComponentTheme["contextual"][ContextName]
  themes: Themes
  readonly ready: boolean
}

const [store, setStore] = createStore<State>({
  mode: "dark",
  lock: undefined,
  active: "opencode",
  ready: false,
})

const [inventory, setInventory] = createSignal(allThemes())
subscribeThemes((themes) => setInventory(themes))

const themeContext = createSimpleContext({
  name: "Theme",
  init: (props: { mode: "dark" | "light"; source: ThemeSource }): ThemeContextValue => {
    const renderer = useRenderer()
    const configState = useConfig()
    const config = configState.data
    const themes = props.source
    const pick = (value: unknown) => {
      if (value === "dark" || value === "light") return value
      return undefined
    }

    setStore(
      produce((draft) => {
        const lock = pick(config.theme?.mode)
        const mode = lock ?? pick(renderer.themeMode) ?? props.mode
        draft.mode = mode
        draft.lock = lock
        const active = config.theme?.name ?? "opencode"
        draft.active = typeof active === "string" ? active : "opencode"
        draft.ready = false
      }),
    )

    createEffect(() => {
      const theme = config.theme?.name
      setStore("active", theme || "opencode")
    })

    createEffect(() => {
      const mode = config.theme?.mode
      if (mode === "dark" || mode === "light") {
        pin(mode, false)
        return
      }
      if (mode === "system" && store.lock !== undefined) free(false)
    })

    function syncCustomThemes() {
      return themes
        .discover()
        .then((themes) => {
          setCustomThemes(themes)
        })
        .catch(() => setStore("active", "opencode"))
    }

    onMount(() => {
      void Promise.allSettled([resolveSystemTheme(store.mode), syncCustomThemes()]).finally(() => {
        valuesV2()
        setStore("ready", true)
      })
    })

    let systemThemeSignature: string | undefined
    let systemThemeMode: "dark" | "light" | undefined
    let hasResolvedSystemTheme = false
    function resolveSystemTheme(mode: "dark" | "light" = store.mode) {
      return renderer
        .getPalette({ size: 16 })
        .then((colors: TerminalColors) => {
          if (!colors.palette[0]) {
            if (hasResolvedSystemTheme) return
            setSystemTheme(undefined)
            if (store.active === "system") setStore("active", "opencode")
            return
          }
          const next = store.lock ?? terminalMode(colors) ?? mode
          if (store.mode !== next) setStore("mode", next)
          const signature = JSON.stringify(colors)
          hasResolvedSystemTheme = true
          if (inventory().system && systemThemeSignature === signature && systemThemeMode === next) return
          systemThemeSignature = signature
          systemThemeMode = next
          setSystemTheme(generateSystem(colors, next))
        })
        .catch(() => {
          if (hasResolvedSystemTheme) return
          setSystemTheme(undefined)
          if (store.active === "system") setStore("active", "opencode")
        })
    }

    let systemRefreshRunning = false
    let systemRefreshQueued = false
    let systemRefreshMode = store.mode
    function refreshSystemTheme(mode: "dark" | "light" = store.mode) {
      systemRefreshMode = mode
      if (systemRefreshRunning) {
        systemRefreshQueued = true
        return
      }

      systemRefreshRunning = true
      const retry = renderer.paletteDetectionStatus === "detecting"
      renderer.clearPaletteCache()
      void resolveSystemTheme(mode).finally(() => {
        systemRefreshRunning = false
        if (!retry && !systemRefreshQueued) return
        systemRefreshQueued = false
        refreshSystemTheme(systemRefreshMode)
      })
    }

    function apply(mode: "dark" | "light") {
      if (store.mode === mode) return
      setStore("mode", mode)
      refreshSystemTheme(mode)
    }

    function pin(mode: "dark" | "light" = store.mode, persist = true) {
      setStore("lock", mode)
      apply(mode)
      if (!persist) return
      void configState
        .update((draft) => {
          draft.theme = { ...draft.theme, mode }
        })
        .catch(() => {})
    }

    function free(persist = true) {
      setStore("lock", undefined)
      refreshSystemTheme(renderer.themeMode ?? store.mode)
      if (!persist) return
      void configState
        .update((draft) => {
          draft.theme = { ...draft.theme, mode: "system" }
        })
        .catch(() => {})
    }

    const handle = (mode: "dark" | "light") => {
      if (store.lock) return
      apply(mode)
    }
    renderer.on(CliRenderEvents.THEME_MODE, handle)

    const handleThemeNotification = (sequence: string) => {
      if (sequence !== "\x1b[?997;1n" && sequence !== "\x1b[?997;2n") return false
      queueMicrotask(() => refreshSystemTheme())
      return false
    }
    renderer.prependInputHandler(handleThemeNotification)

    let themeRefreshTimeouts: ReturnType<typeof setTimeout>[] = []
    const refresh = () => {
      for (const timeout of themeRefreshTimeouts) clearTimeout(timeout)
      themeRefreshTimeouts = THEME_REFRESH_DELAYS.map((delay) =>
        setTimeout(() => {
          refreshSystemTheme()
          if (delay === THEME_REFRESH_DELAYS[THEME_REFRESH_DELAYS.length - 1]) void syncCustomThemes()
        }, delay),
      )
    }
    const unsubscribeRefresh = themes.subscribeRefresh?.(refresh)

    onCleanup(() => {
      renderer.off(CliRenderEvents.THEME_MODE, handle)
      renderer.removeInputHandler(handleThemeNotification)
      unsubscribeRefresh?.()
      for (const timeout of themeRefreshTimeouts) clearTimeout(timeout)
      themeRefreshTimeouts.length = 0
    })

    const [overrides, setOverrides] = createSignal<readonly ThemeClaimRegistration[]>([])
    const reported = new Map<ThemeClaimRegistration | "configured", string>()
    const clearReported = (key: ThemeClaimRegistration | "configured") => reported.delete(key)
    const report = (
      key: ThemeClaimRegistration | "configured",
      name: string,
      reason: "accessor-error" | "invalid-value" | "theme-error",
      cause: unknown,
      owner?: string,
    ) => {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      const signature = `${reason}\u0000${name}\u0000${error.message}`
      if (reported.get(key) !== signature) {
        reported.set(key, signature)
        themeErrors.emit(name, error, owner)
      }
      return error.message
    }

    const initStarted = performance.now()
    const resolution = createMemo(() => {
      const statuses = new Map<ThemeClaimRegistration, ThemeClaimStatus>()
      const candidates: ThemeCandidate[] = []

      for (const claim of overrides().toReversed()) {
        let value: unknown
        try {
          value = claim.source()
        } catch (error) {
          statuses.set(claim, {
            type: "skipped",
            reason: "accessor-error",
            message: report(claim, claim.owner ?? "theme override", "accessor-error", error, claim.owner),
          })
          continue
        }

        if (value === undefined) {
          clearReported(claim)
          statuses.set(claim, { type: "transparent" })
          continue
        }
        if (typeof value !== "string") {
          const error = new TypeError("Theme override must return a string or undefined")
          statuses.set(claim, {
            type: "skipped",
            reason: "invalid-value",
            message: report(claim, claim.owner ?? "theme override", "invalid-value", error, claim.owner),
          })
          continue
        }

        const source = inventory()[value]
        if (!source) {
          clearReported(claim)
          statuses.set(claim, { type: "skipped", name: value, reason: "missing" })
          continue
        }
        candidates.push({ name: value, kind: "override", source, claim })
      }

      const configured = inventory()[store.active] ? store.active : "opencode"
      if (!candidates.some((candidate) => candidate.name === configured)) {
        candidates.push({
          name: configured,
          kind: "configured",
          source: inventory()[configured] ?? DEFAULT_THEMES.opencode,
        })
      }
      candidates.push({ name: "opencode", kind: "fallback", source: DEFAULT_THEMES.opencode })

      for (let index = 0; index < candidates.length; index++) {
        const candidate = candidates[index]
        try {
          const loaded = loadTheme(candidate.source, candidate.name, store.mode)
          if (candidate.kind === "override") {
            clearReported(candidate.claim)
            statuses.set(candidate.claim, { type: "selected", name: candidate.name })
          } else if (candidate.kind === "configured") {
            clearReported("configured")
          }
          for (const masked of candidates.slice(index + 1)) {
            if (masked.kind !== "override") continue
            clearReported(masked.claim)
            statuses.set(masked.claim, { type: "masked", name: masked.name, selected: candidate.name })
          }
          return { name: candidate.name, statuses, ...loaded }
        } catch (error) {
          if (candidate.kind === "fallback") throw error
          if (candidate.kind === "override") {
            statuses.set(candidate.claim, {
              type: "skipped",
              name: candidate.name,
              reason: "theme-error",
              message: report(candidate.claim, candidate.name, "theme-error", error, candidate.claim.owner),
            })
            continue
          }
          report("configured", candidate.name, "theme-error", error)
          if (store.active === candidate.name) setStore("active", "opencode")
        }
      }
      throw new Error("No usable theme")
    })
    const modes = () => resolution().modes
    const mode = () => resolution().mode
    const valuesV2 = () => resolution().theme
    valuesV2()
    themePerformance.set("Init", `${(performance.now() - initStarted).toFixed(2)} ms`)
    const current = createComponentTheme(valuesV2, mode)

    createEffect(() => renderer.setBackgroundColor(valuesV2().background.default))

    const currentSyntax = createSyntaxStyleMemo(() => generateSyntax(valuesV2(), mode()))
    const service: Themes = {
      current,
      currentTokens: valuesV2,
      currentSyntax,
      get selected() {
        return resolution().name
      },
      get configured() {
        return config.theme?.name || "opencode"
      },
      all: allThemes,
      names: () => Object.keys(inventory()).sort((left, right) => left.localeCompare(right)),
      has: (name) => Boolean(inventory()[name]),
      mode,
      modes,
      supports: (requested) => modes().includes(requested),
      locked: () => store.lock !== undefined,
      lock: () => pin(mode()),
      unlock: free,
      setMode(requested = mode(), persist = true) {
        if (!modes().includes(requested)) return false
        pin(requested, persist)
        return true
      },
      set(theme: string) {
        if (!hasTheme(theme)) return false
        setStore("active", theme)
        void configState
          .update((draft) => {
            draft.theme = { ...draft.theme, name: theme }
          })
          .catch(() => {
            if (store.active === theme) setStore("active", config.theme?.name || "opencode")
          })
        return true
      },
      override(source, owner) {
        const claim = { source, owner }
        let active = true
        setOverrides((current) => [...current, claim])
        const handle: ThemeClaim = Object.assign(
          () => {
            if (!active) return
            active = false
            clearReported(claim)
            setOverrides((current) => current.filter((item) => item !== claim))
          },
          {
            status: (): ThemeClaimStatus =>
              active ? (resolution().statuses.get(claim) ?? { type: "transparent" }) : { type: "disposed" },
          },
        )
        return handle
      },
      onError: (handler) => themeErrors.onError(handler),
      get ready() {
        return store.ready
      },
    }
    return {
      current,
      themes: service,
      get ready() {
        return service.ready
      },
    }
  },
})

export function useThemes() {
  return themeContext.use().themes
}
export function useTheme(): ComponentTheme
export function useTheme(context: ContextName): ComponentTheme["contextual"][ContextName]
export function useTheme(context?: ContextName) {
  const value = themeContext.use()
  return context ? value.themes.current.contextual[context] : value.current
}
export const ThemeProvider = themeContext.provider

export function ThemeContextProvider(props: ParentProps<{ context: ContextName }>) {
  const value = themeContext.use()
  return (
    <themeContext.context.Provider
      value={{ current: value.themes.current.contextual[props.context], themes: value.themes, ready: value.ready }}
    >
      {props.children}
    </themeContext.context.Provider>
  )
}

function loadTheme(source: ThemeDocumentSource, name: string, requested: "dark" | "light") {
  const document = parseTheme(source, name)
  const modes = themeModes(document)
  const mode = modes.includes(requested) ? requested : (modes[0] ?? requested)
  return { modes, mode, theme: resolveThemeDocument(document, mode) }
}

export function createSyntaxStyleMemo(factory: () => SyntaxStyle) {
  const renderer = useRenderer()
  const retained = new Set<SyntaxStyle>()
  let current: SyntaxStyle | undefined

  const release = (style: SyntaxStyle) => {
    retained.add(style)
    void renderer
      .idle()
      .catch(() => {})
      .finally(() => {
        if (!retained.delete(style)) return
        style.destroy()
      })
  }

  onCleanup(() => {
    if (current) release(current)
  })

  return createMemo(() => {
    const previous = current
    current = factory()
    if (previous) release(previous)
    return current
  })
}
