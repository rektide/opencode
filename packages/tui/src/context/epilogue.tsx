import type { EpilogueSelectionRule } from "@opencode/plugin/tui/context"
import { createComputed, createMemo, mapArray } from "solid-js"
import stripAnsi from "strip-ansi"
import { normalizeEpilogueSelectionRules } from "../epilogue/selection.ts"
import { stringWidth } from "../util/string-width.ts"
import {
  epilogueOutput,
  type EpilogueRow,
  type EpilogueValue,
  type RetainedEpilogue,
  type RetainedSessionEpilogue,
  type SessionEpilogueCandidate,
} from "../util/presentation.ts"
import { createSimpleContext } from "./helper"

type State =
  | { readonly status: "live"; readonly batch?: RetainedEpilogue }
  | { readonly status: "frozen"; readonly output?: string }
  | { readonly status: "written" }

export type EpilogueProjection = (scope: { readonly sessionID: string }) => unknown
export type EpilogueSelectionTransform = (rules: EpilogueSelectionRule[]) => unknown

export type EpilogueContribution =
  | { readonly type: "projection"; readonly scope: "global" | "session"; readonly project: EpilogueProjection }
  | { readonly type: "retained"; readonly scope: "global"; readonly value: unknown }
  | { readonly type: "retained"; readonly scope: "session"; readonly sessionID: string; readonly value: unknown }

export type EpilogueContributionGroup = {
  readonly plugin: string
  readonly contributions: readonly {
    readonly key: string
    readonly contribution: EpilogueContribution
  }[]
}

export type EpilogueSelectionTransformGroup = {
  readonly plugin: string
  readonly transforms: readonly {
    readonly key: string
    readonly transform: EpilogueSelectionTransform
  }[]
}

export type EpilogueProjectionIssue = {
  readonly plugin: string
  readonly key: string
  readonly type: "projection" | "validation"
  readonly error: unknown
}

export const epilogueLimits = {
  label: 24,
  text: 48,
  rowsPerPlugin: 8,
} as const

const reserved = new Set(["Session", "Continue"])

class EpilogueValidationError extends Error {}

export function createEpilogue() {
  let state: State = { status: "live" }
  return {
    setBatch(batch?: RetainedEpilogue) {
      if (state.status !== "live") return
      state = { status: "live", batch: batch ? copyBatch(batch) : undefined }
    },
    freeze(now: number) {
      if (state.status !== "live") return
      state = {
        status: "frozen",
        output: state.batch ? epilogueOutput(state.batch, now) : undefined,
      }
    },
    take() {
      if (state.status !== "frozen") return undefined
      const output = state.output
      state = { status: "written" }
      return output
    },
  }
}

export function trackEpilogue(input: {
  readonly currentID: () => string | undefined
  readonly sessionIDs: () => readonly string[]
  readonly candidate: (sessionID: string) => SessionEpilogueCandidate | undefined
  readonly groups: () => readonly EpilogueContributionGroup[]
  readonly publish: (retained: RetainedEpilogue) => void
  readonly report: (issue: EpilogueProjectionIssue) => void
}) {
  const globalRows = createMemo(() => collectRows(input.groups(), "global", input.currentID(), input.report))
  const sessions = mapArray(input.sessionIDs, (sessionID) => {
    const rows = createMemo(() => collectRows(input.groups(), "session", sessionID, input.report))
    return (): RetainedSessionEpilogue | undefined => {
      const candidate = input.candidate(sessionID)
      if (!candidate) return undefined
      return { candidate, rows: rows() }
    }
  })
  createComputed(() => {
    input.publish({
      globalRows: globalRows(),
      sessions: Object.freeze(
        sessions().flatMap((session) => {
          const value = session()
          return value ? [value] : []
        }),
      ),
    })
  })
}

export function transformEpilogueSelection(input: {
  readonly base: readonly EpilogueSelectionRule[]
  readonly groups: readonly EpilogueSelectionTransformGroup[]
  readonly report: (issue: EpilogueProjectionIssue) => void
}) {
  return input.groups.reduce((rules, group) => {
    return group.transforms.reduce((current, item) => {
      const draft = current.map((rule) => ({ ...rule }))
      const result = (() => {
        try {
          return item.transform(draft)
        } catch (error) {
          input.report({ plugin: group.plugin, key: item.key, type: "projection", error })
          return failedTransform
        }
      })()
      if (result === failedTransform) return current
      if (thenable(result)) {
        void Promise.resolve(result).catch(() => undefined)
        input.report({
          plugin: group.plugin,
          key: item.key,
          type: "validation",
          error: new EpilogueValidationError("Epilogue selection transform must be synchronous"),
        })
        return current
      }
      try {
        return normalizeEpilogueSelectionRules(draft)
      } catch (error) {
        input.report({ plugin: group.plugin, key: item.key, type: "validation", error })
        return current
      }
    }, rules)
  }, normalizeEpilogueSelectionRules(input.base))
}

const failedTransform = Symbol("failed epilogue selection transform")

function collectRows(
  groups: readonly EpilogueContributionGroup[],
  lane: "global" | "session",
  sessionID: string | undefined,
  report: (issue: EpilogueProjectionIssue) => void,
) {
  return Object.freeze(
    groups.flatMap((group) =>
      group.contributions
        .filter((item) => applies(item.contribution, lane, sessionID))
        .slice(0, epilogueLimits.rowsPerPlugin)
        .flatMap((item) => {
          try {
            const value = project(item.contribution, sessionID)
            if (value === undefined) return []
            return [normalizeEpilogueRow(value)]
          } catch (error) {
            report({
              plugin: group.plugin,
              key: item.key,
              type: error instanceof EpilogueValidationError ? "validation" : "projection",
              error,
            })
            return []
          }
        }),
    ),
  )
}

function applies(contribution: EpilogueContribution, lane: "global" | "session", sessionID: string | undefined) {
  if (contribution.scope !== lane) return false
  if (contribution.type !== "retained" || contribution.scope !== "session") return true
  return contribution.sessionID === sessionID
}

function project(contribution: EpilogueContribution, sessionID: string | undefined) {
  if (contribution.type === "retained") return contribution.value
  if (!sessionID) return undefined
  return contribution.project(Object.freeze({ sessionID }))
}

export function normalizeEpilogueRow(input: unknown): EpilogueRow {
  if (thenable(input)) {
    void Promise.resolve(input).catch(() => undefined)
    throw new EpilogueValidationError("Epilogue projection must be synchronous")
  }
  if (!record(input)) throw new EpilogueValidationError("Epilogue row must be a plain object")
  const label = text(input.label, epilogueLimits.label, "label")
  if (reserved.has(label)) throw new EpilogueValidationError(`Epilogue label is reserved: ${label}`)
  if (!record(input.value)) throw new EpilogueValidationError("Epilogue value must be a plain object")

  const value: EpilogueValue = (() => {
    if (input.value.type === "text")
      return Object.freeze({ type: "text" as const, text: text(input.value.text, epilogueLimits.text, "value") })
    if (input.value.type === "relative-time" && typeof input.value.timestamp === "number") {
      if (!Number.isFinite(input.value.timestamp))
        throw new EpilogueValidationError("Epilogue timestamp must be finite")
      return Object.freeze({ type: "relative-time" as const, timestamp: input.value.timestamp })
    }
    throw new EpilogueValidationError("Epilogue value type is invalid")
  })()
  return Object.freeze({ label, value })
}

function copyBatch(input: RetainedEpilogue): RetainedEpilogue {
  return Object.freeze({
    globalRows: Object.freeze(input.globalRows.map(copyRow)),
    sessions: Object.freeze(
      input.sessions.map((session) =>
        Object.freeze({
          candidate: Object.freeze({
            title: session.candidate.title,
            sessionID: session.candidate.sessionID,
            activity: Object.freeze({
              status: session.candidate.activity.status,
              updated: session.candidate.activity.updated,
              idle: session.candidate.activity.idle,
            }),
          }),
          rows: Object.freeze(session.rows.map(copyRow)),
        }),
      ),
    ),
  })
}

function copyRow(row: EpilogueRow): EpilogueRow {
  return Object.freeze({ label: row.label, value: Object.freeze({ ...row.value }) })
}

function thenable(input: unknown): input is PromiseLike<unknown> {
  if ((typeof input !== "object" || input === null) && typeof input !== "function") return false
  return "then" in input && typeof input.then === "function"
}

function record(input: unknown): input is Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false
  const prototype = Object.getPrototypeOf(input)
  return prototype === Object.prototype || prototype === null
}

function text(input: unknown, limit: number, name: string) {
  if (typeof input !== "string") throw new EpilogueValidationError(`Epilogue ${name} must be text`)
  if (stripAnsi(input) !== input || Array.from(input).some(control))
    throw new EpilogueValidationError(`Epilogue ${name} must not contain terminal controls`)
  const value = input.trim()
  if (!value) throw new EpilogueValidationError(`Epilogue ${name} must not be empty`)
  if (stringWidth(value) > limit)
    throw new EpilogueValidationError(`Epilogue ${name} exceeds its ${limit}-column limit`)
  return value
}

function control(value: string) {
  const code = value.codePointAt(0) ?? 0
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x061c ||
    code === 0x200e ||
    code === 0x200f ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  )
}

export const { use: useEpilogue, provider: EpilogueProvider } = createSimpleContext({
  name: "Epilogue",
  init: (props: { value: Pick<ReturnType<typeof createEpilogue>, "setBatch"> }) => props.value,
})
