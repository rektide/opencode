export * as Session from "./session.js"

import { connect, type Socket } from "node:net"
import { Deferred, Effect, Schema } from "effect"
import { Protocol } from "./protocol.js"

/**
 * A terminal JSON-line Unix-socket session to a watchman-compatible daemon.
 *
 * One session serves one controller for its whole life. Any terminal event —
 * remote EOF, socket error, command timeout, malformed or oversize input,
 * or explicit close — latches once, settles every outstanding request with
 * a failure, and notifies `lost`. A session object never reconnects; the
 * controller opens a fresh one per attempt.
 */

export class ConnectError extends Schema.TaggedError<ConnectError>()("WatchmanConnectError", {
  socket: Schema.String,
  code: Schema.String,
}) {
  override get message() {
    return `cannot connect to watchman at ${this.socket}: ${this.code}`
  }
}

export class TimeoutError extends Schema.TaggedError<TimeoutError>()("WatchmanTimeout", {
  command: Schema.String,
}) {
  override get message() {
    return `watchman command timed out: ${this.command}`
  }
}

export class ProtocolError extends Schema.TaggedError<ProtocolError>()("WatchmanProtocolError", {
  reason: Schema.String,
}) {
  override get message() {
    return `watchman protocol failure: ${this.reason}`
  }
}

export class TransportError extends Schema.TaggedError<TransportError>()("WatchmanTransportError", {
  reason: Schema.String,
}) {
  override get message() {
    return `watchman session lost: ${this.reason}`
  }
}

export class RejectedError extends Schema.TaggedError<RejectedError>()("WatchmanRejected", {
  error: Schema.String,
}) {
  override get message() {
    return `watchman rejected the command: ${this.error}`
  }
}

export type Failure = ConnectError | TimeoutError | ProtocolError | TransportError | RejectedError

export interface Session {
  /**
   * Serialized FIFO; the per-command deadline starts when bytes are written.
   * The reply type is guaranteed by the runtime association check.
   */
  readonly request: <T extends Protocol.Command["type"]>(
    command: Extract<Protocol.Command, { readonly type: T }>,
  ) => Effect.Effect<Protocol.ReplyOf<T>, Failure>
  /** Idempotent and absorbing; optionally writes one final command first. */
  readonly close: (final?: Protocol.Command) => Effect.Effect<void>
}

const MAX_FRAME_BYTES = 16 * 1024 * 1024

interface Pending {
  readonly command: Protocol.Command
  readonly reply: Deferred.Deferred<Protocol.Frame, Failure>
}export const open = (
  options: { readonly socket: string; readonly commandTimeoutMs: number },
  push: (frame: Protocol.Frame) => void,
  lost: (failure: Failure) => void,
): Effect.Effect<Session, ConnectError, never> =>
  Effect.gen(function* () {
    const socket = yield* connectSocket(options.socket)
    let settled = false
    let closing = false
    let buffer: Buffer = Buffer.alloc(0)
    let inFlight: Pending | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined
    const waiting: Pending[] = []
    const closed = yield* Deferred.make<void>()

    const settle = (failure: Failure) => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      const requests = [inFlight, ...waiting.splice(0)].flatMap((entry) => (entry ? [entry] : []))
      inFlight = undefined
      for (const entry of requests) Effect.runFork(Deferred.fail(entry.reply, failure))
      if (!closing) lost(failure)
      socket.destroy()
    }

    // The socket 'close' handler: resolves close() waiters, then latches.
    const settleClosed = () => {
      Effect.runFork(Deferred.succeed(closed, undefined))
      settle(new TransportError({ reason: "socket closed" }))
    }

    const pump = () => {
      if (inFlight || settled || waiting.length === 0) return
      const next = waiting.shift()
      if (!next) return
      inFlight = next
      socket.write(Protocol.encode(next.command) + "\n")
      const command = next.command
      deadline = setTimeout(() => settle(new TimeoutError({ command: command.type })), options.commandTimeoutMs)
    }

    const handleFrame = (frame: Protocol.Frame) => {
      if (frame.type === "push" || frame.type === "canceled") {
        push(frame)
        return
      }
      if (frame.type === "ignored") return
      const request = inFlight
      if (!request) {
        settle(new ProtocolError({ reason: `unassociated frame ${frame.type}` }))
        return
      }
      if (deadline) clearTimeout(deadline)
      inFlight = undefined
      if (frame.type === "error") {
        Effect.runFork(Deferred.fail(request.reply, new RejectedError({ error: frame.error })))
      } else if (frame.type === Protocol.REPLY_TYPE[request.command.type]) {
        Effect.runFork(Deferred.succeed(request.reply, frame))
      } else {
        settle(new ProtocolError({ reason: `${frame.type} reply to ${request.command.type}` }))
        return
      }
      pump()
    }

    const handleData = (chunk: Buffer) => {
      buffer = buffer.length === 0 ? chunk : Buffer.concat([buffer, chunk])
      while (true) {
        if (buffer.length > MAX_FRAME_BYTES) {
          settle(new ProtocolError({ reason: "frame exceeds 16 MiB" }))
          return
        }
        const newline = buffer.indexOf(0x0a)
        if (newline === -1) return
        const line = buffer.subarray(0, newline).toString("utf8")
        buffer = buffer.subarray(newline + 1)
        if (line.trim() === "") continue
        const frame = Protocol.decode(parseLine(line))
        if (frame === undefined) {
          settle(new ProtocolError({ reason: `undecodable frame: ${line.slice(0, 200)}` }))
          return
        }
        handleFrame(frame)
      }
    }

    socket.on("data", handleData)
    socket.on("error", (error: NodeJS.ErrnoException) =>
      settle(new TransportError({ reason: error.code ?? error.message })),
    )
    // A peer half-close ends the session: no further commands can be trusted.
    socket.on("end", () => settle(new TransportError({ reason: "peer closed the connection" })))
    socket.on("close", () => settleClosed())

    return {
      request: ((command: Protocol.Command) =>
        Effect.gen(function* () {
          if (settled) return yield* new TransportError({ reason: "session is closed" })
          const reply = yield* Deferred.make<Protocol.Frame, Failure>()
          waiting.push({ command, reply })
          pump()
          return yield* Deferred.await(reply)
        })) as Session["request"],
      close: (final) =>
        Effect.gen(function* () {
          closing = true
          if (!settled && final) socket.write(Protocol.encode(final) + "\n")
          if (final) socket.end()
          else socket.destroy()
          yield* Deferred.await(closed)
          // If the socket never emitted 'close' (already dead), latch now.
          settle(new TransportError({ reason: "session closed" }))
        }),
    }
  })

const connectSocket = (socketPath: string) =>
  Effect.callback<Socket, ConnectError>((resume) => {
    const socket = connect(socketPath)
    const onConnect = () => {
      socket.off("error", onError)
      resume(Effect.succeed(socket))
    }
    const onError = (error: NodeJS.ErrnoException) => {
      socket.off("connect", onConnect)
      socket.destroy()
      resume(Effect.fail(new ConnectError({ socket: socketPath, code: error.code ?? error.message })))
    }
    socket.once("connect", onConnect)
    socket.once("error", onError)
  })

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}
