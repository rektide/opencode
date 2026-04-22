/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js"
import type { TuiPlugin, TuiPluginApi, TuiPluginMeta, TuiPluginModule, TuiSlotPlugin } from "@opencode-ai/plugin/tui"
import type { EventTuiCommandExecute } from "@opencode-ai/sdk/v2"

const KV_KEY = "lastused:commands"

type CommandMap = Record<string, number>

const load = async (api: TuiPluginApi): Promise<CommandMap> => {
  const stored = api.kv.get<CommandMap>(KV_KEY)
  if (stored && typeof stored === "object") return stored
  return {}
}

const save = (api: TuiPluginApi, data: CommandMap) => {
  api.kv.set(KV_KEY, data)
}

const relativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const COMMAND_LABELS: Record<string, string> = {
  "session.list": "Session list",
  "session.new": "New session",
  "session.share": "Share session",
  "session.interrupt": "Interrupt",
  "session.compact": "Compact",
  "session.page.up": "Page up",
  "session.page.down": "Page down",
  "session.line.up": "Line up",
  "session.line.down": "Line down",
  "session.half.page.up": "Half page up",
  "session.half.page.down": "Half page down",
  "session.first": "Scroll to top",
  "session.last": "Scroll to bottom",
  "prompt.clear": "Clear prompt",
  "prompt.submit": "Submit prompt",
  "agent.cycle": "Cycle agent",
}

const label = (command: string) => COMMAND_LABELS[command] ?? command

const LASTUSED_ORDER = 400

const LastUsedPanel = (props: { api: TuiPluginApi; commands: () => CommandMap }) => {
  const entries = () => Object.entries(props.commands()).sort(([, a], [, b]) => b - a)

  const theme = () => props.api.theme.current
  const panel = () => theme().backgroundPanel.toString()
  const border = () => theme().border.toString()
  const text = () => theme().text.toString()
  const muted = () => theme().textMuted.toString()
  const accent = () => theme().primary.toString()

  return (
    <box
      border
      borderColor={border}
      backgroundColor={panel}
      paddingTop={1}
      paddingBottom={1}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      gap={0}
    >
      <text fg={accent}>
        <b>Last Used</b>
      </text>
      {entries().length === 0 ? (
        <text fg={muted}>No commands tracked yet</text>
      ) : (
        entries().map(([cmd, ts]) => (
          <box flexDirection="row" justifyContent="space-between">
            <text fg={text}>{label(cmd)}</text>
            <text fg={muted}>{relativeTime(ts)}</text>
          </box>
        ))
      )}
    </box>
  )
}

const slot = (api: TuiPluginApi, commands: () => CommandMap): TuiSlotPlugin => ({
  order: LASTUSED_ORDER,
  slots: {
    sidebar_content(ctx) {
      return <LastUsedPanel api={api} commands={commands} />
    },
  },
})

const tui: TuiPlugin = async (api, _options, _meta) => {
  const initial = await load(api)
  const [commands, setCommands] = createSignal<CommandMap>(initial)

  const unsub = api.event.on("tui.command.execute", (evt: EventTuiCommandExecute) => {
    const cmd = evt.properties.command
    const now = Date.now()
    setCommands((prev) => {
      const next = { ...prev, [cmd]: now }
      save(api, next)
      return next
    })
  })

  api.slots.register(slot(api, commands))

  api.lifecycle.onDispose(() => {
    unsub()
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "tui-lastused",
  tui,
}

export default plugin
