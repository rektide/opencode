import { Plugin } from "@opencode/plugin/tui"
import { lastEpilogueActivity } from "../../epilogue/activity.ts"

export default Plugin.define({
  id: "opencode.epilogue.activity",
  setup(context) {
    context.ui.epilogue.registerSession(({ sessionID }) => {
      const session = context.data.session.get(sessionID)
      if (!session) return undefined
      return {
        label: "Last active",
        value: {
          type: "relative-time",
          timestamp: lastEpilogueActivity(session.time),
        },
      }
    })
    context.ui.epilogue.registerSession(({ sessionID }) =>
      context.data.session.status(sessionID) === "running"
        ? { label: "Status", value: { type: "text", text: "running" } }
        : undefined,
    )
  },
})
