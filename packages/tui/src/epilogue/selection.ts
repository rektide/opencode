import type { EpilogueSelectionRule } from "@opencode/plugin/tui/context"
import { lastEpilogueActivity, type EpilogueActivity } from "./activity.ts"

export type EpilogueSession = {
  readonly sessionID: string
  readonly activity: EpilogueActivity
}

/** Use orderEpilogueSessions; wrappers must preserve distinct IDs, current exclusion, and activity order. */
export type EpilogueSessionSource = {
  readonly order: "activity-desc"
  readonly current?: EpilogueSession
  readonly additional: Iterable<EpilogueSession>
}

type EpilogueDecision = { readonly keep: boolean; readonly terminate?: boolean }

/** Host composition grants authority here; the synchronous predicate's result cannot grant it. */
export type EpilogueHostSelectionRule =
  | EpilogueSelectionRule
  | ({ readonly terminating: boolean } & (
      | { readonly type: "membership"; readonly sessionIDs: ReadonlySet<string> }
      | {
          readonly type: "filter"
          readonly evaluate: (
            session: EpilogueSession,
            scope: { readonly index: number; readonly now: number },
          ) => EpilogueDecision
        }
    ))

export type EpilogueSelection = "visible-tabs" | "visible-tabs-2d" | readonly EpilogueSelectionRule[]

export function epilogueSelectionRules(selection: EpilogueSelection): readonly EpilogueSelectionRule[] {
  if (selection === "visible-tabs") return []
  if (selection === "visible-tabs-2d")
    return Object.freeze([{ type: "activity-within", within_ms: 172_800_000, terminating: true }])
  return normalizeEpilogueSelectionRules(selection)
}

export function normalizeEpilogueSelectionRules(input: unknown): readonly EpilogueSelectionRule[] {
  if (!Array.isArray(input)) throw new TypeError("Epilogue selection rules must be an array")
  return Object.freeze(
    input.map((value) => {
      if (!record(value)) throw new TypeError("Epilogue selection rule must be a plain object")
      if (value.type === "activity-within") {
        exactKeys(value, ["type", "within_ms", "terminating"])
        if (typeof value.within_ms !== "number" || !Number.isFinite(value.within_ms) || value.within_ms < 0)
          throw new RangeError("Epilogue activity window must be finite and nonnegative")
        if (typeof value.terminating !== "boolean")
          throw new TypeError("Epilogue selection termination grant must be boolean")
        return Object.freeze({ type: value.type, within_ms: value.within_ms, terminating: value.terminating })
      }
      if (value.type === "limit") {
        exactKeys(value, ["type", "count", "terminating"])
        if (typeof value.count !== "number" || !Number.isInteger(value.count) || value.count < 0)
          throw new RangeError("Epilogue limit must be a nonnegative integer")
        if (typeof value.terminating !== "boolean")
          throw new TypeError("Epilogue selection termination grant must be boolean")
        return Object.freeze({ type: value.type, count: value.count, terminating: value.terminating })
      }
      throw new TypeError("Epilogue selection rule type is invalid")
    }),
  )
}

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
        return (
          lastEpilogueActivity(b.activity) - lastEpilogueActivity(a.activity) ||
          (a.sessionID < b.sessionID ? -1 : a.sessionID > b.sessionID ? 1 : 0)
        )
      }),
  }
}

/** Pin current before narrowing additional Sessions. Stages preserve source order and count their own inputs. */
export function* selectEpilogueSessions(input: {
  readonly source: EpilogueSessionSource
  readonly now: number
  readonly rules?: readonly EpilogueHostSelectionRule[]
}): Generator<EpilogueSession> {
  const rules = input.rules ?? []
  requireSelection(rules, input.now)
  if (input.source.current) yield input.source.current
  yield* rules.reduce((sessions, rule) => applyRule(sessions, rule, input.now), input.source.additional)
}

function requireSelection(rules: readonly EpilogueHostSelectionRule[], now: number) {
  if (!Number.isFinite(now)) throw new RangeError("Epilogue selection requires a finite now")
  rules.forEach((rule) => {
    if (rule.type === "activity-within" && (!Number.isFinite(rule.within_ms) || rule.within_ms < 0))
      throw new RangeError("Epilogue activity window must be finite and nonnegative")
    if (rule.type === "limit" && (!Number.isInteger(rule.count) || rule.count < 0))
      throw new RangeError("Epilogue limit must be a nonnegative integer")
  })
}

function* applyRule(sessions: Iterable<EpilogueSession>, rule: EpilogueHostSelectionRule, now: number) {
  if (rule.type === "limit" && rule.count === 0 && rule.terminating) return
  let index = 0
  for (const session of sessions) {
    const decision = evaluateRule(rule, session, { index: index++, now })
    if (decision.keep) yield session
    if (decision.terminate && rule.terminating) return
  }
}

function evaluateRule(
  rule: EpilogueHostSelectionRule,
  session: EpilogueSession,
  scope: { readonly index: number; readonly now: number },
): EpilogueDecision {
  if (rule.type === "membership") return { keep: rule.sessionIDs.has(session.sessionID) }
  if (rule.type === "limit") return { keep: scope.index < rule.count, terminate: scope.index + 1 >= rule.count }
  if (rule.type === "activity-within") {
    // Running comes first; every later idle Session is no newer, even after preceding narrowing stages.
    const keep =
      session.activity.status === "running" || lastEpilogueActivity(session.activity) >= scope.now - rule.within_ms
    return { keep, terminate: !keep }
  }
  return rule.evaluate(session, scope)
}

function record(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(input).some((key) => !keys.includes(key)))
    throw new TypeError("Epilogue selection rule contains an unknown field")
}
