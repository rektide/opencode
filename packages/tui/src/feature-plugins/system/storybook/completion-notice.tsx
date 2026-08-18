import { Plugin } from "@opencode-ai/plugin/tui"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal } from "solid-js"
import { RouteProvider, useRoute, type Route } from "../../../context/route"
import { useConfig } from "../../../config"
import { SessionContext, SessionNoticeMessageV2 } from "../../../routes/session"
import { StoryFooter } from "./footer"
import type { Story } from "./index"

const DESCRIPTIONS = [
  "Survey renderer lifecycle",
  "Freshen feature workspaces onto the current upstream tip",
  "Investigate why background service contenders spin after the port is freed",
]

const STATES = ["completed", "error", "cancelled"] as const

function CompletionNoticeStory(props: { context: Plugin.Context }) {
  const dimensions = useTerminalDimensions()
  const config = useConfig()
  const [stateIndex, setStateIndex] = createSignal(0)
  const [subagent, setSubagent] = createSignal(true)
  const [descriptionIndex, setDescriptionIndex] = createSignal(0)
  const [route, setRoute] = createSignal<Route>({ type: "session", sessionID: "ses_parent" })
  const state = () => STATES[stateIndex()]
  const description = () => DESCRIPTIONS[descriptionIndex()]
  const routeSessionID = () => {
    const current = route()
    return current.type === "session" ? current.sessionID : undefined
  }
  const message = () => ({
    id: "msg_fixture",
    type: "synthetic" as const,
    text: `<subagent sessionID="ses_child" state="${state()}" description="${description()}">Done</subagent>`,
    description: description(),
    metadata: {
      source: subagent() ? "subagent" : "shell",
      ...(subagent() ? { childID: "ses_child" } : {}),
      agent: "Explore",
      state: state(),
    },
    time: { created: Date.now() },
  })

  function RouteProbe() {
    const current = useRoute()
    createEffect(() => setRoute(current.data))
    return <text></text>
  }

  props.context.keymap.layer(() => ({
    commands: [
      {
        bind: "escape",
        title: "Back to storybook",
        group: "Storybook",
        run: () => props.context.ui.router.navigate({ type: "plugin", name: "storybook" }),
      },
      {
        bind: "tab",
        title: "Next completion state",
        group: "Story",
        run: () => setStateIndex((value) => (value + 1) % STATES.length),
      },
      {
        bind: "c",
        title: "Toggle subagent vs shell source",
        group: "Story",
        run: () => setSubagent((value) => !value),
      },
      {
        bind: "d",
        title: "Next description",
        group: "Story",
        run: () => setDescriptionIndex((value) => (value + 1) % DESCRIPTIONS.length),
      },
      {
        bind: "r",
        title: "Reset route",
        group: "Story",
        run: () => setRoute({ type: "session", sessionID: "ses_parent" }),
      },
    ],
  }))

  return (
    <RouteProvider initialRoute={{ type: "session", sessionID: "ses_parent" }}>
      <SessionContext.Provider
        value={{
          get width() {
            return dimensions().width - 2
          },
          sessionID: "ses_parent",
          thinkingMode: () => "show",
          showThinking: () => false,
          markdownMode: () => "rendered",
          groupExploration: () => false,
          diffWrapMode: () => "word",
          models: () => [],
          config: config.data,
          mutatePending: async () => false,
          pendingDelivery: () => undefined,
        }}
      >
        <box
          flexDirection="column"
          width={dimensions().width}
          height={dimensions().height}
          paddingTop={1}
          paddingLeft={1}
        >
          <text fg={props.context.theme.text.subdued}>
            Transcript tail — click the notice row to navigate into the child session
          </text>
          <box height={1} />
          <SessionNoticeMessageV2 message={message()} />
          <box flexGrow={1} />
          <RouteProbe />
          <StoryFooter
            context={props.context}
            title="Completion notice"
            details={[state(), subagent() ? "subagent" : "shell (no childID)"]}
            status={`route: ${route().type} ${routeSessionID() ?? ""}`}
            message={routeSessionID() === "ses_child" ? "navigated to child" : undefined}
            controls={[
              { shortcut: "tab", label: "state" },
              { shortcut: "c", label: "source" },
              { shortcut: "d", label: "description" },
              { shortcut: "r", label: "reset" },
              { shortcut: "esc", label: "storybook" },
            ]}
          />
        </box>
      </SessionContext.Provider>
    </RouteProvider>
  )
}

export const completionNoticeStory: Story = {
  id: "completion-notice",
  title: "Completion notice",
  render: (context) => <CompletionNoticeStory context={context} />,
}
