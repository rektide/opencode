export * as SubagentCompletion from "./subagent-completion.js"

import { Effect } from "effect"
import { TokenUsage } from "@opencode/schema/token-usage"
import type { Job } from "../job.js"
import type { Session } from "../session.js"
import type { SessionMessage } from "./message.js"

export const NO_TEXT = "Subagent completed without a text response."

export function text(message: SessionMessage.Info | undefined) {
  if (message?.type !== "assistant") return NO_TEXT
  return (
    message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("") || NO_TEXT
  )
}

export const deliver = Effect.fnUntraced(function* (
  sessions: Pick<Session.Interface, "context" | "synthetic">,
  jobs: Pick<Job.Interface, "completeBackground">,
  input: Pick<Job.Info, "status" | "output" | "error" | "notificationID"> & {
    recovery: Extract<Job.Recovery, { kind: "subagent" }>
    resume?: boolean
  },
) {
  if (input.status === "running") return
  const recovery = input.recovery
  const text =
    input.status === "completed"
      ? (input.output ?? NO_TEXT)
      : input.status === "error"
        ? (input.error ?? "Subagent failed")
        : "Subagent cancelled"
  const contextTokens = yield* sessions.context(recovery.childSessionID).pipe(
    Effect.map((messages) => {
      const message = messages.findLast((message) => message.type === "assistant" && message.tokens !== undefined)
      if (message?.type !== "assistant" || message.tokens === undefined) return
      const total = TokenUsage.total(message.tokens)
      if (total > 0) return total
    }),
    Effect.orElseSucceed(() => undefined),
  )
  yield* sessions.synthetic({
    ...(input.notificationID ? { id: input.notificationID } : {}),
    sessionID: recovery.parentSessionID,
    ...(input.resume === false ? { resume: false } : {}),
    description: recovery.description,
    text: `<subagent sessionID="${recovery.childSessionID}" state="${input.status}" description="${recovery.description}">\n${text}\n</subagent>`,
    metadata: {
      source: "subagent",
      childID: recovery.childSessionID,
      agent: recovery.agent,
      state: input.status,
      ...(contextTokens === undefined ? {} : { contextTokens }),
    },
  })
  if (input.notificationID) yield* jobs.completeBackground(input.notificationID)
})
