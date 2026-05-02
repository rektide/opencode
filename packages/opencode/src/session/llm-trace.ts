import * as Log from "@opencode-ai/core/util/log"

const log = Log.create({ service: "session.processor" })

const RATE_LIMIT_RE = /^(x-)?(rate-?limit|codex)/i

const LOG_HEADERS = process.env.LOG_HEADERS === "true" ? "both" : process.env.LOG_HEADERS === "response" ? "response" : process.env.LOG_HEADERS === "request" ? "request" : false

function extractRateLimits(headers: Record<string, string> | undefined) {
  if (!headers) return { hasHeaders: false, rateLimits: {} as Record<string, string> }
  const rateLimits: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (RATE_LIMIT_RE.test(key)) {
      rateLimits[key] = value
    }
  }
  return { hasHeaders: true, rateLimits }
}

export function traceGood(
  headers: Record<string, string> | undefined,
  provider: string,
  model: string,
) {
  const { hasHeaders, rateLimits } = extractRateLimits(headers)
  const extra: Record<string, unknown> = {
    provider,
    model,
    status: 200,
    hasHeaders,
    ...rateLimits,
  }
  if (LOG_HEADERS === "both" || LOG_HEADERS === "response") {
    if (headers) extra.responseHeaders = headers
  }
  log.info("LLM-TRACE-good", extra)
}

export function traceBad(
  headers: Record<string, string> | undefined,
  provider: string,
  model: string,
  status: number | undefined,
  message: string | undefined,
) {
  const { hasHeaders, rateLimits } = extractRateLimits(headers)
  const extra: Record<string, unknown> = {
    provider,
    model,
    status,
    hasHeaders,
    ...rateLimits,
  }
  if (message) {
    extra.message = message.length > 200 ? message.slice(0, 197) + "..." : message
  }
  if (LOG_HEADERS === "both" || LOG_HEADERS === "response") {
    if (headers) extra.responseHeaders = headers
  }
  log.info("LLM-TRACE-bad", extra)
}

export * as LlmTrace from "./llm-trace"
