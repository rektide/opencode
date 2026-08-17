import { NodeFileSystem } from "@effect/platform-node"
import { Global } from "@opencode-ai/util/global"
import { OPENCODE_VERSION } from "../src/version"
import { expect, test } from "bun:test"
import { Effect, FileSystem, Scope } from "effect"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ServerConnection } from "../src/services/server-connection"
import { ServiceConfig } from "../src/services/service-config"

test("service patience env vars parameterize probe and eviction thresholds", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-service-patience-"))
  const layer = Global.layerWith({ config: path.join(root, "config"), state: path.join(root, "state") })
  const runPromise = <A, E>(effect: Effect.Effect<A, E, Global.Service | FileSystem.FileSystem | Scope.Scope>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(NodeFileSystem.layer), Effect.scoped))

  try {
    const defaults = await runPromise(ServiceConfig.options())
    expect(defaults.probeTimeoutSeconds).toBeUndefined()
    expect(defaults.evictionStrikes).toBeUndefined()
    expect(defaults.killGraceSeconds).toBeUndefined()

    process.env["OPENCODE_SERVICE_PROBE_TIMEOUT"] = "3"
    process.env["OPENCODE_SERVICE_EVICTION_STRIKES"] = "100"
    process.env["OPENCODE_SERVICE_KILL_GRACE"] = "240"
    try {
      const tuned = await runPromise(ServiceConfig.options())
      expect(tuned.probeTimeoutSeconds).toBe(3)
      expect(tuned.evictionStrikes).toBe(100)
      expect(tuned.killGraceSeconds).toBe(240)
    } finally {
      delete process.env["OPENCODE_SERVICE_PROBE_TIMEOUT"]
      delete process.env["OPENCODE_SERVICE_EVICTION_STRIKES"]
      delete process.env["OPENCODE_SERVICE_KILL_GRACE"]
    }

    process.env["OPENCODE_SERVICE_EVICTION_STRIKES"] = "bogus"
    try {
      expect((await runPromise(ServiceConfig.options())).evictionStrikes).toBeUndefined()
    } finally {
      delete process.env["OPENCODE_SERVICE_EVICTION_STRIKES"]
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("resolution groups Effect-native lifecycle operations only for the managed service", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-server-resolution-"))
  const id = "server-resolution-test"
  const server = Bun.serve({
    port: 0,
    fetch() {
      return Response.json({
        healthy: true,
        version: OPENCODE_VERSION,
        pid: process.pid,
      })
    },
  })
  const registration = path.join(root, "state", ServiceConfig.filename())
  const layer = Global.layerWith({ config: path.join(root, "config"), state: path.join(root, "state") })
  const runPromise = <A, E>(effect: Effect.Effect<A, E, Global.Service | FileSystem.FileSystem | Scope.Scope>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(NodeFileSystem.layer), Effect.scoped))

  try {
    await fs.mkdir(path.dirname(registration), { recursive: true })
    await fs.writeFile(
      registration,
      JSON.stringify({
        id,
        version: OPENCODE_VERSION,
        url: server.url.toString(),
        pid: process.pid,
      }),
    )
    const resolved = await runPromise(ServerConnection.resolve({}))

    expect(resolved.endpoint.url).toBe(server.url.toString())
    expect(resolved.service).toBeDefined()
    if (!resolved.service) throw new Error("Expected managed service capabilities")
    expect(Effect.isEffect(resolved.service.reconnect())).toBe(true)
    expect(Effect.isEffect(resolved.service.restart())).toBe(true)
    expect(await runPromise(resolved.service.reconnect())).toEqual(resolved.endpoint)

    const explicit = await runPromise(ServerConnection.resolve({ server: server.url.toString() }))
    expect(explicit.endpoint.url).toBe(server.url.toString())
    expect(explicit.service).toBeUndefined()
  } finally {
    await server.stop(true)
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("service options only require a matching version when requested", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-service-options-"))
  const layer = Global.layerWith({ config: path.join(root, "config"), state: path.join(root, "state") })
  const runPromise = <A, E>(effect: Effect.Effect<A, E, Global.Service | FileSystem.FileSystem | Scope.Scope>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer), Effect.provide(NodeFileSystem.layer), Effect.scoped))

  try {
    expect((await runPromise(ServiceConfig.options())).version).toBeUndefined()
    expect((await runPromise(ServiceConfig.options({ checkVersion: true }))).version).toBe(OPENCODE_VERSION)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
