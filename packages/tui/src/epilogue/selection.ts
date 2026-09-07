export type EpilogueSession = {
  readonly sessionID: string
  readonly activity: {
    readonly status: "idle" | "running"
    readonly updated: number
    readonly idle?: number
  }
}

/** Use orderEpilogueSessions; wrappers must preserve distinct IDs, current exclusion, and activity order. */
export type EpilogueSessionSource = {
  readonly order: "activity-desc"
  readonly current?: EpilogueSession
  readonly additional: Iterable<EpilogueSession>
}

type EpilogueDecision = { readonly keep: boolean; readonly terminate?: boolean }

/** Host composition grants authority here; the synchronous predicate's result cannot grant it. */
export type EpilogueSelectionRule = { readonly terminating: boolean } & (
  | { readonly type: "membership"; readonly sessionIDs: ReadonlySet<string> }
  | { readonly type: "activity-within"; readonly within_ms: number }
  | { readonly type: "limit"; readonly count: number }
  | {
      readonly type: "filter"
      readonly evaluate: (
        session: EpilogueSession,
        scope: { readonly index: number; readonly now: number },
      ) => EpilogueDecision
    }
)

/**
 * Scans all supplied metadata before selection; missing entries are omitted and the first ID wins.
 * The caller owns the read-only facts and must keep them stable while consuming the selection.
 */
export function orderEpilogueSessions(input: {
  readonly sessions: Iterable<EpilogueSession | undefined>
  readonly currentID?: string
}): EpilogueSessionSource {
  const sessions = new Map<string, EpilogueSession>()
  for (const session of input.sessions) {
    if (session && !sessions.has(session.sessionID)) sessions.set(session.sessionID, session)
  }
  return {
    order: "activity-desc",
    current: input.currentID === undefined ? undefined : sessions.get(input.currentID),
    additional: Array.from(sessions.values())
      .filter((session) => session.sessionID !== input.currentID)
      .sort((a, b) => {
        if (a.activity.status !== b.activity.status) return a.activity.status === "running" ? -1 : 1
        return lastActivity(b) - lastActivity(a) || (a.sessionID < b.sessionID ? -1 : a.sessionID > b.sessionID ? 1 : 0)
      }),
  }
}

/** Pin current before narrowing additional Sessions. Stages preserve source order and count their own inputs. */
export function* selectEpilogueSessions(input: {
  readonly source: EpilogueSessionSource
  readonly now: number
  readonly rules?: readonly EpilogueSelectionRule[]
}): Generator<EpilogueSession> {
  const rules = input.rules ?? []
  requireSelection(rules, input.now)
  if (input.source.current) yield input.source.current
  yield* rules.reduce((sessions, rule) => applyRule(sessions, rule, input.now), input.source.additional)
}

function requireSelection(rules: readonly EpilogueSelectionRule[], now: number) {
  if (!Number.isFinite(now)) throw new RangeError("Epilogue selection requires a finite now")
  rules.forEach((rule) => {
    if (rule.type === "activity-within" && (!Number.isFinite(rule.within_ms) || rule.within_ms < 0))
      throw new RangeError("Epilogue activity window must be finite and nonnegative")
    if (rule.type === "limit" && (!Number.isInteger(rule.count) || rule.count < 0))
      throw new RangeError("Epilogue limit must be a nonnegative integer")
  })
}

function* applyRule(sessions: Iterable<EpilogueSession>, rule: EpilogueSelectionRule, now: number) {
  if (rule.type === "limit" && rule.count === 0 && rule.terminating) return
  let index = 0
  for (const session of sessions) {
    const decision = evaluateRule(rule, session, { index: index++, now })
    if (decision.keep) yield session
    if (decision.terminate && rule.terminating) return
  }
}

function evaluateRule(
  rule: EpilogueSelectionRule,
  session: EpilogueSession,
  scope: { readonly index: number; readonly now: number },
): EpilogueDecision {
  if (rule.type === "membership") return { keep: rule.sessionIDs.has(session.sessionID) }
  if (rule.type === "limit") return { keep: scope.index < rule.count, terminate: scope.index + 1 >= rule.count }
  if (rule.type === "activity-within") {
    // Running comes first; every later idle Session is no newer, even after preceding narrowing stages.
    const keep = session.activity.status === "running" || lastActivity(session) >= scope.now - rule.within_ms
    return { keep, terminate: !keep }
  }
  return rule.evaluate(session, scope)
}

function lastActivity(session: EpilogueSession) {
  return Math.max(session.activity.updated, session.activity.idle ?? session.activity.updated)
}
