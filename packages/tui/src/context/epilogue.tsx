import { createSimpleContext } from "./helper"
import { createComputed } from "solid-js"
import stripAnsi from "strip-ansi"
import { stringWidth } from "../util/string-width.ts"
import {
  sessionEpilogue,
  type EpilogueRow,
  type EpilogueValue,
  type SessionEpilogueCandidate,
} from "../util/presentation.ts"

type RetainedRows = {
  readonly sessionID: string
  readonly rows: readonly EpilogueRow[]
}

type State =
  | { readonly status: "live"; readonly candidate?: SessionEpilogueCandidate; readonly retained?: RetainedRows }
  | { readonly status: "frozen"; readonly output?: string }
  | { readonly status: "written" }

export type EpilogueProjection = (scope: { readonly sessionID: string }) => unknown

export type EpilogueProjectionGroup = {
  readonly plugin: string
  readonly projections: readonly {
    readonly key: string
    readonly project: EpilogueProjection
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

const reserved = new Set(["Session", "Active", "Continue"])

class EpilogueValidationError extends Error {}

export function createEpilogue() {
  let state: State = { status: "live" }
  return {
    set(candidate?: SessionEpilogueCandidate) {
      if (state.status !== "live") return
      state = { ...state, candidate }
    },
    clear(sessionID: string) {
      if (state.status !== "live" || state.candidate?.sessionID !== sessionID) return
      state = {
        status: "live",
        retained: state.retained?.sessionID === sessionID ? undefined : state.retained,
      }
    },
    setRows(retained?: RetainedRows) {
      if (state.status !== "live") return
      state = { ...state, retained }
    },
    freeze(now: number) {
      if (state.status !== "live") return
      const retained = state.retained
      const rows =
        retained && retained.sessionID === state.candidate?.sessionID ? retained.rows : ([] as readonly EpilogueRow[])
      state = {
        status: "frozen",
        output: state.candidate ? sessionEpilogue(state.candidate, now, rows) : undefined,
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

export function trackEpilogueRows(input: {
  readonly sessionID: () => string | undefined
  readonly groups: () => readonly EpilogueProjectionGroup[]
  readonly publish: (retained?: RetainedRows) => void
  readonly report: (issue: EpilogueProjectionIssue) => void
}) {
  createComputed(() => {
    const sessionID = input.sessionID()
    if (!sessionID) return input.publish()
    const scope = { sessionID }
    const rows = input.groups().flatMap((group) =>
      group.projections.slice(0, epilogueLimits.rowsPerPlugin).flatMap((projection) => {
        try {
          const candidate = projection.project(scope)
          if (candidate === undefined) return []
          return [normalize(candidate)]
        } catch (error) {
          input.report({
            plugin: group.plugin,
            key: projection.key,
            type: error instanceof EpilogueValidationError ? "validation" : "projection",
            error,
          })
          return []
        }
      }),
    )
    input.publish({ sessionID, rows: Object.freeze(rows) })
  })
}

function normalize(input: unknown): EpilogueRow {
  if (!record(input)) throw new EpilogueValidationError("Epilogue row must be a plain object")
  if ("then" in input && typeof input.then === "function")
    throw new EpilogueValidationError("Epilogue projection must be synchronous")
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
  init: (props: { value: Pick<ReturnType<typeof createEpilogue>, "set" | "clear" | "setRows"> }) => props.value,
})
