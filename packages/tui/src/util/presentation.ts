import { logo } from "../logo"
import { stringWidth } from "./string-width.ts"

export type EpilogueValue =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "relative-time"; readonly timestamp: number }

export type EpilogueRow = {
  readonly label: string
  readonly value: EpilogueValue
}

export type SessionEpilogueCandidate = {
  readonly title: string
  readonly sessionID: string
  readonly activity: {
    readonly status: "idle" | "running"
    readonly updated: number
    readonly idle?: number
  }
}

export type RetainedSessionEpilogue = {
  readonly candidate: SessionEpilogueCandidate
  readonly rows: readonly EpilogueRow[]
}

export type RetainedEpilogue = {
  readonly globalRows: readonly EpilogueRow[]
  readonly sessions: readonly RetainedSessionEpilogue[]
}

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"

function wordmark(pad = "") {
  const draw = (line: string, fg: string, shadow: string, bg: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${bg} ${reset}`
        if (char === "^") return `${fg}${bg}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const left = draw(line, dim, "\x1b[38;5;235m", "\x1b[48;5;235m")
    const right = draw(logo.right[index] ?? "", reset, "\x1b[38;5;238m", "\x1b[48;5;238m")
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: SessionEpilogueCandidate, now: number, rows: readonly EpilogueRow[] = []) {
  return epilogueOutput({ globalRows: [], sessions: [{ candidate: input, rows }] }, now) ?? ""
}

export function epilogueOutput(input: RetainedEpilogue, now: number) {
  if (input.globalRows.length === 0 && input.sessions.length === 0) return undefined
  const weak = (text: string) => `${dim}${text}${" ".repeat(Math.max(1, 10 - stringWidth(text)))}${reset}`
  const value = (row: EpilogueRow) => (row.value.type === "text" ? row.value.text : activeAgo(row.value.timestamp, now))
  const row = (item: EpilogueRow) => `  ${weak(item.label)}${bold}${value(item)}${reset}`
  const global = input.globalRows.map(row)
  const sessions = input.sessions.flatMap((session) => [
    `  ${weak("Session")}${bold}${session.candidate.title}${reset}`,
    ...session.rows.map(row),
    `  ${weak("Continue")}${bold}opencode -s ${session.candidate.sessionID}${reset}`,
    "",
  ])
  return [...wordmark("  "), "", ...global, ...(global.length ? [""] : []), ...sessions].join("\n")
}

function activeAgo(updated: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - updated) / 60_000))
  if (minutes < 1) return "now"

  const hours = Math.floor(minutes / 60)
  if (hours < 1) return `${minutes}m ago`

  const days = Math.floor(hours / 24)
  if (days < 1) return `${hours}hr${minutes % 60 ? ` ${minutes % 60}m` : ""} ago`
  return `${days}d${hours % 24 ? ` ${hours % 24}hr` : ""} ago`
}
