import type { Context } from "@opencode-ai/plugin/effect/plugin"
import type { SessionDomain } from "@opencode-ai/plugin/promise/session"
import { Session } from "@opencode-ai/schema/session"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { Effect } from "effect"

export function effectPrompt(context: Context) {
  context.session.list({ parentID: null, limit: 10 })
  context.session.children({ sessionID: Session.ID.make("ses_parent"), limit: 10 })
  context.session.messages({ sessionID: Session.ID.make("ses_child"), order: "asc" })
  context.session.inbox.list({ sessionID: Session.ID.make("ses_child") })
  context.session.active()
  // @ts-expect-error Children fixes the parent and does not accept arbitrary list filters.
  context.session.children({ sessionID: Session.ID.make("ses_parent"), parentID: null })
  // @ts-expect-error Plugin inbox access is read-only.
  context.session.inbox.cancel({ sessionID: Session.ID.make("ses_child"), inboxID: SessionMessage.ID.make("msg_1") })
  // @ts-expect-error Active is an operation, not the Core Effect property.
  context.session.active.pipe
  context.session.hook("prompt", (event) =>
    Effect.sync(() => {
      event.prompt.files ??= []
      event.prompt.files.push({ uri: "file:///policy.md" })
      event.delivery = "queue"
      // @ts-expect-error Admission identity cannot be rewritten.
      event.sessionID = Session.ID.make("ses_other")
    }),
  )
  // @ts-expect-error Prompt admission has no resolved model to filter by provider.
  context.session.hook("prompt", () => Effect.void, { providerID: "openai" })
  context.session.hook("context", () => Effect.void, { providerID: "openai" })
}

export function promisePrompt(session: SessionDomain) {
  void session.list({ parentID: null, limit: 10 })
  void session.children({ sessionID: Session.ID.make("ses_parent"), limit: 10 })
  void session.messages({ sessionID: Session.ID.make("ses_child"), order: "asc" })
  void session.inbox.list({ sessionID: Session.ID.make("ses_child") })
  void session.active()
  // @ts-expect-error Children fixes the parent and does not accept arbitrary list filters.
  void session.children({ sessionID: Session.ID.make("ses_parent"), search: "child" })
  // @ts-expect-error Plugin inbox access is read-only.
  void session.inbox.queue({ sessionID: Session.ID.make("ses_child"), inboxID: SessionMessage.ID.make("msg_1") })
  // @ts-expect-error Active is an operation, not a Promise property.
  session.active.then
  session.hook("prompt", (event) => {
    event.prompt.text = "Prepared"
    event.metadata = { source: "plugin" }
    // @ts-expect-error Admission identity cannot be rewritten.
    event.messageID = SessionMessage.ID.make("msg_other")
  })
  // @ts-expect-error Prompt admission has no resolved model to filter by provider.
  session.hook("prompt", () => {}, { providerID: "openai" })
  session.hook("context", () => {}, { providerID: "openai" })
}
