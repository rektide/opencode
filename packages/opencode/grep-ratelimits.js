#!/usr/bin/env node

// pattern: Mixed (unavoidable)
// Reason: user-requested single-file CLI combines orchestration and parsing.

import { spawnSync } from "node:child_process"
import { readdirSync, readlinkSync, statSync } from "node:fs"
import { join } from "node:path"

const cfg = parse(process.argv.slice(2))
const files = list(cfg)
const out = cfg.dump ? all(files, cfg) : recent(files, cfg)

for (const evt of out) {
  console.log(JSON.stringify(evt))
}

function parse(args) {
  const cfg = {
    logDir: process.env.OPENCODE_LOG_PATH || `${process.env.HOME}/.local/share/opencode/log`,
    pattern: "LLM-TRACE-good",
    proc: false,
    dump: false,
    headers: false,
    headersReq: false,
    headersRes: false,
    top: 12,
    topProc: 0,
    bytes: 16 * 1024 * 1024,
    providers: [],
  }

  for (const arg of args) {
    if (arg === "--success") {
      cfg.pattern = "LLM-TRACE-good"
      continue
    }
    if (arg === "--fail") {
      cfg.pattern = "LLM-TRACE-bad"
      continue
    }
    if (arg === "--proc") {
      cfg.proc = true
      continue
    }
    if (arg.startsWith("--top-proc=")) {
      cfg.topProc = int(arg, "--top-proc=")
      cfg.proc = true
      continue
    }
    if (arg === "--dump") {
      cfg.dump = true
      continue
    }
    if (arg === "--headers") {
      cfg.headers = true
      continue
    }
    if (arg === "--headers-req") {
      cfg.headersReq = true
      continue
    }
    if (arg === "--headers-res") {
      cfg.headersRes = true
      continue
    }
    if (arg === "--help" || arg === "-h") {
      help()
      process.exit(0)
    }
    if (arg.startsWith("--provider")) {
      const val = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : ""
      for (const name of val.split(",")) {
        const key = name.trim()
        if (key) cfg.providers.push(key)
      }
      continue
    }
    if (arg.startsWith("--top=")) {
      cfg.top = int(arg, "--top=")
      continue
    }
    if (arg.startsWith("--bytes=")) {
      cfg.bytes = int(arg, "--bytes=")
      continue
    }
  }

  if (cfg.top < 1) die("--top must be >= 1")
  if (cfg.bytes < 1024) die("--bytes must be >= 1024")

  return cfg
}

function help() {
  console.log(`grep-ratelimits.js

Usage:
  grep-ratelimits.js [flags]

Flags:
  --success                  match LLM-TRACE-good (default)
  --fail                     match LLM-TRACE-bad
  --dump                     dump all matching events (default: newest per provider)
  --provider=a,b,c           prefix-match providers; stops when all found
  --top=12                   scan top N newest .log files (default 12)
  --bytes=4194304             read only last N bytes per file (default 4 MiB)
  --proc                     include extra /proc/*/fd log handles
  --top-proc=N               cap proc entries by mtime (implies --proc)
  --headers                  include request + response headers
  --headers-req              include request headers
  --headers-res              include response headers
  -h, --help                 show this help
`)
}

function int(arg, flag) {
  const n = parseInt(arg.slice(flag.length), 10)
  if (Number.isFinite(n)) return n
  die(`invalid number for ${flag}`)
}

function die(msg) {
  console.error(msg)
  process.exit(1)
}

function list(cfg) {
  const base = logs(cfg.logDir, cfg.top)
  if (!cfg.proc) return base
  return [...base, ...open(cfg.logDir, base, cfg.topProc)]
}

function logs(dir, top) {
  try {
    const rows = []
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".log")) continue
      const file = join(dir, name)
      try {
        rows.push({ file, mtime: statSync(file).mtimeMs })
      } catch {}
    }
    rows.sort((a, b) => b.mtime - a.mtime)
    return rows.slice(0, top).map((row) => row.file)
  } catch {
    return []
  }
}

function open(dir, base, top) {
  const rows = []
  const seen = new Set(base)
  const proc = "/proc"

  try {
    for (const pid of readdirSync(proc)) {
      if (!/^\d+$/.test(pid)) continue
      const fds = `${proc}/${pid}/fd`
      try {
        for (const fd of readdirSync(fds)) {
          const path = `${fds}/${fd}`
          try {
            const link = readlinkSync(path).replace(/ \(deleted\)$/, "")
            if (!link.startsWith(dir)) continue
            if (!link.endsWith(".log")) continue
            if (seen.has(link)) continue
            seen.add(link)
            try {
              const name = link.slice(link.lastIndexOf("/") + 1)
              rows.push({ path, name })
            } catch {}
          } catch {}
        }
      } catch {}
    }
  } catch {}

  rows.sort((a, b) => (b.name > a.name ? 1 : b.name < a.name ? -1 : 0))
  const cap = top > 0 ? rows.slice(0, top) : rows
  return cap.map((r) => r.path)
}

function all(files, cfg) {
  const out = []
  for (const file of files) {
    for (const evt of scan(file, cfg)) {
      out.push(evt)
    }
  }
  return out
}

function shard(rl, provider) {
  const reset = rl["x-codex-primary-reset-at"] || rl["x-codex-secondary-reset-at"]
  return reset ? `${provider}:${reset}` : provider
}

function recent(files, cfg) {
  const map = {}

  for (const file of files) {
    for (const evt of scan(file, cfg)) {
      const key = evt.data._shard
      if (!map[key] || tick(evt.time) > tick(map[key].time)) {
        map[key] = evt
      }
    }
    if (ready(map, cfg)) break
  }

  for (const evt of Object.values(map)) {
    delete evt.data._shard
  }

  return Object.values(map)
}

function ready(map, cfg) {
  if (cfg.dump) return false
  if (cfg.providers.length === 0) return false
  const keys = Object.keys(map)
  const byPrefix = {}
  for (const prefix of cfg.providers) {
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1
  }
  for (const [prefix, needed] of Object.entries(byPrefix)) {
    const found = keys.filter((k) => k.startsWith(prefix)).length
    if (found < needed) return false
  }
  return true
}

function tick(time) {
  const ms = Date.parse(time)
  if (Number.isFinite(ms)) return ms
  return 0
}

function match(provider, cfg) {
  if (cfg.providers.length === 0) return true
  for (const prefix of cfg.providers) {
    if (provider.startsWith(prefix)) return true
  }
  return false
}

function scan(file, cfg) {
  const out = []
  for (const line of tail(file, cfg.bytes)) {
    if (!line.includes(cfg.pattern)) continue
    const evt = parseLine(file, line, cfg)
    if (!evt) continue
    if (!match(evt.data.provider || "", cfg)) continue
    out.push(evt)
  }
  return out
}

function tail(file, bytes) {
  const max = Math.max(4 * 1024 * 1024, bytes * 4)
  const chunk = spawnSync("tail", ["-c", String(bytes), "--", file], {
    encoding: "utf8",
    maxBuffer: max,
  })

  if (chunk.error || chunk.status !== 0 || !chunk.stdout) return []

  const rev = spawnSync("tac", [], {
    input: chunk.stdout,
    encoding: "utf8",
    maxBuffer: max,
  })

  if (rev.error || rev.status !== 0 || !rev.stdout) return []
  return rev.stdout.split("\n").filter(Boolean)
}

function parseLine(file, line, cfg) {
  const m = line.match(/^(\w+)\s+(\S+)\s+\+(\d+)ms\s+service=(\S+)\s+(.*)$/)
  if (!m) return null

  const level = m[1]
  const stamp = m[2]
  const duration = m[3]
  const service = m[4]
  const rest = m[5]

  const isGood = rest.includes("LLM-TRACE-good")
  const isBad = rest.includes("LLM-TRACE-bad")
  const type = isGood ? "good" : isBad ? "bad" : null
  if (!type) return null

  const payload = pairs(rest)
  const rl = limits(payload.headers || payload.responseHeaders || payload) || fromMessage(payload.message)
  const data = {
    level,
    duration: parseInt(duration, 10),
    service,
    provider: payload.provider,
    model: payload.model,
    status: payload.status ? parseInt(payload.status, 10) : undefined,
    message: payload.message,
    rateLimit: rl ? nest(rl) : null,
    _shard: rl ? shard(rl, payload.provider) : payload.provider,
  }

  if (cfg.headers || cfg.headersReq) {
    if (payload.requestHeaders) data.requestHeaders = payload.requestHeaders
  }
  if (cfg.headers || cfg.headersRes) {
    if (payload.responseHeaders) data.responseHeaders = payload.responseHeaders
  }

  return {
    specversion: "1.0",
    type: `com.opencode.llm-trace.${type}`,
    source: "/opencode/session/processor",
    id: Buffer.from(`${file}:${stamp}:${line.length}`).toString("base64").slice(0, 16),
    time: `${stamp}Z`,
    data,
  }
}

function pairs(str) {
  const out = {}
  let i = 0

  while (i < str.length) {
    const eq = str.indexOf("=", i)
    if (eq === -1) break

    const key = str.slice(i, eq)
    i = eq + 1

    if (str[i] === "{") {
      let depth = 0
      let j = i
      while (j < str.length) {
        if (str[j] === "{") depth++
        if (str[j] === "}") {
          depth--
          if (depth === 0) {
            j++
            break
          }
        }
        j++
      }
      const json = str.slice(i, j)
      try {
        out[key] = JSON.parse(json)
      } catch {
        out[key] = json
      }
      i = j
    } else if (key === "message") {
      const mark = str.indexOf(" LLM-TRACE", i)
      if (mark !== -1) {
        out[key] = str.slice(i, mark)
        i = mark + 1
      } else {
        let j = i
        while (j < str.length && str[j] !== " " && str[j] !== "=") j++
        out[key] = str.slice(i, j)
        i = j
      }
    } else {
      let j = i
      while (j < str.length && str[j] !== " " && str[j] !== "=") j++
      out[key] = str.slice(i, j)
      i = j
    }

    while (str[i] === " ") i++
  }

  return out
}

function fromMessage(msg) {
  if (typeof msg !== "string") return null
  const out = {}
  for (const m of msg.matchAll(/((?:x-)?(?:rate-[-]?limit|codex)[-\w]*)=([^\s]+)/gi)) {
    out[m[1]] = m[2]
  }
  if (Object.keys(out).length === 0) return null
  for (const [key, value] of Object.entries(out)) {
    if (!key.endsWith("-reset-after-seconds")) continue
    const seconds = parseInt(value, 10)
    if (!Number.isFinite(seconds)) continue
    const name = key.replace("-reset-after-seconds", "-reset-duration-hours")
    out[name] = Math.round((seconds / 3600) * 10) / 10
  }
  return out
}

function limits(headers) {
  if (!headers || typeof headers !== "object") return null

  const out = {}
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase()
    if (/^(x-)?(rate-?limit|codex)/.test(lower)) {
      out[key] = value
    }
  }

  for (const [key, value] of Object.entries(out)) {
    if (!key.endsWith("-reset-after-seconds")) continue
    const seconds = parseInt(value, 10)
    if (!Number.isFinite(seconds)) continue
    const name = key.replace("-reset-after-seconds", "-reset-duration-hours")
    out[name] = Math.round((seconds / 3600) * 10) / 10
  }

  if (Object.keys(out).length === 0) return null
  return out
}

export function nest(flat, maxDepth = Infinity, dropped = new Set(["x", "at", "window-minutes"])) {
  const seqs = [...dropped].map((d) => d.split("-"))
  const root = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = filterSeqs(key.split("-"), seqs)
    if (parts.length === 0) continue
    insert(root, parts, value, maxDepth)
  }
  return collapse(root)
}

export function filterSeqs(parts, seqs) {
  let out = [...parts]
  for (const seq of seqs) {
    if (seq.length === 1) {
      out = out.filter((s) => s !== seq[0])
    } else {
      for (let i = out.length - seq.length; i >= 0; i--) {
        if (seq.every((s, j) => out[i + j] === s)) {
          out = [...out.slice(0, i), ...out.slice(i + seq.length)]
          break
        }
      }
    }
  }
  return out
}

export function insert(node, parts, value, maxDepth, depth = 0) {
  if (depth >= maxDepth) {
    const key = parts.join("-")
    if (!(key in node) || typeof node[key] !== "object") node[key] = value
    return
  }
  if (parts.length === 1) {
    if (!(parts[0] in node) || typeof node[parts[0]] !== "object") node[parts[0]] = value
    return
  }
  const head = parts[0]
  if (typeof node[head] !== "object" || node[head] === null) node[head] = {}
  insert(node[head], parts.slice(1), value, maxDepth, depth + 1)
}

export function collapse(obj) {
  const out = {}
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val !== "object" || val === null) {
      out[key] = val
      continue
    }
    const child = collapse(val)
    const entries = Object.entries(child)
    if (entries.length === 1) {
      const [ck, cv] = entries[0]
      out[`${key}-${ck}`] = cv
    } else {
      out[key] = child
    }
  }
  return out
}
