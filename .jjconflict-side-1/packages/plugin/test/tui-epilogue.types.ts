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
ui.epilogue.registerSession(({ sessionID }) => ({ label: "Scoped", value: { type: "text", text: sessionID } }))
const retained = ui.epilogue.retain("client", { label: "Client", value: { type: "text", text: "ready" } })
retained.set(undefined)
retained.dispose()
ui.epilogue.retainSession("ses_123", "event").set({ label: "Event", value: { type: "text", text: "seen" } })
ui.epilogue.onCollect((event) => {
  event.sessionIDs.forEach((sessionID) => ui.epilogue.retainSession(sessionID, "collected"))
  event.waitUntil(Promise.resolve())
  event.signal.throwIfAborted()
})
ui.epilogue.onCollect(async () => {})
ui.epilogue.selection.transform((rules) => {
  rules.reverse()
  rules.push({ type: "limit", count: 3, terminating: true })
})
ui.slot({ append: "home.footer", render: () => null })

// @ts-expect-error Epilogue projections are synchronous.
ui.epilogue.register(async () => undefined)
// @ts-expect-error Epilogue rows are structured data, not JSX.
ui.epilogue.register(() => jsx)
// @ts-expect-error Value discriminants are closed.
ui.epilogue.register(() => ({ label: "Bad", value: { type: "html", text: "no" } }))
// @ts-expect-error One registration contributes at most one row.
ui.epilogue.register(() => [{ label: "Bad", value: { type: "text", text: "no" } }])
// @ts-expect-error Selection transforms may only add known rules.
ui.epilogue.selection.transform((rules) => rules.push({ type: "filter", terminating: true }))
// @ts-expect-error Retained values are structured rows.
ui.epilogue.retain("bad", "text")
