import { Global } from "@opencode-ai/util/global"
import { OPENCODE_CHANNEL, OPENCODE_VERSION } from "../version"
import { Hash } from "@opencode-ai/util/hash"
import { Service } from "@opencode-ai/client/effect/service"
import { Effect, FileSystem, Option, Schema } from "effect"
import { randomBytes } from "crypto"
import path from "path"
import { selfCommand } from "../util/process"

// The CLI's service configuration file, plus the Service.EnsureOptions binding that
// points the client package's service operations at this CLI: which
// registration file (by channel), which version, and how to spawn opencode.

export const Info = Schema.Struct({
  hostname: Schema.optional(Schema.String),
  port: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(65_535))),
  password: Schema.optional(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  external: Schema.optional(Schema.Boolean),
})
export type Info = typeof Info.Type

const keys = ["hostname", "port", "password", "env", "external"] as const
type Key = (typeof keys)[number]

const decodeInfo = Schema.decodeUnknownEffect(Schema.fromJsonString(Info))
const decodeRegistration = Schema.decodeUnknownEffect(Schema.fromJsonString(Service.Info))

export function filename(channel = OPENCODE_CHANNEL) {
  if (channel === "latest" || channel === "dev" || channel === "beta" || channel === "next") return "service.json"
  return `service-${channel.replace(/[^a-zA-Z0-9._-]/g, "-")}.json`
}

export function defaultPort(channel = OPENCODE_CHANNEL) {
  if (channel === "latest" || channel === "dev" || channel === "beta" || channel === "next") return 0xc0de
  if (channel === "local") return 0xc0df
  return 10_000 + (Number.parseInt(Hash.fast(channel).slice(0, 8), 16) % 50_000)
}

export function legacyFilename(channel = OPENCODE_CHANNEL) {
  if (channel === "latest" || channel === "local") return
  return `service-${Hash.fast(channel)}.json`
}

export function versionBelongsToChannel(
  version: string | undefined,
  channel = OPENCODE_CHANNEL,
  installedVersion = OPENCODE_VERSION,
) {
  if (version === undefined) return false
  if (version === installedVersion) return true
  const prefix = `0.0.0-${channel}-`
  if (!version.startsWith(prefix)) return false
  return /^\d+(?:\.\d+)?$/.test(version.slice(prefix.length))
}

export const migrateRegistration = Effect.fnUntraced(function* (
  legacy: string,
  file: string,
  channel = OPENCODE_CHANNEL,
  installedVersion = OPENCODE_VERSION,
) {
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs.readFileString(legacy).pipe(Effect.option)
  if (Option.isNone(text)) return
  const registration = yield* decodeRegistration(text.value).pipe(Effect.option)
  if (Option.isNone(registration)) return
  if (!versionBelongsToChannel(registration.value.version, channel, installedVersion)) return
  yield* fs.writeFileString(file, text.value, { flag: "wx", mode: 0o600 }).pipe(Effect.ignore)
})

export const migrateConfig = Effect.fnUntraced(function* (legacy: string, file: string) {
  const fs = yield* FileSystem.FileSystem
  const text = yield* fs.readFileString(legacy).pipe(Effect.option)
  if (Option.isNone(text)) return
  if (Option.isNone(yield* decodeInfo(text.value).pipe(Effect.option))) return
  yield* fs.writeFileString(file, text.value, { flag: "wx", mode: 0o600 }).pipe(Effect.ignore)
})

function configKey(key: string): Key {
  if (key === "hostname" || key === "port" || key === "password" || key === "env" || key === "external") return key
  throw new Error(`Unknown service config key: ${key}`)
}

const paths = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const global = yield* Global.Service
  const name = filename()
  const legacy = legacyFilename()
  const file = path.join(global.state, name)
  return {
    fs,
    file,
    legacyConfigFile: legacy ? path.join(global.config, legacy) : undefined,
    legacyRegistrationFiles: [
      ...(legacy ? [path.join(global.state, legacy)] : []),
      ...(name !== "service.json" && OPENCODE_CHANNEL !== "local" ? [path.join(global.state, "service.json")] : []),
    ],
    configFile: path.join(global.config, name),
  }
})

export const options = Effect.fnUntraced(function* (input: { readonly checkVersion?: boolean } = {}) {
  const { file, legacyRegistrationFiles } = yield* paths
  yield* Effect.forEach(legacyRegistrationFiles, (legacy) => migrateRegistration(legacy, file))
  const probeTimeoutSeconds = seconds("OPENCODE_SERVICE_PROBE_TIMEOUT")
  const evictionStrikes = positiveInteger("OPENCODE_SERVICE_EVICTION_STRIKES")
  const killGraceSeconds = seconds("OPENCODE_SERVICE_KILL_GRACE")
  return {
    file,
    version: input.checkVersion ? OPENCODE_VERSION : undefined,
    env: (yield* read()).env,
    command: [
      ...selfCommand(),
      "serve",
      "--service",
      ...(process.env.OPENCODE_CPU_PROFILE ? ["--cpu-profile", process.env.OPENCODE_CPU_PROFILE] : []),
    ],
    ...(probeTimeoutSeconds !== undefined ? { probeTimeoutSeconds } : {}),
    ...(evictionStrikes !== undefined ? { evictionStrikes } : {}),
    ...(killGraceSeconds !== undefined ? { killGraceSeconds } : {}),
  }
})

// Patience tuning for the background service health probes, in seconds (and
// one strike count). Defaults preserve historical behavior; set
// OPENCODE_SERVICE_EVICTION_STRIKES / _PROBE_TIMEOUT / _KILL_GRACE to tolerate
// slow-but-alive servers instead of evicting them.
function seconds(name: string) {
  const value = Number(process.env[name])
  return process.env[name] !== undefined && Number.isFinite(value) && value > 0 ? value : undefined
}

function positiveInteger(name: string) {
  const value = Number(process.env[name])
  return process.env[name] !== undefined && Number.isInteger(value) && value > 0 ? value : undefined
}

export const read = Effect.fn("cli.service-config.read")(function* () {
  const { fs, configFile, legacyConfigFile } = yield* paths
  if (legacyConfigFile) yield* migrateConfig(legacyConfigFile, configFile)
  return yield* fs.readFileString(configFile).pipe(
    Effect.flatMap(decodeInfo),
    Effect.catch(() => Effect.succeed({} as Info)),
  )
})

const write = Effect.fn("cli.service-config.write")(function* (value: Info) {
  const { fs, configFile } = yield* paths
  const temp = configFile + ".tmp"
  yield* fs.makeDirectory(path.dirname(configFile), { recursive: true })
  yield* fs.writeFileString(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 })
  yield* fs.rename(temp, configFile)
})

export const password = Effect.fn("cli.service-config.password")(function* (value?: string) {
  const existing = yield* read()
  if (value === undefined && existing.password) return existing.password
  const next = value ?? randomBytes(32).toString("base64url")

  // Keep one private credential across server restarts so discovered clients
  // can reconnect without exposing a password flag or environment variable.
  yield* write({ ...existing, password: next })
  return next
})

// External management: a supervisor such as systemd owns the service process.
// Clients discover only and never spawn, evict, or stop the service. The env
// var overrides the config key in either direction so units and shells can
// force a mode without touching persisted state.
export const external = Effect.fnUntraced(function* () {
  const override = process.env["OPENCODE_SERVICE_EXTERNAL"]
  if (override !== undefined) return override === "1" || override.toLowerCase() === "true"
  return (yield* read()).external === true
})
export const requireInternal = Effect.fnUntraced(function* (action: string) {
  if (yield* external())
    return yield* Effect.fail(
      new Error(`Background service is externally managed; use your service manager to ${action} it (service.external)`),
    )
})
export const expectedURL = Effect.fnUntraced(function* () {
  const config = yield* read()
  const hostname = config.hostname ?? "127.0.0.1"
  const port = config.port ?? defaultPort()
  return `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:${port}`
})
export const get = Effect.fn("cli.service-config.get")(function* (key?: string, name?: string) {
  if (key === undefined) {
    const { password: _password, ...safe } = yield* read()
    return JSON.stringify(safe, null, 2)
  }
  const selected = configKey(key)
  if (selected !== "env" && name !== undefined) throw new Error(`Usage: opencode service get ${selected}`)
  switch (selected) {
    case "hostname": {
      return (yield* read()).hostname ?? ""
    }
    case "port": {
      const port = (yield* read()).port
      return port === undefined ? "" : String(port)
    }
    case "password": {
      return yield* password()
    }
    case "env": {
      const env = (yield* read()).env ?? {}
      return name === undefined ? JSON.stringify(env, null, 2) : (env[name] ?? "")
    }
    case "external": {
      return String((yield* read()).external === true)
    }
  }
  throw new Error(`Unknown service config key: ${key}`)
})

export const set = Effect.fn("cli.service-config.set")(function* (key: string, value: string, nestedValue?: string) {
  const selected = configKey(key)
  if (selected !== "env" && nestedValue !== undefined)
    throw new Error(`Usage: opencode service set ${selected} <value>`)
  switch (selected) {
    case "hostname": {
      yield* stopUnlessExternal()
      yield* write({ ...(yield* read()), hostname: value })
      return
    }
    case "port": {
      const port = Number(value)
      if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Port must be between 1 and 65535")
      yield* stopUnlessExternal()
      yield* write({ ...(yield* read()), port })
      return
    }
    case "password": {
      yield* stopUnlessExternal()
      yield* password(value)
      return
    }
    case "env": {
      if (nestedValue === undefined) throw new Error("Usage: opencode service set env <key> <value>")
      yield* stopUnlessExternal()
      const existing = yield* read()
      yield* write({ ...existing, env: { ...existing.env, [value]: nestedValue } })
      return
    }
    case "external": {
      const next = value === "true" || value === "1" ? true : value === "false" || value === "0" ? false : undefined
      if (next === undefined) throw new Error("External must be true or false")
      yield* write({ ...(yield* read()), external: next })
      return
    }
  }
})

export const unset = Effect.fn("cli.service-config.unset")(function* (key: string, name?: string) {
  const selected = configKey(key)
  if (selected !== "env" && name !== undefined) throw new Error(`Usage: opencode service unset ${selected}`)
  switch (selected) {
    case "hostname": {
      yield* stopUnlessExternal()
      const { hostname: _hostname, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "port": {
      yield* stopUnlessExternal()
      const { port: _port, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "password": {
      yield* stopUnlessExternal()
      const { password: _password, ...next } = yield* read()
      yield* write(next)
      return
    }
    case "env": {
      if (name === undefined) throw new Error("Usage: opencode service unset env <key>")
      yield* stopUnlessExternal()
      const existing = yield* read()
      const { [name]: _removed, ...env } = existing.env ?? {}
      const { env: _existingEnv, ...rest } = existing
      yield* write(Object.keys(env).length === 0 ? rest : { ...rest, env })
      return
    }
    case "external": {
      const { external: _external, ...next } = yield* read()
      yield* write(next)
      return
    }
  }
})

const stopUnlessExternal = Effect.fnUntraced(function* () {
  if (yield* external()) return
  yield* Service.stop(yield* options())
})

export * as ServiceConfig from "./service-config"
