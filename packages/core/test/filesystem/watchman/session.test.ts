import { expect } from "bun:test"
import { createServer, type Server, type Socket } from "node:net"
import path from "node:path"
import { Effect, Fiber } from "effect"
import { WatchmanSession } from "@opencode-ai/core/filesystem/watcher/watchman/session"
import { tmpdirScoped } from "../../fixture/tmpdir"
import { it } from "../../lib/effect"

it.live("keeps unilateral pushes out of the pending command slot", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const listener = yield* listen(path.join(directory.path, "watchman.sock"))
    const pushes: unknown[] = []
    const losses: unknown[] = []
    const session = yield* WatchmanSession.open(
      { socket: listener.path, commandTimeoutMs: 1_000 },
      (push) => pushes.push(push),
      (failure) => losses.push(failure),
    )
    const peer = yield* Effect.promise(() => listener.accepted)
    const request = yield* session
      .request({ type: "watch", root: "/repo" })
      .pipe(Effect.forkScoped({ startImmediately: true }))

    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual(["watch", "/repo"])
    peer.send(
      {
        unilateral: true,
        subscription: "opencode-run-1",
        root: "/repo",
        clock: "c:1:2:3:4",
        is_fresh_instance: false,
        files: [{ name: "src/index.ts", exists: true, type: "f" }],
      },
      { version: "2026.09.05", watch: "/repo" },
    )

    expect(yield* Fiber.join(request)).toEqual({ type: "watch", watch: "/repo" })
    expect(pushes).toEqual([
      {
        type: "batch",
        subscription: "opencode-run-1",
        root: "/repo",
        clock: "c:1:2:3:4",
        fresh: false,
        files: [{ name: "src/index.ts", exists: true, type: "f" }],
      },
    ])
    expect(losses).toEqual([])
  }),
)

it.live("destroys the session when a submitted request is interrupted", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const listener = yield* listen(path.join(directory.path, "watchman.sock"))
    const losses: WatchmanSession.Failure[] = []
    const session = yield* WatchmanSession.open(
      { socket: listener.path, commandTimeoutMs: 1_000 },
      () => {},
      (failure) => losses.push(failure),
    )
    const peer = yield* Effect.promise(() => listener.accepted)
    const request = yield* session
      .request({ type: "clock", root: "/repo" })
      .pipe(Effect.forkScoped({ startImmediately: true }))

    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual(["clock", "/repo"])
    const closed = new Promise<void>((resolve) => peer.socket.once("close", () => resolve()))
    yield* Fiber.interrupt(request)
    yield* Effect.promise(() => closed)
    yield* session.close()
    yield* session.close()

    expect(losses.map((failure) => failure.reason)).toEqual(["interrupted"])
  }),
)

it.live("decodes split UTF-8 frames and both unsubscribe reply dialects", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const listener = yield* listen(path.join(directory.path, "watchman.sock"))
    const pushes: unknown[] = []
    const session = yield* WatchmanSession.open(
      { socket: listener.path, commandTimeoutMs: 1_000 },
      (push) => pushes.push(push),
      () => {},
    )
    const peer = yield* Effect.promise(() => listener.accepted)
    const clock = yield* session.request({ type: "clock", root: "/repo" }).pipe(Effect.forkScoped)
    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual(["clock", "/repo"])

    const frames = Buffer.from(
      `${JSON.stringify({
        unilateral: true,
        subscription: "sub",
        files: [{ name: "src/é.ts", exists: true, type: "f" }],
      })}\n${JSON.stringify({ clock: "c:1:2:3:4" })}\n`,
    )
    const split = frames.indexOf(Buffer.from("é")) + 1
    peer.socket.write(frames.subarray(0, split))
    peer.socket.write(frames.subarray(split))
    expect(yield* Fiber.join(clock)).toEqual({ type: "clock", clock: "c:1:2:3:4" })
    expect(pushes).toEqual([
      {
        type: "batch",
        subscription: "sub",
        fresh: false,
        files: [{ name: "src/é.ts", exists: true, type: "f" }],
      },
    ])

    const subscribe = yield* session
      .request({ type: "subscribe", root: "/repo", name: "merged", since: "c:1:2:3:4" })
      .pipe(Effect.forkScoped)
    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual([
      "subscribe",
      "/repo",
      "merged",
      { since: "c:1:2:3:4", fields: ["name", "exists", "type"] },
    ])
    peer.send({
      subscribe: "merged",
      clock: "c:1:2:3:5",
      root: "/repo",
      is_fresh_instance: true,
      files: [{ name: "src/index.ts", exists: true, type: "f" }],
    })
    expect(yield* Fiber.join(subscribe)).toEqual({
      type: "subscribe",
      subscribe: "merged",
      clock: "c:1:2:3:5",
    })

    const stock = yield* session
      .request({ type: "unsubscribe", root: "/repo", name: "stock" })
      .pipe(Effect.forkScoped)
    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual(["unsubscribe", "/repo", "stock"])
    peer.send({ unsubscribe: "stock", deleted: true })
    expect(yield* Fiber.join(stock)).toEqual({ type: "unsubscribe", subscription: "stock", deleted: true })

    const watchwoman = yield* session
      .request({ type: "unsubscribe", root: "/repo", name: "watchwoman" })
      .pipe(Effect.forkScoped)
    expect(JSON.parse(yield* Effect.promise(() => peer.next()))).toEqual(["unsubscribe", "/repo", "watchwoman"])
    peer.send({ subscription: "watchwoman", unsubscribed: true })
    expect(yield* Fiber.join(watchwoman)).toEqual({
      type: "unsubscribe",
      subscription: "watchwoman",
      deleted: true,
    })
  }),
)

it.live("terminates the session on malformed protocol input", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const listener = yield* listen(path.join(directory.path, "watchman.sock"))
    const losses: WatchmanSession.Failure[] = []
    const session = yield* WatchmanSession.open(
      { socket: listener.path, commandTimeoutMs: 1_000 },
      () => {},
      (failure) => losses.push(failure),
    )
    const peer = yield* Effect.promise(() => listener.accepted)
    const request = yield* session.request({ type: "clock", root: "/repo" }).pipe(Effect.forkScoped)
    yield* Effect.promise(() => peer.next())
    peer.socket.write("{not-json}\n")

    expect(yield* Fiber.join(request).pipe(Effect.flip)).toMatchObject({ reason: "protocol" })
    yield* Effect.yieldNow
    expect(losses.map((failure) => failure.reason)).toEqual(["protocol"])
  }),
)

it.live("times out a submitted command and closes its socket", () =>
  Effect.gen(function* () {
    const directory = yield* tmpdirScoped()
    const listener = yield* listen(path.join(directory.path, "watchman.sock"))
    const losses: WatchmanSession.Failure[] = []
    const session = yield* WatchmanSession.open(
      { socket: listener.path, commandTimeoutMs: 25 },
      () => {},
      (failure) => losses.push(failure),
    )
    const peer = yield* Effect.promise(() => listener.accepted)
    const closed = new Promise<void>((resolve) => peer.socket.once("close", () => resolve()))

    expect(yield* session.request({ type: "clock", root: "/repo" }).pipe(Effect.flip)).toMatchObject({
      reason: "timeout",
    })
    yield* Effect.promise(() => closed)
    expect(losses.map((failure) => failure.reason)).toEqual(["timeout"])
  }),
)

type Peer = {
  readonly socket: Socket
  readonly next: () => Promise<string>
  readonly send: (...frames: readonly unknown[]) => void
}

function listen(socketPath: string) {
  let accept: (peer: Peer) => void
  const accepted = new Promise<Peer>((resolve) => {
    accept = resolve
  })
  const server = createServer((socket) => accept(makePeer(socket)))
  return Effect.acquireRelease(
    Effect.promise(
      () =>
        new Promise<{ readonly path: string; readonly server: Server; readonly accepted: Promise<Peer> }>(
          (resolve, reject) => {
            server.once("error", reject)
            server.listen(socketPath, () => resolve({ path: socketPath, server, accepted }))
          },
        ),
    ),
    (listener) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve, reject) => {
            listener.server.close((error) => (error ? reject(error) : resolve()))
          }),
      ).pipe(Effect.orDie),
  )
}

function makePeer(socket: Socket): Peer {
  const lines: string[] = []
  const waiting: Array<(line: string) => void> = []
  let buffer = ""
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8")
    for (;;) {
      const index = buffer.indexOf("\n")
      if (index < 0) return
      const line = buffer.slice(0, index)
      buffer = buffer.slice(index + 1)
      const resolve = waiting.shift()
      if (resolve) resolve(line)
      else lines.push(line)
    }
  })
  return {
    socket,
    next: () => {
      const line = lines.shift()
      if (line !== undefined) return Promise.resolve(line)
      return new Promise((resolve) => waiting.push(resolve))
    },
    send: (...frames) => socket.write(`${frames.map((frame) => JSON.stringify(frame)).join("\n")}\n`),
  }
}
