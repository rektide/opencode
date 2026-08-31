import type { Context } from "@opencode-ai/plugin/effect/plugin"
import type { SessionDomain } from "@opencode-ai/plugin/promise/session"
import { Session } from "@opencode-ai/schema/session"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { Effect } from "effect"

export function effectPrompt(context: Context) {
  context.session.list({ parentID: null, limit: 10 })
  context.session.children({ sessionID: Session.ID.make("ses_parent"), limit: 10 })
  context.session.messages({ sessionID: Session.ID.make("ses_child"), order: "asc" })
  // @ts-expect-error Children fixes the parent and does not accept arbitrary list filters.
  context.session.children({ sessionID: Session.ID.make("ses_parent"), parentID: null })
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
  // @ts-expect-error Children fixes the parent and does not accept arbitrary list filters.
  void session.children({ sessionID: Session.ID.make("ses_parent"), search: "child" })
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
