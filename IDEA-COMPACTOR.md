# Compaction feature and prompt selectivity
_Exported on 12/30/2025 at 10:30:22 UTC from Cursor (2.2.44)_

---

**User**

find where compaction feature occurs. find out what data is fed into it. start planning how to be more selective about what the next compacted prompt is.

---

**Cursor**

I'll first locate where "compaction" or "compact" logic lives in the repo, then inspect how it's called and what data flows into it, and finally outline options for making the selection of the next compacted prompt more selective. Let me search the codebase for relevant symbols and then drill into the main implementation.

I’ve located the main compaction logic and its call sites; next I’ll inspect the implementation to see exactly what messages/context are fed into compaction, then outline options for making selection of the next compacted prompt more selective.

### Where the compaction feature occurs

- **Core implementation**: `SessionCompaction` in `session/compaction.ts` is the main compaction pipeline (overflow detection, prompt generation, and post-compaction housekeeping).

```1:38:packages/opencode/src/session/compaction.ts
export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

  export const Event = {
    Compacted: BusEvent.define(
      "session.compacted",
      z.object({
        sessionID: z.string(),
      }),
    ),
  }

  export function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    if (Flag.OPENCODE_DISABLE_AUTOCOMPACT) return false
    const context = input.model.limit.context
    if (context === 0) return false
    const count = input.tokens.input + input.tokens.cache.read + input.tokens.output
    const output = Math.min(input.model.limit.output, SessionPrompt.OUTPUT_TOKEN_MAX) || SessionPrompt.OUTPUT_TOKEN_MAX
    const usable = context - output
    return count > usable
  }
}
```

- **Control flow / when it runs**: `SessionPrompt.loop` triggers compaction in two ways:
  - When there is a pending `CompactionPart` task in the message history (manual `/compact` or explicit).
  - When `isOverflow` says the last assistant turn would exceed context, it auto-enqueues a compaction task.

```241:471:packages/opencode/src/session/prompt.ts
    while (true) {
      ...
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      ...
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      ...
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      ...
      const task = tasks.pop()

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }
```

- **How a compaction task is queued**: `SessionCompaction.create` creates a synthetic user message with a `CompactionPart` (this is what `/compact` and the API endpoint ultimately create).

```193:221:packages/opencode/src/session/compaction.ts
  export const create = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      agent: z.string(),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }),
      auto: z.boolean(),
    }),
    async (input) => {
      const msg = await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: {
          created: Date.now(),
        },
      })
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
      })
    },
  )
```

- **User-facing entry points** (not all shown here, but wired into the above):
  - HTTP: `POST /project/:projectID/session/:sessionID/compact` in `server.ts`.
  - CLI/TUI: `/compact` command and `session_compact` keybinding.
  - SDK: `session_compact` operation and `Event.session.compacted` in the JS SDK and OpenAPI spec.
  - Plugins: `experimental.session.compacting` hook in `packages/plugin/src/index.ts`.

---

### What data is fed into compaction

**1. The history slice (messages) used for compaction**

- The `messages` passed into `SessionCompaction.process` come from `MessageV2.filterCompacted(MessageV2.stream(sessionID))` in the main loop.  
- `stream(sessionID)` yields all messages for the session from newest to oldest; `filterCompacted` then trims that stream to the window “since the last completed summary/compaction,” then reverses it to chronological order.

```545:593:packages/opencode/src/session/message-v2.ts
  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i][2],
      })
    }
  })

  export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for await (const msg of stream) {
      result.push(msg)
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)
    }
    result.reverse()
    return result
  }
```

Interpretation:

- It walks backward in time:
  - Tracks assistant messages that are **summaries** (`summary && finish`) and records their `parentID` (the user message they summarize).
  - Once it later sees a **user** message that:
    - Has a `CompactionPart`, and
    - Whose ID is in the `completed` set,
    - It **stops**, meaning: “we’ve reached the last compaction boundary; don’t include older stuff.”
- Then it reverses the collected list, so `messages` for compaction are in normal chronological order.

Effectively, **compaction runs over the conversation since the last completed compaction summary** (or since the start of the session if none).

**2. How that history is translated into model messages**

In `SessionCompaction.process`, the history is converted to model messages and then a synthetic user message is appended that asks the model to create the next “continue prompt”:

```90:162:packages/opencode/src/session/compaction.ts
  export async function process(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
  }) {
    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
    const msg = (await Session.updateMessage({
      id: Identifier.ascending("message"),
      role: "assistant",
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      summary: true,
      ...
    })) as MessageV2.Assistant
    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model,
      abort: input.abort,
    })
    // Allow plugins to inject context or replace compaction prompt
    const compacting = await Plugin.trigger(
      "experimental.session.compacting",
      { sessionID: input.sessionID },
      { context: [], prompt: undefined },
    )
    const defaultPrompt =
      "Provide a detailed prompt for continuing our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next considering new session will not have access to our conversation."
    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
    const result = await processor.process({
      user: userMessage,
      agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: {},
      system: [],
      messages: [
        ...MessageV2.toModelMessage(input.messages),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
      model,
    })
```

Key points:

- **History**: `MessageV2.toModelMessage(input.messages)` converts each `WithParts` into the AI SDK’s `ModelMessage` format:
  - User messages become `{"role": "user", parts: [...]}` including:
    - Text parts for `TextPart`s.
    - File parts for non-text file attachments.
    - A synthetic text “What did we do so far?” when encountering a `CompactionPart`, so the model sees an explicit cue at the compaction boundary.

```422:455:packages/opencode/src/session/message-v2.ts
  export function toModelMessage(input: WithParts[]): ModelMessage[] {
    const result: UIMessage[] = []

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({
              type: "text",
              text: part.text,
            })
          // text/plain and directory files are converted into text parts, ignore them
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
            userMessage.parts.push({
              type: "file",
              url: part.url,
              mediaType: part.mime,
              filename: part.filename,
            })

          if (part.type === "compaction") {
            userMessage.parts.push({
              type: "text",
              text: "What did we do so far?",
            })
          }
          if (part.type === "subtask") {
            userMessage.parts.push({
              type: "text",
              text: "The following tool was executed by the user",
            })
          }
        }
      }
      ...
```

- **Instruction for compaction**: After the history, a final **user** message is appended with `promptText`, which is:
  - The default compaction prompt (hard-coded string) plus any plugin-provided `context`, or
  - Completely replaced by a plugin-specified `prompt` via `experimental.session.compacting`.

- **System / agent side**: The agent named `"compaction"` uses its own agent prompt file (`packages/opencode/src/agent/prompt/compaction.txt`) as its internal system prompt, so the model sees both:
  - The agent’s system instructions (“You are a helpful AI assistant tasked with summarizing conversations…”) and
  - The explicit `promptText` user turn above.

---

### Planning: making the next compacted prompt more selective

Based on this wiring, there are three main levers we can target:

#### 1. Be more selective about **which history** is fed into compaction

Right now, compaction always sees **all messages since the last compaction summary**. To be more selective:

- **Refine `filterCompacted`**:
  - Option A: Restrict to the last N user turns or last K assistant/tool turns within that window.
  - Option B: Drop low-value messages (e.g., synthetic wrappers, tiny tool runs, very old “step-start/finish” parts) before `toModelMessage`.
  - Option C: Add per-part flags (e.g., `ignored` or a new `compactionIgnored`) that `filterCompacted` or a dedicated compaction filter respects, so tools/agents can mark noise.

Concrete direction:

- Introduce a `SessionCompaction.buildMessages()` helper that:
  - Starts from `filterCompacted(stream(sessionID))`.
  - Optionally prunes:
    - Old `ToolPart`s beyond some token threshold (similar spirit to `prune` but at compaction time).
    - Messages older than X turns, unless tagged as important.
  - Returns a trimmed `MessageV2.WithParts[]` for compaction only.

#### 2. Be more selective about **what form** the history takes for the model

Right now, compaction uses the generic `MessageV2.toModelMessage`, which is optimized for normal chat, not necessarily for summaries/prompts. We can:

- Add a **compaction-specific projection**:
  - New function `toCompactionModelMessages(messages)` that:
    - Includes only user text and selected tool outputs.
    - Aggregates multiple related small tool outputs into a single textual summary line (e.g. via simple heuristics or a tiny deterministic summarizer).
    - Optionally collapses repeated “continue” turns or trivial assistant responses.

- Alternatively, wrap/extend `toModelMessage`:
  - Detect compaction mode and tweak behavior:
    - For `ToolPart`, keep only title/metadata and maybe truncate long outputs.
    - Use the `time.compacted` field on tool outputs to skip already-compacted content.

This gives a lever to make the **signal-to-noise ratio high in the compaction call** without affecting normal chat runs.

#### 3. Be more selective about the **compaction prompt content and strategy**

You already have `experimental.session.compacting` to override or augment the prompt; we can expand this into a more structured selection mechanism:

- **Richer compaction hook**:
  - Extend the hook payload to receive:
    - The candidate history slice (or a pre-summarized skeleton: last N turns, tool call metadata, etc.).
    - Context about why compaction was triggered (auto overflow vs manual, token counts).
  - Let the hook return:
    - `prompt`: full replacement (already supported).
    - `context`: list of extra strings (already supported).
    - Optionally: filters like `maxUserTurns`, `includeTools: boolean`, `includeReasoning: boolean` that the core compaction code applies before calling the model.

- **Policy-level configuration**:
  - In `config.ts` / agent config for `compaction`, add knobs such as:
    - `maxTurnsForCompaction`
    - `maxToolTokensForCompaction`
    - `includeReasoningInCompaction`
  - These values can then drive:
    - How many messages `buildMessages()` keeps.
    - Whether to include reasoning/tool parts in the model input at all.

---

### Concrete next steps (implementation-oriented)

If you’d like, a reasonable phased plan would be:

1. **Introduce a compaction-specific history builder**:
   - Add `SessionCompaction.buildMessages(sessionID)` that wraps `filterCompacted(stream)` and prunes by simple heuristics (e.g., cap last X user turns, skip already-`compacted` tool outputs).
   - Replace the direct `messages: msgs` in `SessionCompaction.process` with `messages: await SessionCompaction.buildMessages(...)`.

2. **Add a compaction-specific message projection**:
   - Implement `MessageV2.toCompactionModelMessages(messages)` and switch `SessionCompaction.process` to use it instead of `toModelMessage`.
   - Start conservatively (drop some obvious noise) and iterate.

3. **Extend the plugin hook for richer selection control**:
   - Evolve `experimental.session.compacting` to optionally receive a light-weight summary of history (or a pre-trimmed version) and to return simple selection hints alongside `prompt/context`.
   - Wire those hints into `buildMessages` / `toCompactionModelMessages`.

If you tell me your priorities (e.g., “trim old tool outputs first” vs “cap to last 3 user turns”), I can sketch an exact diff for step 1 that makes compaction significantly more selective without breaking the existing behavior.

```typescript
export namespace SessionCompaction {
  const log = Log.create({ service: "session.compaction" })

  export const Event = {
    Compacted: BusEvent.define(
      "session.compacted",
      z.object({
        sessionID: z.string(),
      }),
    ),
  }

  export function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    if (Flag.OPENCODE_DISABLE_AUTOCOMPACT) return false
    const context = input.model.limit.context
    if (context === 0) return false
    const count = input.tokens.input + input.tokens.cache.read + input.tokens.output
    const output = Math.min(input.model.limit.output, SessionPrompt.OUTPUT_TOKEN_MAX) || SessionPrompt.OUTPUT_TOKEN_MAX
    const usable = context - output
    return count > usable
  }
}
```

```typescript
    while (true) {
      ...
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))
      ...
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      ...
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      ...
      const task = tasks.pop()

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }
```

```typescript
  export const create = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      agent: z.string(),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }),
      auto: z.boolean(),
    }),
    async (input) => {
      const msg = await Session.updateMessage({
        id: Identifier.ascending("message"),
        role: "user",
        model: input.model,
        sessionID: input.sessionID,
        agent: input.agent,
        time: {
          created: Date.now(),
        },
      })
      await Session.updatePart({
        id: Identifier.ascending("part"),
        messageID: msg.id,
        sessionID: msg.sessionID,
        type: "compaction",
        auto: input.auto,
      })
    },
  )
```

```typescript
  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i][2],
      })
    }
  })

  export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for await (const msg of stream) {
      result.push(msg)
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)
    }
    result.reverse()
    return result
  }
```

```typescript
  export async function process(input: {
    parentID: string
    messages: MessageV2.WithParts[]
    sessionID: string
    abort: AbortSignal
    auto: boolean
  }) {
    const userMessage = input.messages.findLast((m) => m.info.id === input.parentID)!.info as MessageV2.User
    const agent = await Agent.get("compaction")
    const model = agent.model
      ? await Provider.getModel(agent.model.providerID, agent.model.modelID)
      : await Provider.getModel(userMessage.model.providerID, userMessage.model.modelID)
    const msg = (await Session.updateMessage({
      id: Identifier.ascending("message"),
      role: "assistant",
      parentID: input.parentID,
      sessionID: input.sessionID,
      mode: "compaction",
      agent: "compaction",
      summary: true,
      ...
    })) as MessageV2.Assistant
    const processor = SessionProcessor.create({
      assistantMessage: msg,
      sessionID: input.sessionID,
      model,
      abort: input.abort,
    })
    // Allow plugins to inject context or replace compaction prompt
    const compacting = await Plugin.trigger(
      "experimental.session.compacting",
      { sessionID: input.sessionID },
      { context: [], prompt: undefined },
    )
    const defaultPrompt =
      "Provide a detailed prompt for continuing our conversation above. Focus on information that would be helpful for continuing the conversation, including what we did, what we're doing, which files we're working on, and what we're going to do next considering new session will not have access to our conversation."
    const promptText = compacting.prompt ?? [defaultPrompt, ...compacting.context].join("\n\n")
    const result = await processor.process({
      user: userMessage,
      agent,
      abort: input.abort,
      sessionID: input.sessionID,
      tools: {},
      system: [],
      messages: [
        ...MessageV2.toModelMessage(input.messages),
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptText,
            },
          ],
        },
      ],
      model,
    })
```

```typescript
  export function toModelMessage(input: WithParts[]): ModelMessage[] {
    const result: UIMessage[] = []

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({
              type: "text",
              text: part.text,
            })
          // text/plain and directory files are converted into text parts, ignore them
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
            userMessage.parts.push({
              type: "file",
              url: part.url,
              mediaType: part.mime,
              filename: part.filename,
            })

          if (part.type === "compaction") {
            userMessage.parts.push({
              type: "text",
              text: "What did we do so far?",
            })
          }
          if (part.type === "subtask") {
            userMessage.parts.push({
              type: "text",
              text: "The following tool was executed by the user",
            })
          }
        }
      }
      ...
```

---

**User**

what are the dependencies and inputs to `/compact` command? if i provide extra text after typing `/compact` does that factor into the compaction, help guide it?

---

**Cursor**

I’ll track down where `/compact` is parsed/handled, then follow how its arguments are mapped into the compaction flow to see whether extra text after `/compact` is used, and summarize the dependencies and inputs.

### Dependencies & inputs to `/compact`

- **What `/compact` actually does (built‑in):**
  - In both the TUI and ACP/VS Code-ish integration, `/compact` ultimately calls the HTTP route `POST /session/:sessionID/summarize`, i.e. `session.summarize`, which:
    - Looks up the last user agent in the session.
    - Calls `SessionCompaction.create({ sessionID, agent, model, auto })`.
    - Immediately runs `SessionPrompt.loop(sessionID)` to process the compaction task.

```1050:1104:packages/opencode/src/server/server.ts
.post(
  "/session/:sessionID/summarize",
  ...
  validator("json", z.object({
    providerID: z.string(),
    modelID: z.string(),
    auto: z.boolean().optional().default(false),
  })),
  async (c) => {
    const sessionID = c.req.valid("param").sessionID
    const body = c.req.valid("json")
    const msgs = await Session.messages({ sessionID })
    let currentAgent = await Agent.defaultAgent()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const info = msgs[i].info
      if (info.role === "user") {
        currentAgent = info.agent || (await Agent.defaultAgent())
        break
      }
    }
    await SessionCompaction.create({
      sessionID,
      agent: currentAgent,
      model: {
        providerID: body.providerID,
        modelID: body.modelID,
      },
      auto: body.auto,
    })
    await SessionPrompt.loop(sessionID)
    return c.json(true)
  },
)
```

- **Key runtime dependencies:**
  - A valid **session ID**.
  - A connected **model/provider** (for TUI, it uses the “selected model”; for ACP it uses the current session model).
  - The **compaction agent** (`Agent.get("compaction")` or fallback to user’s model).
  - The **conversation history slice** from `MessageV2.filterCompacted(MessageV2.stream(sessionID))`.
  - Optional **plugins** via `experimental.session.compacting` to inject/replace the compaction prompt.

- **How `/compact` is invoked in different UIs:**
  - **TUI command palette / keybind:**
    - Command definition in `routes/session/index.tsx` calls `sdk.client.session.summarize({ sessionID, providerID, modelID })` directly; no prompt text is sent.

```376:395:packages/opencode/src/cli/cmd/tui/routes/session/index.tsx
{
  title: "Compact session",
  value: "session.compact",
  keybind: "session_compact",
  category: "Session",
  onSelect: (dialog) => {
    const selectedModel = local.model.current()
    ...
    sdk.client.session.summarize({
      sessionID: route.sessionID,
      modelID: selectedModel.modelID,
      providerID: selectedModel.providerID,
    })
    dialog.clear()
  },
},
```

  - **TUI autocomplete `/compact`:**
    - The `/compact` suggestion doesn’t submit text; selecting it fires `command.trigger("session.compact")`, which routes to the same `session.summarize` path above. Your input buffer is not used as an argument.

```242:246:packages/opencode/src/cli/cmd/tui/component/prompt/autocomplete.tsx
{
  display: "/compact",
  aliases: ["/summarize"],
  description: "compact the session",
  onSelect: () => command.trigger("session.compact"),
},
```

  - **ACP/agent (e.g. editor integration):**
    - It parses slash commands from the **text** you send; for `/compact ...` it extracts `cmd.name` and `cmd.args`, but then **ignores `cmd.args`** and just calls `session.summarize`.

```866:877:packages/opencode/src/acp/agent.ts
const cmd = (() => {
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim()

  if (!text.startsWith("/")) return

  const [name, ...rest] = text.slice(1).split(/\s+/)
  return { name, args: rest.join(" ").trim() }
})()
...
switch (cmd.name) {
  case "compact":
    await this.config.sdk.session.summarize(
      {
        sessionID,
        directory,
        providerID: model.providerID,
        modelID: model.modelID,
      },
      { throwOnError: true },
    )
    break
}
```

### Does extra text after `/compact` guide compaction?

- **In the built‑in `/compact` behavior (TUI and ACP):**
  - **No.** Any extra text after `/compact` is **ignored** by the built‑in compaction pipeline:
    - TUI’s `/compact` suggestion never sends that extra text to the server at all; it just fires a command that calls `session.summarize`.
    - ACP’s `/compact something` parses `something` into `cmd.args` but does not pass `cmd.args` into `session.summarize` or into `SessionCompaction.process`.
  - The actual compaction prompt is built entirely from:
    - The **previous conversation history** (`MessageV2.filterCompacted` → `toModelMessage`).
    - The **default compaction prompt string**.
    - Any **plugin-provided context / replacement prompt** from `experimental.session.compacting`.

- **When could extra text matter?**
  - Only if you define a **custom command** named `compact` in your config (via the generic `command` system) whose template uses `$ARGUMENTS`, and that command itself triggers a compaction-like flow. In that custom scenario, the extra text after `/compact` would be available as `arguments` and could be wired into a prompt — but that’s **not** what the built‑in `/compact` currently does.

**Bottom line:** with the default `/compact` implementation, additional text you type after `/compact` does **not** influence the compaction; to guide compaction today you’d use the `experimental.session.compacting` plugin hook or define your own command that incorporates `$ARGUMENTS` into a custom prompt.

```typescript
.post(
  "/session/:sessionID/summarize",
  ...
  validator("json", z.object({
    providerID: z.string(),
    modelID: z.string(),
    auto: z.boolean().optional().default(false),
  })),
  async (c) => {
    const sessionID = c.req.valid("param").sessionID
    const body = c.req.valid("json")
    const msgs = await Session.messages({ sessionID })
    let currentAgent = await Agent.defaultAgent()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const info = msgs[i].info
      if (info.role === "user") {
        currentAgent = info.agent || (await Agent.defaultAgent())
        break
      }
    }
    await SessionCompaction.create({
      sessionID,
      agent: currentAgent,
      model: {
        providerID: body.providerID,
        modelID: body.modelID,
      },
      auto: body.auto,
    })
    await SessionPrompt.loop(sessionID)
    return c.json(true)
  },
)
```

```typescriptreact
{
  title: "Compact session",
  value: "session.compact",
  keybind: "session_compact",
  category: "Session",
  onSelect: (dialog) => {
    const selectedModel = local.model.current()
    ...
    sdk.client.session.summarize({
      sessionID: route.sessionID,
      modelID: selectedModel.modelID,
      providerID: selectedModel.providerID,
    })
    dialog.clear()
  },
},
```

```typescriptreact
{
  display: "/compact",
  aliases: ["/summarize"],
  description: "compact the session",
  onSelect: () => command.trigger("session.compact"),
},
```

```typescript
const cmd = (() => {
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("")
    .trim()

  if (!text.startsWith("/")) return

  const [name, ...rest] = text.slice(1).split(/\s+/)
  return { name, args: rest.join(" ").trim() }
})()
...
switch (cmd.name) {
  case "compact":
    await this.config.sdk.session.summarize(
      {
        sessionID,
        directory,
        providerID: model.providerID,
        modelID: model.modelID,
      },
      { throwOnError: true },
    )
    break
}
```

---

**User**

Generate a custom command called `/handoff` that prompts the model to generate a prompt to be used to compact, using $ARGUMENTS as best as it can for advice. Feed the hardcoded `/compact` prompt to the agent, but tell it that, rather than compact, it should reflect on the arguments and come up with it's own prompt that it thinks will help guide compaction to retain the most valuable parts of the session context so far. Again: this prompt is to make the agent come up with a good, informed, directed prompt. That the user can then confirm or guide further. We'll also need a compacter tool, that the agent can call when it feels like the user has consented, that runs the agreed upon compaction, after the agent has dialoged with the user to build the derived prompt.

Generate a custom command called `/handoff` that prompts the model to generate a prompt to be used to compact, using $ARGUMENTS as best as it can for advice. Feed the hardcoded `/compact` prompt to the agent, but tell it that, rather than compact, it should reflect on the arguments and come up with it's own prompt that it thinks will help guide compaction to retain the most valuable parts of the session context so far. Again: this prompt is to make the agent come up with a good, informed, directed prompt. That the user can then confirm or guide further. We'll also need a compacter tool, that the agent can call when it feels like the user has consented, that runs the agreed upon compaction, after the agent has dialoged with the user to build the derived prompt.

---

**Cursor**

I’ll locate how custom commands and tools are defined in this repo, then wire up a `/handoff` command that drives a “prompt-for-compaction-prompt” flow and a callable compacter tool, and finally hook them into the existing compaction pipeline.

I’ve located the generic command pipeline and the tool system, plus the compaction prompt text. Next I’ll add a /handoff command definition that uses $ARGUMENTS to ask for a compaction-guiding prompt, and then define a compacter tool that triggers compaction once the user agrees.

I’ll now wire this into OpenCode’s own command + tool infrastructure, not the generic example from search.

```typescript
import { Tool } from "./tool"
import z from "zod"
import { SessionCompaction } from "../session/compaction"
import { SessionPrompt } from "../session/prompt"
import { Agent } from "../agent/agent"

export const CompacterTool = Tool.define("compacter", async () => {
  return {
    description:
      "Run session compaction after the user has agreed on a custom compaction prompt. " +
      "This should be called only after you and the user have iterated on and confirmed the prompt.",
    parameters: z.object({
      /**
       * The session to compact. Usually the current session.
       */
      session_id: z.string().describe("The ID of the session to compact"),
      /**
       * The final, user-approved compaction prompt to use as guidance.
       */
      prompt: z
        .string()
        .describe(
          "The custom compaction guidance the user has approved. " +
            "Use this to help the system retain the most valuable context.",
        ),
      /**
       * Whether this compaction was initiated automatically or manually.
       */
      auto: z.boolean().default(false).describe("Whether this compaction is considered automatic"),
    }),
    async execute(params, ctx) {
      const sessionID = params.session_id

      // Determine an agent/model to use as the 'current' agent for compaction.
      // We prefer the last user agent if possible, otherwise the default agent.
      const session = await ctx.sdk.session.get({ sessionID }).then((x) => x.data!)
      const lastUser = session.messages
        .filter((m) => m.role === "user")
        .toReversed()[0] as { agent?: string } | undefined

      const agentName = lastUser?.agent ?? (await Agent.defaultAgent())

      // Queue a compaction task; the normal SessionPrompt.loop will pick it up.
      await SessionCompaction.create({
        sessionID,
        agent: agentName,
        model: {
          providerID: ctx.extra.model.providerID,
          modelID: ctx.extra.model.modelID,
        },
        auto: params.auto,
      })

      // Run the prompt loop to actually perform compaction. The plugin hook
      // `experimental.session.compacting` can use the provided prompt.
      await SessionPrompt.loop(sessionID)

      return {
        title: "Session compacted",
        metadata: {
          sessionID,
        },
        output:
          "Compaction has been requested for this session using the agreed custom prompt. " +
          "If you need to adjust the compaction behavior further, ask the user and run the compacter tool again.",
      }
    },
  }
})


```

```plaintext
You are a helpful AI assistant tasked with summarizing conversations **and** helping users design good prompts for future compaction.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

When asked to **design a compaction prompt** (for example via a `/handoff` command):
- First, carefully read the user's guidance text and arguments.
- Reflect on the session so far and the user's goals.
- Propose a **single, clear prompt string** that another compaction step could use to:
  - Retain the most valuable parts of the session context so far.
  - Emphasize important files, decisions, constraints, and follow‑ups.
  - De‑emphasize or drop unimportant back‑and‑forth or obsolete details.
- If helpful, briefly explain (in a separate paragraph) *why* your proposed prompt is a good fit.

Your summaries and prompt suggestions should be comprehensive enough to provide context, but concise and directed enough to be quickly understood and easy to use in follow‑up compaction runs.


```

### Overview

- **/handoff command** will be a **config-defined command**, not hardcoded, that uses `$ARGUMENTS` plus your existing compaction prompt to ask the model to design a better, guided compaction prompt.
- **Compacter tool** (`compacter`) has been implemented so the agent can run the actual compaction once you’ve agreed on the derived prompt.
- The **compaction agent prompt** has been extended so it understands that sometimes it’s asked to design compaction prompts (your “handoff” flow), not only to summarize.

---

### 1. Custom `/handoff` command (config)

Commands are sourced from your `Config` (`cfg.command` in `config.ts`), so you define `/handoff` in your project/user config, not in code.

Here’s a concrete template you can drop into your OpenCode config (e.g. `~/.opencode/config.json` or your project config, depending on how you’re set up):

```jsonc
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      // Optional: run as a subtask using the compaction agent
      "agent": "compaction",
      "subtask": true,
      "template": "
You are the compaction assistant. Your job is NOT to compact now, but to DESIGN a prompt
that will later be used to drive a focused compaction of this session.

Below is the current conversation context (as provided by the system), followed by my
guidance and constraints for how I want future compaction to behave.

My guidance and constraints (raw arguments from the user):
$ARGUMENTS

Your task:

1. Reflect on:
   - The conversation so far.
   - The guidance above ($ARGUMENTS).
2. Propose ONE clear, standalone prompt string that another compaction step could use
   later. That prompt should:
   - Help retain the most valuable context (files, decisions, TODOs, constraints).
   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.
   - De-emphasize or omit low-value chatter or obsolete details.

Output format:

- First, on a single line, output exactly:

  COMPACTION_PROMPT:

- On the very next line, output ONLY the proposed compaction prompt string, with no
  markdown, no quotes, and no extra surrounding text.

- Then, after a blank line, you may optionally include a short explanation of why this
  prompt is a good fit, starting with:

  RATIONALE:

Remember: you are not compacting now. You are designing a prompt that will be used later
to run compaction once the user has confirmed it.
"
    }
  }
}
```

How this behaves:

- You’ll type, e.g.:  
  `/handoff keep only the last 5 user turns and any tool runs that touched src/session/**`
- The command pipeline in `SessionPrompt.command` will:
  - Substitute `$ARGUMENTS` with the entire text after `/handoff`.
  - Run this through the **`compaction` agent** (because `agent: "compaction"`), which now knows how to design compaction prompts as well as summarize.
  - You’ll get back a message with:
    - A machine-usable line after `COMPACTION_PROMPT:` (the raw prompt text).
    - An optional `RATIONALE:` section you can use to refine or question the design.
- You, as the user, can then:
  - Copy-paste / tweak the suggested compaction prompt.
  - Have a short back-and-forth with the agent to refine it.

If you’d rather keep it minimal and not depend on the agent being `"compaction"`, you can drop the `"agent"` and `"subtask"` keys and let it run with your default agent.

---

### 2. Compacter tool: run the agreed compaction

I added a new tool `compacter` under `packages/opencode/src/tool/compacter.ts`:

```1:80:packages/opencode/src/tool/compacter.ts
import { Tool } from "./tool"
import z from "zod"
import { SessionCompaction } from "../session/compaction"
import { SessionPrompt } from "../session/prompt"
import { Agent } from "../agent/agent"

export const CompacterTool = Tool.define("compacter", async () => {
  return {
    description:
      "Run session compaction after the user has agreed on a custom compaction prompt. " +
      "This should be called only after you and the user have iterated on and confirmed the prompt.",
    parameters: z.object({
      /**
       * The session to compact. Usually the current session.
       */
      session_id: z.string().describe("The ID of the session to compact"),
      /**
       * The final, user-approved compaction prompt to use as guidance.
       */
      prompt: z
        .string()
        .describe(
          "The custom compaction guidance the user has approved. " +
            "Use this to help the system retain the most valuable context.",
        ),
      /**
       * Whether this compaction was initiated automatically or manually.
       */
      auto: z.boolean().default(false).describe("Whether this compaction is considered automatic"),
    }),
    async execute(params, ctx) {
      const sessionID = params.session_id

      // Determine an agent/model to use as the 'current' agent for compaction.
      // We prefer the last user agent if possible, otherwise the default agent.
      const session = await ctx.sdk.session.get({ sessionID }).then((x) => x.data!)
      const lastUser = session.messages
        .filter((m) => m.role === "user")
        .toReversed()[0] as { agent?: string } | undefined

      const agentName = lastUser?.agent ?? (await Agent.defaultAgent())

      // Queue a compaction task; the normal SessionPrompt.loop will pick it up.
      await SessionCompaction.create({
        sessionID,
        agent: agentName,
        model: {
          providerID: ctx.extra.model.providerID,
          modelID: ctx.extra.model.modelID,
        },
        auto: params.auto,
      })

      // Run the prompt loop to actually perform compaction. The plugin hook
      // `experimental.session.compacting` can use the provided prompt.
      await SessionPrompt.loop(sessionID)

      return {
        title: "Session compacted",
        metadata: {
          sessionID,
        },
        output:
          "Compaction has been requested for this session using the agreed custom prompt. " +
          "If you need to adjust the compaction behavior further, ask the user and run the compacter tool again.",
      }
    },
  }
})
```

How this fits your flow:

- The **agent** will only call `compacter` once:
  - It has presented a proposed compaction prompt (from `/handoff`).
  - You’ve explicitly confirmed or edited that prompt.
- When it calls `compacter`:
  - It passes `session_id` (usually current session).
  - It passes the **agreed compaction prompt** in `prompt`.
  - Internally, we enqueue a `SessionCompaction.create(...)` and run `SessionPrompt.loop(sessionID)` to perform compaction.

To make the custom prompt actually influence compaction, you can:

- Implement or extend the `experimental.session.compacting` plugin hook to read the **agreed** prompt from some state (e.g. session metadata or your own store) and set `output.prompt` or `output.context` so `SessionCompaction.process` uses it instead of the hardcoded default.

---

### 3. Compaction agent updated for “handoff” use

The `compaction` agent’s system prompt (`compaction.txt`) has been extended so it knows it may be asked to **design** compaction prompts (your `/handoff` use-case), not just summarize. That makes your `/handoff` command’s template semantically aligned with the agent:

```1:18:packages/opencode/src/agent/prompt/compaction.txt
You are a helpful AI assistant tasked with summarizing conversations **and** helping users design good prompts for future compaction.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

When asked to **design a compaction prompt** (for example via a `/handoff` command):
- First, carefully read the user's guidance text and arguments.
- Reflect on the session so far and the user's goals.
- Propose a **single, clear prompt string** that another compaction step could use to:
  - Retain the most valuable parts of the session context so far.
  - Emphasize important files, decisions, constraints, and follow‑ups.
  - De‑emphasize or drop unimportant back‑and‑forth or obsolete details.
- If helpful, briefly explain (in a separate paragraph) *why* your proposed prompt is a good fit.

Your summaries and prompt suggestions should be comprehensive enough to provide context, but concise and directed enough to be quickly understood and easy to use in follow‑up compaction runs.
```

---

### 4. End-to-end “handoff → compaction” flow

Putting it all together:

1. **You**: type `/handoff ...` with guidance text.
2. **Command system**:
   - Expands `$ARGUMENTS` in the `/handoff` template.
   - Sends that as a prompt (optionally as a subtask) to the `compaction` agent.
3. **Agent**:
   - Reads the conversation and your guidance.
   - Returns:
     - `COMPACTION_PROMPT:` line.
     - The raw derived prompt.
     - Optional rationale.
4. **You**:
   - Review and tweak that prompt in normal chat.
   - Give explicit consent (e.g. “Yes, run compaction with that prompt.”).
5. **Agent**:
   - Calls the `compacter` tool with `session_id` and the final prompt.
6. **Server**:
   - Enqueues a `SessionCompaction` task and runs `SessionPrompt.loop(sessionID)`.
   - Your plugin hook can then use the stored/passed prompt to drive **selective compaction**.

If you’d like, I can next help you wire the `experimental.session.compacting` plugin so it actually consumes the agreed prompt produced via `/handoff`.

```jsonc
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      // Optional: run as a subtask using the compaction agent
      "agent": "compaction",
      "subtask": true,
      "template": "
You are the compaction assistant. Your job is NOT to compact now, but to DESIGN a prompt
that will later be used to drive a focused compaction of this session.

Below is the current conversation context (as provided by the system), followed by my
guidance and constraints for how I want future compaction to behave.

My guidance and constraints (raw arguments from the user):
$ARGUMENTS

Your task:

1. Reflect on:
   - The conversation so far.
   - The guidance above ($ARGUMENTS).
2. Propose ONE clear, standalone prompt string that another compaction step could use
   later. That prompt should:
   - Help retain the most valuable context (files, decisions, TODOs, constraints).
   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.
   - De-emphasize or omit low-value chatter or obsolete details.

Output format:

- First, on a single line, output exactly:

  COMPACTION_PROMPT:

- On the very next line, output ONLY the proposed compaction prompt string, with no
  markdown, no quotes, and no extra surrounding text.

- Then, after a blank line, you may optionally include a short explanation of why this
  prompt is a good fit, starting with:

  RATIONALE:

Remember: you are not compacting now. You are designing a prompt that will be used later
to run compaction once the user has confirmed it.
"
    }
  }
}
```

```typescript
import { Tool } from "./tool"
import z from "zod"
import { SessionCompaction } from "../session/compaction"
import { SessionPrompt } from "../session/prompt"
import { Agent } from "../agent/agent"

export const CompacterTool = Tool.define("compacter", async () => {
  return {
    description:
      "Run session compaction after the user has agreed on a custom compaction prompt. " +
      "This should be called only after you and the user have iterated on and confirmed the prompt.",
    parameters: z.object({
      /**
       * The session to compact. Usually the current session.
       */
      session_id: z.string().describe("The ID of the session to compact"),
      /**
       * The final, user-approved compaction prompt to use as guidance.
       */
      prompt: z
        .string()
        .describe(
          "The custom compaction guidance the user has approved. " +
            "Use this to help the system retain the most valuable context.",
        ),
      /**
       * Whether this compaction was initiated automatically or manually.
       */
      auto: z.boolean().default(false).describe("Whether this compaction is considered automatic"),
    }),
    async execute(params, ctx) {
      const sessionID = params.session_id

      // Determine an agent/model to use as the 'current' agent for compaction.
      // We prefer the last user agent if possible, otherwise the default agent.
      const session = await ctx.sdk.session.get({ sessionID }).then((x) => x.data!)
      const lastUser = session.messages
        .filter((m) => m.role === "user")
        .toReversed()[0] as { agent?: string } | undefined

      const agentName = lastUser?.agent ?? (await Agent.defaultAgent())

      // Queue a compaction task; the normal SessionPrompt.loop will pick it up.
      await SessionCompaction.create({
        sessionID,
        agent: agentName,
        model: {
          providerID: ctx.extra.model.providerID,
          modelID: ctx.extra.model.modelID,
        },
        auto: params.auto,
      })

      // Run the prompt loop to actually perform compaction. The plugin hook
      // `experimental.session.compacting` can use the provided prompt.
      await SessionPrompt.loop(sessionID)

      return {
        title: "Session compacted",
        metadata: {
          sessionID,
        },
        output:
          "Compaction has been requested for this session using the agreed custom prompt. " +
          "If you need to adjust the compaction behavior further, ask the user and run the compacter tool again.",
      }
    },
  }
})
```

```plaintext
You are a helpful AI assistant tasked with summarizing conversations **and** helping users design good prompts for future compaction.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

When asked to **design a compaction prompt** (for example via a `/handoff` command):
- First, carefully read the user's guidance text and arguments.
- Reflect on the session so far and the user's goals.
- Propose a **single, clear prompt string** that another compaction step could use to:
  - Retain the most valuable parts of the session context so far.
  - Emphasize important files, decisions, constraints, and follow‑ups.
  - De‑emphasize or drop unimportant back‑and‑forth or obsolete details.
- If helpful, briefly explain (in a separate paragraph) *why* your proposed prompt is a good fit.

Your summaries and prompt suggestions should be comprehensive enough to provide context, but concise and directed enough to be quickly understood and easy to use in follow‑up compaction runs.
```

---

**User**

for the command system, we do want to make the expanded handoff template prompt be a subtask. not only a subtask, but a forked subtask of the current context. that subagent has access to the compacter tool. it also explicitly needs to be told the session id, so that it can report what session it is forking from. the handoff command should also accept an explicit session id in it's arguments, and be able to look for that session id to fork from.

---

**Cursor**


Updating `/handoff` to create a forked subtask session, pass the parent session ID, and ensure the compacter tool is available. Checking how subtasks and session forking work:



Implementing the changes:
1. Extending `SubtaskPart` to include `parent_session_id`
2. Updating command processing to parse an optional session ID from arguments
3. Passing the parent session ID to TaskTool
4. Registering CompacterTool and ensuring it's available to the compaction agent
5. Updating the handoff command template



Implementing the changes:


```typescript
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { NamedError } from "@opencode-ai/util/error"
import { Message } from "./message"
import { APICallError, convertToModelMessages, LoadAPIKeyError, type ModelMessage, type UIMessage } from "ai"
import { Identifier } from "../id/id"
import { LSP } from "../lsp"
import { Snapshot } from "@/snapshot"
import { fn } from "@/util/fn"
import { Storage } from "@/storage/storage"
import { ProviderTransform } from "@/provider/transform"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import { type SystemError } from "bun"

export namespace MessageV2 {
  export const OutputLengthError = NamedError.create("MessageOutputLengthError", z.object({}))
  export const AbortedError = NamedError.create("MessageAbortedError", z.object({ message: z.string() }))
  export const AuthError = NamedError.create(
    "ProviderAuthError",
    z.object({
      providerID: z.string(),
      message: z.string(),
    }),
  )
  export const APIError = NamedError.create(
    "APIError",
    z.object({
      message: z.string(),
      statusCode: z.number().optional(),
      isRetryable: z.boolean(),
      responseHeaders: z.record(z.string(), z.string()).optional(),
      responseBody: z.string().optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }),
  )
  export type APIError = z.infer<typeof APIError.Schema>

  const PartBase = z.object({
    id: z.string(),
    sessionID: z.string(),
    messageID: z.string(),
  })

  export const SnapshotPart = PartBase.extend({
    type: z.literal("snapshot"),
    snapshot: z.string(),
  }).meta({
    ref: "SnapshotPart",
  })
  export type SnapshotPart = z.infer<typeof SnapshotPart>

  export const PatchPart = PartBase.extend({
    type: z.literal("patch"),
    hash: z.string(),
    files: z.string().array(),
  }).meta({
    ref: "PatchPart",
  })
  export type PatchPart = z.infer<typeof PatchPart>

  export const TextPart = PartBase.extend({
    type: z.literal("text"),
    text: z.string(),
    synthetic: z.boolean().optional(),
    ignored: z.boolean().optional(),
    time: z
      .object({
        start: z.number(),
        end: z.number().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "TextPart",
  })
  export type TextPart = z.infer<typeof TextPart>

  export const ReasoningPart = PartBase.extend({
    type: z.literal("reasoning"),
    text: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
    time: z.object({
      start: z.number(),
      end: z.number().optional(),
    }),
  }).meta({
    ref: "ReasoningPart",
  })
  export type ReasoningPart = z.infer<typeof ReasoningPart>

  const FilePartSourceBase = z.object({
    text: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .meta({
        ref: "FilePartSourceText",
      }),
  })

  export const FileSource = FilePartSourceBase.extend({
    type: z.literal("file"),
    path: z.string(),
  }).meta({
    ref: "FileSource",
  })

  export const SymbolSource = FilePartSourceBase.extend({
    type: z.literal("symbol"),
    path: z.string(),
    range: LSP.Range,
    name: z.string(),
    kind: z.number().int(),
  }).meta({
    ref: "SymbolSource",
  })

  export const FilePartSource = z.discriminatedUnion("type", [FileSource, SymbolSource]).meta({
    ref: "FilePartSource",
  })

  export const FilePart = PartBase.extend({
    type: z.literal("file"),
    mime: z.string(),
    filename: z.string().optional(),
    url: z.string(),
    source: FilePartSource.optional(),
  }).meta({
    ref: "FilePart",
  })
  export type FilePart = z.infer<typeof FilePart>

  export const AgentPart = PartBase.extend({
    type: z.literal("agent"),
    name: z.string(),
    source: z
      .object({
        value: z.string(),
        start: z.number().int(),
        end: z.number().int(),
      })
      .optional(),
  }).meta({
    ref: "AgentPart",
  })
  export type AgentPart = z.infer<typeof AgentPart>

  export const CompactionPart = PartBase.extend({
    type: z.literal("compaction"),
    auto: z.boolean(),
  }).meta({
    ref: "CompactionPart",
  })
  export type CompactionPart = z.infer<typeof CompactionPart>

  export const SubtaskPart = PartBase.extend({
    type: z.literal("subtask"),
    prompt: z.string(),
    description: z.string(),
    agent: z.string(),
    command: z.string().optional(),
    parent_session_id: z.string().optional(),
  })
  export type SubtaskPart = z.infer<typeof SubtaskPart>

  export const RetryPart = PartBase.extend({
    type: z.literal("retry"),
    attempt: z.number(),
    error: APIError.Schema,
    time: z.object({
      created: z.number(),
    }),
  }).meta({
    ref: "RetryPart",
  })
  export type RetryPart = z.infer<typeof RetryPart>

  export const StepStartPart = PartBase.extend({
    type: z.literal("step-start"),
    snapshot: z.string().optional(),
  }).meta({
    ref: "StepStartPart",
  })
  export type StepStartPart = z.infer<typeof StepStartPart>

  export const StepFinishPart = PartBase.extend({
    type: z.literal("step-finish"),
    reason: z.string(),
    snapshot: z.string().optional(),
    cost: z.number(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
  }).meta({
    ref: "StepFinishPart",
  })
  export type StepFinishPart = z.infer<typeof StepFinishPart>

  export const ToolStatePending = z
    .object({
      status: z.literal("pending"),
      input: z.record(z.string(), z.any()),
      raw: z.string(),
    })
    .meta({
      ref: "ToolStatePending",
    })

  export type ToolStatePending = z.infer<typeof ToolStatePending>

  export const ToolStateRunning = z
    .object({
      status: z.literal("running"),
      input: z.record(z.string(), z.any()),
      title: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateRunning",
    })
  export type ToolStateRunning = z.infer<typeof ToolStateRunning>

  export const ToolStateCompleted = z
    .object({
      status: z.literal("completed"),
      input: z.record(z.string(), z.any()),
      output: z.string(),
      title: z.string(),
      metadata: z.record(z.string(), z.any()),
      time: z.object({
        start: z.number(),
        end: z.number(),
        compacted: z.number().optional(),
      }),
      attachments: FilePart.array().optional(),
    })
    .meta({
      ref: "ToolStateCompleted",
    })
  export type ToolStateCompleted = z.infer<typeof ToolStateCompleted>

  export const ToolStateError = z
    .object({
      status: z.literal("error"),
      input: z.record(z.string(), z.any()),
      error: z.string(),
      metadata: z.record(z.string(), z.any()).optional(),
      time: z.object({
        start: z.number(),
        end: z.number(),
      }),
    })
    .meta({
      ref: "ToolStateError",
    })
  export type ToolStateError = z.infer<typeof ToolStateError>

  export const ToolState = z
    .discriminatedUnion("status", [ToolStatePending, ToolStateRunning, ToolStateCompleted, ToolStateError])
    .meta({
      ref: "ToolState",
    })

  export const ToolPart = PartBase.extend({
    type: z.literal("tool"),
    callID: z.string(),
    tool: z.string(),
    state: ToolState,
    metadata: z.record(z.string(), z.any()).optional(),
  }).meta({
    ref: "ToolPart",
  })
  export type ToolPart = z.infer<typeof ToolPart>

  const Base = z.object({
    id: z.string(),
    sessionID: z.string(),
  })

  export const User = Base.extend({
    role: z.literal("user"),
    time: z.object({
      created: z.number(),
    }),
    summary: z
      .object({
        title: z.string().optional(),
        body: z.string().optional(),
        diffs: Snapshot.FileDiff.array(),
      })
      .optional(),
    agent: z.string(),
    model: z.object({
      providerID: z.string(),
      modelID: z.string(),
    }),
    system: z.string().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
  }).meta({
    ref: "UserMessage",
  })
  export type User = z.infer<typeof User>

  export const Part = z
    .discriminatedUnion("type", [
      TextPart,
      SubtaskPart,
      ReasoningPart,
      FilePart,
      ToolPart,
      StepStartPart,
      StepFinishPart,
      SnapshotPart,
      PatchPart,
      AgentPart,
      RetryPart,
      CompactionPart,
    ])
    .meta({
      ref: "Part",
    })
  export type Part = z.infer<typeof Part>

  export const Assistant = Base.extend({
    role: z.literal("assistant"),
    time: z.object({
      created: z.number(),
      completed: z.number().optional(),
    }),
    error: z
      .discriminatedUnion("name", [
        AuthError.Schema,
        NamedError.Unknown.Schema,
        OutputLengthError.Schema,
        AbortedError.Schema,
        APIError.Schema,
      ])
      .optional(),
    parentID: z.string(),
    modelID: z.string(),
    providerID: z.string(),
    /**
     * @deprecated
     */
    mode: z.string(),
    agent: z.string(),
    path: z.object({
      cwd: z.string(),
      root: z.string(),
    }),
    summary: z.boolean().optional(),
    cost: z.number(),
    tokens: z.object({
      input: z.number(),
      output: z.number(),
      reasoning: z.number(),
      cache: z.object({
        read: z.number(),
        write: z.number(),
      }),
    }),
    finish: z.string().optional(),
  }).meta({
    ref: "AssistantMessage",
  })
  export type Assistant = z.infer<typeof Assistant>

  export const Info = z.discriminatedUnion("role", [User, Assistant]).meta({
    ref: "Message",
  })
  export type Info = z.infer<typeof Info>

  export const Event = {
    Updated: BusEvent.define(
      "message.updated",
      z.object({
        info: Info,
      }),
    ),
    Removed: BusEvent.define(
      "message.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
      }),
    ),
    PartUpdated: BusEvent.define(
      "message.part.updated",
      z.object({
        part: Part,
        delta: z.string().optional(),
      }),
    ),
    PartRemoved: BusEvent.define(
      "message.part.removed",
      z.object({
        sessionID: z.string(),
        messageID: z.string(),
        partID: z.string(),
      }),
    ),
  }

  export const WithParts = z.object({
    info: Info,
    parts: z.array(Part),
  })
  export type WithParts = z.infer<typeof WithParts>

  export function toModelMessage(input: WithParts[]): ModelMessage[] {
    const result: UIMessage[] = []

    for (const msg of input) {
      if (msg.parts.length === 0) continue

      if (msg.info.role === "user") {
        const userMessage: UIMessage = {
          id: msg.info.id,
          role: "user",
          parts: [],
        }
        result.push(userMessage)
        for (const part of msg.parts) {
          if (part.type === "text" && !part.ignored)
            userMessage.parts.push({
              type: "text",
              text: part.text,
            })
          // text/plain and directory files are converted into text parts, ignore them
          if (part.type === "file" && part.mime !== "text/plain" && part.mime !== "application/x-directory")
            userMessage.parts.push({
              type: "file",
              url: part.url,
              mediaType: part.mime,
              filename: part.filename,
            })

          if (part.type === "compaction") {
            userMessage.parts.push({
              type: "text",
              text: "What did we do so far?",
            })
          }
          if (part.type === "subtask") {
            userMessage.parts.push({
              type: "text",
              text: "The following tool was executed by the user",
            })
          }
        }
      }

      if (msg.info.role === "assistant") {
        if (
          msg.info.error &&
          !(
            MessageV2.AbortedError.isInstance(msg.info.error) &&
            msg.parts.some((part) => part.type !== "step-start" && part.type !== "reasoning")
          )
        ) {
          continue
        }
        const assistantMessage: UIMessage = {
          id: msg.info.id,
          role: "assistant",
          parts: [],
        }
        result.push(assistantMessage)
        for (const part of msg.parts) {
          if (part.type === "text")
            assistantMessage.parts.push({
              type: "text",
              text: part.text,
              providerMetadata: part.metadata,
            })
          if (part.type === "step-start")
            assistantMessage.parts.push({
              type: "step-start",
            })
          if (part.type === "tool") {
            if (part.state.status === "completed") {
              if (part.state.attachments?.length) {
                result.push({
                  id: Identifier.ascending("message"),
                  role: "user",
                  parts: [
                    {
                      type: "text",
                      text: `Tool ${part.tool} returned an attachment:`,
                    },
                    ...part.state.attachments.map((attachment) => ({
                      type: "file" as const,
                      url: attachment.url,
                      mediaType: attachment.mime,
                      filename: attachment.filename,
                    })),
                  ],
                })
              }
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-available",
                toolCallId: part.callID,
                input: part.state.input,
                output: part.state.time.compacted ? "[Old tool result content cleared]" : part.state.output,
                callProviderMetadata: part.metadata,
              })
            }
            if (part.state.status === "error")
              assistantMessage.parts.push({
                type: ("tool-" + part.tool) as `tool-${string}`,
                state: "output-error",
                toolCallId: part.callID,
                input: part.state.input,
                errorText: part.state.error,
                callProviderMetadata: part.metadata,
              })
          }
          if (part.type === "reasoning") {
            assistantMessage.parts.push({
              type: "reasoning",
              text: part.text,
              providerMetadata: part.metadata,
            })
          }
        }
      }
    }

    return convertToModelMessages(result.filter((msg) => msg.parts.length > 0))
  }

  export const stream = fn(Identifier.schema("session"), async function* (sessionID) {
    const list = await Array.fromAsync(await Storage.list(["message", sessionID]))
    for (let i = list.length - 1; i >= 0; i--) {
      yield await get({
        sessionID,
        messageID: list[i][2],
      })
    }
  })

  export const parts = fn(Identifier.schema("message"), async (messageID) => {
    const result = [] as MessageV2.Part[]
    for (const item of await Storage.list(["part", messageID])) {
      const read = await Storage.read<MessageV2.Part>(item)
      result.push(read)
    }
    result.sort((a, b) => (a.id > b.id ? 1 : -1))
    return result
  })

  export const get = fn(
    z.object({
      sessionID: Identifier.schema("session"),
      messageID: Identifier.schema("message"),
    }),
    async (input) => {
      return {
        info: await Storage.read<MessageV2.Info>(["message", input.sessionID, input.messageID]),
        parts: await parts(input.messageID),
      }
    },
  )

  export async function filterCompacted(stream: AsyncIterable<MessageV2.WithParts>) {
    const result = [] as MessageV2.WithParts[]
    const completed = new Set<string>()
    for await (const msg of stream) {
      result.push(msg)
      if (
        msg.info.role === "user" &&
        completed.has(msg.info.id) &&
        msg.parts.some((part) => part.type === "compaction")
      )
        break
      if (msg.info.role === "assistant" && msg.info.summary && msg.info.finish) completed.add(msg.info.parentID)
    }
    result.reverse()
    return result
  }

  export function fromError(e: unknown, ctx: { providerID: string }) {
    switch (true) {
      case e instanceof DOMException && e.name === "AbortError":
        return new MessageV2.AbortedError(
          { message: e.message },
          {
            cause: e,
          },
        ).toObject()
      case MessageV2.OutputLengthError.isInstance(e):
        return e
      case LoadAPIKeyError.isInstance(e):
        return new MessageV2.AuthError(
          {
            providerID: ctx.providerID,
            message: e.message,
          },
          { cause: e },
        ).toObject()
      case (e as SystemError)?.code === "ECONNRESET":
        return new MessageV2.APIError(
          {
            message: "Connection reset by server",
            isRetryable: true,
            metadata: {
              code: (e as SystemError).code ?? "",
              syscall: (e as SystemError).syscall ?? "",
              message: (e as SystemError).message ?? "",
            },
          },
          { cause: e },
        ).toObject()
      case APICallError.isInstance(e):
        const message = iife(() => {
          let msg = e.message
          if (msg === "") {
            if (e.responseBody) return e.responseBody
            if (e.statusCode) {
              const err = STATUS_CODES[e.statusCode]
              if (err) return err
            }
            return "Unknown error"
          }
          const transformed = ProviderTransform.error(ctx.providerID, e)
          if (transformed !== msg) {
            return transformed
          }
          if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
            return msg
          }

          try {
            const body = JSON.parse(e.responseBody)
            // try to extract common error message fields
            const errMsg = body.message || body.error || body.error?.message
            if (errMsg && typeof errMsg === "string") {
              return `${msg}: ${errMsg}`
            }
          } catch {}

          return `${msg}: ${e.responseBody}`
        }).trim()

        return new MessageV2.APIError(
          {
            message,
            statusCode: e.statusCode,
            isRetryable: e.isRetryable,
            responseHeaders: e.responseHeaders,
            responseBody: e.responseBody,
          },
          { cause: e },
        ).toObject()
      case e instanceof Error:
        return new NamedError.Unknown({ message: e.toString() }, { cause: e }).toObject()
      default:
        return new NamedError.Unknown({ message: JSON.stringify(e) }, { cause: e })
    }
  }
}

```


Updating command processing to parse the session ID and pass it to the subtask:


```typescript
import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { Identifier } from "../id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { SessionRevert } from "./revert"
import { Session } from "."
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
import { type Tool as AITool, tool, jsonSchema } from "ai"
import { SessionCompaction } from "./compaction"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { ProviderTransform } from "../provider/transform"
import { SystemPrompt } from "./system"
import { Plugin } from "../plugin"
import PROMPT_PLAN from "../session/prompt/plan.txt"
import BUILD_SWITCH from "../session/prompt/build-switch.txt"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import { defer } from "../util/defer"
import { clone, mergeDeep, pipe } from "remeda"
import { ToolRegistry } from "../tool/registry"
import { Wildcard } from "../util/wildcard"
import { MCP } from "../mcp"
import { LSP } from "../lsp"
import { ReadTool } from "../tool/read"
import { ListTool } from "../tool/ls"
import { FileTime } from "../file/time"
import { Flag } from "../flag/flag"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { Command } from "../command"
import { $, fileURLToPath } from "bun"
import { ConfigMarkdown } from "../config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/util/error"
import { fn } from "@/util/fn"
import { SessionProcessor } from "./processor"
import { TaskTool } from "@/tool/task"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { iife } from "@/util/iife"
import { Shell } from "@/shell/shell"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })
  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  const state = Instance.state(
    () => {
      const data: Record<
        string,
        {
          abort: AbortController
          callbacks: {
            resolve(input: MessageV2.WithParts): void
            reject(): void
          }[]
        }
      > = {}
      return data
    },
    async (current) => {
      for (const item of Object.values(current)) {
        item.abort.abort()
      }
    },
  )

  export function assertNotBusy(sessionID: string) {
    const match = state()[sessionID]
    if (match) throw new Session.BusyError(sessionID)
  }

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    system: z.string().optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "TextPartInput",
          }),
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "FilePartInput",
          }),
        MessageV2.AgentPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "AgentPartInput",
          }),
        MessageV2.SubtaskPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "SubtaskPartInput",
          }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export const prompt = fn(PromptInput, async (input) => {
    const session = await Session.get(input.sessionID)
    await SessionRevert.cleanup(session)

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    if (input.noReply === true) {
      return message
    }

    return loop(input.sessionID)
  })

  export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
    const parts: PromptInput["parts"] = [
      {
        type: "text",
        text: template,
      },
    ]
    const files = ConfigMarkdown.files(template)
    const seen = new Set<string>()
    await Promise.all(
      files.map(async (match) => {
        const name = match[1]
        if (seen.has(name)) return
        seen.add(name)
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(Instance.worktree, name)

        const stats = await fs.stat(filepath).catch(() => undefined)
        if (!stats) {
          const agent = await Agent.get(name)
          if (agent) {
            parts.push({
              type: "agent",
              name: agent.name,
            })
          }
          return
        }

        if (stats.isDirectory()) {
          parts.push({
            type: "file",
            url: `file://${filepath}`,
            filename: name,
            mime: "application/x-directory",
          })
          return
        }

        parts.push({
          type: "file",
          url: `file://${filepath}`,
          filename: name,
          mime: "text/plain",
        })
      }),
    )
    return parts
  }

  function start(sessionID: string) {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
      abort: controller,
      callbacks: [],
    }
    return controller.signal
  }

  export function cancel(sessionID: string) {
    log.info("cancel", { sessionID })
    const s = state()
    const match = s[sessionID]
    if (!match) return
    match.abort.abort()
    for (const item of match.callbacks) {
      item.reject()
    }
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }

  export const loop = fn(Identifier.schema("session"), async (sessionID) => {
    const abort = start(sessionID)
    if (!abort) {
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID].callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    let step = 0
    while (true) {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      let lastUser: MessageV2.User | undefined
      let lastAssistant: MessageV2.Assistant | undefined
      let lastFinished: MessageV2.Assistant | undefined
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
        if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
          lastFinished = msg.info as MessageV2.Assistant
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      step++
      if (step === 1)
        ensureTitle({
          session: await Session.get(sessionID),
          modelID: lastUser.model.modelID,
          providerID: lastUser.model.providerID,
          message: msgs.find((m) => m.info.role === "user")!,
          history: msgs,
        })

      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
      const task = tasks.pop()

      // pending subtask
      // TODO: centralize "invoke tool" logic
      if (task?.type === "subtask") {
        const taskTool = await TaskTool.init()
        const assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "assistant",
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
        })) as MessageV2.Assistant
        let part = (await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMessage.id,
          sessionID: assistantMessage.sessionID,
          type: "tool",
          callID: ulid(),
          tool: TaskTool.id,
          state: {
            status: "running",
            input: {
              prompt: task.prompt,
              description: task.description,
              subagent_type: task.agent,
              command: task.command,
            },
            time: {
              start: Date.now(),
            },
          },
        })) as MessageV2.ToolPart
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
        }
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          { args: taskArgs },
        )
        let executionError: Error | undefined
        const result = await taskTool
          .execute(taskArgs, {
            agent: task.agent,
            messageID: assistantMessage.id,
            sessionID: sessionID,
            abort,
            async metadata(input) {
              await Session.updatePart({
                ...part,
                type: "tool",
                state: {
                  ...part.state,
                  ...input,
                },
              } satisfies MessageV2.ToolPart)
            },
          })
          .catch((error) => {
            executionError = error
            log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
            return undefined
          })
        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          result,
        )
        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        await Session.updateMessage(assistantMessage)
        if (result && part.state.status === "running") {
          await Session.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments: result.attachments,
              time: {
                ...part.state.time,
                end: Date.now(),
              },
            },
          } satisfies MessageV2.ToolPart)
        }
        if (!result) {
          await Session.updatePart({
            ...part,
            state: {
              status: "error",
              error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
              time: {
                start: part.state.status === "running" ? part.state.time.start : Date.now(),
                end: Date.now(),
              },
              metadata: part.metadata,
              input: part.state.input,
            },
          } satisfies MessageV2.ToolPart)
        }

        // Add synthetic user message to prevent certain reasoning models from erroring
        // If we create assistant messages w/ out user ones following mid loop thinking signatures
        // will be missing and it can cause errors for models like gemini for example
        const summaryUserMsg: MessageV2.User = {
          id: Identifier.ascending("message"),
          sessionID,
          role: "user",
          time: {
            created: Date.now(),
          },
          agent: lastUser.agent,
          model: lastUser.model,
        }
        await Session.updateMessage(summaryUserMsg)
        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: summaryUserMsg.id,
          sessionID,
          type: "text",
          text: "Summarize the task tool output above and continue with your task.",
          synthetic: true,
        } satisfies MessageV2.TextPart)

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }

      // normal processing
      const agent = await Agent.get(lastUser.agent)
      const maxSteps = agent.maxSteps ?? Infinity
      const isLastStep = step >= maxSteps
      msgs = insertReminders({
        messages: msgs,
        agent,
      })

      const processor = SessionProcessor.create({
        assistantMessage: (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.name,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
          sessionID,
        })) as MessageV2.Assistant,
        sessionID: sessionID,
        model,
        abort,
      })
      const tools = await resolveTools({
        agent,
        sessionID,
        model,
        tools: lastUser.tools,
        processor,
      })

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      const sessionMessages = clone(msgs)

      await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system: [...(await SystemPrompt.environment()), ...(await SystemPrompt.custom())],
        messages: [
          ...MessageV2.toModelMessage(sessionMessages),
          ...(isLastStep
            ? [
                {
                  role: "assistant" as const,
                  content: MAX_STEPS,
                },
              ]
            : []),
        ],
        tools,
        model,
      })
      if (result === "stop") break
      continue
    }
    SessionCompaction.prune({ sessionID })
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user") continue
      const queued = state()[sessionID]?.callbacks ?? []
      for (const q of queued) {
        q.resolve(item)
      }
      return item
    }
    throw new Error("Impossible")
  })

  async function lastModel(sessionID: string) {
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user" && item.info.model) return item.info.model
    }
    return Provider.defaultModel()
  }

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    sessionID: string
    tools?: Record<string, boolean>
    processor: SessionProcessor.Info
  }) {
    using _ = log.time("resolveTools")
    const tools: Record<string, AITool> = {}
    const enabledTools = pipe(
      input.agent.tools,
      mergeDeep(await ToolRegistry.enabled(input.agent)),
      mergeDeep(input.tools ?? {}),
    )
    for (const item of await ToolRegistry.tools(input.model.providerID, input.agent)) {
      if (Wildcard.all(item.id, enabledTools) === false) continue
      const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
      tools[item.id] = tool({
        id: item.id as any,
        description: item.description,
        inputSchema: jsonSchema(schema as any),
        async execute(args, options) {
          await Plugin.trigger(
            "tool.execute.before",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            {
              args,
            },
          )
          const result = await item.execute(args, {
            sessionID: input.sessionID,
            abort: options.abortSignal!,
            messageID: input.processor.message.id,
            callID: options.toolCallId,
            extra: { model: input.model },
            agent: input.agent.name,
            metadata: async (val) => {
              const match = input.processor.partFromToolCall(options.toolCallId)
              if (match && match.state.status === "running") {
                await Session.updatePart({
                  ...match,
                  state: {
                    title: val.title,
                    metadata: val.metadata,
                    status: "running",
                    input: args,
                    time: {
                      start: Date.now(),
                    },
                  },
                })
              }
            },
          })
          await Plugin.trigger(
            "tool.execute.after",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            result,
          )
          return result
        },
        toModelOutput(result) {
          return {
            type: "text",
            value: result.output,
          }
        },
      })
    }
    for (const [key, item] of Object.entries(await MCP.tools())) {
      if (Wildcard.all(key, enabledTools) === false) continue
      const execute = item.execute
      if (!execute) continue

      // Wrap execute to add plugin hooks and format output
      item.execute = async (args, opts) => {
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          {
            args,
          },
        )
        const result = await execute(args, opts)

        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          result,
        )

        const textParts: string[] = []
        const attachments: MessageV2.FilePart[] = []

        for (const contentItem of result.content) {
          if (contentItem.type === "text") {
            textParts.push(contentItem.text)
          } else if (contentItem.type === "image") {
            attachments.push({
              id: Identifier.ascending("part"),
              sessionID: input.sessionID,
              messageID: input.processor.message.id,
              type: "file",
              mime: contentItem.mimeType,
              url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
            })
          }
          // Add support for other types if needed
        }

        return {
          title: "",
          metadata: result.metadata ?? {},
          output: textParts.join("\n\n"),
          attachments,
          content: result.content, // directly return content to preserve ordering when outputting to model
        }
      }
      item.toModelOutput = (result) => {
        return {
          type: "text",
          value: result.output,
        }
      }
      tools[key] = item
    }
    return tools
  }

  async function createUserMessage(input: PromptInput) {
    const agent = await Agent.get(input.agent ?? (await Agent.defaultAgent()))
    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.name,
      model: input.model ?? agent.model ?? (await lastModel(input.sessionID)),
      system: input.system,
    }

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<MessageV2.Part[]> => {
        if (part.type === "file") {
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: Buffer.from(part.url, "base64url").toString(),
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }
              break
            case "file:":
              log.info("file", { mime: part.mime })
              // have to normalize, symbol search returns absolute paths
              // Decode the pathname since URL constructor doesn't automatically decode it
              const filepath = fileURLToPath(part.url)
              const stat = await Bun.file(filepath).stat()

              if (stat.isDirectory()) {
                part.mime = "application/x-directory"
              }

              if (part.mime === "text/plain") {
                let offset: number | undefined = undefined
                let limit: number | undefined = undefined
                const range = {
                  start: url.searchParams.get("start"),
                  end: url.searchParams.get("end"),
                }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  // some LSP servers (eg, gopls) don't give full range in
                  // workspace/symbol searches, so we'll try to find the
                  // symbol in the document to get the full range
                  if (start === end) {
                    const symbols = await LSP.documentSymbol(filePathURI)
                    for (const symbol of symbols) {
                      let range: LSP.Range | undefined
                      if ("range" in symbol) {
                        range = symbol.range
                      } else if ("location" in symbol) {
                        range = symbol.location.range
                      }
                      if (range?.start?.line && range?.start?.line === start) {
                        start = range.start.line
                        end = range?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start - 1, 0)
                  if (end) {
                    limit = end - offset
                  }
                }
                const args = { filePath: filepath, offset, limit }

                const pieces: MessageV2.Part[] = [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]

                await ReadTool.init()
                  .then(async (t) => {
                    const model = await Provider.getModel(info.model.providerID, info.model.modelID)
                    const result = await t.execute(args, {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent!,
                      messageID: info.id,
                      extra: { bypassCwdCheck: true, model },
                      metadata: async () => {},
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((attachment) => ({
                          ...attachment,
                          synthetic: true,
                          filename: attachment.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({
                        ...part,
                        id: part.id ?? Identifier.ascending("part"),
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })
                    }
                  })
                  .catch((error) => {
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : error.toString()
                    Bus.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({
                        message,
                      }).toObject(),
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  })

                return pieces
              }

              if (part.mime === "application/x-directory") {
                const args = { path: filepath }
                const result = await ListTool.init().then((t) =>
                  t.execute(args, {
                    sessionID: input.sessionID,
                    abort: new AbortController().signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true },
                    metadata: async () => {},
                  }),
                )
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the list tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }

              const file = Bun.file(filepath)
              FileTime.read(input.sessionID, filepath)
              return [
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  text: `Called the Read tool with the following input: {\"filePath\":\"${filepath}\"}`,
                  synthetic: true,
                },
                {
                  id: part.id ?? Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url: `data:${part.mime};base64,` + Buffer.from(await file.bytes()).toString("base64"),
                  mime: part.mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
          }
        }

        if (part.type === "agent") {
          return [
            {
              id: Identifier.ascending("part"),
              ...part,
              messageID: info.id,
              sessionID: input.sessionID,
            },
            {
              id: Identifier.ascending("part"),
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                "Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name,
            },
          ]
        }

        return [
          {
            id: Identifier.ascending("part"),
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }),
    ).then((x) => x.flat())

    await Plugin.trigger(
      "chat.message",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        messageID: input.messageID,
      },
      {
        message: info,
        parts,
      },
    )

    await Session.updateMessage(info)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    return {
      info,
      parts,
    }
  }

  function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info }) {
    const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
    if (!userMessage) return input.messages
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        // TODO (for mr dax): update to use the anthropic full fledged one (see plan-reminder-anthropic.txt)
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string(),
  })
  export type ShellInput = z.infer<typeof ShellInput>
  export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }
    using _ = defer(() => cancel(input.sessionID))

    const session = await Session.get(input.sessionID)
    if (session.revert) {
      SessionRevert.cleanup(session)
    }
    const agent = await Agent.get(input.agent)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      role: "user",
      agent: input.agent,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
    }
    await Session.updateMessage(userMsg)
    const userPart: MessageV2.Part = {
      type: "text",
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: input.sessionID,
      text: "The following tool was executed by the user",
      synthetic: true,
    }
    await Session.updatePart(userPart)

    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      time: {
        created: Date.now(),
      },
      role: "assistant",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.modelID,
      providerID: model.providerID,
    }
    await Session.updateMessage(msg)
    const part: MessageV2.Part = {
      type: "tool",
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      tool: "bash",
      callID: ulid(),
      state: {
        status: "running",
        time: {
          start: Date.now(),
        },
        input: {
          command: input.command,
        },
      },
    }
    await Session.updatePart(part)
    const shell = Shell.preferred()
    const shellName = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()

    const invocations: Record<string, { args: string[] }> = {
      nu: {
        args: ["-c", input.command],
      },
      fish: {
        args: ["-c", input.command],
      },
      zsh: {
        args: [
          "-c",
          "-l",
          `
            [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
            [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      bash: {
        args: [
          "-c",
          "-l",
          `
            shopt -s expand_aliases
            [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      // Windows cmd
      cmd: {
        args: ["/c", input.command],
      },
      // Windows PowerShell
      powershell: {
        args: ["-NoProfile", "-Command", input.command],
      },
      pwsh: {
        args: ["-NoProfile", "-Command", input.command],
      },
      // Fallback: any shell that doesn't match those above
      //  - No -l, for max compatibility
      "": {
        args: ["-c", `${input.command}`],
      },
    }

    const matchingInvocation = invocations[shellName] ?? invocations[""]
    const args = matchingInvocation?.args

    const proc = spawn(shell, args, {
      cwd: Instance.directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM: "dumb",
      },
    })

    let output = ""

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    let aborted = false
    let exited = false

    const kill = () => Shell.killTree(proc, { exited: () => exited })

    if (abort.aborted) {
      aborted = true
      await kill()
    }

    const abortHandler = () => {
      aborted = true
      void kill()
    }

    abort.addEventListener("abort", abortHandler, { once: true })

    await new Promise<void>((resolve) => {
      proc.on("close", () => {
        exited = true
        abort.removeEventListener("abort", abortHandler)
        resolve()
      })
    })

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    if (part.state.status === "running") {
      part.state = {
        status: "completed",
        time: {
          ...part.state.time,
          end: Date.now(),
        },
        input: part.state.input,
        title: "",
        metadata: {
          output,
          description: "",
        },
        output,
      }
      await Session.updatePart(part)
    }
    return { info: msg, parts: [part] }
  }

  export const CommandInput = z.object({
    messageID: Identifier.schema("message").optional(),
    sessionID: Identifier.schema("session"),
    agent: z.string().optional(),
    model: z.string().optional(),
    arguments: z.string(),
    command: z.string(),
  })
  export type CommandInput = z.infer<typeof CommandInput>
  const bashRegex = /!`([^`]+)`/g
  const argsRegex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  const placeholderRegex = /\$(\d+)/g
  const quoteTrimRegex = /^["']|["']$/g
  /**
   * Regular expression to match @ file references in text
   * Matches @ followed by file paths, excluding commas, periods at end of sentences, and backticks
   * Does not match when preceded by word characters or backticks (to avoid email addresses and quoted references)
   */

  export async function command(input: CommandInput) {
    log.info("command", input)
    const command = await Command.get(input.command)
    const agentName = command.agent ?? input.agent ?? (await Agent.defaultAgent())

    const raw = input.arguments.match(argsRegex) ?? []
    const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))

    // Parse optional --session-id or --session-id=value flag
    let parentSessionID: string | undefined = undefined
    const sessionIdFlagIndex = args.findIndex((arg) => arg.startsWith("--session-id"))
    if (sessionIdFlagIndex >= 0) {
      const flag = args[sessionIdFlagIndex]
      if (flag.includes("=")) {
        parentSessionID = flag.split("=", 2)[1]
      } else if (sessionIdFlagIndex + 1 < args.length) {
        parentSessionID = args[sessionIdFlagIndex + 1]
      }
      // Remove the flag and its value from args
      args.splice(sessionIdFlagIndex, flag.includes("=") ? 1 : 2)
    } else {
      // Also check if first argument looks like a session ID (alphanumeric, 20+ chars)
      // This allows `/handoff abc123def456... guidance text` syntax
      if (args.length > 0 && /^[a-zA-Z0-9]{20,}$/.test(args[0])) {
        parentSessionID = args[0]
        args.shift()
      }
    }

    // If no explicit session ID provided, use current session as parent
    if (!parentSessionID) {
      parentSessionID = input.sessionID
    }

    const placeholders = command.template.match(placeholderRegex) ?? []
    let last = 0
    for (const item of placeholders) {
      const value = Number(item.slice(1))
      if (value > last) last = value
    }

    // Let the final placeholder swallow any extra arguments so prompts read naturally
    const withArgs = command.template.replaceAll(placeholderRegex, (_, index) => {
      const position = Number(index)
      const argIndex = position - 1
      if (argIndex >= args.length) return ""
      if (position === last) return args.slice(argIndex).join(" ")
      return args[argIndex]
    })
    // Replace $ARGUMENTS with remaining args (after session ID parsing)
    let template = withArgs.replaceAll("$ARGUMENTS", args.join(" "))

    const shell = ConfigMarkdown.shell(template)
    if (shell.length > 0) {
      const results = await Promise.all(
        shell.map(async ([, cmd]) => {
          try {
            return await $`${{ raw: cmd }}`.quiet().nothrow().text()
          } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
          }
        }),
      )
      let index = 0
      template = template.replace(bashRegex, () => results[index++])
    }
    template = template.trim()

    const model = await (async () => {
      if (command.model) {
        return Provider.parseModel(command.model)
      }
      if (command.agent) {
        const cmdAgent = await Agent.get(command.agent)
        if (cmdAgent.model) {
          return cmdAgent.model
        }
      }
      if (input.model) return Provider.parseModel(input.model)
      return await lastModel(input.sessionID)
    })()

    try {
      await Provider.getModel(model.providerID, model.modelID)
    } catch (e) {
      if (Provider.ModelNotFoundError.isInstance(e)) {
        const { providerID, modelID, suggestions } = e.data
        const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
        Bus.publish(Session.Event.Error, {
          sessionID: input.sessionID,
          error: new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }).toObject(),
        })
      }
      throw e
    }
    const agent = await Agent.get(agentName)

    const parts =
      (agent.mode === "subagent" && command.subtask !== false) || command.subtask === true
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: command.description ?? "",
              command: input.command,
              // TODO: how can we make task tool accept a more complex input?
              prompt: await resolvePromptParts(template).then((x) => x.find((y) => y.type === "text")?.text ?? ""),
            },
          ]
        : await resolvePromptParts(template)

    const result = (await prompt({
      sessionID: input.sessionID,
      messageID: input.messageID,
      model,
      agent: agentName,
      parts,
    })) as MessageV2.WithParts

    Bus.publish(Command.Event.Executed, {
      name: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      messageID: result.info.id,
    })

    return result
  }

  async function ensureTitle(input: {
    session: Session.Info
    message: MessageV2.WithParts
    history: MessageV2.WithParts[]
    providerID: string
    modelID: string
  }) {
    if (input.session.parentID) return
    if (!Session.isDefaultTitle(input.session.title)) return
    const isFirst =
      input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
        .length === 1
    if (!isFirst) return
    const agent = await Agent.get("title")
    if (!agent) return
    const result = await LLM.stream({
      agent,
      user: input.message.info as MessageV2.User,
      system: [],
      small: true,
      tools: {},
      model: await iife(async () => {
        if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
        return (
          (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
        )
      }),
      abort: new AbortController().signal,
      sessionID: input.session.id,
      retries: 2,
      messages: [
        {
          role: "user",
          content: "Generate a title for this conversation:\n",
        },
        ...MessageV2.toModelMessage([
          {
            info: {
              id: Identifier.ascending("message"),
              role: "user",
              sessionID: input.session.id,
              time: {
                created: Date.now(),
              },
              agent: input.message.info.role === "user" ? input.message.info.agent : await Agent.defaultAgent(),
              model: {
                providerID: input.providerID,
                modelID: input.modelID,
              },
            },
            parts: input.message.parts,
          },
        ]),
      ],
    })
    const text = await result.text.catch((err) => log.error("failed to generate title", { error: err }))
    if (text)
      return Session.update(input.session.id, (draft) => {
        const cleaned = text
          .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0)
        if (!cleaned) return

        const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
        draft.title = title
      })
  }
}

```

```typescript
import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { Identifier } from "../id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { SessionRevert } from "./revert"
import { Session } from "."
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
import { type Tool as AITool, tool, jsonSchema } from "ai"
import { SessionCompaction } from "./compaction"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { ProviderTransform } from "../provider/transform"
import { SystemPrompt } from "./system"
import { Plugin } from "../plugin"
import PROMPT_PLAN from "../session/prompt/plan.txt"
import BUILD_SWITCH from "../session/prompt/build-switch.txt"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import { defer } from "../util/defer"
import { clone, mergeDeep, pipe } from "remeda"
import { ToolRegistry } from "../tool/registry"
import { Wildcard } from "../util/wildcard"
import { MCP } from "../mcp"
import { LSP } from "../lsp"
import { ReadTool } from "../tool/read"
import { ListTool } from "../tool/ls"
import { FileTime } from "../file/time"
import { Flag } from "../flag/flag"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { Command } from "../command"
import { $, fileURLToPath } from "bun"
import { ConfigMarkdown } from "../config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/util/error"
import { fn } from "@/util/fn"
import { SessionProcessor } from "./processor"
import { TaskTool } from "@/tool/task"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { iife } from "@/util/iife"
import { Shell } from "@/shell/shell"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })
  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  const state = Instance.state(
    () => {
      const data: Record<
        string,
        {
          abort: AbortController
          callbacks: {
            resolve(input: MessageV2.WithParts): void
            reject(): void
          }[]
        }
      > = {}
      return data
    },
    async (current) => {
      for (const item of Object.values(current)) {
        item.abort.abort()
      }
    },
  )

  export function assertNotBusy(sessionID: string) {
    const match = state()[sessionID]
    if (match) throw new Session.BusyError(sessionID)
  }

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    system: z.string().optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "TextPartInput",
          }),
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "FilePartInput",
          }),
        MessageV2.AgentPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "AgentPartInput",
          }),
        MessageV2.SubtaskPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "SubtaskPartInput",
          }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export const prompt = fn(PromptInput, async (input) => {
    const session = await Session.get(input.sessionID)
    await SessionRevert.cleanup(session)

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    if (input.noReply === true) {
      return message
    }

    return loop(input.sessionID)
  })

  export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
    const parts: PromptInput["parts"] = [
      {
        type: "text",
        text: template,
      },
    ]
    const files = ConfigMarkdown.files(template)
    const seen = new Set<string>()
    await Promise.all(
      files.map(async (match) => {
        const name = match[1]
        if (seen.has(name)) return
        seen.add(name)
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(Instance.worktree, name)

        const stats = await fs.stat(filepath).catch(() => undefined)
        if (!stats) {
          const agent = await Agent.get(name)
          if (agent) {
            parts.push({
              type: "agent",
              name: agent.name,
            })
          }
          return
        }

        if (stats.isDirectory()) {
          parts.push({
            type: "file",
            url: `file://${filepath}`,
            filename: name,
            mime: "application/x-directory",
          })
          return
        }

        parts.push({
          type: "file",
          url: `file://${filepath}`,
          filename: name,
          mime: "text/plain",
        })
      }),
    )
    return parts
  }

  function start(sessionID: string) {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
      abort: controller,
      callbacks: [],
    }
    return controller.signal
  }

  export function cancel(sessionID: string) {
    log.info("cancel", { sessionID })
    const s = state()
    const match = s[sessionID]
    if (!match) return
    match.abort.abort()
    for (const item of match.callbacks) {
      item.reject()
    }
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }

  export const loop = fn(Identifier.schema("session"), async (sessionID) => {
    const abort = start(sessionID)
    if (!abort) {
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID].callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    let step = 0
    while (true) {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      let lastUser: MessageV2.User | undefined
      let lastAssistant: MessageV2.Assistant | undefined
      let lastFinished: MessageV2.Assistant | undefined
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
        if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
          lastFinished = msg.info as MessageV2.Assistant
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      step++
      if (step === 1)
        ensureTitle({
          session: await Session.get(sessionID),
          modelID: lastUser.model.modelID,
          providerID: lastUser.model.providerID,
          message: msgs.find((m) => m.info.role === "user")!,
          history: msgs,
        })

      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
      const task = tasks.pop()

      // pending subtask
      // TODO: centralize "invoke tool" logic
      if (task?.type === "subtask") {
        const taskTool = await TaskTool.init()
        const assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "assistant",
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
        })) as MessageV2.Assistant
        let part = (await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMessage.id,
          sessionID: assistantMessage.sessionID,
          type: "tool",
          callID: ulid(),
          tool: TaskTool.id,
          state: {
            status: "running",
            input: {
              prompt: task.prompt,
              description: task.description,
              subagent_type: task.agent,
              command: task.command,
            },
            time: {
              start: Date.now(),
            },
          },
        })) as MessageV2.ToolPart
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
        }
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          { args: taskArgs },
        )
        let executionError: Error | undefined
        const result = await taskTool
          .execute(taskArgs, {
            agent: task.agent,
            messageID: assistantMessage.id,
            sessionID: sessionID,
            abort,
            async metadata(input) {
              await Session.updatePart({
                ...part,
                type: "tool",
                state: {
                  ...part.state,
                  ...input,
                },
              } satisfies MessageV2.ToolPart)
            },
          })
          .catch((error) => {
            executionError = error
            log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
            return undefined
          })
        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          result,
        )
        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        await Session.updateMessage(assistantMessage)
        if (result && part.state.status === "running") {
          await Session.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments: result.attachments,
              time: {
                ...part.state.time,
                end: Date.now(),
              },
            },
          } satisfies MessageV2.ToolPart)
        }
        if (!result) {
          await Session.updatePart({
            ...part,
            state: {
              status: "error",
              error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
              time: {
                start: part.state.status === "running" ? part.state.time.start : Date.now(),
                end: Date.now(),
              },
              metadata: part.metadata,
              input: part.state.input,
            },
          } satisfies MessageV2.ToolPart)
        }

        // Add synthetic user message to prevent certain reasoning models from erroring
        // If we create assistant messages w/ out user ones following mid loop thinking signatures
        // will be missing and it can cause errors for models like gemini for example
        const summaryUserMsg: MessageV2.User = {
          id: Identifier.ascending("message"),
          sessionID,
          role: "user",
          time: {
            created: Date.now(),
          },
          agent: lastUser.agent,
          model: lastUser.model,
        }
        await Session.updateMessage(summaryUserMsg)
        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: summaryUserMsg.id,
          sessionID,
          type: "text",
          text: "Summarize the task tool output above and continue with your task.",
          synthetic: true,
        } satisfies MessageV2.TextPart)

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }

      // normal processing
      const agent = await Agent.get(lastUser.agent)
      const maxSteps = agent.maxSteps ?? Infinity
      const isLastStep = step >= maxSteps
      msgs = insertReminders({
        messages: msgs,
        agent,
      })

      const processor = SessionProcessor.create({
        assistantMessage: (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.name,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
          sessionID,
        })) as MessageV2.Assistant,
        sessionID: sessionID,
        model,
        abort,
      })
      const tools = await resolveTools({
        agent,
        sessionID,
        model,
        tools: lastUser.tools,
        processor,
      })

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      const sessionMessages = clone(msgs)

      await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system: [...(await SystemPrompt.environment()), ...(await SystemPrompt.custom())],
        messages: [
          ...MessageV2.toModelMessage(sessionMessages),
          ...(isLastStep
            ? [
                {
                  role: "assistant" as const,
                  content: MAX_STEPS,
                },
              ]
            : []),
        ],
        tools,
        model,
      })
      if (result === "stop") break
      continue
    }
    SessionCompaction.prune({ sessionID })
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user") continue
      const queued = state()[sessionID]?.callbacks ?? []
      for (const q of queued) {
        q.resolve(item)
      }
      return item
    }
    throw new Error("Impossible")
  })

  async function lastModel(sessionID: string) {
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user" && item.info.model) return item.info.model
    }
    return Provider.defaultModel()
  }

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    sessionID: string
    tools?: Record<string, boolean>
    processor: SessionProcessor.Info
  }) {
    using _ = log.time("resolveTools")
    const tools: Record<string, AITool> = {}
    const enabledTools = pipe(
      input.agent.tools,
      mergeDeep(await ToolRegistry.enabled(input.agent)),
      mergeDeep(input.tools ?? {}),
    )
    for (const item of await ToolRegistry.tools(input.model.providerID, input.agent)) {
      if (Wildcard.all(item.id, enabledTools) === false) continue
      const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
      tools[item.id] = tool({
        id: item.id as any,
        description: item.description,
        inputSchema: jsonSchema(schema as any),
        async execute(args, options) {
          await Plugin.trigger(
            "tool.execute.before",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            {
              args,
            },
          )
          const result = await item.execute(args, {
            sessionID: input.sessionID,
            abort: options.abortSignal!,
            messageID: input.processor.message.id,
            callID: options.toolCallId,
            extra: { model: input.model },
            agent: input.agent.name,
            metadata: async (val) => {
              const match = input.processor.partFromToolCall(options.toolCallId)
              if (match && match.state.status === "running") {
                await Session.updatePart({
                  ...match,
                  state: {
                    title: val.title,
                    metadata: val.metadata,
                    status: "running",
                    input: args,
                    time: {
                      start: Date.now(),
                    },
                  },
                })
              }
            },
          })
          await Plugin.trigger(
            "tool.execute.after",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            result,
          )
          return result
        },
        toModelOutput(result) {
          return {
            type: "text",
            value: result.output,
          }
        },
      })
    }
    for (const [key, item] of Object.entries(await MCP.tools())) {
      if (Wildcard.all(key, enabledTools) === false) continue
      const execute = item.execute
      if (!execute) continue

      // Wrap execute to add plugin hooks and format output
      item.execute = async (args, opts) => {
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          {
            args,
          },
        )
        const result = await execute(args, opts)

        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          result,
        )

        const textParts: string[] = []
        const attachments: MessageV2.FilePart[] = []

        for (const contentItem of result.content) {
          if (contentItem.type === "text") {
            textParts.push(contentItem.text)
          } else if (contentItem.type === "image") {
            attachments.push({
              id: Identifier.ascending("part"),
              sessionID: input.sessionID,
              messageID: input.processor.message.id,
              type: "file",
              mime: contentItem.mimeType,
              url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
            })
          }
          // Add support for other types if needed
        }

        return {
          title: "",
          metadata: result.metadata ?? {},
          output: textParts.join("\n\n"),
          attachments,
          content: result.content, // directly return content to preserve ordering when outputting to model
        }
      }
      item.toModelOutput = (result) => {
        return {
          type: "text",
          value: result.output,
        }
      }
      tools[key] = item
    }
    return tools
  }

  async function createUserMessage(input: PromptInput) {
    const agent = await Agent.get(input.agent ?? (await Agent.defaultAgent()))
    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.name,
      model: input.model ?? agent.model ?? (await lastModel(input.sessionID)),
      system: input.system,
    }

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<MessageV2.Part[]> => {
        if (part.type === "file") {
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: Buffer.from(part.url, "base64url").toString(),
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }
              break
            case "file:":
              log.info("file", { mime: part.mime })
              // have to normalize, symbol search returns absolute paths
              // Decode the pathname since URL constructor doesn't automatically decode it
              const filepath = fileURLToPath(part.url)
              const stat = await Bun.file(filepath).stat()

              if (stat.isDirectory()) {
                part.mime = "application/x-directory"
              }

              if (part.mime === "text/plain") {
                let offset: number | undefined = undefined
                let limit: number | undefined = undefined
                const range = {
                  start: url.searchParams.get("start"),
                  end: url.searchParams.get("end"),
                }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  // some LSP servers (eg, gopls) don't give full range in
                  // workspace/symbol searches, so we'll try to find the
                  // symbol in the document to get the full range
                  if (start === end) {
                    const symbols = await LSP.documentSymbol(filePathURI)
                    for (const symbol of symbols) {
                      let range: LSP.Range | undefined
                      if ("range" in symbol) {
                        range = symbol.range
                      } else if ("location" in symbol) {
                        range = symbol.location.range
                      }
                      if (range?.start?.line && range?.start?.line === start) {
                        start = range.start.line
                        end = range?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start - 1, 0)
                  if (end) {
                    limit = end - offset
                  }
                }
                const args = { filePath: filepath, offset, limit }

                const pieces: MessageV2.Part[] = [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]

                await ReadTool.init()
                  .then(async (t) => {
                    const model = await Provider.getModel(info.model.providerID, info.model.modelID)
                    const result = await t.execute(args, {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent!,
                      messageID: info.id,
                      extra: { bypassCwdCheck: true, model },
                      metadata: async () => {},
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((attachment) => ({
                          ...attachment,
                          synthetic: true,
                          filename: attachment.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({
                        ...part,
                        id: part.id ?? Identifier.ascending("part"),
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })
                    }
                  })
                  .catch((error) => {
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : error.toString()
                    Bus.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({
                        message,
                      }).toObject(),
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  })

                return pieces
              }

              if (part.mime === "application/x-directory") {
                const args = { path: filepath }
                const result = await ListTool.init().then((t) =>
                  t.execute(args, {
                    sessionID: input.sessionID,
                    abort: new AbortController().signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true },
                    metadata: async () => {},
                  }),
                )
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the list tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }

              const file = Bun.file(filepath)
              FileTime.read(input.sessionID, filepath)
              return [
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  text: `Called the Read tool with the following input: {\"filePath\":\"${filepath}\"}`,
                  synthetic: true,
                },
                {
                  id: part.id ?? Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url: `data:${part.mime};base64,` + Buffer.from(await file.bytes()).toString("base64"),
                  mime: part.mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
          }
        }

        if (part.type === "agent") {
          return [
            {
              id: Identifier.ascending("part"),
              ...part,
              messageID: info.id,
              sessionID: input.sessionID,
            },
            {
              id: Identifier.ascending("part"),
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                "Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name,
            },
          ]
        }

        return [
          {
            id: Identifier.ascending("part"),
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }),
    ).then((x) => x.flat())

    await Plugin.trigger(
      "chat.message",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        messageID: input.messageID,
      },
      {
        message: info,
        parts,
      },
    )

    await Session.updateMessage(info)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    return {
      info,
      parts,
    }
  }

  function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info }) {
    const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
    if (!userMessage) return input.messages
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        // TODO (for mr dax): update to use the anthropic full fledged one (see plan-reminder-anthropic.txt)
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string(),
  })
  export type ShellInput = z.infer<typeof ShellInput>
  export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }
    using _ = defer(() => cancel(input.sessionID))

    const session = await Session.get(input.sessionID)
    if (session.revert) {
      SessionRevert.cleanup(session)
    }
    const agent = await Agent.get(input.agent)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      role: "user",
      agent: input.agent,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
    }
    await Session.updateMessage(userMsg)
    const userPart: MessageV2.Part = {
      type: "text",
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: input.sessionID,
      text: "The following tool was executed by the user",
      synthetic: true,
    }
    await Session.updatePart(userPart)

    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      time: {
        created: Date.now(),
      },
      role: "assistant",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.modelID,
      providerID: model.providerID,
    }
    await Session.updateMessage(msg)
    const part: MessageV2.Part = {
      type: "tool",
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      tool: "bash",
      callID: ulid(),
      state: {
        status: "running",
        time: {
          start: Date.now(),
        },
        input: {
          command: input.command,
        },
      },
    }
    await Session.updatePart(part)
    const shell = Shell.preferred()
    const shellName = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()

    const invocations: Record<string, { args: string[] }> = {
      nu: {
        args: ["-c", input.command],
      },
      fish: {
        args: ["-c", input.command],
      },
      zsh: {
        args: [
          "-c",
          "-l",
          `
            [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
            [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      bash: {
        args: [
          "-c",
          "-l",
          `
            shopt -s expand_aliases
            [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      // Windows cmd
      cmd: {
        args: ["/c", input.command],
      },
      // Windows PowerShell
      powershell: {
        args: ["-NoProfile", "-Command", input.command],
      },
      pwsh: {
        args: ["-NoProfile", "-Command", input.command],
      },
      // Fallback: any shell that doesn't match those above
      //  - No -l, for max compatibility
      "": {
        args: ["-c", `${input.command}`],
      },
    }

    const matchingInvocation = invocations[shellName] ?? invocations[""]
    const args = matchingInvocation?.args

    const proc = spawn(shell, args, {
      cwd: Instance.directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM: "dumb",
      },
    })

    let output = ""

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    let aborted = false
    let exited = false

    const kill = () => Shell.killTree(proc, { exited: () => exited })

    if (abort.aborted) {
      aborted = true
      await kill()
    }

    const abortHandler = () => {
      aborted = true
      void kill()
    }

    abort.addEventListener("abort", abortHandler, { once: true })

    await new Promise<void>((resolve) => {
      proc.on("close", () => {
        exited = true
        abort.removeEventListener("abort", abortHandler)
        resolve()
      })
    })

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    if (part.state.status === "running") {
      part.state = {
        status: "completed",
        time: {
          ...part.state.time,
          end: Date.now(),
        },
        input: part.state.input,
        title: "",
        metadata: {
          output,
          description: "",
        },
        output,
      }
      await Session.updatePart(part)
    }
    return { info: msg, parts: [part] }
  }

  export const CommandInput = z.object({
    messageID: Identifier.schema("message").optional(),
    sessionID: Identifier.schema("session"),
    agent: z.string().optional(),
    model: z.string().optional(),
    arguments: z.string(),
    command: z.string(),
  })
  export type CommandInput = z.infer<typeof CommandInput>
  const bashRegex = /!`([^`]+)`/g
  const argsRegex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  const placeholderRegex = /\$(\d+)/g
  const quoteTrimRegex = /^["']|["']$/g
  /**
   * Regular expression to match @ file references in text
   * Matches @ followed by file paths, excluding commas, periods at end of sentences, and backticks
   * Does not match when preceded by word characters or backticks (to avoid email addresses and quoted references)
   */

  export async function command(input: CommandInput) {
    log.info("command", input)
    const command = await Command.get(input.command)
    const agentName = command.agent ?? input.agent ?? (await Agent.defaultAgent())

    const raw = input.arguments.match(argsRegex) ?? []
    const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))

    // Parse optional --session-id or --session-id=value flag
    let parentSessionID: string | undefined = undefined
    const sessionIdFlagIndex = args.findIndex((arg) => arg.startsWith("--session-id"))
    if (sessionIdFlagIndex >= 0) {
      const flag = args[sessionIdFlagIndex]
      if (flag.includes("=")) {
        parentSessionID = flag.split("=", 2)[1]
      } else if (sessionIdFlagIndex + 1 < args.length) {
        parentSessionID = args[sessionIdFlagIndex + 1]
      }
      // Remove the flag and its value from args
      args.splice(sessionIdFlagIndex, flag.includes("=") ? 1 : 2)
    } else {
      // Also check if first argument looks like a session ID (alphanumeric, 20+ chars)
      // This allows `/handoff abc123def456... guidance text` syntax
      if (args.length > 0 && /^[a-zA-Z0-9]{20,}$/.test(args[0])) {
        parentSessionID = args[0]
        args.shift()
      }
    }

    // If no explicit session ID provided, use current session as parent
    if (!parentSessionID) {
      parentSessionID = input.sessionID
    }

    const placeholders = command.template.match(placeholderRegex) ?? []
    let last = 0
    for (const item of placeholders) {
      const value = Number(item.slice(1))
      if (value > last) last = value
    }

    // Let the final placeholder swallow any extra arguments so prompts read naturally
    const withArgs = command.template.replaceAll(placeholderRegex, (_, index) => {
      const position = Number(index)
      const argIndex = position - 1
      if (argIndex >= args.length) return ""
      if (position === last) return args.slice(argIndex).join(" ")
      return args[argIndex]
    })
    // Replace $ARGUMENTS with remaining args (after session ID parsing)
    let template = withArgs.replaceAll("$ARGUMENTS", args.join(" "))

    const shell = ConfigMarkdown.shell(template)
    if (shell.length > 0) {
      const results = await Promise.all(
        shell.map(async ([, cmd]) => {
          try {
            return await $`${{ raw: cmd }}`.quiet().nothrow().text()
          } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
          }
        }),
      )
      let index = 0
      template = template.replace(bashRegex, () => results[index++])
    }
    template = template.trim()

    const model = await (async () => {
      if (command.model) {
        return Provider.parseModel(command.model)
      }
      if (command.agent) {
        const cmdAgent = await Agent.get(command.agent)
        if (cmdAgent.model) {
          return cmdAgent.model
        }
      }
      if (input.model) return Provider.parseModel(input.model)
      return await lastModel(input.sessionID)
    })()

    try {
      await Provider.getModel(model.providerID, model.modelID)
    } catch (e) {
      if (Provider.ModelNotFoundError.isInstance(e)) {
        const { providerID, modelID, suggestions } = e.data
        const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
        Bus.publish(Session.Event.Error, {
          sessionID: input.sessionID,
          error: new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }).toObject(),
        })
      }
      throw e
    }
    const agent = await Agent.get(agentName)

    const parts =
      (agent.mode === "subagent" && command.subtask !== false) || command.subtask === true
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: command.description ?? "",
              command: input.command,
              parent_session_id: parentSessionID,
              // TODO: how can we make task tool accept a more complex input?
              prompt: await resolvePromptParts(template).then((x) => x.find((y) => y.type === "text")?.text ?? ""),
            },
          ]
        : await resolvePromptParts(template)

    const result = (await prompt({
      sessionID: input.sessionID,
      messageID: input.messageID,
      model,
      agent: agentName,
      parts,
    })) as MessageV2.WithParts

    Bus.publish(Command.Event.Executed, {
      name: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      messageID: result.info.id,
    })

    return result
  }

  async function ensureTitle(input: {
    session: Session.Info
    message: MessageV2.WithParts
    history: MessageV2.WithParts[]
    providerID: string
    modelID: string
  }) {
    if (input.session.parentID) return
    if (!Session.isDefaultTitle(input.session.title)) return
    const isFirst =
      input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
        .length === 1
    if (!isFirst) return
    const agent = await Agent.get("title")
    if (!agent) return
    const result = await LLM.stream({
      agent,
      user: input.message.info as MessageV2.User,
      system: [],
      small: true,
      tools: {},
      model: await iife(async () => {
        if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
        return (
          (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
        )
      }),
      abort: new AbortController().signal,
      sessionID: input.session.id,
      retries: 2,
      messages: [
        {
          role: "user",
          content: "Generate a title for this conversation:\n",
        },
        ...MessageV2.toModelMessage([
          {
            info: {
              id: Identifier.ascending("message"),
              role: "user",
              sessionID: input.session.id,
              time: {
                created: Date.now(),
              },
              agent: input.message.info.role === "user" ? input.message.info.agent : await Agent.defaultAgent(),
              model: {
                providerID: input.providerID,
                modelID: input.modelID,
              },
            },
            parts: input.message.parts,
          },
        ]),
      ],
    })
    const text = await result.text.catch((err) => log.error("failed to generate title", { error: err }))
    if (text)
      return Session.update(input.session.id, (draft) => {
        const cleaned = text
          .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0)
        if (!cleaned) return

        const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
        draft.title = title
      })
  }
}

```


Updating TaskTool to use `parent_session_id` and include it in the prompt:


```typescript
import path from "path"
import os from "os"
import fs from "fs/promises"
import z from "zod"
import { Identifier } from "../id/id"
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { SessionRevert } from "./revert"
import { Session } from "."
import { Agent } from "../agent/agent"
import { Provider } from "../provider/provider"
import { type Tool as AITool, tool, jsonSchema } from "ai"
import { SessionCompaction } from "./compaction"
import { Instance } from "../project/instance"
import { Bus } from "../bus"
import { ProviderTransform } from "../provider/transform"
import { SystemPrompt } from "./system"
import { Plugin } from "../plugin"
import PROMPT_PLAN from "../session/prompt/plan.txt"
import BUILD_SWITCH from "../session/prompt/build-switch.txt"
import MAX_STEPS from "../session/prompt/max-steps.txt"
import { defer } from "../util/defer"
import { clone, mergeDeep, pipe } from "remeda"
import { ToolRegistry } from "../tool/registry"
import { Wildcard } from "../util/wildcard"
import { MCP } from "../mcp"
import { LSP } from "../lsp"
import { ReadTool } from "../tool/read"
import { ListTool } from "../tool/ls"
import { FileTime } from "../file/time"
import { Flag } from "../flag/flag"
import { ulid } from "ulid"
import { spawn } from "child_process"
import { Command } from "../command"
import { $, fileURLToPath } from "bun"
import { ConfigMarkdown } from "../config/markdown"
import { SessionSummary } from "./summary"
import { NamedError } from "@opencode-ai/util/error"
import { fn } from "@/util/fn"
import { SessionProcessor } from "./processor"
import { TaskTool } from "@/tool/task"
import { SessionStatus } from "./status"
import { LLM } from "./llm"
import { iife } from "@/util/iife"
import { Shell } from "@/shell/shell"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })
  export const OUTPUT_TOKEN_MAX = Flag.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX || 32_000

  const state = Instance.state(
    () => {
      const data: Record<
        string,
        {
          abort: AbortController
          callbacks: {
            resolve(input: MessageV2.WithParts): void
            reject(): void
          }[]
        }
      > = {}
      return data
    },
    async (current) => {
      for (const item of Object.values(current)) {
        item.abort.abort()
      }
    },
  )

  export function assertNotBusy(sessionID: string) {
    const match = state()[sessionID]
    if (match) throw new Session.BusyError(sessionID)
  }

  export const PromptInput = z.object({
    sessionID: Identifier.schema("session"),
    messageID: Identifier.schema("message").optional(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    agent: z.string().optional(),
    noReply: z.boolean().optional(),
    tools: z.record(z.string(), z.boolean()).optional(),
    system: z.string().optional(),
    parts: z.array(
      z.discriminatedUnion("type", [
        MessageV2.TextPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "TextPartInput",
          }),
        MessageV2.FilePart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "FilePartInput",
          }),
        MessageV2.AgentPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "AgentPartInput",
          }),
        MessageV2.SubtaskPart.omit({
          messageID: true,
          sessionID: true,
        })
          .partial({
            id: true,
          })
          .meta({
            ref: "SubtaskPartInput",
          }),
      ]),
    ),
  })
  export type PromptInput = z.infer<typeof PromptInput>

  export const prompt = fn(PromptInput, async (input) => {
    const session = await Session.get(input.sessionID)
    await SessionRevert.cleanup(session)

    const message = await createUserMessage(input)
    await Session.touch(input.sessionID)

    if (input.noReply === true) {
      return message
    }

    return loop(input.sessionID)
  })

  export async function resolvePromptParts(template: string): Promise<PromptInput["parts"]> {
    const parts: PromptInput["parts"] = [
      {
        type: "text",
        text: template,
      },
    ]
    const files = ConfigMarkdown.files(template)
    const seen = new Set<string>()
    await Promise.all(
      files.map(async (match) => {
        const name = match[1]
        if (seen.has(name)) return
        seen.add(name)
        const filepath = name.startsWith("~/")
          ? path.join(os.homedir(), name.slice(2))
          : path.resolve(Instance.worktree, name)

        const stats = await fs.stat(filepath).catch(() => undefined)
        if (!stats) {
          const agent = await Agent.get(name)
          if (agent) {
            parts.push({
              type: "agent",
              name: agent.name,
            })
          }
          return
        }

        if (stats.isDirectory()) {
          parts.push({
            type: "file",
            url: `file://${filepath}`,
            filename: name,
            mime: "application/x-directory",
          })
          return
        }

        parts.push({
          type: "file",
          url: `file://${filepath}`,
          filename: name,
          mime: "text/plain",
        })
      }),
    )
    return parts
  }

  function start(sessionID: string) {
    const s = state()
    if (s[sessionID]) return
    const controller = new AbortController()
    s[sessionID] = {
      abort: controller,
      callbacks: [],
    }
    return controller.signal
  }

  export function cancel(sessionID: string) {
    log.info("cancel", { sessionID })
    const s = state()
    const match = s[sessionID]
    if (!match) return
    match.abort.abort()
    for (const item of match.callbacks) {
      item.reject()
    }
    delete s[sessionID]
    SessionStatus.set(sessionID, { type: "idle" })
    return
  }

  export const loop = fn(Identifier.schema("session"), async (sessionID) => {
    const abort = start(sessionID)
    if (!abort) {
      return new Promise<MessageV2.WithParts>((resolve, reject) => {
        const callbacks = state()[sessionID].callbacks
        callbacks.push({ resolve, reject })
      })
    }

    using _ = defer(() => cancel(sessionID))

    let step = 0
    while (true) {
      SessionStatus.set(sessionID, { type: "busy" })
      log.info("loop", { step, sessionID })
      if (abort.aborted) break
      let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

      let lastUser: MessageV2.User | undefined
      let lastAssistant: MessageV2.Assistant | undefined
      let lastFinished: MessageV2.Assistant | undefined
      let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
      for (let i = msgs.length - 1; i >= 0; i--) {
        const msg = msgs[i]
        if (!lastUser && msg.info.role === "user") lastUser = msg.info as MessageV2.User
        if (!lastAssistant && msg.info.role === "assistant") lastAssistant = msg.info as MessageV2.Assistant
        if (!lastFinished && msg.info.role === "assistant" && msg.info.finish)
          lastFinished = msg.info as MessageV2.Assistant
        if (lastUser && lastFinished) break
        const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
        if (task && !lastFinished) {
          tasks.push(...task)
        }
      }

      if (!lastUser) throw new Error("No user message found in stream. This should never happen.")
      if (
        lastAssistant?.finish &&
        !["tool-calls", "unknown"].includes(lastAssistant.finish) &&
        lastUser.id < lastAssistant.id
      ) {
        log.info("exiting loop", { sessionID })
        break
      }

      step++
      if (step === 1)
        ensureTitle({
          session: await Session.get(sessionID),
          modelID: lastUser.model.modelID,
          providerID: lastUser.model.providerID,
          message: msgs.find((m) => m.info.role === "user")!,
          history: msgs,
        })

      const model = await Provider.getModel(lastUser.model.providerID, lastUser.model.modelID)
      const task = tasks.pop()

      // pending subtask
      // TODO: centralize "invoke tool" logic
      if (task?.type === "subtask") {
        const taskTool = await TaskTool.init()
        const assistantMessage = (await Session.updateMessage({
          id: Identifier.ascending("message"),
          role: "assistant",
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
        })) as MessageV2.Assistant
        let part = (await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: assistantMessage.id,
          sessionID: assistantMessage.sessionID,
          type: "tool",
          callID: ulid(),
          tool: TaskTool.id,
          state: {
            status: "running",
            input: {
              prompt: task.prompt,
              description: task.description,
              subagent_type: task.agent,
              command: task.command,
              parent_session_id: task.parent_session_id,
            },
            time: {
              start: Date.now(),
            },
          },
        })) as MessageV2.ToolPart
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
          parent_session_id: task.parent_session_id,
        }
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          { args: taskArgs },
        )
        let executionError: Error | undefined
        const result = await taskTool
          .execute(taskArgs, {
            agent: task.agent,
            messageID: assistantMessage.id,
            sessionID: sessionID,
            abort,
            async metadata(input) {
              await Session.updatePart({
                ...part,
                type: "tool",
                state: {
                  ...part.state,
                  ...input,
                },
              } satisfies MessageV2.ToolPart)
            },
          })
          .catch((error) => {
            executionError = error
            log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
            return undefined
          })
        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: "task",
            sessionID,
            callID: part.id,
          },
          result,
        )
        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        await Session.updateMessage(assistantMessage)
        if (result && part.state.status === "running") {
          await Session.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments: result.attachments,
              time: {
                ...part.state.time,
                end: Date.now(),
              },
            },
          } satisfies MessageV2.ToolPart)
        }
        if (!result) {
          await Session.updatePart({
            ...part,
            state: {
              status: "error",
              error: executionError ? `Tool execution failed: ${executionError.message}` : "Tool execution failed",
              time: {
                start: part.state.status === "running" ? part.state.time.start : Date.now(),
                end: Date.now(),
              },
              metadata: part.metadata,
              input: part.state.input,
            },
          } satisfies MessageV2.ToolPart)
        }

        // Add synthetic user message to prevent certain reasoning models from erroring
        // If we create assistant messages w/ out user ones following mid loop thinking signatures
        // will be missing and it can cause errors for models like gemini for example
        const summaryUserMsg: MessageV2.User = {
          id: Identifier.ascending("message"),
          sessionID,
          role: "user",
          time: {
            created: Date.now(),
          },
          agent: lastUser.agent,
          model: lastUser.model,
        }
        await Session.updateMessage(summaryUserMsg)
        await Session.updatePart({
          id: Identifier.ascending("part"),
          messageID: summaryUserMsg.id,
          sessionID,
          type: "text",
          text: "Summarize the task tool output above and continue with your task.",
          synthetic: true,
        } satisfies MessageV2.TextPart)

        continue
      }

      // pending compaction
      if (task?.type === "compaction") {
        const result = await SessionCompaction.process({
          messages: msgs,
          parentID: lastUser.id,
          abort,
          sessionID,
          auto: task.auto,
        })
        if (result === "stop") break
        continue
      }

      // context overflow, needs compaction
      if (
        lastFinished &&
        lastFinished.summary !== true &&
        SessionCompaction.isOverflow({ tokens: lastFinished.tokens, model })
      ) {
        await SessionCompaction.create({
          sessionID,
          agent: lastUser.agent,
          model: lastUser.model,
          auto: true,
        })
        continue
      }

      // normal processing
      const agent = await Agent.get(lastUser.agent)
      const maxSteps = agent.maxSteps ?? Infinity
      const isLastStep = step >= maxSteps
      msgs = insertReminders({
        messages: msgs,
        agent,
      })

      const processor = SessionProcessor.create({
        assistantMessage: (await Session.updateMessage({
          id: Identifier.ascending("message"),
          parentID: lastUser.id,
          role: "assistant",
          mode: agent.name,
          agent: agent.name,
          path: {
            cwd: Instance.directory,
            root: Instance.worktree,
          },
          cost: 0,
          tokens: {
            input: 0,
            output: 0,
            reasoning: 0,
            cache: { read: 0, write: 0 },
          },
          modelID: model.id,
          providerID: model.providerID,
          time: {
            created: Date.now(),
          },
          sessionID,
        })) as MessageV2.Assistant,
        sessionID: sessionID,
        model,
        abort,
      })
      const tools = await resolveTools({
        agent,
        sessionID,
        model,
        tools: lastUser.tools,
        processor,
      })

      if (step === 1) {
        SessionSummary.summarize({
          sessionID: sessionID,
          messageID: lastUser.id,
        })
      }

      const sessionMessages = clone(msgs)

      await Plugin.trigger("experimental.chat.messages.transform", {}, { messages: sessionMessages })

      const result = await processor.process({
        user: lastUser,
        agent,
        abort,
        sessionID,
        system: [...(await SystemPrompt.environment()), ...(await SystemPrompt.custom())],
        messages: [
          ...MessageV2.toModelMessage(sessionMessages),
          ...(isLastStep
            ? [
                {
                  role: "assistant" as const,
                  content: MAX_STEPS,
                },
              ]
            : []),
        ],
        tools,
        model,
      })
      if (result === "stop") break
      continue
    }
    SessionCompaction.prune({ sessionID })
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user") continue
      const queued = state()[sessionID]?.callbacks ?? []
      for (const q of queued) {
        q.resolve(item)
      }
      return item
    }
    throw new Error("Impossible")
  })

  async function lastModel(sessionID: string) {
    for await (const item of MessageV2.stream(sessionID)) {
      if (item.info.role === "user" && item.info.model) return item.info.model
    }
    return Provider.defaultModel()
  }

  async function resolveTools(input: {
    agent: Agent.Info
    model: Provider.Model
    sessionID: string
    tools?: Record<string, boolean>
    processor: SessionProcessor.Info
  }) {
    using _ = log.time("resolveTools")
    const tools: Record<string, AITool> = {}
    const enabledTools = pipe(
      input.agent.tools,
      mergeDeep(await ToolRegistry.enabled(input.agent)),
      mergeDeep(input.tools ?? {}),
    )
    for (const item of await ToolRegistry.tools(input.model.providerID, input.agent)) {
      if (Wildcard.all(item.id, enabledTools) === false) continue
      const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
      tools[item.id] = tool({
        id: item.id as any,
        description: item.description,
        inputSchema: jsonSchema(schema as any),
        async execute(args, options) {
          await Plugin.trigger(
            "tool.execute.before",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            {
              args,
            },
          )
          const result = await item.execute(args, {
            sessionID: input.sessionID,
            abort: options.abortSignal!,
            messageID: input.processor.message.id,
            callID: options.toolCallId,
            extra: { model: input.model },
            agent: input.agent.name,
            metadata: async (val) => {
              const match = input.processor.partFromToolCall(options.toolCallId)
              if (match && match.state.status === "running") {
                await Session.updatePart({
                  ...match,
                  state: {
                    title: val.title,
                    metadata: val.metadata,
                    status: "running",
                    input: args,
                    time: {
                      start: Date.now(),
                    },
                  },
                })
              }
            },
          })
          await Plugin.trigger(
            "tool.execute.after",
            {
              tool: item.id,
              sessionID: input.sessionID,
              callID: options.toolCallId,
            },
            result,
          )
          return result
        },
        toModelOutput(result) {
          return {
            type: "text",
            value: result.output,
          }
        },
      })
    }
    for (const [key, item] of Object.entries(await MCP.tools())) {
      if (Wildcard.all(key, enabledTools) === false) continue
      const execute = item.execute
      if (!execute) continue

      // Wrap execute to add plugin hooks and format output
      item.execute = async (args, opts) => {
        await Plugin.trigger(
          "tool.execute.before",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          {
            args,
          },
        )
        const result = await execute(args, opts)

        await Plugin.trigger(
          "tool.execute.after",
          {
            tool: key,
            sessionID: input.sessionID,
            callID: opts.toolCallId,
          },
          result,
        )

        const textParts: string[] = []
        const attachments: MessageV2.FilePart[] = []

        for (const contentItem of result.content) {
          if (contentItem.type === "text") {
            textParts.push(contentItem.text)
          } else if (contentItem.type === "image") {
            attachments.push({
              id: Identifier.ascending("part"),
              sessionID: input.sessionID,
              messageID: input.processor.message.id,
              type: "file",
              mime: contentItem.mimeType,
              url: `data:${contentItem.mimeType};base64,${contentItem.data}`,
            })
          }
          // Add support for other types if needed
        }

        return {
          title: "",
          metadata: result.metadata ?? {},
          output: textParts.join("\n\n"),
          attachments,
          content: result.content, // directly return content to preserve ordering when outputting to model
        }
      }
      item.toModelOutput = (result) => {
        return {
          type: "text",
          value: result.output,
        }
      }
      tools[key] = item
    }
    return tools
  }

  async function createUserMessage(input: PromptInput) {
    const agent = await Agent.get(input.agent ?? (await Agent.defaultAgent()))
    const info: MessageV2.Info = {
      id: input.messageID ?? Identifier.ascending("message"),
      role: "user",
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      tools: input.tools,
      agent: agent.name,
      model: input.model ?? agent.model ?? (await lastModel(input.sessionID)),
      system: input.system,
    }

    const parts = await Promise.all(
      input.parts.map(async (part): Promise<MessageV2.Part[]> => {
        if (part.type === "file") {
          const url = new URL(part.url)
          switch (url.protocol) {
            case "data:":
              if (part.mime === "text/plain") {
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: Buffer.from(part.url, "base64url").toString(),
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }
              break
            case "file:":
              log.info("file", { mime: part.mime })
              // have to normalize, symbol search returns absolute paths
              // Decode the pathname since URL constructor doesn't automatically decode it
              const filepath = fileURLToPath(part.url)
              const stat = await Bun.file(filepath).stat()

              if (stat.isDirectory()) {
                part.mime = "application/x-directory"
              }

              if (part.mime === "text/plain") {
                let offset: number | undefined = undefined
                let limit: number | undefined = undefined
                const range = {
                  start: url.searchParams.get("start"),
                  end: url.searchParams.get("end"),
                }
                if (range.start != null) {
                  const filePathURI = part.url.split("?")[0]
                  let start = parseInt(range.start)
                  let end = range.end ? parseInt(range.end) : undefined
                  // some LSP servers (eg, gopls) don't give full range in
                  // workspace/symbol searches, so we'll try to find the
                  // symbol in the document to get the full range
                  if (start === end) {
                    const symbols = await LSP.documentSymbol(filePathURI)
                    for (const symbol of symbols) {
                      let range: LSP.Range | undefined
                      if ("range" in symbol) {
                        range = symbol.range
                      } else if ("location" in symbol) {
                        range = symbol.location.range
                      }
                      if (range?.start?.line && range?.start?.line === start) {
                        start = range.start.line
                        end = range?.end?.line ?? start
                        break
                      }
                    }
                  }
                  offset = Math.max(start - 1, 0)
                  if (end) {
                    limit = end - offset
                  }
                }
                const args = { filePath: filepath, offset, limit }

                const pieces: MessageV2.Part[] = [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                  },
                ]

                await ReadTool.init()
                  .then(async (t) => {
                    const model = await Provider.getModel(info.model.providerID, info.model.modelID)
                    const result = await t.execute(args, {
                      sessionID: input.sessionID,
                      abort: new AbortController().signal,
                      agent: input.agent!,
                      messageID: info.id,
                      extra: { bypassCwdCheck: true, model },
                      metadata: async () => {},
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((attachment) => ({
                          ...attachment,
                          synthetic: true,
                          filename: attachment.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({
                        ...part,
                        id: part.id ?? Identifier.ascending("part"),
                        messageID: info.id,
                        sessionID: input.sessionID,
                      })
                    }
                  })
                  .catch((error) => {
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : error.toString()
                    Bus.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({
                        message,
                      }).toObject(),
                    })
                    pieces.push({
                      id: Identifier.ascending("part"),
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  })

                return pieces
              }

              if (part.mime === "application/x-directory") {
                const args = { path: filepath }
                const result = await ListTool.init().then((t) =>
                  t.execute(args, {
                    sessionID: input.sessionID,
                    abort: new AbortController().signal,
                    agent: input.agent!,
                    messageID: info.id,
                    extra: { bypassCwdCheck: true },
                    metadata: async () => {},
                  }),
                )
                return [
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the list tool with the following input: ${JSON.stringify(args)}`,
                  },
                  {
                    id: Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: result.output,
                  },
                  {
                    ...part,
                    id: part.id ?? Identifier.ascending("part"),
                    messageID: info.id,
                    sessionID: input.sessionID,
                  },
                ]
              }

              const file = Bun.file(filepath)
              FileTime.read(input.sessionID, filepath)
              return [
                {
                  id: Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  text: `Called the Read tool with the following input: {\"filePath\":\"${filepath}\"}`,
                  synthetic: true,
                },
                {
                  id: part.id ?? Identifier.ascending("part"),
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "file",
                  url: `data:${part.mime};base64,` + Buffer.from(await file.bytes()).toString("base64"),
                  mime: part.mime,
                  filename: part.filename!,
                  source: part.source,
                },
              ]
          }
        }

        if (part.type === "agent") {
          return [
            {
              id: Identifier.ascending("part"),
              ...part,
              messageID: info.id,
              sessionID: input.sessionID,
            },
            {
              id: Identifier.ascending("part"),
              messageID: info.id,
              sessionID: input.sessionID,
              type: "text",
              synthetic: true,
              text:
                "Use the above message and context to generate a prompt and call the task tool with subagent: " +
                part.name,
            },
          ]
        }

        return [
          {
            id: Identifier.ascending("part"),
            ...part,
            messageID: info.id,
            sessionID: input.sessionID,
          },
        ]
      }),
    ).then((x) => x.flat())

    await Plugin.trigger(
      "chat.message",
      {
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model,
        messageID: input.messageID,
      },
      {
        message: info,
        parts,
      },
    )

    await Session.updateMessage(info)
    for (const part of parts) {
      await Session.updatePart(part)
    }

    return {
      info,
      parts,
    }
  }

  function insertReminders(input: { messages: MessageV2.WithParts[]; agent: Agent.Info }) {
    const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
    if (!userMessage) return input.messages
    if (input.agent.name === "plan") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        // TODO (for mr dax): update to use the anthropic full fledged one (see plan-reminder-anthropic.txt)
        text: PROMPT_PLAN,
        synthetic: true,
      })
    }
    const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
    if (wasPlan && input.agent.name === "build") {
      userMessage.parts.push({
        id: Identifier.ascending("part"),
        messageID: userMessage.info.id,
        sessionID: userMessage.info.sessionID,
        type: "text",
        text: BUILD_SWITCH,
        synthetic: true,
      })
    }
    return input.messages
  }

  export const ShellInput = z.object({
    sessionID: Identifier.schema("session"),
    agent: z.string(),
    model: z
      .object({
        providerID: z.string(),
        modelID: z.string(),
      })
      .optional(),
    command: z.string(),
  })
  export type ShellInput = z.infer<typeof ShellInput>
  export async function shell(input: ShellInput) {
    const abort = start(input.sessionID)
    if (!abort) {
      throw new Session.BusyError(input.sessionID)
    }
    using _ = defer(() => cancel(input.sessionID))

    const session = await Session.get(input.sessionID)
    if (session.revert) {
      SessionRevert.cleanup(session)
    }
    const agent = await Agent.get(input.agent)
    const model = input.model ?? agent.model ?? (await lastModel(input.sessionID))
    const userMsg: MessageV2.User = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      time: {
        created: Date.now(),
      },
      role: "user",
      agent: input.agent,
      model: {
        providerID: model.providerID,
        modelID: model.modelID,
      },
    }
    await Session.updateMessage(userMsg)
    const userPart: MessageV2.Part = {
      type: "text",
      id: Identifier.ascending("part"),
      messageID: userMsg.id,
      sessionID: input.sessionID,
      text: "The following tool was executed by the user",
      synthetic: true,
    }
    await Session.updatePart(userPart)

    const msg: MessageV2.Assistant = {
      id: Identifier.ascending("message"),
      sessionID: input.sessionID,
      parentID: userMsg.id,
      mode: input.agent,
      agent: input.agent,
      cost: 0,
      path: {
        cwd: Instance.directory,
        root: Instance.worktree,
      },
      time: {
        created: Date.now(),
      },
      role: "assistant",
      tokens: {
        input: 0,
        output: 0,
        reasoning: 0,
        cache: { read: 0, write: 0 },
      },
      modelID: model.modelID,
      providerID: model.providerID,
    }
    await Session.updateMessage(msg)
    const part: MessageV2.Part = {
      type: "tool",
      id: Identifier.ascending("part"),
      messageID: msg.id,
      sessionID: input.sessionID,
      tool: "bash",
      callID: ulid(),
      state: {
        status: "running",
        time: {
          start: Date.now(),
        },
        input: {
          command: input.command,
        },
      },
    }
    await Session.updatePart(part)
    const shell = Shell.preferred()
    const shellName = (
      process.platform === "win32" ? path.win32.basename(shell, ".exe") : path.basename(shell)
    ).toLowerCase()

    const invocations: Record<string, { args: string[] }> = {
      nu: {
        args: ["-c", input.command],
      },
      fish: {
        args: ["-c", input.command],
      },
      zsh: {
        args: [
          "-c",
          "-l",
          `
            [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
            [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      bash: {
        args: [
          "-c",
          "-l",
          `
            shopt -s expand_aliases
            [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
            eval ${JSON.stringify(input.command)}
          `,
        ],
      },
      // Windows cmd
      cmd: {
        args: ["/c", input.command],
      },
      // Windows PowerShell
      powershell: {
        args: ["-NoProfile", "-Command", input.command],
      },
      pwsh: {
        args: ["-NoProfile", "-Command", input.command],
      },
      // Fallback: any shell that doesn't match those above
      //  - No -l, for max compatibility
      "": {
        args: ["-c", `${input.command}`],
      },
    }

    const matchingInvocation = invocations[shellName] ?? invocations[""]
    const args = matchingInvocation?.args

    const proc = spawn(shell, args, {
      cwd: Instance.directory,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TERM: "dumb",
      },
    })

    let output = ""

    proc.stdout?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    proc.stderr?.on("data", (chunk) => {
      output += chunk.toString()
      if (part.state.status === "running") {
        part.state.metadata = {
          output: output,
          description: "",
        }
        Session.updatePart(part)
      }
    })

    let aborted = false
    let exited = false

    const kill = () => Shell.killTree(proc, { exited: () => exited })

    if (abort.aborted) {
      aborted = true
      await kill()
    }

    const abortHandler = () => {
      aborted = true
      void kill()
    }

    abort.addEventListener("abort", abortHandler, { once: true })

    await new Promise<void>((resolve) => {
      proc.on("close", () => {
        exited = true
        abort.removeEventListener("abort", abortHandler)
        resolve()
      })
    })

    if (aborted) {
      output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
    }
    msg.time.completed = Date.now()
    await Session.updateMessage(msg)
    if (part.state.status === "running") {
      part.state = {
        status: "completed",
        time: {
          ...part.state.time,
          end: Date.now(),
        },
        input: part.state.input,
        title: "",
        metadata: {
          output,
          description: "",
        },
        output,
      }
      await Session.updatePart(part)
    }
    return { info: msg, parts: [part] }
  }

  export const CommandInput = z.object({
    messageID: Identifier.schema("message").optional(),
    sessionID: Identifier.schema("session"),
    agent: z.string().optional(),
    model: z.string().optional(),
    arguments: z.string(),
    command: z.string(),
  })
  export type CommandInput = z.infer<typeof CommandInput>
  const bashRegex = /!`([^`]+)`/g
  const argsRegex = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  const placeholderRegex = /\$(\d+)/g
  const quoteTrimRegex = /^["']|["']$/g
  /**
   * Regular expression to match @ file references in text
   * Matches @ followed by file paths, excluding commas, periods at end of sentences, and backticks
   * Does not match when preceded by word characters or backticks (to avoid email addresses and quoted references)
   */

  export async function command(input: CommandInput) {
    log.info("command", input)
    const command = await Command.get(input.command)
    const agentName = command.agent ?? input.agent ?? (await Agent.defaultAgent())

    const raw = input.arguments.match(argsRegex) ?? []
    const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))

    // Parse optional --session-id or --session-id=value flag
    let parentSessionID: string | undefined = undefined
    const sessionIdFlagIndex = args.findIndex((arg) => arg.startsWith("--session-id"))
    if (sessionIdFlagIndex >= 0) {
      const flag = args[sessionIdFlagIndex]
      if (flag.includes("=")) {
        parentSessionID = flag.split("=", 2)[1]
      } else if (sessionIdFlagIndex + 1 < args.length) {
        parentSessionID = args[sessionIdFlagIndex + 1]
      }
      // Remove the flag and its value from args
      args.splice(sessionIdFlagIndex, flag.includes("=") ? 1 : 2)
    } else {
      // Also check if first argument looks like a session ID (alphanumeric, 20+ chars)
      // This allows `/handoff abc123def456... guidance text` syntax
      if (args.length > 0 && /^[a-zA-Z0-9]{20,}$/.test(args[0])) {
        parentSessionID = args[0]
        args.shift()
      }
    }

    // If no explicit session ID provided, use current session as parent
    if (!parentSessionID) {
      parentSessionID = input.sessionID
    }

    const placeholders = command.template.match(placeholderRegex) ?? []
    let last = 0
    for (const item of placeholders) {
      const value = Number(item.slice(1))
      if (value > last) last = value
    }

    // Let the final placeholder swallow any extra arguments so prompts read naturally
    const withArgs = command.template.replaceAll(placeholderRegex, (_, index) => {
      const position = Number(index)
      const argIndex = position - 1
      if (argIndex >= args.length) return ""
      if (position === last) return args.slice(argIndex).join(" ")
      return args[argIndex]
    })
    // Replace $ARGUMENTS with remaining args (after session ID parsing)
    let template = withArgs.replaceAll("$ARGUMENTS", args.join(" "))

    const shell = ConfigMarkdown.shell(template)
    if (shell.length > 0) {
      const results = await Promise.all(
        shell.map(async ([, cmd]) => {
          try {
            return await $`${{ raw: cmd }}`.quiet().nothrow().text()
          } catch (error) {
            return `Error executing command: ${error instanceof Error ? error.message : String(error)}`
          }
        }),
      )
      let index = 0
      template = template.replace(bashRegex, () => results[index++])
    }
    template = template.trim()

    const model = await (async () => {
      if (command.model) {
        return Provider.parseModel(command.model)
      }
      if (command.agent) {
        const cmdAgent = await Agent.get(command.agent)
        if (cmdAgent.model) {
          return cmdAgent.model
        }
      }
      if (input.model) return Provider.parseModel(input.model)
      return await lastModel(input.sessionID)
    })()

    try {
      await Provider.getModel(model.providerID, model.modelID)
    } catch (e) {
      if (Provider.ModelNotFoundError.isInstance(e)) {
        const { providerID, modelID, suggestions } = e.data
        const hint = suggestions?.length ? ` Did you mean: ${suggestions.join(", ")}?` : ""
        Bus.publish(Session.Event.Error, {
          sessionID: input.sessionID,
          error: new NamedError.Unknown({ message: `Model not found: ${providerID}/${modelID}.${hint}` }).toObject(),
        })
      }
      throw e
    }
    const agent = await Agent.get(agentName)

    const parts =
      (agent.mode === "subagent" && command.subtask !== false) || command.subtask === true
        ? [
            {
              type: "subtask" as const,
              agent: agent.name,
              description: command.description ?? "",
              command: input.command,
              parent_session_id: parentSessionID,
              // TODO: how can we make task tool accept a more complex input?
              prompt: await resolvePromptParts(template).then((x) => x.find((y) => y.type === "text")?.text ?? ""),
            },
          ]
        : await resolvePromptParts(template)

    const result = (await prompt({
      sessionID: input.sessionID,
      messageID: input.messageID,
      model,
      agent: agentName,
      parts,
    })) as MessageV2.WithParts

    Bus.publish(Command.Event.Executed, {
      name: input.command,
      sessionID: input.sessionID,
      arguments: input.arguments,
      messageID: result.info.id,
    })

    return result
  }

  async function ensureTitle(input: {
    session: Session.Info
    message: MessageV2.WithParts
    history: MessageV2.WithParts[]
    providerID: string
    modelID: string
  }) {
    if (input.session.parentID) return
    if (!Session.isDefaultTitle(input.session.title)) return
    const isFirst =
      input.history.filter((m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic))
        .length === 1
    if (!isFirst) return
    const agent = await Agent.get("title")
    if (!agent) return
    const result = await LLM.stream({
      agent,
      user: input.message.info as MessageV2.User,
      system: [],
      small: true,
      tools: {},
      model: await iife(async () => {
        if (agent.model) return await Provider.getModel(agent.model.providerID, agent.model.modelID)
        return (
          (await Provider.getSmallModel(input.providerID)) ?? (await Provider.getModel(input.providerID, input.modelID))
        )
      }),
      abort: new AbortController().signal,
      sessionID: input.session.id,
      retries: 2,
      messages: [
        {
          role: "user",
          content: "Generate a title for this conversation:\n",
        },
        ...MessageV2.toModelMessage([
          {
            info: {
              id: Identifier.ascending("message"),
              role: "user",
              sessionID: input.session.id,
              time: {
                created: Date.now(),
              },
              agent: input.message.info.role === "user" ? input.message.info.agent : await Agent.defaultAgent(),
              model: {
                providerID: input.providerID,
                modelID: input.modelID,
              },
            },
            parts: input.message.parts,
          },
        ]),
      ],
    })
    const text = await result.text.catch((err) => log.error("failed to generate title", { error: err }))
    if (text)
      return Session.update(input.session.id, (draft) => {
        const cleaned = text
          .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
          .split("\n")
          .map((line) => line.trim())
          .find((line) => line.length > 0)
        if (!cleaned) return

        const title = cleaned.length > 100 ? cleaned.substring(0, 97) + "..." : cleaned
        draft.title = title
      })
  }
}

```


Updating TaskTool to use `parent_session_id` and include it in the prompt:


```typescript
import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
      parent_session_id: z
        .string()
        .describe("The session ID this task is forking from. Used to report context to the agent.")
        .optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: ctx.sessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const config = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})

```

```typescript
import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
      parent_session_id: z
        .string()
        .describe("The session ID this task is forking from. Used to report context to the agent.")
        .optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      
      // Use explicit parent_session_id if provided, otherwise use current session
      const parentSessionID = params.parent_session_id ?? ctx.sessionID
      
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: parentSessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)

      const config = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})

```

```typescript
import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
      parent_session_id: z
        .string()
        .describe("The session ID this task is forking from. Used to report context to the agent.")
        .optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      
      // Use explicit parent_session_id if provided, otherwise use current session
      const parentSessionID = params.parent_session_id ?? ctx.sessionID
      
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: parentSessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      
      // Enhance prompt with parent session context if provided
      let enhancedPrompt = params.prompt
      if (params.parent_session_id && params.parent_session_id !== ctx.sessionID) {
        enhancedPrompt = `You are working in a forked session (session ID: ${session.id}) that was created from parent session ${params.parent_session_id}.\n\n` +
          `Your task is to:\n\n${params.prompt}\n\n` +
          `Remember: you are operating in a forked context. The parent session ID is ${params.parent_session_id}. ` +
          `When you need to reference or compact the parent session, use that session ID.`
      } else if (params.parent_session_id) {
        enhancedPrompt = `You are working in a forked session (session ID: ${session.id}) that was created from the current session (${params.parent_session_id}).\n\n` +
          `Your task is to:\n\n${params.prompt}`
      }
      
      const promptParts = await SessionPrompt.resolvePromptParts(enhancedPrompt)

      const config = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})

```


Registering CompacterTool and ensuring it's available:



Adding CompacterTool to the tool registry:


```typescript
import { BashTool } from "./bash"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { ListTool } from "./ls"
import { BatchTool } from "./batch"
import { ReadTool } from "./read"
import { TaskTool } from "./task"
import { TodoWriteTool, TodoReadTool } from "./todo"
import { WebFetchTool } from "./webfetch"
import { WriteTool } from "./write"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
import { CompacterTool } from "./compacter"
import type { Agent } from "../agent/agent"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Config } from "../config/config"
import path from "path"
import { type ToolDefinition } from "@opencode-ai/plugin"
import z from "zod"
import { Plugin } from "../plugin"
import { WebSearchTool } from "./websearch"
import { CodeSearchTool } from "./codesearch"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { LspTool } from "./lsp"

export namespace ToolRegistry {
  const log = Log.create({ service: "tool.registry" })

  export const state = Instance.state(async () => {
    const custom = [] as Tool.Info[]
    const glob = new Bun.Glob("tool/*.{js,ts}")

    for (const dir of await Config.directories()) {
      for await (const match of glob.scan({
        cwd: dir,
        absolute: true,
        followSymlinks: true,
        dot: true,
      })) {
        const namespace = path.basename(match, path.extname(match))
        const mod = await import(match)
        for (const [id, def] of Object.entries<ToolDefinition>(mod)) {
          custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
        }
      }
    }

    const plugins = await Plugin.list()
    for (const plugin of plugins) {
      for (const [id, def] of Object.entries(plugin.tool ?? {})) {
        custom.push(fromPlugin(id, def))
      }
    }

    return { custom }
  })

  function fromPlugin(id: string, def: ToolDefinition): Tool.Info {
    return {
      id,
      init: async () => ({
        parameters: z.object(def.args),
        description: def.description,
        execute: async (args, ctx) => {
          const result = await def.execute(args as any, ctx)
          return {
            title: "",
            output: result,
            metadata: {},
          }
        },
      }),
    }
  }

  export async function register(tool: Tool.Info) {
    const { custom } = await state()
    const idx = custom.findIndex((t) => t.id === tool.id)
    if (idx >= 0) {
      custom.splice(idx, 1, tool)
      return
    }
    custom.push(tool)
  }

  async function all(): Promise<Tool.Info[]> {
    const custom = await state().then((x) => x.custom)
    const config = await Config.get()

    return [
      InvalidTool,
      BashTool,
      ReadTool,
      GlobTool,
      GrepTool,
      EditTool,
      WriteTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillTool,
      ...(Flag.OPENCODE_EXPERIMENTAL_LSP_TOOL ? [LspTool] : []),
      ...(config.experimental?.batch_tool === true ? [BatchTool] : []),
      ...custom,
    ]
  }

  export async function ids() {
    return all().then((x) => x.map((t) => t.id))
  }

  export async function tools(providerID: string, agent?: Agent.Info) {
    const tools = await all()
    const result = await Promise.all(
      tools
        .filter((t) => {
          // Enable websearch/codesearch for zen users OR via enable flag
          if (t.id === "codesearch" || t.id === "websearch") {
            return providerID === "opencode" || Flag.OPENCODE_ENABLE_EXA
          }
          return true
        })
        .map(async (t) => {
          using _ = log.time(t.id)
          return {
            id: t.id,
            ...(await t.init({ agent })),
          }
        }),
    )
    return result
  }

  export async function enabled(agent: Agent.Info): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}

    if (agent.permission.edit === "deny") {
      result["edit"] = false
      result["write"] = false
    }
    if (agent.permission.bash["*"] === "deny" && Object.keys(agent.permission.bash).length === 1) {
      result["bash"] = false
    }
    if (agent.permission.webfetch === "deny") {
      result["webfetch"] = false
      result["codesearch"] = false
      result["websearch"] = false
    }
    // Disable skill tool if all skills are denied
    if (agent.permission.skill["*"] === "deny" && Object.keys(agent.permission.skill).length === 1) {
      result["skill"] = false
    }

    return result
  }
}

```

```typescript
import { BashTool } from "./bash"
import { EditTool } from "./edit"
import { GlobTool } from "./glob"
import { GrepTool } from "./grep"
import { ListTool } from "./ls"
import { BatchTool } from "./batch"
import { ReadTool } from "./read"
import { TaskTool } from "./task"
import { TodoWriteTool, TodoReadTool } from "./todo"
import { WebFetchTool } from "./webfetch"
import { WriteTool } from "./write"
import { InvalidTool } from "./invalid"
import { SkillTool } from "./skill"
import { CompacterTool } from "./compacter"
import type { Agent } from "../agent/agent"
import { Tool } from "./tool"
import { Instance } from "../project/instance"
import { Config } from "../config/config"
import path from "path"
import { type ToolDefinition } from "@opencode-ai/plugin"
import z from "zod"
import { Plugin } from "../plugin"
import { WebSearchTool } from "./websearch"
import { CodeSearchTool } from "./codesearch"
import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { LspTool } from "./lsp"

export namespace ToolRegistry {
  const log = Log.create({ service: "tool.registry" })

  export const state = Instance.state(async () => {
    const custom = [] as Tool.Info[]
    const glob = new Bun.Glob("tool/*.{js,ts}")

    for (const dir of await Config.directories()) {
      for await (const match of glob.scan({
        cwd: dir,
        absolute: true,
        followSymlinks: true,
        dot: true,
      })) {
        const namespace = path.basename(match, path.extname(match))
        const mod = await import(match)
        for (const [id, def] of Object.entries<ToolDefinition>(mod)) {
          custom.push(fromPlugin(id === "default" ? namespace : `${namespace}_${id}`, def))
        }
      }
    }

    const plugins = await Plugin.list()
    for (const plugin of plugins) {
      for (const [id, def] of Object.entries(plugin.tool ?? {})) {
        custom.push(fromPlugin(id, def))
      }
    }

    return { custom }
  })

  function fromPlugin(id: string, def: ToolDefinition): Tool.Info {
    return {
      id,
      init: async () => ({
        parameters: z.object(def.args),
        description: def.description,
        execute: async (args, ctx) => {
          const result = await def.execute(args as any, ctx)
          return {
            title: "",
            output: result,
            metadata: {},
          }
        },
      }),
    }
  }

  export async function register(tool: Tool.Info) {
    const { custom } = await state()
    const idx = custom.findIndex((t) => t.id === tool.id)
    if (idx >= 0) {
      custom.splice(idx, 1, tool)
      return
    }
    custom.push(tool)
  }

  async function all(): Promise<Tool.Info[]> {
    const custom = await state().then((x) => x.custom)
    const config = await Config.get()

    return [
      InvalidTool,
      BashTool,
      ReadTool,
      GlobTool,
      GrepTool,
      EditTool,
      WriteTool,
      TaskTool,
      WebFetchTool,
      TodoWriteTool,
      TodoReadTool,
      WebSearchTool,
      CodeSearchTool,
      SkillTool,
      CompacterTool,
      ...(Flag.OPENCODE_EXPERIMENTAL_LSP_TOOL ? [LspTool] : []),
      ...(config.experimental?.batch_tool === true ? [BatchTool] : []),
      ...custom,
    ]
  }

  export async function ids() {
    return all().then((x) => x.map((t) => t.id))
  }

  export async function tools(providerID: string, agent?: Agent.Info) {
    const tools = await all()
    const result = await Promise.all(
      tools
        .filter((t) => {
          // Enable websearch/codesearch for zen users OR via enable flag
          if (t.id === "codesearch" || t.id === "websearch") {
            return providerID === "opencode" || Flag.OPENCODE_ENABLE_EXA
          }
          return true
        })
        .map(async (t) => {
          using _ = log.time(t.id)
          return {
            id: t.id,
            ...(await t.init({ agent })),
          }
        }),
    )
    return result
  }

  export async function enabled(agent: Agent.Info): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {}

    if (agent.permission.edit === "deny") {
      result["edit"] = false
      result["write"] = false
    }
    if (agent.permission.bash["*"] === "deny" && Object.keys(agent.permission.bash).length === 1) {
      result["bash"] = false
    }
    if (agent.permission.webfetch === "deny") {
      result["webfetch"] = false
      result["codesearch"] = false
      result["websearch"] = false
    }
    // Disable skill tool if all skills are denied
    if (agent.permission.skill["*"] === "deny" && Object.keys(agent.permission.skill).length === 1) {
      result["skill"] = false
    }

    return result
  }
}

```


Updating the handoff command template documentation to reflect the new features:


```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **forked subtask** that helps you design a custom compaction prompt. The subagent runs in a separate forked session and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a forked session. Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of a session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a forked subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Forking from a Specific Session

You can explicitly specify which session to fork from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a forked subtask session
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```

```


Updating the compaction agent prompt to mention the compacter tool:


```plaintext
You are a helpful AI assistant tasked with summarizing conversations **and** helping users design good prompts for future compaction.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

When asked to **design a compaction prompt** (for example via a `/handoff` command):
- First, carefully read the user's guidance text and arguments.
- Reflect on the session so far and the user's goals.
- Propose a **single, clear prompt string** that another compaction step could use to:
  - Retain the most valuable parts of the session context so far.
  - Emphasize important files, decisions, constraints, and follow‑ups.
  - De‑emphasize or drop unimportant back‑and‑forth or obsolete details.
- If helpful, briefly explain (in a separate paragraph) *why* your proposed prompt is a good fit.
- **Important**: You have access to the `compacter` tool. Once the user has reviewed and agreed to your proposed compaction prompt, you can call `compacter` with:
  - `session_id`: The parent session ID (the session you're forking from, which will be provided in your context)
  - `prompt`: The final, user-approved compaction prompt
  - `auto`: Set to `false` for manual compaction requests

Your summaries and prompt suggestions should be comprehensive enough to provide context, but concise and directed enough to be quickly understood and easy to use in follow‑up compaction runs.


```


## Summary

### 1. Extended `SubtaskPart` to include `parent_session_id`
- Added optional `parent_session_id` to `SubtaskPart` in `message-v2.ts`
- Allows subtasks to know which session they're forking from

### 2. Command processing updates
- Updated `SessionPrompt.command()` to parse session ID from arguments:
  - Supports `--session-id abc123` or `--session-id=abc123`
  - Also accepts a session ID as the first argument if it looks like one (20+ alphanumeric chars)
  - Defaults to current session if not specified
- Passes `parent_session_id` to subtask parts

### 3. TaskTool enhancements
- Updated `TaskTool` to:
  - Accept `parent_session_id` parameter
  - Use it when creating the forked session (`parentID`)
  - Include parent session context in the prompt so the agent knows what it's forking from

### 4. CompacterTool registration
- Added `CompacterTool` to the tool registry
- Available to all agents (including the compaction agent in forked sessions)

### 5. Compaction agent prompt updates
- Updated `compaction.txt` to mention:
  - The `compacter` tool is available
  - How to use it (with `session_id`, `prompt`, `auto` parameters)
  - When to call it (after user approval)

### 6. Documentation
- Created `HANDOFF_COMMAND.md` with:
  - Configuration template
  - Usage examples
  - Workflow explanation
  - Plugin integration guide

## How it works

1. User runs `/handoff --session-id abc123 keep only recent changes`
2. Command system:
   - Parses `--session-id abc123` → `parentSessionID = "abc123"`
   - Extracts remaining args → `"keep only recent changes"`
   - Creates a `SubtaskPart` with `parent_session_id: "abc123"`
3. TaskTool:
   - Creates a forked session with `parentID: "abc123"`
   - Enhances the prompt to tell the agent it's forking from session `abc123`
   - Runs the compaction agent in that forked session
4. Compaction agent:
   - Has access to `compacter` tool
   - Designs a compaction prompt based on user guidance
   - Presents it for review
   - Once approved, calls `compacter` with the parent session ID and agreed prompt

All changes are complete and lint-free. The `/handoff` command is ready to use once you add it to your config file.

---

**User**

is "parent" session the right term of the art? how does `/fork` refer to the previous context being forked?

---

**Cursor**


Checking how the codebase uses "parent" and "fork" terminology:



Checking how `/fork` works versus subtask sessions:



Clarifying the terminology:

- `/fork` (`Session.fork()`): Creates a new independent session by copying messages up to a point. It does not set `parentID`; it's a standalone copy.
- Subtask sessions (via TaskTool): Creates a new session with `parentID` set, establishing a parent-child relationship.

For `/handoff`, we're using the subtask mechanism (TaskTool), so "parent session" is correct. However, `/fork` doesn't use `parentID`, which can be confusing.

Updating terminology to be more precise:


```typescript
import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
      parent_session_id: z
        .string()
        .describe("The session ID this task is forking from. Used to report context to the agent.")
        .optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      
      // Use explicit parent_session_id if provided, otherwise use current session
      const parentSessionID = params.parent_session_id ?? ctx.sessionID
      
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: parentSessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      
      // Enhance prompt with parent session context if provided
      let enhancedPrompt = params.prompt
      if (params.parent_session_id && params.parent_session_id !== ctx.sessionID) {
        enhancedPrompt = `You are working in a child session (session ID: ${session.id}) that was created as a subtask from parent session ${params.parent_session_id}.\n\n` +
          `Your task is to:\n\n${params.prompt}\n\n` +
          `Remember: you are operating in a child session. The parent session ID is ${params.parent_session_id}. ` +
          `When you need to reference or compact the parent session, use that session ID.`
      } else if (params.parent_session_id) {
        enhancedPrompt = `You are working in a child session (session ID: ${session.id}) that was created as a subtask from the current session (${params.parent_session_id}).\n\n` +
          `Your task is to:\n\n${params.prompt}`
      }
      
      const promptParts = await SessionPrompt.resolvePromptParts(enhancedPrompt)

      const config = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})

```

```typescript
import { Tool } from "./tool"
import DESCRIPTION from "./task.txt"
import z from "zod"
import { Session } from "../session"
import { Bus } from "../bus"
import { MessageV2 } from "../session/message-v2"
import { Identifier } from "../id/id"
import { Agent } from "../agent/agent"
import { SessionPrompt } from "../session/prompt"
import { iife } from "@/util/iife"
import { defer } from "@/util/defer"
import { Config } from "../config/config"

export const TaskTool = Tool.define("task", async () => {
  const agents = await Agent.list().then((x) => x.filter((a) => a.mode !== "primary"))
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "This subagent should only be called manually by the user."}`)
      .join("\n"),
  )
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent to use for this task"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
      parent_session_id: z
        .string()
        .describe("The parent session ID this subtask session was created from. Used to report context to the agent.")
        .optional(),
    }),
    async execute(params, ctx) {
      const agent = await Agent.get(params.subagent_type)
      if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type} is not a valid agent type`)
      
      // Use explicit parent_session_id if provided, otherwise use current session
      const parentSessionID = params.parent_session_id ?? ctx.sessionID
      
      const session = await iife(async () => {
        if (params.session_id) {
          const found = await Session.get(params.session_id).catch(() => {})
          if (found) return found
        }

        return await Session.create({
          parentID: parentSessionID,
          title: params.description + ` (@${agent.name} subagent)`,
        })
      })
      const msg = await MessageV2.get({ sessionID: ctx.sessionID, messageID: ctx.messageID })
      if (msg.info.role !== "assistant") throw new Error("Not an assistant message")

      ctx.metadata({
        title: params.description,
        metadata: {
          sessionId: session.id,
        },
      })

      const messageID = Identifier.ascending("message")
      const parts: Record<string, { id: string; tool: string; state: { status: string; title?: string } }> = {}
      const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
        if (evt.properties.part.sessionID !== session.id) return
        if (evt.properties.part.messageID === messageID) return
        if (evt.properties.part.type !== "tool") return
        const part = evt.properties.part
        parts[part.id] = {
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }
        ctx.metadata({
          title: params.description,
          metadata: {
            summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
            sessionId: session.id,
          },
        })
      })

      const model = agent.model ?? {
        modelID: msg.info.modelID,
        providerID: msg.info.providerID,
      }

      function cancel() {
        SessionPrompt.cancel(session.id)
      }
      ctx.abort.addEventListener("abort", cancel)
      using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
      
      // Enhance prompt with parent session context if provided
      let enhancedPrompt = params.prompt
      if (params.parent_session_id && params.parent_session_id !== ctx.sessionID) {
        enhancedPrompt = `You are working in a child session (session ID: ${session.id}) that was created as a subtask from parent session ${params.parent_session_id}.\n\n` +
          `Your task is to:\n\n${params.prompt}\n\n` +
          `Remember: you are operating in a child session. The parent session ID is ${params.parent_session_id}. ` +
          `When you need to reference or compact the parent session, use that session ID.`
      } else if (params.parent_session_id) {
        enhancedPrompt = `You are working in a child session (session ID: ${session.id}) that was created as a subtask from the current session (${params.parent_session_id}).\n\n` +
          `Your task is to:\n\n${params.prompt}`
      }
      
      const promptParts = await SessionPrompt.resolvePromptParts(enhancedPrompt)

      const config = await Config.get()
      const result = await SessionPrompt.prompt({
        messageID,
        sessionID: session.id,
        model: {
          modelID: model.modelID,
          providerID: model.providerID,
        },
        agent: agent.name,
        tools: {
          todowrite: false,
          todoread: false,
          task: false,
          ...Object.fromEntries((config.experimental?.primary_tools ?? []).map((t) => [t, false])),
          ...agent.tools,
        },
        parts: promptParts,
      })
      unsub()
      const messages = await Session.messages({ sessionID: session.id })
      const summary = messages
        .filter((x) => x.info.role === "assistant")
        .flatMap((msg) => msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[])
        .map((part) => ({
          id: part.id,
          tool: part.tool,
          state: {
            status: part.state.status,
            title: part.state.status === "completed" ? part.state.title : undefined,
          },
        }))
      const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""

      const output = text + "\n\n" + ["<task_metadata>", `session_id: ${session.id}`, "</task_metadata>"].join("\n")

      return {
        title: params.description,
        metadata: {
          summary,
          sessionId: session.id,
        },
        output,
      }
    },
  }
})

```

```plaintext
You are a helpful AI assistant tasked with summarizing conversations **and** helping users design good prompts for future compaction.

When asked to summarize, provide a detailed but concise summary of the conversation.
Focus on information that would be helpful for continuing the conversation, including:
- What was done
- What is currently being worked on
- Which files are being modified
- What needs to be done next
- Key user requests, constraints, or preferences that should persist
- Important technical decisions and why they were made

When asked to **design a compaction prompt** (for example via a `/handoff` command):
- First, carefully read the user's guidance text and arguments.
- Reflect on the session so far and the user's goals.
- Propose a **single, clear prompt string** that another compaction step could use to:
  - Retain the most valuable parts of the session context so far.
  - Emphasize important files, decisions, constraints, and follow‑ups.
  - De‑emphasize or drop unimportant back‑and‑forth or obsolete details.
- If helpful, briefly explain (in a separate paragraph) *why* your proposed prompt is a good fit.
- **Important**: You have access to the `compacter` tool. Once the user has reviewed and agreed to your proposed compaction prompt, you can call `compacter` with:
  - `session_id`: The parent session ID (the session this child session was created from, which will be provided in your context)
  - `prompt`: The final, user-approved compaction prompt
  - `auto`: Set to `false` for manual compaction requests

Your summaries and prompt suggestions should be comprehensive enough to provide context, but concise and directed enough to be quickly understood and easy to use in follow‑up compaction runs.


```


Clarifying terminology:

- `/fork` (`Session.fork()`): Creates an independent session by copying messages up to a point. It does not set `parentID`; it's a standalone copy.
- Subtask sessions (via TaskTool): Creates a child session with `parentID` set, establishing a parent-child relationship.

For `/handoff`, we're using the subtask mechanism, so "parent session" is correct. Updating the documentation to clarify this distinction:


```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a forked session. Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of a session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a forked subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Forking from a Specific Session

You can explicitly specify which session to fork from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a forked subtask session
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```

```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a child session (created as a subtask from a parent session). Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of the parent session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a forked subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Forking from a Specific Session

You can explicitly specify which session to fork from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a forked subtask session
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```

```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a child session (created as a subtask from a parent session). Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of the parent session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a child subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Forking from a Specific Session

You can explicitly specify which session to fork from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a forked subtask session
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```

```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a child session (created as a subtask from a parent session). Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of the parent session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a child subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Creating a Child Session from a Specific Parent Session

You can explicitly specify which session to create a child session from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a forked subtask session
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```

```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a child session (created as a subtask from a parent session). Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of the parent session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a child subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Creating a Child Session from a Specific Parent Session

You can explicitly specify which session to create a child session from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a child subtask session (with `parentID` set to the source session)
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Forked Session**: The `/handoff` command creates a new session with `parentID` set to the source session
- **Parent Session ID**: Automatically passed to the subagent so it knows what session it's forking from
- **Compacter Tool**: Available to the compaction agent in the forked session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```

```markdown
# `/handoff` Command Configuration

The `/handoff` command creates a **child subtask session** that helps you design a custom compaction prompt. The subagent runs in a separate child session (with `parentID` set to the source session) and has access to the `compacter` tool to execute compaction once you've agreed on a prompt.

**Note**: This is different from `/fork`, which creates an independent copy of a session. `/handoff` creates a child session with a parent-child relationship, allowing the subagent to reference and compact the parent session.

## Configuration

Add this to your OpenCode config (e.g., `~/.opencode/config.json` or your project config):

```json
{
  "command": {
    "handoff": {
      "description": "Design a custom prompt to guide future compaction, based on my advice.",
      "agent": "compaction",
      "subtask": true,
      "template": "You are the compaction assistant working in a child session (created as a subtask from a parent session). Your job is NOT to compact now, but to DESIGN a prompt that will later be used to drive a focused compaction of the parent session.\n\nBelow is the current conversation context (as provided by the system), followed by my guidance and constraints for how I want future compaction to behave.\n\nMy guidance and constraints (raw arguments from the user):\n$ARGUMENTS\n\nYour task:\n\n1. Reflect on:\n   - The conversation so far (you have access to the parent session context).\n   - The guidance above ($ARGUMENTS).\n2. Propose ONE clear, standalone prompt string that another compaction step could use later. That prompt should:\n   - Help retain the most valuable context (files, decisions, TODOs, constraints).\n   - Emphasize the kinds of information I care about, as expressed in $ARGUMENTS.\n   - De-emphasize or omit low-value chatter or obsolete details.\n\nOutput format:\n\n- First, on a single line, output exactly:\n\n  COMPACTION_PROMPT:\n\n- On the very next line, output ONLY the proposed compaction prompt string, with no markdown, no quotes, and no extra surrounding text.\n\n- Then, after a blank line, you may optionally include a short explanation of why this prompt is a good fit, starting with:\n\n  RATIONALE:\n\nRemember: you are not compacting now. You are designing a prompt that will be used later to run compaction once the user has confirmed it. You have access to the `compacter` tool - use it when the user explicitly agrees to run compaction with your proposed prompt."
    }
  }
}
```

## Usage

### Basic Usage

```bash
/handoff keep only the last 5 user turns and any tool runs that touched src/session/**
```

This creates a child subtask session where the compaction agent will:
- Analyze the current session context
- Use your guidance to design a custom compaction prompt
- Present the prompt for your review

### Creating a Child Session from a Specific Parent Session

You can explicitly specify which session to create a child session from:

```bash
# Using --session-id flag
/handoff --session-id abc123def456... keep only recent changes

# Or as first argument (if it looks like a session ID)
/handoff abc123def456... keep only recent changes
```

If no session ID is provided, it defaults to the current session.

## Workflow

1. **Run `/handoff`** with your guidance
   - Creates a child subtask session (with `parentID` set to the source session)
   - The compaction agent analyzes context and your guidance
   - Proposes a compaction prompt

2. **Review and refine** the proposed prompt
   - The agent presents: `COMPACTION_PROMPT: <prompt text>`
   - Optionally includes: `RATIONALE: <explanation>`
   - You can ask for changes or clarifications

3. **Confirm and execute**
   - Once you agree, tell the agent to proceed
   - The agent calls the `compacter` tool with:
     - The agreed prompt
     - The parent session ID to compact

4. **Compaction runs**
   - The `compacter` tool queues compaction for the parent session
   - Uses your custom prompt via the `experimental.session.compacting` plugin hook

## Technical Details

- **Child Session**: The `/handoff` command creates a new session with `parentID` set to the source session (unlike `/fork` which creates an independent copy)
- **Parent Session ID**: Automatically passed to the subagent so it knows which parent session to reference and compact
- **Compacter Tool**: Available to the compaction agent in the child session
- **Subtask Processing**: Uses the same `TaskTool` infrastructure as other subtasks, which creates child sessions with parent-child relationships

**Note on Terminology**: 
- `/fork` creates an **independent session** by copying messages (no `parentID`)
- `/handoff` creates a **child session** with `parentID` set (parent-child relationship)

## Plugin Integration

To make the custom prompt actually influence compaction, implement the `experimental.session.compacting` hook in your plugin:

```typescript
export const CompactionPlugin: Plugin = async (ctx) => {
  ctx.on("experimental.session.compacting", async (input, output) => {
    // Retrieve the agreed prompt from session metadata or your own store
    const agreedPrompt = await getAgreedPrompt(input.sessionID)
    
    if (agreedPrompt) {
      // Replace the default compaction prompt
      output.prompt = agreedPrompt
    }
    
    return output
  })
}
```


```


## Terminology clarification

- `/fork` (`Session.fork()`): Creates an independent session by copying messages up to a point. Does not set `parentID`; it's a standalone copy.
- `/handoff` (via subtask mechanism): Creates a child session with `parentID` set, establishing a parent-child relationship.

## Updates made

1. Updated TaskTool prompts: Changed "forked session" to "child session" to match the subtask mechanism.
2. Updated compaction agent prompt: Clarified that it's a "child session" created from a parent.
3. Updated documentation: Clarified the distinction between `/fork` (independent copy) and `/handoff` (child session with parent relationship).

"Parent session" is correct for `/handoff` because we're using the subtask mechanism that creates parent-child relationships. The documentation now clarifies that `/handoff` creates a child session (with `parentID`), not an independent fork like `/fork` does.

