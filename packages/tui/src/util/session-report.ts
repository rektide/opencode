import type { OpenCodeClient, SessionInfo, SessionMessageInfo } from "@opencode-ai/client"
import { withTimestampedFallback } from "@opencode-ai/util/session-title-fallback"
import { toolDisplayContent } from "./tool-display"

export async function formatSessionReports(api: OpenCodeClient, sessionIDs: readonly string[]) {
  const reports = []
  for (const sessionID of sessionIDs) {
    const [session, first] = await Promise.all([
      api.session.get({ sessionID }),
      api.message.list({ sessionID, limit: 200, order: "asc" }),
    ])
    const pages = [first]
    while (pages.at(-1)?.cursor.next) {
      pages.push(
        await api.message.list({
          sessionID,
          limit: 200,
          cursor: pages.at(-1)!.cursor.next ?? undefined,
        }),
      )
    }
    reports.push(formatSessionTranscript(session, pages.flatMap((page) => page.data), true))
  }
  return reports.join("\n\n---\n\n")
}

export function formatSessionTranscript(session: SessionInfo, messages: SessionMessageInfo[], thinking: boolean) {
  const body = messages.flatMap((message) => {
    if (message.type === "user") return [`## User\n\n${message.text}`]
    if (message.type === "shell")
      return [`## Shell\n\n\`\`\`\n$ ${message.command}\n${message.output?.output ?? ""}\n\`\`\``]
    if (message.type !== "assistant") return []
    const content = message.content.flatMap((item) => {
      if (item.type === "text") return [item.text]
      if (item.type === "reasoning") return thinking ? [`_Thinking:_\n\n${item.text}`] : []
      const input = typeof item.state.input === "string" ? item.state.input : JSON.stringify(item.state.input, null, 2)
      const output =
        item.state.status === "error"
          ? item.state.error.message
          : item.state.status === "streaming"
            ? ""
            : toolDisplayContent(item.state)
                .flatMap((entry) => (entry.type === "text" ? [entry.text] : [entry.name ?? entry.uri]))
                .join("\n")
      return [`**Tool: ${item.name}**\n\n**Input:**\n\`\`\`json\n${input}\n\`\`\`\n\n${output}`]
    })
    return [`## Assistant\n\n${content.join("\n\n")}`]
  })
  return `# ${withTimestampedFallback(session)}\n\n**Session ID:** ${session.id}\n**Created:** ${new Date(session.time.created).toLocaleString()}\n**Updated:** ${new Date(session.time.updated).toLocaleString()}\n\n---\n\n${body.join("\n\n---\n\n")}\n`
}
