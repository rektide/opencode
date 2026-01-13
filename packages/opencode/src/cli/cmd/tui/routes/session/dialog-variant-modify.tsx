import { createMemo, onMount, Show, For, type JSX, batch, createSignal } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { TextareaRenderable, TextAttributes } from "@opentui/core"
import { useTheme } from "@tui/context/theme"
import { useLocal } from "@tui/context/local"
import { useSync } from "@tui/context/sync"
import { useDialog } from "@tui/ui/dialog"
import { useKeyboard } from "@opentui/solid"
import { mergeDeep } from "remeda"
import { ProviderTransform } from "@/provider/transform"
import path from "path"
import { Global } from "@/global"

const REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const
const THINKING_TYPES = ["enabled", "auto"] as const

interface VariantForm {
  name: string
  thinking?: {
    type?: "enabled" | "auto"
    budgetTokens?: number
  }
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  reasoningSummary?: "auto" | "concise" | "detailed"
  include?: string[]
  thinkingConfig?: {
    includeThoughts?: boolean
    thinkingLevel?: "low" | "high"
    thinkingBudget?: number
  }
  reasoningConfig?: {
    type?: "enabled"
    maxReasoningEffort?: "low" | "medium" | "high"
    budgetTokens?: number
  }
}

export function DialogVariantModify(props: { sessionID?: string }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const local = useLocal()
  const sync = useSync()

  let nameInput: TextareaRenderable

  const [store, setStore] = createStore<{
    form: VariantForm
    active: "name" | "field"
    selectedField: string
    isNew: boolean
    modelInfo: { providerID: string; modelID: string; providerName: string; modelName: string } | null
    existingVariant: Record<string, any> | null
  }>({
    form: { name: "" },
    active: "name",
    selectedField: "",
    isNew: true,
    modelInfo: null,
    existingVariant: null,
  })

  const fields = createMemo(() => {
    const info = store.modelInfo
    if (!info) return []

    const provider = sync.data.provider.find((x) => x.id === info.providerID)
    if (!provider) return []

    const model = provider.models[info.modelID]
    if (!model) return []

    const results = []

    if (model.api.npm === "@ai-sdk/anthropic" || model.api.id.includes("anthropic")) {
      results.push({
        key: "thinking.type",
        label: "Thinking type",
        options: THINKING_TYPES,
        current: store.form.thinking?.type,
      })
      results.push({
        key: "thinking.budgetTokens",
        label: "Budget tokens",
        type: "number",
        current: store.form.thinking?.budgetTokens,
      })
    }

    if (
      [
        "@ai-sdk/openai",
        "@ai-sdk/azure",
        "@ai-sdk/gateway",
        "@ai-sdk/cerebras",
        "@ai-sdk/togetherai",
        "@ai-sdk/xai",
        "@ai-sdk/deepinfra",
        "@ai-sdk/openai-compatible",
        "@openrouter/ai-sdk-provider",
        "@ai-sdk/groq",
      ].includes(model.api.npm)
    ) {
      results.push({
        key: "reasoningEffort",
        label: "Reasoning effort",
        options:
          model.api.id.includes("gpt-5-") || model.api.id === "gpt-5"
            ? ["none", "minimal", ...REASONING_EFFORTS]
            : REASONING_EFFORTS,
        current: store.form.reasoningEffort,
      })
      results.push({
        key: "reasoningSummary",
        label: "Reasoning summary",
        options: ["auto", "concise", "detailed"] as const,
        current: store.form.reasoningSummary,
      })
      results.push({
        key: "include",
        label: "Include content",
        type: "toggle",
        options: ["reasoning.encrypted_content"] as string[],
        current: store.form.include,
      })
    }

    if (model.api.npm === "@ai-sdk/google" || model.api.npm === "@ai-sdk/google-vertex") {
      if (model.api.id.includes("2.5")) {
        results.push({
          key: "thinkingConfig.thinkingBudget",
          label: "Thinking budget",
          type: "number",
          current: store.form.thinkingConfig?.thinkingBudget,
        })
      } else {
        results.push({
          key: "thinkingConfig.thinkingLevel",
          label: "Thinking level",
          options: ["low", "high"] as const,
          current: store.form.thinkingConfig?.thinkingLevel,
        })
      }
      results.push({
        key: "thinkingConfig.includeThoughts",
        label: "Include thoughts",
        type: "toggle",
        current: store.form.thinkingConfig?.includeThoughts,
      })
    }

    if (model.api.npm === "@ai-sdk/amazon-bedrock") {
      if (model.api.id.includes("anthropic")) {
        results.push({
          key: "reasoningConfig.type",
          label: "Reasoning config",
          options: ["enabled"] as const,
          current: store.form.reasoningConfig?.type,
        })
        results.push({
          key: "reasoningConfig.budgetTokens",
          label: "Budget tokens",
          type: "number",
          current: store.form.reasoningConfig?.budgetTokens,
        })
      } else {
        results.push({
          key: "reasoningConfig.type",
          label: "Reasoning config",
          options: ["enabled"] as const,
          current: store.form.reasoningConfig?.type,
        })
        results.push({
          key: "reasoningConfig.maxReasoningEffort",
          label: "Max reasoning effort",
          options: REASONING_EFFORTS,
          current: store.form.reasoningConfig?.maxReasoningEffort,
        })
      }
    }

    return results
  })

  onMount(() => {
    dialog.setSize("medium")

    const currentModel = local.model.current()
    if (!currentModel) {
      dialog.clear()
      return
    }

    const provider = sync.data.provider.find((x) => x.id === currentModel.providerID)
    if (!provider) {
      dialog.clear()
      return
    }

    const model = provider.models[currentModel.modelID]
    if (!model) {
      dialog.clear()
      return
    }

    const currentVariantName = local.model.variant.current()
    const existingVariantRaw = currentVariantName ? model.variants?.[currentVariantName] : null
    const existingVariant: Record<string, any> | null = existingVariantRaw ? { ...existingVariantRaw } : null

    const modelInfo = {
      providerID: currentModel.providerID,
      modelID: currentModel.modelID,
      providerName: provider.name,
      modelName: model.name ?? currentModel.modelID,
    }

    batch(() => {
      setStore("modelInfo", modelInfo)
      setStore("existingVariant", existingVariant as any)
      setStore("isNew", !existingVariant)

      if (existingVariant) {
        setStore(
          "form",
          produce((s) => {
            s.name = currentVariantName ?? ""
            Object.assign(s, existingVariant)
          }),
        )
      } else {
        setStore(
          "form",
          produce((s) => {
            s.name = ""
          }),
        )
      }
    })

    setTimeout(() => nameInput.focus(), 1)
  })

  useKeyboard((evt) => {
    if (evt.name === "return") {
      if (store.active === "name") {
        setStore("active", "field")
        if (fields().length > 0) {
          setStore("selectedField", fields()[0].key)
        }
      } else {
        saveVariant()
      }
      return
    }

    if (evt.name === "tab") {
      if (store.active === "field") {
        const fieldList = fields()
        const currentIndex = fieldList.findIndex((f) => f.key === store.selectedField)
        const nextIndex = (currentIndex + 1) % fieldList.length
        setStore("selectedField", fieldList[nextIndex].key)
        evt.preventDefault()
      }
    }

    if (evt.name === "shift+tab") {
      if (store.active === "field") {
        const fieldList = fields()
        const currentIndex = fieldList.findIndex((f) => f.key === store.selectedField)
        const nextIndex = currentIndex === 0 ? fieldList.length - 1 : currentIndex - 1
        setStore("selectedField", fieldList[nextIndex].key)
        evt.preventDefault()
      }
    }

    if (store.active === "field") {
      const selectedField = fields().find((f) => f.key === store.selectedField)
      if (!selectedField) return

      if ("options" in selectedField) {
        const options = selectedField.options as readonly any[]
        const currentIndex = options.indexOf(selectedField.current)

        if (evt.name === "right" || evt.name === "down") {
          const nextIndex = currentIndex + 1
          if (nextIndex < options.length) {
            setField(selectedField.key, options[nextIndex])
          }
        }

        if (evt.name === "left" || evt.name === "up") {
          const prevIndex = currentIndex - 1
          if (prevIndex >= 0) {
            setField(selectedField.key, options[prevIndex])
          }
        }
      }

      if (selectedField.type === "number") {
        const current = selectedField.current as number | undefined
        const step = 100

        if (evt.name === "right" || evt.name === "up") {
          setField(selectedField.key, (current ?? 0) + step)
        }

        if (evt.name === "left" || evt.name === "down") {
          const next = (current ?? 0) - step
          setField(selectedField.key, next >= 0 ? next : 0)
        }
      }

      if (selectedField.type === "toggle") {
        if (evt.name === "space") {
          if ("options" in selectedField) {
            const options = selectedField.options as string[]
            const current = selectedField.current as string[] | undefined
            if (current?.includes(options[0])) {
              setField(selectedField.key, [])
            } else {
              setField(selectedField.key, options)
            }
          } else {
            setField(selectedField.key, !(selectedField.current as boolean | undefined))
          }
          evt.preventDefault()
        }
      }
    }
  })

  function setField(key: string, value: any) {
    const parts = key.split(".")
    setStore(
      "form",
      produce((s) => {
        if (parts.length === 1) {
          ;(s as any)[parts[0]] = value
        } else if (parts.length === 2) {
          const parent = (s as any)[parts[0]]
          if (parent && typeof parent === "object") {
            parent[parts[1]] = value
          }
        } else if (parts.length === 3) {
          const parent = (s as any)[parts[0]]
          if (parent && typeof parent === "object") {
            const child = parent[parts[1]]
            if (child && typeof child === "object") {
              child[parts[2]] = value
            }
          }
        }
      }),
    )
  }

  function getField(key: string): any {
    const parts = key.split(".")
    if (parts.length === 1) {
      return (store.form as any)[parts[0]]
    }
    if (parts.length === 2) {
      const parent = (store.form as any)[parts[0]]
      if (parent && typeof parent === "object") {
        return parent[parts[1]]
      }
    }
    if (parts.length === 3) {
      const parent = (store.form as any)[parts[0]]
      if (parent && typeof parent === "object") {
        const child = parent[parts[1]]
        if (child && typeof child === "object") {
          return child[parts[2]]
        }
      }
    }
    return undefined
  }

  async function saveVariant() {
    const variantName = nameInput.plainText.trim()
    if (!variantName) {
      return
    }

    if (!store.modelInfo) return

    const { providerID, modelID } = store.modelInfo

    const configPath = path.join(Global.Path.config, "config.json")
    const config = await Bun.file(configPath)
      .json()
      .catch(() => ({}))

    const providerConfig = config.provider ?? {}
    providerConfig[providerID] = providerConfig[providerID] ?? {}
    providerConfig[providerID].models = providerConfig[providerID].models ?? {}
    providerConfig[providerID].models[modelID] = providerConfig[providerID].models[modelID] ?? {}
    providerConfig[providerID].models[modelID].variants = providerConfig[providerID].models[modelID].variants ?? {}

    const cleanForm: Record<string, any> = {}
    for (const [key, value] of Object.entries(store.form)) {
      if (key === "name") continue
      if (value !== undefined && value !== null && value !== "") {
        cleanForm[key] = value
      }
    }

    providerConfig[providerID].models[modelID].variants[variantName] = cleanForm
    config.provider = providerConfig

    await Bun.write(configPath, JSON.stringify(config, null, 2))

    local.model.variant.set(variantName)
    dialog.clear()
  }

  async function deleteVariant() {
    if (store.isNew) return
    const variantName = nameInput.plainText.trim()
    if (!variantName) return
    if (!store.modelInfo) return

    const { providerID, modelID } = store.modelInfo

    const configPath = path.join(Global.Path.config, "config.json")
    const config = await Bun.file(configPath)
      .json()
      .catch(() => ({}))

    if (config.provider?.[providerID]?.models?.[modelID]?.variants?.[variantName]) {
      delete config.provider[providerID].models[modelID].variants[variantName]

      await Bun.write(configPath, JSON.stringify(config, null, 2))

      if (local.model.variant.current() === variantName) {
        local.model.variant.set(undefined)
      }
    }

    dialog.clear()
  }

  return (
    <box paddingLeft={2} paddingRight={2} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text attributes={TextAttributes.BOLD} fg={theme.text}>
          {store.isNew ? "Create Variant" : "Modify Variant"}
        </text>
        <text fg={theme.textMuted}>esc</text>
      </box>

      <Show when={store.modelInfo}>
        <box gap={1}>
          <text fg={theme.textMuted}>
            {store.modelInfo!.providerName} / {store.modelInfo!.modelName}
          </text>
          <Show when={store.existingVariant}>
            <text fg={theme.accent}>Current variant: {local.model.variant.current()}</text>
          </Show>
        </box>
      </Show>

      <box gap={1}>
        <box>
          <text fg={theme.text}>Variant name:</text>
        </box>
        <textarea
          height={1}
          ref={(val: TextareaRenderable) => (nameInput = val)}
          initialValue={store.form.name}
          textColor={theme.text}
          focusedTextColor={store.active === "name" ? theme.primary : theme.text}
          cursorColor={theme.primary}
        />
      </box>

      <Show when={fields().length > 0}>
        <box gap={1} flexDirection="column">
          <For each={fields()}>
            {(field) => {
              const isSelected = createMemo(() => store.selectedField === field.key && store.active === "field")
              const value = createMemo(() => getField(field.key))

              return (
                <box
                  flexDirection="row"
                  gap={2}
                  paddingLeft={1}
                  backgroundColor={isSelected() ? theme.backgroundElement : undefined}
                  onMouseUp={() => {
                    setStore("active", "field")
                    setStore("selectedField", field.key)
                  }}
                >
                  <text fg={isSelected() ? theme.primary : theme.textMuted} minWidth={22}>
                    {field.label}:
                  </text>

                  <Show when={field.type === "number"}>
                    <text fg={isSelected() ? theme.primary : theme.text}>{value() ?? 0}</text>
                  </Show>

                  <Show when={field.type === "toggle"}>
                    <text fg={isSelected() ? theme.primary : theme.text}>{value() ? "[x]" : "[ ]"}</text>
                  </Show>

                  <Show when={"options" in field && !(value() instanceof Array)}>
                    <text fg={isSelected() ? theme.primary : theme.text}>{value() ?? "(none)"}</text>
                  </Show>

                  <Show when={value() instanceof Array}>
                    <text fg={isSelected() ? theme.primary : theme.text}>{value().length > 0 ? "[x]" : "[ ]"}</text>
                  </Show>
                </box>
              )
            }}
          </For>
        </box>
      </Show>

      <Show when={fields().length === 0 && store.modelInfo}>
        <text fg={theme.textMuted}>No configurable settings for this model</text>
      </Show>

      <Show when={store.active === "name"}>
        <text fg={theme.textMuted} paddingBottom={1}>
          Press <span style={{ fg: theme.text }}>return</span> to continue to settings
        </text>
      </Show>

      <Show when={store.active === "field" && fields().length > 0}>
        <text fg={theme.textMuted} paddingBottom={1}>
          Press <span style={{ fg: theme.text }}>tab</span> to move between fields,{" "}
          <span style={{ fg: theme.text }}>arrow keys</span> to change values,{" "}
          <span style={{ fg: theme.text }}>return</span> to save
        </text>
      </Show>

      <Show when={!store.isNew}>
        <box paddingBottom={1} gap={2} flexDirection="row">
          <text fg={theme.error} onMouseUp={deleteVariant}>
            [Delete variant]
          </text>
        </box>
      </Show>
    </box>
  )
}
