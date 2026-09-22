import { describe, expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Scope } from "effect"
import { WatchmanDirectory } from "@opencode/core/filesystem/watchman/directory"

/**
 * A scripted daemon: replies to the attach sequence, records subscriptions,
 * and lets tests push PDUs, change clock identities, or kill connections.
 */
function daemon(socketPath: string) {
  const commands: string[] = []
  const subscriptions: string[] = []
  const state = { silent: false, identity: 3 }
  let socket: Socket | undefined
  const server = createServer((connection) => {
    socket = connection
    let buffer = ""
    connection.on("data", (chunk) => {
      buffer += chunk.toString("utf8")
      while (true) {
        const newline = buffer.indexOf("\n")
        if (newline === -1) return
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        if (line === "") continue
        commands.push(line)
        if (state.silent) continue
        const command = JSON.parse(line) as unknown[]
        const reply = replyTo(command, state, subscriptions)
        if (reply) connection.write(JSON.stringify(reply) + "\n")
      }
    })
  })
  const start = async () => {
    await fs.mkdir(path.dirname(socketPath), { recursive: true })
    server.listen(socketPath)
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve)
      server.once("error", reject)
    })
  }
  const close = async () => {
    socket?.destroy()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fs.rm(socketPath, { force: true })
  }
  return {
    commands,
    subscriptions,
    start,
    close,
    silent: () => (state.silent = true),
    changeIdentity: () => (state.identity += 1),
    push: (frame: object) => socket?.write(JSON.stringify(frame) + "\n"),
    destroy: () => socket?.destroy(),
  }
}

function replyTo(command: unknown[], state: { identity: number }, subscriptions: string[]): object | undefined {
  switch (command[0]) {
    case "version":
      return {
        version: "6.0.0",
        capabilities: {
          "cmd-watch": true,
          "cmd-clock": true,
          "cmd-subscribe": true,
          "cmd-unsubscribe": true,
          "field-name": true,
          "field-exists": true,
        },
      }
    case "watch":
      return { watch: command[1] }
    case "clock":
      return { clock: `c:1:2:${state.identity}:4` }
    case "subscribe":
      subscriptions.push(String(command[2]))
      return { subscribe: command[2] }
    case "unsubscribe":
      return { deleted: true }
    default:
      return { error: `unknown command ${String(command[0])}` }
  }
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Harness {
  readonly daemon: ReturnType<typeof daemon>
  readonly published: { readonly path: string; readonly type: string }[]
  readonly invalidations: number[]
  readonly stop: () => Promise<void>
}

/** Subscribes a watch through the controller against a running daemon. */
async function harness(
  effect: (harness: Harness, root: string, socketPath: string) => Promise<void>,
  options: Partial<{ watchmanOptions: Partial<WatchmanDirectory.Options> }> = {},
) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-dir-"))
  const root = path.join(directory, "root")
  await fs.mkdir(root, { recursive: true })
  const socketPath = path.join(directory, "s.sock")
  const server = daemon(socketPath)
  await server.start()
  const published: { path: string; type: string }[] = []
  const invalidations: number[] = []
  const scope = Effect.runSync(Scope.make())
  const subscription = await Effect.runPromise(
    WatchmanDirectory.subscribe(
      {
        socket: socketPath,
        commandTimeoutMs: 1000,
        heartbeatMs: options.watchmanOptions?.heartbeatMs ?? 60_000,
      },
      scope,
      {
        type: "directory",
        target: root,
        ignore: ["node_modules"],
        publish: (update) => published.push(update),
        invalidate: () => invalidations.push(1),
      },
    ),
  )
  try {
    await effect({ daemon: server, published, invalidations, stop: () => subscription.unsubscribe() }, root, socketPath)
  } finally {
    await subscription.unsubscribe()
    await Scope.close(scope, { _tag: "Success", value: undefined } as never)
    await server.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const attached = async (h: { readonly invalidations: number[] }, count: number) => {
  const deadline = Date.now() + 5000
  while (h.invalidations.length < count && Date.now() < deadline) await tick(20)
}

describe("watchman directory controller", () => {
  test("validates options", () => {
    expect(WatchmanDirectory.options({}) instanceof WatchmanDirectory.OptionsError).toBe(true)
    expect(WatchmanDirectory.options({ socket: "relative.sock" }) instanceof WatchmanDirectory.OptionsError).toBe(true)
    expect(
      WatchmanDirectory.options({ socket: "/abs.sock", commandTimeoutMs: 0 }) instanceof WatchmanDirectory.OptionsError,
    ).toBe(true)
    expect(WatchmanDirectory.options({ socket: "/abs.sock" })).toEqual({
      socket: "/abs.sock",
      commandTimeoutMs: 10_000,
    })
  })

  test("returns immediately, invalidates on install, and publishes mapped hints", async () => {
    await harness(async (h, root) => {
      await attached(h, 1)
      const name = h.daemon.subscriptions[0]
      h.daemon.push({
        unilateral: true,
        subscription: name,
        files: [
          { name: "a.txt", exists: true },
          { name: "sub/b.txt", exists: false },
          { name: "node_modules/pkg/x.js", exists: true },
          { name: ".watchman-cookie-9", exists: true },
          { name: "gone", exists: false },
        ],
      })
      await tick(50)
      expect(h.published).toEqual([
        { path: path.join(root, "a.txt"), type: "update" },
        { path: path.join(root, "sub/b.txt"), type: "delete" },
        { path: path.join(root, "gone"), type: "delete" },
      ])
      expect(h.invalidations.length).toBe(1)
    })
  })

  test("drops rows that arrive before the subscribe acknowledgement", async () => {
    await harness(async (h, root) => {
      await attached(h, 1)
      // A predecessor subscription name is stale traffic and never publishes.
      h.daemon.push({ unilateral: true, subscription: "opencode-stale-1", files: [{ name: "x", exists: true }] })
      await tick(50)
      expect(h.published).toEqual([])
    })
  })

  test("a fresh instance invalidates before its rows publish", async () => {
    await harness(async (h, root) => {
      await attached(h, 1)
      const name = h.daemon.subscriptions[0]
      const before = { invalidations: h.invalidations.length, published: h.published.length }
      h.daemon.push({ unilateral: true, subscription: name, is_fresh_instance: true, files: [{ name: "n.txt", exists: true }] })
      await tick(50)
      expect(h.invalidations.length).toBe(before.invalidations + 1)
      expect(h.published.length).toBe(before.published + 1)
      expect(h.published.at(-1)).toEqual({ path: path.join(root, "n.txt"), type: "update" })
    })
  })

  test("reconnects with a fresh clock and a new subscription name after socket loss", async () => {
    await harness(async (h) => {
      await attached(h, 1)
      const firstName = h.daemon.subscriptions[0]
      h.daemon.destroy()
      await attached(h, 2)
      expect(h.daemon.subscriptions.length).toBe(2)
      expect(h.daemon.subscriptions[1]).not.toBe(firstName)
      // Live again: rows through the new generation publish.
      const name = h.daemon.subscriptions[1]
      h.daemon.push({ unilateral: true, subscription: name, files: [{ name: "after.txt", exists: true }] })
      await tick(50)
      expect(h.published.at(-1)?.path).toContain("after.txt")
    })
  })

  test("heartbeat identity change retires the generation", async () => {
    await harness(
      async (h) => {
        await attached(h, 1)
        h.daemon.changeIdentity()
        await attached(h, 2)
        expect(h.daemon.subscriptions.length).toBe(2)
      },
      { watchmanOptions: { heartbeatMs: 80 } },
    )
  })

  test("daemon cancellation reconnects", async () => {
    await harness(async (h) => {
      await attached(h, 1)
      h.daemon.push({ subscription: h.daemon.subscriptions[0], canceled: true, clock: "c:1:2:3:9" })
      await attached(h, 2)
      expect(h.daemon.subscriptions.length).toBe(2)
    })
  })

  test("release unsubscribes, stops publishing, and resolves promptly", async () => {
    await harness(async (h) => {
      await attached(h, 1)
      await h.stop()
      const name = h.daemon.subscriptions[0]
      h.daemon.push({ unilateral: true, subscription: name, files: [{ name: "late.txt", exists: true }] })
      await tick(50)
      expect(h.published.filter((update) => update.path.endsWith("late.txt"))).toEqual([])
      const unsubscribes = h.daemon.commands.filter((line) => JSON.parse(line)[0] === "unsubscribe")
      expect(unsubscribes.length).toBe(1)
    })
  })
})
