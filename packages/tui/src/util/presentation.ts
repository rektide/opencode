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
  const weak = (text: string) => `${dim}${text}${" ".repeat(Math.max(1, 10 - stringWidth(text)))}${reset}`
  const value = (row: EpilogueRow) => (row.value.type === "text" ? row.value.text : activeAgo(row.value.timestamp, now))
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Active")}${bold}${
      input.activity.status === "running"
        ? "running"
        : activeAgo(Math.max(input.activity.updated, input.activity.idle ?? input.activity.updated), now)
    }${reset}`,
    ...rows.map((row) => `  ${weak(row.label)}${bold}${value(row)}${reset}`),
    `  ${weak("Continue")}${bold}opencode2 -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
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
