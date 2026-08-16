import { OpenCode, type SessionInfo } from "@opencode-ai/client"

export type SessionReviewEntry = {
  reference: string
  line: number
}

export function parseSessionReview(content: string) {
  return content.split(/\r?\n/).flatMap((value, index) => {
    const line = value.trim()
    if (!line || line.startsWith("#")) return []
    return [{ reference: line.split(/\s+/, 1)[0], line: index + 1 }]
  })
}

export async function resolveSessionReview(
  api: ReturnType<typeof OpenCode.make>,
  source: string,
  entries: readonly SessionReviewEntry[],
) {
  if (entries.length === 0) throw new Error(`${source}: review list contains no sessions`)
  const listed = await listSessions(api)
  const sessions = new Map(listed.map((session) => [session.id, session]))
  const resolved: SessionInfo[] = []
  for (const entry of entries) {
    const exact = sessions.get(entry.reference)
    if (exact) {
      resolved.push(exact)
      continue
    }
    const matches = listed.filter((session) => session.id.startsWith(entry.reference))
    if (matches.length === 1) {
      resolved.push(matches[0])
      continue
    }
    const reason = matches.length === 0 ? "unknown session" : `ambiguous prefix (${matches.map((item) => item.id).join(", ")})`
    throw new Error(`${source}:${entry.line}: ${reason}: ${entry.reference}`)
  }
  return normalizeSessionRoots(api, resolved, sessions)
}

export async function resolveSessionIDs(api: ReturnType<typeof OpenCode.make>, sessionIDs: readonly string[]) {
  const sessions = new Map<string, SessionInfo>()
  const resolved = []
  for (const sessionID of sessionIDs) {
    const session = sessions.get(sessionID) ?? (await api.session.get({ sessionID }))
    sessions.set(session.id, session)
    resolved.push(session)
  }
  return normalizeSessionRoots(api, resolved, sessions)
}

export function selectSessionReviewCursor(
  sessionIDs: readonly string[],
  explicitSessionIDs: readonly string[],
  persistedSessionID?: string,
) {
  return explicitSessionIDs.findLast((sessionID) => sessionIDs.includes(sessionID)) ??
    (persistedSessionID && sessionIDs.includes(persistedSessionID) ? persistedSessionID : sessionIDs[0])
}

export function nextSessionReview(sessionIDs: readonly string[], currentSessionID?: string) {
  const index = currentSessionID ? sessionIDs.indexOf(currentSessionID) : -1
  if (index === -1) return sessionIDs[0]
  return sessionIDs[index + 1]
}

async function listSessions(api: ReturnType<typeof OpenCode.make>) {
  const sessions: SessionInfo[] = []
  let cursor: string | undefined
  do {
    const response = await api.session.list({ limit: 100, cursor })
    sessions.push(...response.data)
    cursor = response.cursor.next ?? undefined
  } while (cursor)
  return sessions
}

async function normalizeSessionRoots(
  api: ReturnType<typeof OpenCode.make>,
  input: readonly SessionInfo[],
  sessions: Map<string, SessionInfo>,
) {
  const roots: string[] = []
  for (const initial of input) {
    let session = initial
    const seen = new Set([session.id])
    while (session.parentID && !seen.has(session.parentID)) {
      seen.add(session.parentID)
      const parentID = session.parentID
      session = sessions.get(parentID) ?? (await api.session.get({ sessionID: parentID }))
      sessions.set(session.id, session)
    }
    if (!roots.includes(session.id)) roots.push(session.id)
  }
  return roots
}
