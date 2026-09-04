import type { UI } from "@opencode/plugin/tui/context"
import type { JSX } from "@opentui/solid"

declare const ui: UI
declare const jsx: JSX.Element

ui.epilogue.register(({ sessionID }) => ({
  label: "Session ID",
  value: { type: "text", text: sessionID },
}))
ui.epilogue.register(() => ({
  label: "Updated",
  value: { type: "relative-time", timestamp: Date.now() },
}))
ui.slot({ append: "home.footer", render: () => null })

// @ts-expect-error Epilogue projections are synchronous.
ui.epilogue.register(async () => undefined)
// @ts-expect-error Epilogue rows are structured data, not JSX.
ui.epilogue.register(() => jsx)
// @ts-expect-error Value discriminants are closed.
ui.epilogue.register(() => ({ label: "Bad", value: { type: "html", text: "no" } }))
// @ts-expect-error One registration contributes at most one row.
ui.epilogue.register(() => [{ label: "Bad", value: { type: "text", text: "no" } }])
