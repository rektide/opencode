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

