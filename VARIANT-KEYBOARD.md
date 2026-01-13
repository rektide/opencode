# Variant Dialog Keyboard Accessibility Improvements

## Important: Standard Key Patterns in This Codebase

All existing dialogs use `return` key for save/confirm, NOT `ctrl+s`:

- `DialogPrompt`: Uses `return` to submit
- `DialogExportOptions`: Uses `return` to confirm, `tab` to navigate fields
- `DialogConfirm`: Uses `return` to activate selected button, `left/right` to navigate buttons

**Do NOT use `ctrl+s` - it breaks consistency with the rest of the TUI.**

---

## Current Issues

### 1. Content Selection is Confusing

The "Include content" toggle field is extremely confusing:

```typescript
{
  key: "include",
  label: "Include content",
  type: "toggle",
  options: ["reasoning.encrypted_content"] as string[],
  current: store.form.include,
}
```

**Problems:**

- User sees "Include content" but has NO IDEA what content it refers to
- Toggle shows `[ ]` or `[x]` but doesn't explain what's being toggled
- The actual option `reasoning.encrypted_content` is completely opaque to users
- No tooltip or description explaining this affects reasoning model responses

**Impact:** Users likely won't use this setting because they don't understand it.

---

### 2. Navigation is Opaque

**Current behavior:**

- Tab: Move between fields
- Arrow keys (←→↑↓): Change values in current field
- Space: Toggle boolean fields
- Return: Save and exit
- Esc: Cancel (close dialog)

**Problems:**

- No way to SEE what options are available for select fields
- User must blindly cycle through options to discover what's possible
- No indicator of which field is focused (only slight bg color change)
- No way to quickly jump to a specific field
- No way to reset fields to defaults

**Example:** `reasoningEffort` field shows current value like "medium" but user can't see other options without cycling through them blindly.

---

### 3. Missing Action Buttons

**Original spec:** Create/Modify (bottom right), Cancel (bottom right), Delete (bottom left - only for modify mode)

**Current implementation:** No buttons at all

- Return saves and exits
- Esc cancels (closes dialog)
- Delete is a clickable link but no keyboard shortcut

**Problems:**

- No explicit "Create variant" vs "Modify variant" button
- Cancel only via Esc (no obvious button)
- Delete only via mouse click (no keyboard shortcut)
- No confirmation before delete
- No "Save and create another" workflow option

---

### 4. Number Field Coarseness

**Current behavior:** Arrow keys increment/decrement by 100 tokens

**Problems:**

- 100 token increments may be too large for some use cases
- No way to type exact value directly
- No visual indicator of min/max values
- No context on what "reasonable" values are

**Example:** User wants 15000 thinking budget tokens but can only get 15000 via 150 increments of 100.

---

### 5. No Validation or Feedback

**Missing:**

- Validation errors shown inline
- Confirmation when overwriting existing variant
- Feedback when save succeeds
- Warning when creating variant with same name as existing

---

## Proposed Improvements

### 1. Content Field Redesign

**Option A:** Better label and description

```
Include reasoning details in response
↑↓: Toggle | Reasoning content will be included in the assistant's response
```

**Option B:** Split into multiple clear toggles

```
Include raw reasoning      [ ]
Include summary of reasoning  [ ]
Include encrypted content   [ ]
```

**Option C:** Use select menu instead of toggle

```
Reasoning detail level:
  ○ None
  ○ Summary only
  ● Include raw reasoning
  ○ Include encrypted only
```

---

### 2. Navigation Enhancements

**Current dialog uses `tab` to navigate between fields - this is good and matches existing patterns!**

However, we should add support for `left/right` directional navigation as well, to provide more flexibility.

#### 2.1 Field Jump Shortcuts

```
1: Jump to variant name
2: Jump to thinking type
3: Jump to budget tokens
4: Jump to reasoning effort
...
q: Cancel
s: Save
```

#### 2.2 Show All Options for Select Fields

**Mode:** Press `o` to open options list

```
reasoningEffort: low

Available options:
  ○ none
  ○ minimal
  ● low
  ○ medium
  ○ high
  ○ xhigh

↑↓: Navigate | return: Select | esc: Cancel
```

#### 2.3 Direct Number Input

**Mode:** Press `e` to edit numeric field directly

```
Budget tokens: 20000

Enter exact value: 15000
(100-200000)             [ok] [cancel]

↑↓: ±100 | shift+↑↓: ±1000 | e: edit directly
```

#### 2.4 Focus Indicator Improvements

- Bright primary color for focused field (not just subtle bg)
- Left indicator `►` showing which field has focus
- Top/right help showing navigation options for current field type

---

### 3. Action Bar at Bottom

**IMPORTANT: All existing dialogs in this codebase use `return` key for save/confirm, NOT `ctrl+s`.**

Pattern from `DialogConfirm` and `DialogExportOptions`:

- `return`: Confirm/save current action
- `esc`: Cancel and close dialog
- `left/right` arrows: Navigate between action buttons (confirm/cancel)
- `tab`: Navigate between form fields

```
┌─────────────────────────────────────────────────────┐
│ Modify variant                            esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: thinking-heavy                        │
├─────────────────────────────────────────────────────┤
│ Thinking type: enabled                            │
│ Budget tokens: 20000                             │
├─────────────────────────────────────────────────────┤
│ ←→: Delete/Cancel | return: Save               │
└─────────────────────────────────────────────────────┘
```

**Or for new variant:**

```
┌─────────────────────────────────────────────────────┐
│ Modify variant                            esc: Cancel │
├─────────────────────────────────────────────────────┤
│ esc: Cancel | return: Save | d: Delete variant │
└─────────────────────────────────────────────────────┘
```

**Or for new variant:**

```
┌─────────────────────────────────────────────────────┐
│ Create variant                           esc: Cancel │
├─────────────────────────────────────────────────────┤
│ esc: Cancel | return: Create                    │
└─────────────────────────────────────────────────────┘
```

**Keyboard shortcuts (matching existing dialog patterns):**

- `return`: Save (Create or Modify) - **matches all existing dialogs**
- `esc`: Cancel and close dialog
- `left/right` arrows: Navigate between action buttons when in button focus mode
- `d`: Direct delete shortcut (only when modifying existing variant)

---

### 4. Delete Confirmation

**When user presses `d`:**

```
Confirm delete

Delete variant "thinking-heavy" for
anthropic/claude-3-5-sonnet?

  esc: Cancel  |  d: Confirm delete
```

---

### 5. Enhanced Help Text

**Contextual help based on field type:**

**For select fields:**

```
Thinking type: enabled
↑↓/←→: Change value | o: Show all options
```

**For number fields:**

```
Budget tokens: 20000
↑↓: ±100 | shift+↑↓: ±1000 | e: Edit directly
```

**For toggle fields:**

```
Include reasoning: [x]
space: Toggle | ?: Show more info
```

Thinking type: enabled
↑↓: Change value | o: Show all options

```

**For number fields:**

```

Budget tokens: 20000
↑↓: ±100 | shift+↑↓: ±1000 | e: Edit directly

```

**For toggle fields:**

```

Include reasoning: [x]
space: Toggle | ?: Show more info

```

---

### 6. Create vs Modify UX

**When opening with no variant selected:**

```

┌─────────────────────────────────────────────────────┐
│ Create variant esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: **\*\***\_\_\_**\*\*** [new]│
│ Thinking type: enabled │
│ Budget tokens: 20000 │
├─────────────────────────────────────────────────────┤
│ return: Create | esc: Cancel │
└─────────────────────────────────────────────────────┘

```

**When opening with existing variant:**

```

┌─────────────────────────────────────────────────────┐
│ Modify "thinking-heavy" variant esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: thinking-heavy [existing]│
│ Thinking type: enabled │
│ Budget tokens: 20000 │
├─────────────────────────────────────────────────────┤
│ return: Save | d: Delete | esc: Cancel │
└─────────────────────────────────────────────────────┘

```

**When changing name to new name:**

```

┌─────────────────────────────────────────────────────┐
│ Create variant (new name) esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: **\*\***\_\_\_**\*\*** [new]│
│ Thinking type: enabled │
│ Budget tokens: 20000 │
├─────────────────────────────────────────────────────┤
│ return: Create | esc: Cancel │
└─────────────────────────────────────────────────────┘

```

**When opening with existing variant:**

```

┌─────────────────────────────────────────────────────┐
│ Modify "thinking-heavy" variant esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: thinking-heavy [existing]│
│ Thinking type: enabled │
│ Budget tokens: 20000 │
├─────────────────────────────────────────────────────┤
│ ctrl+s: Save | d: Delete | esc: Cancel │
└─────────────────────────────────────────────────────┘

```

**When changing name to new name:**

```

┌─────────────────────────────────────────────────────┐
│ Create variant (new name) esc: Cancel │
├─────────────────────────────────────────────────────┤
│ Variant name: **\*\***\_\_\_**\*\*** [new]│
│ Thinking type: enabled │
│ Budget tokens: 20000 │
├─────────────────────────────────────────────────────┤
│ ctrl+s: Create | esc: Cancel │
└─────────────────────────────────────────────────────┘

```

**Note:** Detect if name matches existing variant and show `[existing]` indicator.

---

### 7. Reset to Defaults

**Press `r` in any field:**

```

Reset this field to default?
Reasoning effort: medium (default: low)

y: Yes | n: No

```

**Press `R` anywhere:**

```

Reset all fields to defaults?

This will undo all changes.

y: Yes | n: No

```

---

### 8. Smart Defaults Integration

**Problem:** The form currently has no defaults populated from ProviderTransform.

**Solution:**

- Read default values from `ProviderTransform.variants(model)` when opening dialog
- Pre-populate form with intelligent defaults based on model type
- Show indicator: `(default)` next to fields that are at default value

**Example:**

```

Thinking type: enabled (default)
Budget tokens: 20000 (default: 200000)

````

---

## How Other Dialogs Navigate

### DialogExportOptions Pattern

```typescript
// Uses tab to cycle through fields
const order = ["filename", "thinking", "toolDetails", "assistantMetadata", "openWithoutSaving"]
if (evt.name === "tab") {
  const currentIndex = order.indexOf(store.active)
  const nextIndex = (currentIndex + 1) % order.length
  setStore("active", order[nextIndex]) // Move to next field
}

// Uses space to toggle boolean fields
if (evt.name === "space") {
  if (store.active === "thinking") setStore("thinking", !store.thinking)
}
````

**Key pattern:**

- `tab`: Move to next field (cycles)
- `shift+tab`: Move to previous field
- `return`: Submit all fields
- Background color highlights `store.active` field

### DialogConfirm Pattern

```typescript
// Uses left/right to navigate between buttons
if (evt.name === "left" || evt.name === "right") {
  setStore("active", store.active === "confirm" ? "cancel" : "confirm")
}

// Uses return to activate selected button
if (evt.name === "return") {
  if (store.active === "confirm") props.onConfirm?.()
  if (store.active === "cancel") props.onCancel?.()
}
```

**Key pattern:**

- `left/right`: Navigate between button options
- `return`: Activate selected button
- Visual highlight shows selected button

---

## Summary of Keyboard Shortcuts

### Global

- `esc`: Cancel/close dialog
- `return`: Save (Create or Modify) - **standard across all dialogs**
- `tab` / `shift+tab`: Navigate between fields
- `left/right` arrows: Navigate between action buttons (when buttons are focus target)
- `1-9`: Jump to field by number (if implemented)

### Per-Field

- `↑↓←→`: Change value (select fields) or increment/decrement (number fields)
- `shift+↑↓`: Increment/decrement by 1000 (number fields only)
- `space`: Toggle boolean fields
- `o`: Show all options (select fields)
- `e`: Edit directly (number fields)
- `r`: Reset field to default

### Action Bar

- `return`: Save (Create or Modify) - **when field focus, saves form**
- `d`: Delete variant (modify mode only) - **global shortcut**
- `esc`: Cancel - **global shortcut**
- `left/right`: Navigate between action buttons - **when action buttons have focus**

---

## Priority Improvements

### High Priority (Must Fix)

1. **Fix "Include content" field** - Make it understandable or remove
2. **Add action bar with Save/Cancel/Delete buttons** - Meets original spec
3. **Show available options for select fields** - Don't make users guess

### Medium Priority (Should Fix)

4. **Add field jump shortcuts (1-9)** - Power user efficiency
5. **Add direct number input** - Precision over arrow keys
6. **Show `(default)` indicators** - Make clear what's baseline

### Low Priority (Nice to Have)

7. **Add reset to defaults** - Convenience
8. **Add help mode (`?`)** - Discoverability
9. **Add save and continue** - Bulk creation workflow
