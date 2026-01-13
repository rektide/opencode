import {
  Component,
  createMemo,
  createSignal,
  For,
  Show,
  onMount,
} from "solid-js";
import { createStore } from "solid-js/store";
import { useDialog } from "@opencode-ai/ui/context/dialog";
import { Dialog } from "@opencode-ai/ui/dialog";
import { TextField } from "@opencode-ai/ui/text-field";
import { Button } from "@opencode-ai/ui/button";
import { Select } from "@opencode-ai/ui/select";
import { Switch } from "@opencode-ai/ui/switch";
import { useLocal } from "@/context/local";
import { useSDK } from "@/context/sdk";
import { showToast } from "@opencode-ai/ui/toast";

interface VariantForm {
  name: string;
  settings: Record<string, any>;
}

type VariantControl =
  | { type: "text"; key: string; label: string; description?: string }
  | {
      type: "select";
      key: string;
      label: string;
      description?: string;
      options: Array<{ value: string; label: string }>;
    }
  | { type: "number"; key: string; label: string; description?: string }
  | { type: "switch"; key: string; label: string; description?: string }
  | {
      type: "array";
      key: string;
      label: string;
      description?: string;
      options: Array<{ value: string; label: string }>;
    };

const REASONING_EFFORT_FULL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
];

const REASONING_EFFORT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const REASONING_SUMMARY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: true.toString(), label: "Enabled" },
  { value: false.toString(), label: "Disabled" },
];

const INCLUDE_REASONING_OPTION = {
  value: "reasoning.encrypted_content",
  label: "Encrypted reasoning content",
};

const THINKING_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

const THINKING_LEVEL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

const THINKING_LEVEL_FULL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

function getVariantControls(
  providerID: string,
  modelID: string,
  apiNpm: string | undefined,
  providerApi: string | undefined,
): { controls: VariantControl[]; isSupported: boolean } {
  const lowerModel = modelID.toLowerCase();
  const lowerApi = providerApi?.toLowerCase() ?? "";
  const lowerNpm = apiNpm?.toLowerCase() ?? "";

  if (lowerApi.includes("anthropic") || lowerModel.includes("claude")) {
    return {
      controls: [
        {
          type: "select",
          key: "thinking.type",
          label: "Thinking",
          description: "Enable extended thinking mode",
          options: THINKING_TYPE_OPTIONS,
        },
        {
          type: "number",
          key: "thinking.budgetTokens",
          label: "Budget Tokens",
          description: "Maximum tokens for thinking (max 31999)",
        },
      ],
      isSupported: true,
    };
  }

  if (
    lowerApi.includes("openai") ||
    lowerModel.includes("gpt") ||
    lowerModel.includes("o1")
  ) {
    return {
      controls: [
        {
          type: "select",
          key: "reasoningEffort",
          label: "Reasoning Effort",
          description: "Level of computational effort for reasoning",
          options: REASONING_EFFORT_FULL_OPTIONS,
        },
        {
          type: "select",
          key: "reasoningSummary",
          label: "Reasoning Summary",
          description: "Include reasoning summary in response",
          options: REASONING_SUMMARY_OPTIONS,
        },
        {
          type: "array",
          key: "include",
          label: "Include",
          description:
            "Fields to include in response (e.g., reasoning.encrypted_content)",
          options: [INCLUDE_REASONING_OPTION],
        },
      ],
      isSupported: true,
    };
  }

  if (lowerApi.includes("openrouter")) {
    return {
      controls: [
        {
          type: "select",
          key: "reasoning.effort",
          label: "Reasoning Effort",
          description: "Level of reasoning effort",
          options: REASONING_EFFORT_OPTIONS,
        },
      ],
      isSupported: true,
    };
  }

  if (lowerApi.includes("azure")) {
    return {
      controls: [
        {
          type: "select",
          key: "reasoningEffort",
          label: "Reasoning Effort",
          description: "Level of computational effort for reasoning",
          options: REASONING_EFFORT_FULL_OPTIONS,
        },
        {
          type: "select",
          key: "reasoningSummary",
          label: "Reasoning Summary",
          description: "Include reasoning summary in response",
          options: REASONING_SUMMARY_OPTIONS,
        },
        {
          type: "array",
          key: "include",
          label: "Include",
          description: "Fields to include in response",
          options: [INCLUDE_REASONING_OPTION],
        },
      ],
      isSupported: true,
    };
  }

  if (lowerApi.includes("amazon-bedrock")) {
    return {
      controls: [
        {
          type: "number",
          key: "reasoningConfig.budgetTokens",
          label: "Budget Tokens",
          description: "Maximum tokens for reasoning",
        },
      ],
      isSupported: true,
    };
  }

  if (lowerApi.includes("google") || lowerApi.includes("vertex")) {
    return {
      controls: [
        {
          type: "switch",
          key: "includeThoughts",
          label: "Include Thoughts",
          description: "Include thinking/thoughts in response",
        },
        {
          type: "select",
          key: "thinkingLevel",
          label: "Thinking Level",
          description: "Level of thinking",
          options: THINKING_LEVEL_OPTIONS,
        },
        {
          type: "number",
          key: "thinkingBudget",
          label: "Thinking Budget",
          description: "Budget for thinking (tokens)",
        },
      ],
      isSupported: true,
    };
  }

  if (lowerApi.includes("groq")) {
    return {
      controls: [
        {
          type: "switch",
          key: "includeThoughts",
          label: "Include Thoughts",
          description: "Include thinking/thoughts in response",
        },
        {
          type: "select",
          key: "thinkingLevel",
          label: "Thinking Level",
          description: "Level of thinking",
          options: THINKING_LEVEL_FULL_OPTIONS,
        },
      ],
      isSupported: true,
    };
  }

  if (
    lowerApi.includes("cerebras") ||
    lowerApi.includes("togetherai") ||
    lowerApi.includes("xai") ||
    lowerApi.includes("deepinfra") ||
    lowerApi.includes("openai-compatible") ||
    lowerApi.includes("gateway")
  ) {
    return {
      controls: [
        {
          type: "select",
          key: "reasoningEffort",
          label: "Reasoning Effort",
          description: "Level of computational effort for reasoning",
          options: REASONING_EFFORT_OPTIONS,
        },
      ],
      isSupported: true,
    };
  }

  return {
    controls: [
      {
        type: "select",
        key: "reasoningEffort",
        label: "Reasoning Effort",
        description: "Level of computational effort for reasoning",
        options: REASONING_EFFORT_FULL_OPTIONS,
      },
      {
        type: "select",
        key: "reasoningSummary",
        label: "Reasoning Summary",
        description: "Include reasoning summary in response",
        options: REASONING_SUMMARY_OPTIONS,
      },
      {
        type: "array",
        key: "include",
        label: "Include",
        description: "Fields to include in response",
        options: [INCLUDE_REASONING_OPTION],
      },
    ],
    isSupported: false,
  };
}

function getVariantDefaultSettings(
  providerID: string,
  modelID: string,
  apiNpm: string | undefined,
  providerApi: string | undefined,
): Record<string, any> {
  const lowerProvider = providerID.toLowerCase();
  const lowerModel = modelID.toLowerCase();
  const lowerApi = providerApi?.toLowerCase() ?? "";
  const lowerNpm = apiNpm?.toLowerCase() ?? "";

  if (lowerNpm.includes("anthropic") || lowerModel.includes("claude")) {
    return {
      "thinking.type": "enabled",
      "thinking.budgetTokens": 16000,
    };
  }

  if (
    lowerNpm.includes("openai") ||
    lowerModel.includes("gpt") ||
    lowerModel.includes("o1")
  ) {
    return {
      reasoningEffort: "medium",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    };
  }

  if (lowerNpm.includes("openrouter")) {
    return {
      "reasoning.effort": "medium",
    };
  }

  if (lowerNpm.includes("azure")) {
    return {
      reasoningEffort: "medium",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    };
  }

  if (lowerNpm.includes("amazon-bedrock")) {
    return {
      "reasoningConfig.budgetTokens": 16000,
    };
  }

  if (
    lowerNpm.includes("google") ||
    lowerApi.includes("google") ||
    lowerApi.includes("vertex")
  ) {
    return {
      includeThoughts: true,
      thinkingLevel: "high",
      thinkingBudget: 16000,
    };
  }

  if (lowerNpm.includes("groq")) {
    return {
      includeThoughts: true,
      thinkingLevel: "medium",
    };
  }

  if (
    lowerNpm.includes("cerebras") ||
    lowerNpm.includes("togetherai") ||
    lowerNpm.includes("xai") ||
    lowerNpm.includes("deepinfra") ||
    lowerNpm.includes("openai-compatible") ||
    lowerNpm.includes("gateway")
  ) {
    return {
      reasoningEffort: "medium",
    };
  }

  if (
    lowerApi.includes("openai") ||
    lowerModel.includes("gpt") ||
    lowerModel.includes("o1")
  ) {
    return {
      reasoningEffort: "medium",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    };
  }

  if (lowerApi.includes("openrouter")) {
    return {
      "reasoning.effort": "medium",
    };
  }

  if (lowerApi.includes("azure")) {
    return {
      reasoningEffort: "medium",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
    };
  }

  if (lowerApi.includes("amazon-bedrock")) {
    return {
      "reasoningConfig.budgetTokens": 16000,
    };
  }

  if (lowerApi.includes("google") || lowerApi.includes("vertex")) {
    return {
      includeThoughts: true,
      thinkingLevel: "high",
      thinkingBudget: 16000,
    };
  }

  if (lowerApi.includes("groq")) {
    return {
      includeThoughts: true,
      thinkingLevel: "medium",
    };
  }

  if (
    lowerApi.includes("cerebras") ||
    lowerApi.includes("togetherai") ||
    lowerApi.includes("xai") ||
    lowerApi.includes("deepinfra") ||
    lowerApi.includes("openai-compatible") ||
    lowerApi.includes("gateway")
  ) {
    return {
      reasoningEffort: "medium",
    };
  }

  return {
    reasoningEffort: "medium",
    reasoningSummary: "auto",
    include: ["reasoning.encrypted_content"],
  };
}

function flattenVariantSettings(
  settings: Record<string, any>,
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(settings)) {
    if (key.includes(".")) {
      const parts = key.split(".");
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

export const DialogModifyVariant: Component = () => {
  const local = useLocal();
  const sdk = useSDK();
  const dialog = useDialog();

  const currentModel = createMemo(() => local.model.current());
  const currentVariant = createMemo(() => local.model.variant.current());

  const variantInfo = createMemo(() => {
    const model = currentModel();
    if (!model) return { controls: [], isSupported: true };
    return getVariantControls(
      model.provider.id,
      model.id,
      (model as any).provider?.api,
      (model as any).provider?.npm,
    );
  });

  const variantControls = createMemo(() => variantInfo().controls);

  const defaultSettings = createMemo(() => {
    const model = currentModel();
    if (!model) return {};
    return getVariantDefaultSettings(
      model.provider.id,
      model.id,
      (model as any).provider?.api,
      (model as any).provider?.npm,
    );
  });

  const originalVariantName = currentVariant();

  const [config, setConfig] = createSignal<any>(null);

  const [store, setStore] = createStore<VariantForm>({
    name: originalVariantName ?? "",
    settings: defaultSettings(),
  });

  const [variantExists, setVariantExists] = createSignal(!!originalVariantName);

  const currentVariantExists = createMemo(() => {
    const model = currentModel();
    const name = store.name;
    if (!model || !name || !config()) return false;
    return !!config()?.provider?.[model.provider.id]?.models?.[model.id]
      ?.variants?.[name];
  });

  const isEditingExistingVariant = createMemo(() => {
    return (
      store.name && store.name === originalVariantName && currentVariantExists()
    );
  });

  const dialogTitle = createMemo(() => {
    return currentVariantExists() ? "Modify variant" : "Create variant";
  });

  const handleCancel = () => {
    dialog.close();
  };

  const handleDelete = async () => {
    const model = currentModel();
    if (!model) return;
    if (!store.name) {
      showToast("No variant to delete");
      return;
    }

    try {
      const result = await sdk.client.config.get();
      if (!result.data) {
        showToast("Failed to load config");
        return;
      }
      const config = result.data;
      const providerID = model.provider.id;
      const modelID = model.id;
      const variantName = store.name;

      const updatedConfig = { ...config };
      if (updatedConfig.provider?.[providerID]?.models?.[modelID]?.variants) {
        delete updatedConfig.provider[providerID].models[modelID].variants![
          variantName
        ];
      }

      await sdk.client.config.update({ config: updatedConfig });
      showToast(`Variant "${variantName}" deleted`);
      dialog.close();
    } catch (error) {
      showToast("Failed to delete variant");
      console.error(error);
    }
  };

  const handleSave = async () => {
    const model = currentModel();
    if (!model) return;

    try {
      const result = await sdk.client.config.get();
      if (!result.data) {
        showToast("Failed to load config");
        return;
      }
      const config = result.data;
      const providerID = model.provider.id;
      const modelID = model.id;
      const variantName = store.name;

      if (!variantName) {
        showToast("Variant name is required");
        return;
      }

      const lowerProvider = providerID.toLowerCase();
      if (
        lowerProvider === "anthropic" ||
        modelID.toLowerCase().includes("claude")
      ) {
        const budgetTokens = store.settings["thinking.budgetTokens"];
        if (typeof budgetTokens === "number" && budgetTokens > 31999) {
          showToast("Budget tokens cannot exceed 31999");
          return;
        }
      }

      const updatedConfig = { ...config };
      if (!updatedConfig.provider) updatedConfig.provider = {};
      if (!updatedConfig.provider[providerID])
        updatedConfig.provider[providerID] = {};
      if (!updatedConfig.provider[providerID].models)
        updatedConfig.provider[providerID].models = {};
      if (!updatedConfig.provider[providerID].models[modelID])
        updatedConfig.provider[providerID].models[modelID] = {};
      if (!updatedConfig.provider[providerID].models[modelID].variants) {
        updatedConfig.provider[providerID].models[modelID].variants = {};
      }

      const flattenedSettings = flattenVariantSettings(store.settings);
      updatedConfig.provider[providerID].models[modelID].variants[variantName] =
        flattenedSettings;

      await sdk.client.config.update({ config: updatedConfig });
      showToast(`Variant "${variantName}" saved`);
      dialog.close();
    } catch (error) {
      showToast("Failed to save variant");
      console.error(error);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setStore("settings", key, value);
  };

  const toggleArrayItem = (key: string, value: string) => {
    const current = (store.settings[key] as string[]) ?? [];
    if (current.includes(value)) {
      setStore(
        "settings",
        key,
        current.filter((x) => x !== value),
      );
    } else {
      setStore("settings", key, [...current, value]);
    }
  };

  const loadExistingVariantSettings = async () => {
    const model = currentModel();
    const variantName = currentVariant();
    if (!model || !variantName) {
      setVariantExists(false);
      return;
    }

    try {
      const result = await sdk.client.config.get();
      if (!result.data) return;

      const config = result.data;
      setConfig(config);
      const variantSettings =
        config.provider?.[model.provider.id]?.models?.[model.id]?.variants?.[
          variantName
        ];

      if (variantSettings) {
        setVariantExists(true);
        const flattened = flattenSettings(variantSettings);
        setStore("settings", flattened);
      } else {
        setVariantExists(false);
      }
    } catch (error) {
      console.error("Failed to load variant settings:", error);
    }
  };

  function flattenSettings(
    obj: Record<string, any>,
    prefix = "",
  ): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const nested = flattenSettings(value, `${prefix}${key}.`);
        Object.assign(result, nested);
      } else {
        result[`${prefix}${key}`] = value;
      }
    }

    return result;
  }

  onMount(() => {
    loadExistingVariantSettings();
  });

  return (
    <Dialog
      title={dialogTitle()}
      description={
        <div class="flex flex-col gap-1">
          <Show when={currentModel()}>
            <div class="text-14-regular text-text-weak">
              {currentModel()!.provider.name} / {currentModel()!.name}
            </div>
          </Show>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        <Show when={!variantInfo().isSupported}>
          <div class="p-3 bg-orange-500/10 border border-orange-500/30 rounded text-13-regular text-orange-500">
            <span>
              ⚠️ This provider/model combination may not support these settings.
              The variant might not work as expected.
            </span>
          </div>
        </Show>

        <TextField
          label="Variant name"
          placeholder="Enter variant name"
          value={store.name}
          onChange={(v) => setStore("name", v)}
          autofocus
        />

        <Show when={variantControls().length > 0}>
          <For each={variantControls()}>
            {(control) => (
              <div class="flex flex-col gap-1">
                <Show
                  when={control.type === "text"}
                  fallback={
                    <Show
                      when={control.type === "select"}
                      fallback={
                        <Show
                          when={control.type === "number"}
                          fallback={
                            <Show
                              when={control.type === "switch"}
                              fallback={
                                <Show
                                  when={control.type === "array"}
                                  fallback={null}
                                >
                                  <div class="flex flex-col gap-2">
                                    <span class="text-14-regular text-text-strong">
                                      {control.label}
                                    </span>
                                    <Show when={control.description}>
                                      <div class="text-12-regular text-text-weak">
                                        {control.description}
                                      </div>
                                    </Show>
                                    <For each={(control as any).options}>
                                      {(option) => {
                                        const currentArray =
                                          (store.settings[
                                            control.key
                                          ] as string[]) ?? [];
                                        const isSelected =
                                          currentArray.includes(option.value);
                                        return (
                                          <button
                                            type="button"
                                            classList={{
                                              "px-3 py-1.5 rounded text-13-regular border transition-colors": true,
                                              "bg-surface-raised border-border-base text-text-strong":
                                                isSelected,
                                              "bg-surface-raised-non-alpha border-border-subtle text-text-weak":
                                                !isSelected,
                                            }}
                                            onClick={() =>
                                              toggleArrayItem(
                                                control.key,
                                                option.value,
                                              )
                                            }
                                          >
                                            {(control as any).label(
                                              (x: any) => x.label,
                                            )(option)}
                                          </button>
                                        );
                                      }}
                                    </For>
                                  </div>
                                </Show>
                              }
                            >
                              <Switch
                                checked={store.settings[control.key] === true}
                                onChange={(v) => updateSetting(control.key, v)}
                              >
                                {control.label}
                              </Switch>
                              <Show when={control.description}>
                                <div class="text-12-regular text-text-weak">
                                  {control.description}
                                </div>
                              </Show>
                            </Show>
                          }
                        >
                          <TextField
                            type="number"
                            label={control.label}
                            value={
                              store.settings[control.key]?.toString() ?? ""
                            }
                            onChange={(v) =>
                              updateSetting(control.key, parseInt(v) || 0)
                            }
                            description={control.description}
                          />
                        </Show>
                      }
                    >
                      <Select
                        placeholder={`Select ${control.label.toLowerCase()}`}
                        options={(control as any).options}
                        label={(x: any) => x.label}
                        value={(control as any).options.find(
                          (x: any) => x.value === store.settings[control.key],
                        )}
                        onSelect={(v: any) =>
                          updateSetting(control.key, v.value)
                        }
                      />
                      <Show when={control.description}>
                        <div class="text-12-regular text-text-weak mt-1">
                          {control.description}
                        </div>
                      </Show>
                    </Show>
                  }
                >
                  <TextField
                    label={control.label}
                    placeholder={`Enter ${control.label.toLowerCase()}`}
                    value={store.settings[control.key]?.toString() ?? ""}
                    onChange={(v) => updateSetting(control.key, v)}
                    description={control.description}
                  />
                </Show>
              </div>
            )}
          </For>
        </Show>

        <Show when={variantControls().length === 0}>
          <div class="text-14-regular text-text-weak">
            No variant settings available for this model.
          </div>
        </Show>

        <div class="flex justify-between items-center mt-2">
          <Show when={isEditingExistingVariant()}>
            <Button
              variant="ghost"
              disabled={!store.name}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </Show>
          <div class="flex gap-2">
            <Button variant="secondary" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              OK
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
