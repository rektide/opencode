import { logo } from "../logo"

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

export function sessionEpilogue(input: { title: string; sessionID?: string; updated?: number }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    ...(input.updated === undefined ? [] : [`  ${weak("Active")}${bold}${activeAgo(input.updated)}${reset}`]),
    `  ${weak("Continue")}${bold}opencode2 -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}

function activeAgo(updated: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - updated) / 60_000))
  if (minutes < 1) return "now"

  const hours = Math.floor(minutes / 60)
  if (hours < 1) return `${minutes}m ago`

  const days = Math.floor(hours / 24)
  if (days < 1) return `${hours}hr${minutes % 60 ? ` ${minutes % 60}m` : ""} ago`
  return `${days}d${hours % 24 ? ` ${hours % 24}hr` : ""} ago`
}
