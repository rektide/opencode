# Plan: Model Variant Dialog

## Overview

Create a dialog to modify model variants with shortcut `control-x v`. The dialog should allow editing variant settings that customize model behavior, supporting OpenAI and Anthropic model variation configs.

## Requirements

### Core Functionality

- **Shortcut**: `control-x v` to open the dialog
- **Display**: Show current variant name (or empty if no variant)
- **Model Info**: Display provider + model when no variant exists
- **Controls**: Dynamic form fields based on provider/model type
- **Buttons**:
  - Delete button (bottom left) - removes variant
  - Cancel button (bottom right)
  - OK button (bottom right) - saves changes
- **Target**: Edit user's opencode config JSON file

### Provider Support

1. **OpenAI**: `reasoningEffort` (none, minimal, low, medium, high, xhigh)
2. **Anthropic**: `budgetTokens` (number, max 31999) + thinking type toggle

### Extensibility

Pluggable tool architecture for generating different form controls for different model variant settings.

---

## What We've Learned

### 1. Dialog Creation Patterns

**Location**: `packages/ui/src/components/dialog.tsx`

The `Dialog` component structure:

```tsx
<Dialog title="Title" description="Description" action={actionSlot}>
  {/* Dialog content */}
</Dialog>
```

Key slots:

- `title`: Dialog title (top left)
- `description`: Dialog description (under title)
- `action`: Action slot (top right, overrides close button)
- `body` (children): Main content area
- Close button automatically appears when no `action` slot

**Dialog Context**: `@opencode-ai/ui/context/dialog`

```tsx
const dialog = useDialog()
dialog.show(() => <YourDialog />)
dialog.close()
```

**Example Dialog Pattern** (from `dialog-manage-models.tsx`):

```tsx
export const DialogManageModels: Component = () => {
  const local = useLocal()
  return (
    <Dialog title="Manage models" description="Customize which models...">
      <List
        search={{ placeholder: "Search models", autofocus: true }}
        items={local.model.list()}
        onSelect={(item) => {
          /* ... */
        }}
      >
        {(i) => <span>{i.name}</span>}
      </List>
    </Dialog>
  )
}
```

---

### 2. Keyboard Shortcuts/Commands Registration

**Location**: `packages/app/src/context/command.tsx`

**Command Registration Pattern**:

```tsx
command.register(() => [
  {
    id: "model.variant.cycle",
    title: "Cycle model variants",
    description: "Cycle through available variants",
    keybind: "ctrl+t",
    category: "Model",
    onSelect: (source) => {
      local.model.variant.cycle()
    },
  },
])
```

**Keybind Format**:

- Uses `+` to separate modifiers: `"ctrl+t"`, `"mod+shift+p"`
- `mod` = `Cmd` on Mac, `Ctrl` on Windows/Linux
- Multiple keybinds: `"ctrl+a,ctrl+b"`
- Leader key system: `<leader>` prefix (e.g., `<leader>m`)

**Keybind Parsing** (`parseKeybind` function):

```ts
parseKeybind("ctrl+t") // → { key: "t", ctrl: true, meta: false, shift: false, alt: false }
parseKeybind("<leader>m") // → { key: "m", leader: true }
parseKeybind("mod+shift+p") // → Cmd+Shift+P (Mac) or Ctrl+Shift+P (Windows)
```

**Command Registration Location**: In session page (`packages/app/src/pages/session.tsx:418`)

**Existing Model Commands**:

- `model.choose`: Choose model (`mod+'`)
- `model.variant.cycle`: Cycle variants (`ctrl+t` - existing!)
- `model.list`: List models (`<leader>m` in TUI)

**For Our Implementation**:

```tsx
{
  id: "model.variant.modify",
  title: "Modify variant",
  description: "Edit current model variant settings",
  keybind: "ctrl+x,v",
  category: "Model",
  onSelect: () => dialog.show(() => <DialogModifyVariant />),
}
```

**Note**: The leader key system in TUI (`ctrl+x` followed by another key) is different. For web UI, we use `ctrl+x,v` (comma-separated keybinds) or we might need to use the leader key pattern from TUI.

**TUI Keybinds** (`packages/opencode/src/config/config.ts:609-754`):

- Leader key: `ctrl+x` (default)
- Pattern: `<leader>v` means `ctrl+x` then `v`

**Web UI Keybinds**: No leader key pattern, use comma-separated or space-separated keys.

---

### 3. Config File Structure and Editing

**Config File Locations** (from `packages/opencode/src/config/config.ts`):

1. Remote/well-known config (lowest precedence)
2. Global user config: `~/.config/opencode/config.json` or `opencode.json`
3. Custom config path: `OPENCODE_CONFIG` flag
4. Project config: `<project>/opencode.json` or `opencode.jsonc` (highest precedence)

**Config Schema** (`packages/opencode/src/config/config.ts:609-1051`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "theme": "catppuccin",
  "model": "anthropic/claude-3-opus-20240229",
  "provider": {
    "anthropic": {
      "options": { "apiKey": "...", "baseURL": "...", "timeout": 300000 },
      "models": {
        "claude-3-opus-20240229": {
          "variants": {
            "extended-thinking": {
              "disabled": false,
              "maxTokens": 200000
            },
            "compact": {
              "disabled": false,
              "maxTokens": 4000
            }
          }
        }
      }
    }
  }
}
```

**Model Variant Structure** (`packages/opencode/src/config/config.ts:787-809`):

```typescript
export const Provider = ModelsDev.Provider.partial().extend({
  models: z
    .record(
      z.string(),
      ModelsDev.Model.partial().extend({
        variants: z
          .record(
            z.string(),
            z
              .object({
                disabled: z.boolean().optional(),
              })
              .catchall(z.any()),
          )
          .optional(),
      }),
    )
    .optional(),
})
```

**Config API** (`packages/opencode/src/server/server.ts:474-498`):

```typescript
// GET /config - Get configuration
const config = await sdk.client.config.get()

// PATCH /config - Update configuration
await sdk.client.config.update({ config: updatedConfig })
```

**Config Types** (`packages/sdk/js/src/v2/gen/sdk.gen.ts:528-601`):

```typescript
export class Config extends HeyApiClient {
  public get<ThrowOnError extends boolean = false>(
    parameters?: { directory?: string },
    options?: Options<never, ThrowOnError>,
  ) {
    /* ... */
  }

  public update<ThrowOnError extends boolean = false>(
    parameters?: {
      directory?: string
      config?: Config // Full config object
    },
    options?: Options<never, ThrowOnError>,
  ) {
    /* ... */
  }
}
```

**Config Return Type**:
The `sdk.client.config.get()` returns a result object with:

```typescript
{
  data: Config | undefined
  error: unknown | undefined
  request: Request
  response: Response
}
```

**Config Update Pattern**:

```typescript
const result = await sdk.client.config.get()
if (!result.data) return
const config = result.data

const updatedConfig = { ...config }
// Modify nested path
if (!updatedConfig.provider) updatedConfig.provider = {}
if (!updatedConfig.provider[providerID]) updatedConfig.provider[providerID] = {}
if (!updatedConfig.provider[providerID].models) updatedConfig.provider[providerID].models = {}
if (!updatedConfig.provider[providerID].models[modelID]) updatedConfig.provider[providerID].models[modelID] = {}
if (!updatedConfig.provider[providerID].models[modelID].variants)
  updatedConfig.provider[providerID].models[modelID].variants = {}

updatedConfig.provider[providerID].models[modelID].variants![variantName] = {
  /* settings */
}

await sdk.client.config.update({ config: updatedConfig })
```

---

### 4. Model Variants Definition and Management

**Variant Storage**:

- Persisted in `model.json` state file at `~/.config/opencode/state/model.json`
- Structure: `{ recent: [...], favorite: [...], variant: { "provider/model": "variant-name" } }`

**Variant Management** (`packages/app/src/context/local.tsx:290-328`):

```typescript
variant: {
  current() {
    const m = current()
    if (!m) return undefined
    const key = `${m.provider.id}/${m.id}`
    return store.variant?.[key]
  },
  list() {
    const m = current()
    if (!m) return []
    if (!m.variants) return []
    return Object.keys(m.variants)
  },
  set(value: string | undefined) {
    const m = current()
    if (!m) return
    const key = `${m.provider.id}/${m.id}`
    if (!store.variant) {
      setStore("variant", { [key]: value })
    } else {
      setStore("variant", key, value)
    }
  },
  cycle() {
    const variants = this.list()
    if (variants.length === 0) return
    const currentVariant = this.current()
    if (!currentVariant) {
      this.set(variants[0])
      return
    }
    const index = variants.indexOf(currentVariant)
    if (index === -1 || index === variants.length - 1) {
      this.set(undefined)
      return
    }
    this.set(variants[index + 1])
  },
}
```

**Variant Settings** (`packages/opencode/src/provider/transform.ts:274-378`):

The `variants()` function generates default variant configurations for different providers:

**OpenAI** (`@ai-sdk/openai`):

```typescript
{
  low: { reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  medium: { reasoningEffort: "medium", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
  high: { reasoningEffort: "high", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
}
```

For newer GPT-5 models, includes additional values:

```typescript
;["none", "minimal", "low", "medium", "high", "xhigh"]
```

**Anthropic** (`@ai-sdk/anthropic`):

```typescript
{
  high: {
    thinking: {
      type: "enabled",
      budgetTokens: 16000,
    },
  },
  max: {
    thinking: {
      type: "enabled",
      budgetTokens: 31999,
    },
  },
}
```

**OpenRouter** (`@openrouter/ai-sdk-provider`):

```typescript
{
  low: { reasoning: { effort: "low" } },
  medium: { reasoning: { effort: "medium" } },
  high: { reasoning: { effort: "high" } },
}
```

**Widely Supported** (togetherai, xai, cerebras, deepinfra, openai-compatible):

```typescript
{
  low: { reasoningEffort: "low" },
  medium: { reasoningEffort: "medium" },
  high: { reasoningEffort: "high" },
}
```

**Azure** (`@ai-sdk/azure`):
For GPT-5 models:

```typescript
;["minimal", "low", "medium", "high"]
```

---

### 5. Form Controls and UI Components

**Location**: `packages/ui/src/components/`

Available components:

**TextField** (`text-field.tsx`):

```tsx
<TextField
  label="Name"
  placeholder="Enter name"
  value={store.name}
  onChange={setStore.bind(null, "name")}
  error={store.error}
  description="Optional description"
  copyable
  multiline
  autofocus
/>
```

Props: `label`, `placeholder`, `value`, `onChange`, `error`, `description`, `copyable`, `multiline`, `autofocus`

**Switch** (`switch.tsx`):

```tsx
<Switch checked={isVisible} onChange={setVisible}>
  Label text
</Switch>
```

**Button** (`button.tsx`):

```tsx
<Button
  variant="primary" // "primary" | "secondary" | "ghost"
  size="large" // "small" | "normal" | "large"
  icon="plus-small"
  onClick={handleClick}
>
  Button text
</Button>
```

**Select** (`select.tsx`):

```tsx
<Select
  placeholder="Select option"
  options={items}
  current={selected}
  groupBy={(x) => x.category}
  label={(x) => x.title}
  onSelect={(v) => setSelected(v)}
/>
```

**RadioGroup** (`radio-group.tsx`):

```tsx
<RadioGroup options={options} value={selected} onChange={setSelected} />
```

**Checkbox** (`checkbox.tsx`):

```tsx
<Checkbox checked={checked} onChange={setChecked} label="Label" />
```

**List** (`list.tsx`):

- Filterable, searchable, keyboard-navigable lists
- Used in most dialogs (select-model, manage-models, etc.)
- Props: `search`, `items`, `key`, `filterKeys`, `sortBy`, `groupBy`, `onSelect`

---

### 6. Model Information Access

**Local Context** (`packages/app/src/context/local.tsx`):

```typescript
const local = useLocal()

const currentModel = local.model.current()
// Returns: LocalModel | undefined
// LocalModel = Omit<Model, "provider"> & { provider: Provider }

const currentVariant = local.model.variant.current()
// Returns: string | undefined (variant name)

const availableVariants = local.model.variant.list()
// Returns: string[] (variant names)

const modelVariants = currentModel?.variants
// Returns: Record<string, Record<string, any>> | undefined
```

**SDK Client** (`packages/app/src/context/sdk.ts`):

```typescript
const sdk = useSDK()
const config = await sdk.client.config.get()
const updated = await sdk.client.config.update({ config: newConfig })
```

---

### 7. Existing Dialogs to Reference

**DialogManageModels** (`packages/app/src/components/dialog-manage-models.tsx`):

- Shows list of all models
- Toggle visibility with Switch
- Uses List component with search
- Simple pattern for model listing

**DialogSelectModel** (`packages/app/src/components/dialog-select-model.tsx`):

- Searchable model selector
- Groups by provider
- Shows provider names
- Recent variants support
- Connect provider button (action slot)

**DialogFork** (`packages/app/src/components/dialog-fork.tsx`):

- Lists user messages
- Uses createMemo for filtering
- Shows formatted messages
- Simple select pattern

---

## Implementation Plan

### Step 1: Create Dialog Component

**File**: `packages/app/src/components/dialog-modify-variant.tsx`

**Structure**:

```typescript
import { Component, createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { Button } from "@opencode-ai/ui/button"
import { Select } from "@opencode-ai/ui/select"
import { Switch } from "@opencode-ai/ui/switch"
import { useLocal } from "@/context/local"
import { useSDK } from "@/context/sdk"
import { showToast } from "@opencode-ai/ui/toast"

export const DialogModifyVariant: Component = () => {
  const local = useLocal()
  const sdk = useSDK()
  const dialog = useDialog()

  const currentModel = createMemo(() => local.model.current())
  const currentVariant = createMemo(() => local.model.variant.current())

  // Form state
  const [store, setStore] = createStore({
    name: currentVariant() ?? "",
    settings: { /* default settings */ }
  })

  // Render dynamic controls based on provider/model
  // Handle save/delete/cancel

  return (
    <Dialog title="Modify variant">
      {/* Form content */}
    </Dialog>
  )
}
```

### Step 2: Implement Dynamic Control Generation

**Control Types**:

```typescript
type VariantControl =
  | { type: "text"; key: string; label: string; description?: string }
  | {
      type: "select"
      key: string
      label: string
      description?: string
      options: Array<{ value: string; label: string }>
    }
  | { type: "number"; key: string; label: string; description?: string }
  | { type: "switch"; key: string; label: string; description?: string }
```

**Provider Detection**:

```typescript
function getVariantControls(providerID: string, modelID: string): VariantControl[] {
  const lowerProvider = providerID.toLowerCase()
  const lowerModel = modelID.toLowerCase()

  if (lowerProvider === "anthropic" || lowerModel.includes("claude")) {
    return [
      {
        type: "select",
        key: "thinking.type",
        label: "Thinking",
        description: "Enable extended thinking mode",
        options: [
          { value: "enabled", label: "Enabled" },
          { value: "disabled", label: "Disabled" },
        ],
      },
      {
        type: "number",
        key: "thinking.budgetTokens",
        label: "Budget Tokens",
        description: "Maximum tokens for thinking (max 31999)",
      },
    ]
  }

  if (lowerProvider === "openai" || lowerModel.includes("gpt") || lowerModel.includes("o1")) {
    return [
      {
        type: "select",
        key: "reasoningEffort",
        label: "Reasoning Effort",
        description: "Level of computational effort for reasoning",
        options: [
          { value: "none", label: "None" },
          { value: "minimal", label: "Minimal" },
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
          { value: "xhigh", label: "Extra High" },
        ],
      },
      {
        type: "switch",
        key: "reasoningSummary",
        label: "Reasoning Summary",
        description: "Include reasoning summary",
      },
    ]
  }

  return []
}
```

**Default Settings**:

```typescript
function getVariantDefaultSettings(providerID: string, modelID: string): Record<string, any> {
  const lowerProvider = providerID.toLowerCase()
  const lowerModel = modelID.toLowerCase()

  if (lowerProvider === "anthropic" || lowerModel.includes("claude")) {
    return {
      "thinking.type": "enabled",
      "thinking.budgetTokens": 16000,
    }
  }

  if (lowerProvider === "openai" || lowerModel.includes("gpt") || lowerModel.includes("o1")) {
    return {
      reasoningEffort: "medium",
      reasoningSummary: true,
    }
  }

  return {}
}
```

**Settings Flattening** (for saving nested objects):

```typescript
function flattenVariantSettings(settings: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}

  for (const [key, value] of Object.entries(settings)) {
    if (key.includes(".")) {
      const parts = key.split(".")
      let current = result
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {}
        current = current[parts[i]]
      }
      current[parts[parts.length - 1]] = value
    } else {
      result[key] = value
    }
  }

  return result
}
```

### Step 3: Save and Delete Handlers

**Save Handler**:

```typescript
const handleSave = async () => {
  const model = currentModel()
  if (!model) return

  try {
    const result = await sdk.client.config.get()
    if (!result.data) {
      showToast("Failed to load config")
      return
    }
    const config = result.data
    const providerID = model.provider.id
    const modelID = model.id
    const variantName = store.name

    if (!variantName) {
      showToast("Variant name is required")
      return
    }

    const updatedConfig = { ...config }
    if (!updatedConfig.provider) updatedConfig.provider = {}
    if (!updatedConfig.provider[providerID]) updatedConfig.provider[providerID] = {}
    if (!updatedConfig.provider[providerID].models) updatedConfig.provider[providerID].models = {}
    if (!updatedConfig.provider[providerID].models[modelID]) updatedConfig.provider[providerID].models[modelID] = {}
    if (!updatedConfig.provider[providerID].models[modelID].variants)
      updatedConfig.provider[providerID].models[modelID].variants = {}

    const flattenedSettings = flattenVariantSettings(store.settings)
    updatedConfig.provider[providerID].models[modelID].variants![variantName] = flattenedSettings

    await sdk.client.config.update({ config: updatedConfig })
    showToast(`Variant "${variantName}" saved`)
    dialog.close()
  } catch (error) {
    showToast("Failed to save variant")
    console.error(error)
  }
}
```

**Delete Handler**:

```typescript
const handleDelete = async () => {
  const model = currentModel()
  if (!model) return
  if (!store.name) {
    showToast("No variant to delete")
    return
  }

  try {
    const result = await sdk.client.config.get()
    if (!result.data) {
      showToast("Failed to load config")
      return
    }
    const config = result.data
    const providerID = model.provider.id
    const modelID = model.id
    const variantName = store.name

    const updatedConfig = { ...config }
    if (updatedConfig.provider?.[providerID]?.models?.[modelID]?.variants) {
      delete updatedConfig.provider[providerID].models[modelID].variants![variantName]
    }

    await sdk.client.config.update({ config: updatedConfig })
    showToast(`Variant "${variantName}" deleted`)
    dialog.close()
  } catch (error) {
    showToast("Failed to delete variant")
    console.error(error)
  }
}
```

### Step 4: Register Command

**Location**: `packages/app/src/pages/session.tsx` (around line 418, in `command.register`)

```typescript
{
  id: "model.variant.modify",
  title: "Modify variant",
  description: "Edit current model variant settings",
  category: "Model",
  keybind: "ctrl+x,v",
  onSelect: () => dialog.show(() => <DialogModifyVariant />),
}
```

**Import Dialog**: Add to imports:

```typescript
import { DialogModifyVariant } from "@/components/dialog-modify-variant"
```

### Step 5: Dialog Layout

```tsx
return (
  <Dialog
    title="Modify variant"
    description={
      <Show when={currentModel()}>
        <div class="text-14-regular text-text-weak">
          {currentModel()!.provider.name} / {currentModel()!.name}
        </div>
      </Show>
    }
  >
    <div class="flex flex-col gap-4">
      {/* Variant Name */}
      <TextField
        label="Variant name"
        placeholder="Enter variant name"
        value={store.name}
        onChange={(v) => setStore("name", v)}
        autofocus
      />

      {/* Dynamic Controls */}
      <Show when={variantControls().length > 0}>
        <For each={variantControls()}>
          {(control) => <div class="flex flex-col gap-1">{/* Render based on control.type */}</div>}
        </For>
      </Show>

      {/* No Controls Message */}
      <Show when={variantControls().length === 0}>
        <div class="text-14-regular text-text-weak">No variant settings available for this model.</div>
      </Show>

      {/* Buttons */}
      <div class="flex justify-between items-center mt-2">
        <Button variant="ghost" disabled={!store.name} onClick={handleDelete}>
          Delete
        </Button>
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
)
```

---

## Technical Considerations

### Keybinding Format

The shortcut `control-x v` can be implemented as:

- `"ctrl+x,v"` (comma-separated sequence) - presses ctrl+x then v
- Or need to investigate if leader key pattern works in web UI

**TUI Pattern**: Uses `<leader>v` which is `ctrl+x` then `v`
**Web UI Pattern**: Likely `"ctrl+x,v"` or `"ctrl+x ctrl+v"`

Need to test which format works in web UI.

### Config Update vs Variant Selection

- The dialog edits the **config file** (persistent variants)
- `local.model.variant.set()` edits the **state file** (current selection)
- After saving to config, the variant should appear in the variant list
- User still needs to select the variant via `local.model.variant.set(name)` to activate it

**Decision**: Should the dialog also set the current variant after saving?

- **Pros**: Seamless UX - saves and activates immediately
- **Cons**: Might be unexpected if user wants to save but not activate

**Recommendation**: Only save to config, let user manually select variant after.

### Form State Management

Use SolidJS stores:

```typescript
const [store, setStore] = createStore<VariantForm>({
  name: currentVariant() ?? "",
  settings: defaultSettings(),
})
```

### Loading Existing Variant Settings

When dialog opens with existing variant, we need to:

1. Fetch current config
2. Find the variant's settings
3. Populate form with existing values
4. Allow editing

**Enhancement**: Add this in Phase 2 if time permits. For now, start with default values.

### Validation

- Variant name is required for save
- Budget tokens should be validated (max 31999 for Anthropic)
- Show error toasts on validation failures

### Toast Messages

Use `showToast()` for user feedback:

- "Variant saved"
- "Variant deleted"
- "Failed to save variant"
- "Variant name is required"

---

## Testing Checklist

1. **Dialog Opens**: Press `ctrl+x,v` and dialog appears
2. **Current Model**: Shows provider/model name
3. **Variant Name**: Prefills current variant name if exists
4. **Controls**: Shows appropriate controls for model type
5. **Anthropic**: Shows thinking type and budget tokens
6. **OpenAI**: Shows reasoning effort and summary switch
7. **Save**: Saves variant to config file
8. **Delete**: Deletes variant from config file
9. **Cancel**: Closes dialog without changes
10. **Empty Variant**: Works with empty variant name (creating new)
11. **No Controls**: Shows message for unsupported models

---

## File Structure

```
packages/app/src/
  components/
    dialog-modify-variant.tsx    # NEW
  pages/
    session.tsx                   # EDIT: Add command registration
```

---

## Dependencies

All dependencies already exist in the project:

- `solid-js`: Component framework
- `@opencode-ai/ui`: Dialog, TextField, Button, Select, Switch, Toast
- `@opencode-ai/ui/context/dialog`: Dialog context
- `@opencode-ai/sdk/v2`: Config client
- `@/context/local`: Local model/variant context
- `@/context/sdk`: SDK client

No new dependencies required.

---

## Extensibility

The `VariantControl` type and `getVariantControls()` function make it easy to add support for new providers:

```typescript
function getVariantControls(providerID: string, modelID: string): VariantControl[] {
  // ... existing providers ...

  if (lowerProvider === "xai") {
    return [
      {
        type: "select",
        key: "reasoningEffort",
        label: "Reasoning Effort",
        options: [
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ],
      },
    ]
  }

  return []
}
```

---

## Edge Cases

1. **No model selected**: Show error toast, close dialog
2. **Config fetch fails**: Show error toast, close dialog
3. **Config update fails**: Show error toast, don't close dialog
4. **Variant doesn't exist**: Allow creating new variant with name
5. **Model has no variant support**: Show "No variant settings available" message
6. **Budget tokens exceeds max**: Validate before save, show error
7. **Empty variant name**: Disable delete button, show error on save

---

## Future Enhancements (Out of Scope)

1. **Load existing variant settings**: When editing existing variant, populate form with current values
2. **Variant presets**: Add preset dropdown (low, medium, high)
3. **Validation**: Real-time validation of form fields
4. **Preview**: Show how variant will affect model behavior
5. **Import/Export**: Export variant as JSON for sharing
6. **Batch operations**: Apply variant to multiple models
7. **Variant templates**: Save variant as template for reuse
8. **Advanced settings**: More granular control over all variant options

---

## Summary

This plan provides a complete roadmap for implementing model variant dialog with:

- ✅ Shortcut `control-x v` (via command registration)
- ✅ Dynamic form controls for different providers
- ✅ Config file editing (save/delete variants)
- ✅ Support for OpenAI (reasoningEffort) and Anthropic (budgetTokens)
- ✅ Pluggable architecture for future provider support
- ✅ UI components following existing patterns
- ✅ Proper error handling and user feedback
- ✅ Load existing variant settings when editing
- ✅ Validation for budget tokens (max 31999 for Anthropic)

The implementation follows existing codebase patterns and conventions, ensuring consistency and maintainability.

## Implementation Status

### Completed ✅

1. **Dialog Component** (`packages/app/src/components/dialog-modify-variant.tsx`)
   - Form state management with SolidJS stores
   - Dynamic control generation based on provider/model
   - Support for OpenAI and Anthropic providers
   - Save/Delete/Cancel buttons with proper layout

2. **Command Registration** (`packages/app/src/pages/session.tsx`)
   - Registered `"model.variant.modify"` command
   - Keybind: `"ctrl+x,v"`
   - Category: "Model"
   - Opens `DialogModifyVariant` on select

3. **Type Safety**
   - All TypeScript types defined
   - Typecheck passes successfully

4. **Additional Features**
   - Load existing variant settings on mount
   - Validation for Anthropic budget tokens (max 31999)
   - Nested settings flattening for config storage

### Next Steps

1. **Testing**
   - Start dev server and test dialog opens with `ctrl+x,v`
   - Test creating new variants for OpenAI models
   - Test creating new variants for Anthropic models
   - Test editing existing variants
   - Test deleting variants
   - Test error handling (no model, failed config load, etc.)

2. **Optional Enhancements**
   - Add preset dropdown for common variant configurations
   - Show variant preview/summary before saving
   - Support for more providers (xai, togetherai, etc.)
   - Export/import variants as JSON

## Files Modified

```
packages/app/src/
  components/
    dialog-modify-variant.tsx    # NEW - Dialog component
  pages/
    session.tsx                   # EDIT - Added command registration +1 import
```

## Files Created

```
PLAN-variant-dialog.md              # Implementation plan and documentation
```
