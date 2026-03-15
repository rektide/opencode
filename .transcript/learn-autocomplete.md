# Find autocomplete implementation (@explore subagent)

**Session ID:** ses_4a3931ab9ffeoAs8VedeVao3ub
**Created:** 12/26/2025, 8:49:59 PM
**Updated:** 12/26/2025, 8:51:47 PM

---

## User

Find where autocomplete happens in this codebase. Look for:
1. Files or functions related to autocomplete functionality
2. Code that handles autocomplete requests or suggestions
3. Plugin types that currently exist and how they're structured
4. Where plugins are registered and how different plugin types are handled

Search thoroughly using multiple search patterns like "autocomplete", "completion", "suggest", "plugin", and related terms.

---

## Assistant

I'll help you find where autocomplete happens in this codebase. Let me search systematically for relevant files and code.

```
Tool: list
```

```
Tool: glob
```

```
Tool: glob
```

---

## Assistant

```
Tool: glob
```

```
Tool: glob
```

```
Tool: grep
```

---

## Assistant

```
Tool: list
```

```
Tool: grep
```

---

## Assistant

```
Tool: read
```

```
Tool: list
```

---

## Assistant

```
Tool: read
```

```
Tool: read
```

```
Tool: read
```

---

## Assistant

```
Tool: list
```

```
Tool: bash
```

---

## Assistant

```
Tool: list
```

```
Tool: glob
```

---

## Assistant

```
Tool: bash
```

```
Tool: bash
```

---

## Assistant

```
Tool: bash
```

```
Tool: grep
```

---

## Assistant

```
Tool: read
```

```
Tool: read
```

---

## Assistant

```
Tool: grep
```

```
Tool: bash
```

---

## Assistant

```
Tool: read
```

```
Tool: read
```

---

## Assistant

```
Tool: bash
```

```
Tool: list
```

---

## Assistant

```
Tool: list
```

```
Tool: list
```

---

## Assistant

```
Tool: read
```

```
Tool: read
```

---

## Assistant

```
Tool: grep
```

```
Tool: bash
```

---

## Assistant

```
Tool: read
```

---

## Assistant

Based on my thorough exploration of the codebase, here's a comprehensive summary of where autocomplete happens and how the plugin system works:

## 1. Autocomplete Implementation

### Primary Location
**File:** `/home/rektide/src/opencode-plugin-autocomplete/packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`

This is the main autocomplete component for the TUI (Terminal UI). Key findings:

#### Autocomplete Types
The system supports **two autocomplete modes**:
- **`@` mode** - Autocomplete for **agents** and **files**
- **`/` mode** - Autocomplete for **commands**

#### How It Works

**Agent Autocomplete:**
- Filters agents from `sync.data.agent`
- Excludes hidden agents and primary mode agents
- Shows agents prefixed with `@`
- Inserts the agent as a "part" in the prompt when selected

**File Autocomplete:**
- Uses `sdk.client.find.files()` API to search for files
- Displays truncated filenames based on container width
- Inserts files as "file parts" with metadata (mime type, filename, URL)
- Uses extmarks to visually mark the inserted text

**Command Autocomplete:**
- Lists built-in commands like `/new`, `/models`, `/help`, etc.
- Includes session-specific commands like `/undo`, `/redo`, `/compact`
- Shows command descriptions alongside names

#### Key Implementation Details
- Uses `fuzzysort` for fuzzy matching across display names, descriptions, and aliases
- Limits results to 10 options
- Supports keyboard navigation (up/down arrows, Tab, Enter)
- Positions the autocomplete menu above the input field
- Dynamically tracks cursor position to position the menu

### Integration Point
**File:** `/home/rektide/src/opencode-plugin-autocomplete/packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`

The `Prompt` component integrates the `Autocomplete` component and handles:
- Showing/hiding autocomplete on key events (`@` and `/`)
- Managing prompt parts (agent references, file references, text)
- Creating and managing extmarks (virtual text styling)
- Handling paste events and image insertion

---

## 2. Plugin System

### Plugin Registration

**Core File:** `/home/rektide/src/opencode-plugin-autocomplete/packages/opencode/src/plugin/index.ts`

Plugins are loaded from these locations:
1. `.opencode/plugin` directory in your project
2. Global directory: `~/.config/opencode/plugin`
3. Configured plugins via `opencode.json`

**Loading Process:**
1. Plugins are defined in config as a list of package names or file paths
2. Default plugins are: `opencode-copilot-auth@0.0.9` and `opencode-anthropic-auth@0.0.5`
3. Each plugin is imported and initialized with a `PluginInput` context containing:
   - `client` - OpenCode SDK client
   - `project` - Project information
   - `directory` - Working directory
   - `worktree` - Git worktree path
   - `$` - Bun's shell API
4. Plugins return a `Hooks` object with various lifecycle handlers

### Plugin Types

Plugins can hook into multiple **event types**:

#### Command Events
- `command.executed`

#### File Events  
- `file.edited`
- `file.watcher.updated`

#### Installation Events
- `installation.updated`

#### LSP Events
- `lsp.client.diagnostics`
- `lsp.updated`

#### Message Events
- `message.part.removed`
- `message.part.updated`
- `message.removed`
- `message.updated`

#### Permission Events
- `permission.replied`
- `permission.updated`
- `permission.ask`

#### Session Events
- `session.created`
- `session.compacted`
- `session.deleted`
- `session.diff`
- `session.error`
- `session.idle`
- `session.status`
- `session.updated`

#### Tool Events
- `tool.execute.before`
- `tool.execute.after`

#### TUI Events
- `tui.prompt.append`
- `tui.command.execute`
- `tui.toast.show`

#### Experimental Hooks
- `experimental.chat.messages.transform` - Transform chat messages
- `experimental.chat.system.transform` - Transform system prompt
- `experimental.session.compacting` - Customize session compaction
- `experimental.text.complete` - **Text completion hook**

### Custom Tools from Plugins

**File:** `/home/rektide/src/opencode-plugin-autocomplete/packages/opencode/src/tool/registry.ts`

Plugins can define custom tools that appear alongside built-in tools:

```typescript
export const MyPlugin: Plugin = async (ctx) => {
  return {
    tool: {
      mytool: tool({
        description: "Custom tool description",
        args: {
          foo: tool.schema.string(),
        },
        async execute(args, ctx) {
          return `Result: ${args.foo}`
        },
      }),
    },
  }
}
```

Tool registration:
1. Tools are loaded from `.opencode/tool/*.{ts,js}` directories
2. Plugin tools are merged with custom tools
3. Tools are initialized with agent-specific permissions
4. Available tools are filtered based on agent permissions

### Plugin Type Definitions

**File:** `/home/rektide/src/opencode-plugin-autocomplete/packages/plugin/src/index.ts`

Key plugin types:
- `PluginInput` - Context passed to plugins
- `Hooks` - Available lifecycle hooks plugins can implement
- `Plugin` - Plugin function signature
- `AuthHook` - For provider authentication via plugins
- `ToolDefinition` - Structure for defining custom tools

### MCP Server Integration

**Documentation:** `/home/rektide/src/opencode-plugin-autocomplete/packages/web/src/content/docs/mcp-servers.mdx`

MCP (Model Context Protocol) servers provide external tools:
- Can be local (command-based) or remote (HTTP-based)
- MCP tools appear alongside built-in tools
- Can be enabled/disabled globally or per-agent
- OAuth authentication support for remote MCPs

---

## 3. Where Autocomplete Could Be Extended

### For Autocomplete Plugins

Currently, there's an experimental hook:
```typescript
"experimental.text.complete"?: (
  input: { sessionID: string; messageID: string; partID: string },
  output: { text: string },
) => Promise<void>
```

This hook suggests a text completion feature is being developed, though it's marked as experimental.

### Current Limitations

1. **Autocomplete options are hardcoded** in the `autocomplete.tsx` file
2. **No plugin hooks for autocomplete** - plugins can't add custom autocomplete items
3. **File search uses SDK** (`sdk.client.find.files`) but this could be extended

### Potential Extension Points

To add plugin-based autocomplete, you would need to:

1. **Add a new plugin hook** like `"tui.autocomplete.options"` to the Hooks interface in `/packages/plugin/src/index.ts`

2. **Modify the autocomplete component** to fetch options from plugins via the hook system

3. **Allow plugins to register custom autocomplete providers** similar to how tools are registered

---

## Summary

- **Autocomplete location:** `/packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx`
- **Plugin system:** `/packages/opencode/src/plugin/index.ts`
- **Tool registry:** `/packages/opencode/src/tool/registry.ts`
- **Current autocomplete types:** Agents (`@`), files (`@`), commands (`/`)
- **Plugin hook types:** 20+ event types, plus experimental hooks
- **No current plugin support** for adding custom autocomplete items
- **Experimental text completion hook** exists: `experimental.text.complete`

---

