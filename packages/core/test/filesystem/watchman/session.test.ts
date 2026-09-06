import { describe, expect, test } from "bun:test"
import { createServer, type Socket } from "node:net"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { Session } from "@opencode-ai/core/filesystem/watchman/session"

/** A scripted watchman-compatible peer speaking newline-delimited JSON. */
function peer(socketPath: string) {
  const received: string[] = []
  const state = { silent: false }
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
        received.push(line)
        if (state.silent) continue
        const reply = replyTo(JSON.parse(line) as unknown[])
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
    received,
    start,
    close,
    silent: () => (state.silent = true),
    push: (frame: object) => socket?.write(JSON.stringify(frame) + "\n"),
    raw: (bytes: Buffer) => socket?.write(bytes),
    destroy: () => socket?.destroy(),
  }
}

function replyTo(command: unknown[]): object | undefined {
  switch (command[0]) {
    case "version":
      return {
        version: "6.0.0",
        capabilities: { "cmd-watch": true, "cmd-clock": true, "cmd-subscribe": true, "cmd-unsubscribe": true },
      }
    case "watch":
      return command[1] === "/denied" ? { error: "failed to watch" } : { watch: command[1] }
    case "clock":
      return { clock: "c:1:2:3:4" }
    case "subscribe":
      return { subscribe: command[2] }
    case "unsubscribe":
      return { deleted: true }
    default:
      return { error: `unknown command ${String(command[0])}` }
  }
}

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function withPeer(effect: (server: ReturnType<typeof peer>, socketPath: string) => Promise<void>) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-session-"))
  const socketPath = path.join(directory, "s.sock")
  const server = peer(socketPath)
  await server.start()
  try {
    await effect(server, socketPath)
  } finally {
    await server.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}

const open = (socketPath: string) => Effect.runPromise(Session.open({ socket: socketPath, commandTimeoutMs: 1000 }, () => {}, () => {}))

/** Runs one request, resolving with the typed failure instead of rejecting. */
const attempt = (session: Session.Session, command: Parameters<Session.Session["request"]>[0]) =>
  Effect.runPromise(Effect.flip(session.request(command as never)))

describe("watchman session", () => {
  test("round-trips commands and decodes typed replies", async () => {
    await withPeer(async (server, socketPath) => {
      const session = await open(socketPath)
      const version = await Effect.runPromise(session.request({ type: "version", required: ["cmd-watch"] }))
      const watched = await Effect.runPromise(session.request({ type: "watch", root: "/root" }))
      const clock = await Effect.runPromise(session.request({ type: "clock", root: "/root" }))
      await Effect.runPromise(session.close())
      expect(version.capabilities["cmd-watch"]).toBe(true)
      expect(watched.watch).toBe("/root")
      expect(clock.clock).toBe("c:1:2:3:4")
      expect(JSON.parse(server.received[0])).toEqual(["version", { required: ["cmd-watch"] }])
      expect(JSON.parse(server.received[1])).toEqual(["watch", "/root"])
    })
  })

  test("delivers unilateral pushes without consuming the pending command", async () => {
    await withPeer(async (server, socketPath) => {
      const pushes: unknown[] = []
      const session = await Effect.runPromise(
        Session.open({ socket: socketPath, commandTimeoutMs: 1000 }, (frame) => pushes.push(frame), () => {}),
      )
      const pending = Effect.runPromise(session.request({ type: "clock", root: "/root" }))
      await tick(10)
      server.push({ subscription: "sub", clock: "c:1:2:3:5", files: [{ name: "a", exists: true }] })
      server.push({ unilateral: true, subscription: "sub", files: [{ name: "b", exists: false }] })
      const clock = await pending
      await tick(20)
      expect(clock.clock).toBe("c:1:2:3:4")
      expect(pushes).toEqual([
        { type: "push", subscription: "sub", clock: "c:1:2:3:5", fresh: false, files: [{ name: "a", exists: true }] },
        { type: "push", subscription: "sub", clock: undefined, fresh: false, files: [{ name: "b", exists: false }] },
      ])
      await Effect.runPromise(session.close())
    })
  })

  test("a merged subscribe acknowledgement settles the command and drops its rows", async () => {
    await withPeer(async (server, socketPath) => {
      const session = await open(socketPath)
      const pending = Effect.runPromise(session.request({ type: "subscribe", root: "/root", name: "name", since: "c:1" }))
      await tick(10)
      server.push({ subscribe: "name", files: [{ name: "x", exists: true }] })
      const reply = await pending
      expect(reply.subscribe).toBe("name")
      await Effect.runPromise(session.close())
    })
  })

  test("error replies fail the command as a rejection; the session survives", async () => {
    await withPeer(async (_server, socketPath) => {
      const session = await open(socketPath)
      const rejection = await attempt(session, { type: "watch", root: "/denied" })
      expect(rejection._tag).toBe("WatchmanRejected")
      const clock = await Effect.runPromise(session.request({ type: "clock", root: "/root" }))
      expect(clock.clock).toBe("c:1:2:3:4")
      await Effect.runPromise(session.close())
    })
  })

  test("handles split multibyte frames and multiple frames per chunk", async () => {
    await withPeer(async (server, socketPath) => {
      const pushes: number[] = []
      const session = await Effect.runPromise(
        Session.open(
          { socket: socketPath, commandTimeoutMs: 1000 },
          (frame) => {
            if (frame.type === "push") pushes.push(frame.files.length)
          },
          () => {},
        ),
      )
      const frames = Buffer.from(
        JSON.stringify({ subscription: "s", files: [{ name: "fé", exists: true }] }) +
          "\n" +
          JSON.stringify({ subscription: "s", files: [] }) +
          "\n",
        "utf8",
      )
      // Split inside the multibyte é sequence and between the two frames.
      const split = frames.indexOf("f") + 2
      server.raw(frames.subarray(0, split))
      await tick(10)
      server.raw(frames.subarray(split))
      await tick(10)
      expect(pushes).toEqual([1, 0])
      await Effect.runPromise(session.close())
    })
  })

  test("terminates on malformed frames and fails in-flight requests", async () => {
    await withPeer(async (server, socketPath) => {
      const lost: string[] = []
      const session = await Effect.runPromise(
        Session.open({ socket: socketPath, commandTimeoutMs: 1000 }, () => {}, (failure) => lost.push(failure._tag)),
      )
      server.raw(Buffer.from("this is not json\n"))
      const failure = await attempt(session, { type: "clock", root: "/root" })
      expect(failure._tag).toBe("WatchmanProtocolError")
      expect(lost).toEqual(["WatchmanProtocolError"])
    })
  })

  test("peer EOF terminates the session", async () => {
    await withPeer(async (server, socketPath) => {
      const lost: string[] = []
      const session = await Effect.runPromise(
        Session.open({ socket: socketPath, commandTimeoutMs: 1000 }, () => {}, (failure) => lost.push(failure._tag)),
      )
      server.destroy()
      await tick(50)
      expect(lost).toEqual(["WatchmanTransportError"])
      const failure = await attempt(session, { type: "clock", root: "/root" })
      expect(failure._tag).toBe("WatchmanTransportError")
    })
  })

  test("commands time out and destroy the session", async () => {
    await withPeer(async (server, socketPath) => {
      server.silent()
      const lost: string[] = []
      const session = await Effect.runPromise(
        Session.open({ socket: socketPath, commandTimeoutMs: 60 }, () => {}, (failure) => lost.push(failure._tag)),
      )
      const failure = await attempt(session, { type: "clock", root: "/root" })
      expect(failure._tag).toBe("WatchmanTimeout")
      await tick(50)
      expect(lost).toEqual(["WatchmanTimeout"])
    })
  })

  test("close writes an optional final command, half-closes, and joins", async () => {
    await withPeer(async (server, socketPath) => {
      const session = await open(socketPath)
      await Effect.runPromise(session.close({ type: "unsubscribe", root: "/root", name: "name" }))
      await tick(20)
      const last = server.received.at(-1)
      expect(last && JSON.parse(last)[0]).toBe("unsubscribe")
      await Effect.runPromise(session.close())
    })
  })
})
