import { Tool } from "./tool"
import z from "zod"
import { SessionCompaction } from "../session/compaction"
import { SessionPrompt } from "../session/prompt"
import { Agent } from "../agent/agent"

export const CompacterTool = Tool.define("compacter", async () => {
  return {
    description:
      "Run session compaction after the user has agreed on a custom compaction prompt. " +
      "This should be called only after you and the user have iterated on and confirmed the prompt.",
    parameters: z.object({
      /**
       * The session to compact. Usually the current session.
       */
      session_id: z.string().describe("The ID of the session to compact"),
      /**
       * The final, user-approved compaction prompt to use as guidance.
       */
      prompt: z
        .string()
        .describe(
          "The custom compaction guidance the user has approved. " +
            "Use this to help the system retain the most valuable context.",
        ),
      /**
       * Whether this compaction was initiated automatically or manually.
       */
      auto: z.boolean().default(false).describe("Whether this compaction is considered automatic"),
    }),
    async execute(params, ctx) {
      const sessionID = params.session_id

      // Determine an agent/model to use as the 'current' agent for compaction.
      // We prefer the last user agent if possible, otherwise the default agent.
      const session = await ctx.sdk.session.get({ sessionID }).then((x) => x.data!)
      const lastUser = session.messages
        .filter((m) => m.role === "user")
        .toReversed()[0] as { agent?: string } | undefined

      const agentName = lastUser?.agent ?? (await Agent.defaultAgent())

      // Queue a compaction task; the normal SessionPrompt.loop will pick it up.
      await SessionCompaction.create({
        sessionID,
        agent: agentName,
        model: {
          providerID: ctx.extra.model.providerID,
          modelID: ctx.extra.model.modelID,
        },
        auto: params.auto,
      })

      // Run the prompt loop to actually perform compaction. The plugin hook
      // `experimental.session.compacting` can use the provided prompt.
      await SessionPrompt.loop(sessionID)

      return {
        title: "Session compacted",
        metadata: {
          sessionID,
        },
        output:
          "Compaction has been requested for this session using the agreed custom prompt. " +
          "If you need to adjust the compaction behavior further, ask the user and run the compacter tool again.",
      }
    },
  }
})


