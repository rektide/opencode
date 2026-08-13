export * as SubagentListTool from "./subagent-list"

import type { Context as PluginContext } from "@opencode-ai/plugin/effect/plugin"
import { ToolFailure } from "@opencode-ai/ai"
import { DateTime, Effect, Schema } from "effect"
import { PluginRuntime } from "../../plugin/runtime"
import { SessionSchema } from "../../session/schema"

export const name = "subagent_list"

export const Input = Schema.Struct({})

const Prompt = Schema.Struct({
  text: Schema.String,
  time: Schema.Number,
  state: Schema.Literals(["history", "pending"]),
})

const Child = Schema.Struct({
  sessionID: SessionSchema.ID,
  agent: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  status: Schema.Literals(["running", "completed", "error", "cancelled", "idle"]),
  error: Schema.optionalKey(Schema.String),
  prompts: Schema.Array(Prompt),
})

export const Output = Schema.Array(Child)
type EncodedOutput = typeof Output.Encoded

export const description = [
  "Lists every direct subagent child of the current session, including children no longer present in process-local job state.",
  "Use this after losing earlier tool results or when you need a child sessionID for continuation.",
  "Status is conservative: idle means no running job or durable terminal result is known.",
].join("\n")

const initialPrefix = "You are a subagent spawned by another session.\n"

export const toModelContent = (children: EncodedOutput) => {
  if (children.length === 0) return "No direct subagent children found."
  return [
    JSON.stringify(children, null, 2),
    "",
    "To continue a non-running child, call subagent with its sessionID, the same agent, a new prompt, and background omitted or false.",
    "Do not continue a child whose status is running. Status idle means durable history cannot prove a terminal outcome.",
  ].join("\n")
}

export const Plugin = {
  id: "opencode.tool.subagent-list",
  effect: Effect.fn("SubagentListTool.Plugin")(function* (ctx: PluginContext) {
    const runtime = yield* PluginRuntime.Service
    yield* ctx.tool
      .transform((draft) =>
        draft.add({
          name,
          options: { codemode: false },
          description,
          input: Input,
          output: Output,
          execute: (_, context) =>
            Effect.gen(function* () {
              const sessions = (yield* runtime.session.list({ parentID: context.sessionID })).data.filter(
                (session) => session.fork === undefined,
              )
              const active = yield* runtime.session.active
              return yield* Effect.forEach(sessions, (session) =>
                Effect.gen(function* () {
                  const messages = yield* runtime.session.messages({ sessionID: session.id, order: "asc" })
                  const pending = yield* runtime.session.pending(session.id)
                  const prompts = [
                    ...messages.flatMap((message) =>
                      message.type === "user"
                        ? [
                            {
                              text: message.text,
                              time: DateTime.toEpochMillis(message.time.created),
                              state: "history" as const,
                            },
                          ]
                        : [],
                    ),
                    ...pending.flatMap((message) =>
                      message.type === "user"
                        ? [
                            {
                              text: message.data.text,
                              time: DateTime.toEpochMillis(message.timeCreated),
                              state: "pending" as const,
                            },
                          ]
                        : [],
                    ),
                  ]
                    .toSorted((a, b) => a.time - b.time)
                    .map((prompt, index) => ({
                      ...prompt,
                      text:
                        index === 0 && prompt.text.startsWith(initialPrefix)
                          ? prompt.text.slice(initialPrefix.length)
                          : prompt.text,
                    }))
                  const job = yield* runtime.job.get(session.id)
                  const latestUserIndex = messages.findLastIndex((message) => message.type === "user")
                  const latestAssistantIndex = messages.findLastIndex((message) => message.type === "assistant")
                  const latestAssistant = messages[latestAssistantIndex]
                  const durable =
                    latestAssistant?.type === "assistant" &&
                    latestAssistantIndex > latestUserIndex &&
                    !pending.some((message) => message.type === "user")
                      ? latestAssistant.error
                        ? { status: "error" as const, error: latestAssistant.error.message }
                        : latestAssistant.time.completed !== undefined
                          ? { status: "completed" as const }
                          : { status: "idle" as const }
                      : { status: "idle" as const }
                  return {
                    sessionID: session.id,
                    ...(session.agent ? { agent: session.agent } : {}),
                    ...(session.title ? { title: session.title } : {}),
                    createdAt: DateTime.toEpochMillis(session.time.created),
                    updatedAt: DateTime.toEpochMillis(session.time.updated),
                    prompts,
                    ...(active.has(session.id)
                      ? { status: "running" as const }
                      : job
                      ? {
                          status: job.status,
                          ...(job.status === "error" && job.error ? { error: job.error } : {}),
                        }
                      : durable),
                  }
                }),
              )
            }).pipe(
              Effect.map((output) => ({
                output,
                content: toModelContent(output),
                metadata: { count: output.length },
              })),
              Effect.mapError((error) => new ToolFailure({ message: "Unable to list subagent sessions", error })),
            ),
        }),
      )
      .pipe(Effect.orDie)
  }),
}
