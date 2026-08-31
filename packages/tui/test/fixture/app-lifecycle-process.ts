import { NodeRuntime } from "@effect/platform-node"
import { createTestRenderer } from "@opentui/core/testing"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { Global } from "@opencode-ai/util/global"
import { Effect, FileSystem } from "effect"
import { pathToFileURL } from "node:url"
import { run } from "../../src/app.tsx"

const server = process.env.OPENCODE_EPILOGUE_SERVER
const ready = process.env.OPENCODE_EPILOGUE_READY
const plugin = process.env.OPENCODE_EPILOGUE_PLUGIN
if (!server || !ready || !plugin) throw new Error("Missing epilogue process fixture configuration")

const setup = await createTestRenderer({ width: 80, height: 24, useThread: false })
const setTitle = setup.renderer.setTerminalTitle.bind(setup.renderer)
setup.renderer.setTerminalTitle = (title) => {
  setTitle(title)
  if (title === "OC | Demo session") void Bun.write(ready, "ready\n")
}

const write = process.stdout.write.bind(process.stdout)
process.stdout.write = ((
  chunk: string | Uint8Array,
  encoding?: BufferEncoding | ((error?: Error | null) => void),
  callback?: (error?: Error | null) => void,
) => {
  setTimeout(() => {
    if (typeof encoding === "string") {
      write(chunk, encoding, callback)
      return
    }
    write(chunk, encoding)
  }, 100)
  return false
}) as typeof process.stdout.write

run({
  app: { name: "test", version: "test", channel: "test" },
  server: { endpoint: { url: server } },
  config: { get: async () => ({}), update: async () => ({}) },
  packages: { resolve: async () => pathToFileURL(plugin).href },
  terminalHandoff: async () => ({ renderer: setup.renderer, mode: "dark", complete: () => {} }),
  args: { sessionID: "dummy" },
  log: () => {},
}).pipe(
  Effect.provide(AppNodeBuilder.build(Global.node)),
  Effect.provide(FileSystem.layerNoop({})),
  Effect.scoped,
  Effect.tap(() => Effect.sync(() => process.exit(process.exitCode ?? 0))),
  NodeRuntime.runMain,
)
