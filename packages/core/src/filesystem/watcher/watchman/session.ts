export * as WatchmanSession from "./session.js"

import { Socket } from "node:net"
import { Effect, Option, Schema, Scope } from "effect"
import { WatchmanProtocol } from "./protocol.js"

const MAX_FRAME_BYTES = 16 * 1024 * 1024
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))
const decodeUtf8 = Option.liftThrowable((bytes: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(bytes))

export class Failure extends Schema.TaggedError<Failure>()("WatchmanSessionFailure", {
  reason: Schema.Literals(["connect", "closed", "timeout", "protocol", "interrupted"]),
  message: Schema.String,
}) {}

export interface Interface {
  readonly request: (command: WatchmanProtocol.Command) => Effect.Effect<WatchmanProtocol.Reply, Failure>
  /** Writes one final command without waiting for its reply. No later request is accepted. */
  readonly send: (command: WatchmanProtocol.Command) => Effect.Effect<void, Failure>
  readonly close: () => Effect.Effect<void>
}

export type Options = {
  readonly socket: string
  readonly commandTimeoutMs: number
}

type Pending = {
  readonly command: WatchmanProtocol.Command
  readonly resume: (effect: Effect.Effect<WatchmanProtocol.Reply, Failure>) => void
  submitted: boolean
  timer?: ReturnType<typeof setTimeout>
}

export const open = (
  options: Options,
  receive: (push: WatchmanProtocol.Push) => void,
  lost: (failure: Failure) => void,
): Effect.Effect<Interface, Failure, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.callback<Interface, Failure>((resume) => {
      const socket = new Socket()
      const queued: Pending[] = []
      let active: Pending | undefined
      let input = Buffer.alloc(0)
      let connected = false
      let draining = false
      let returned = false
      let terminal: Failure | undefined
      let resolveClosed: () => void
      const closed = new Promise<void>((resolve) => {
        resolveClosed = resolve
      })

      const finish = (failure: Failure, explicit = false) => {
        if (terminal) return
        terminal = failure
        if (active) {
          if (active.timer) clearTimeout(active.timer)
          active.resume(Effect.fail(failure))
          active = undefined
        }
        queued.splice(0).forEach((pending) => pending.resume(Effect.fail(failure)))
        if (!returned) resume(Effect.fail(failure))
        if (returned && !explicit) lost(failure)
        socket.destroy()
      }

      const dispatch = () => {
        if (!connected || active || terminal) return
        const pending = queued.shift()
        if (!pending) return
        active = pending
        pending.submitted = true
        socket.write(`${JSON.stringify(WatchmanProtocol.encode(pending.command))}\n`, (error) => {
          if (error) {
            finish(new Failure({ reason: "closed", message: error.message }))
            return
          }
          if (active !== pending || terminal) return
          pending.timer = setTimeout(
            () => finish(new Failure({ reason: "timeout", message: `Watchman ${pending.command.type} timed out` })),
            options.commandTimeoutMs,
          )
        })
      }

      const frame = (bytes: Buffer) => {
        if (draining) return
        const text = Option.getOrUndefined(decodeUtf8(bytes))
        if (text === undefined) {
          finish(new Failure({ reason: "protocol", message: "Watchman sent invalid UTF-8" }))
          return
        }
        const value = Option.getOrUndefined(decodeJson(text))
        if (value === undefined) {
          finish(new Failure({ reason: "protocol", message: "Watchman sent invalid JSON" }))
          return
        }
        const pushed = WatchmanProtocol.push(value)
        if (pushed._tag === "Push") {
          receive(pushed.push)
          return
        }
        if (pushed._tag === "InvalidPush") {
          finish(new Failure({ reason: "protocol", message: "Watchman sent a malformed push frame" }))
          return
        }
        if (!active) {
          finish(new Failure({ reason: "protocol", message: "Watchman sent an unassociated response" }))
          return
        }
        const result = WatchmanProtocol.reply(active.command, value)
        if (result._tag === "InvalidReply") {
          finish(new Failure({ reason: "protocol", message: `Watchman sent an invalid ${active.command.type} reply` }))
          return
        }
        const settled = active
        active = undefined
        if (settled.timer) clearTimeout(settled.timer)
        settled.resume(Effect.succeed(result.reply))
        dispatch()
      }

      const data = (chunk: Buffer) => {
        const bytes = Buffer.concat([input, chunk])
        let start = 0
        for (;;) {
          const end = bytes.indexOf(0x0a, start)
          if (end < 0) break
          if (end - start > MAX_FRAME_BYTES) {
            finish(new Failure({ reason: "protocol", message: "Watchman frame exceeded 16 MiB" }))
            return
          }
          if (end === start) {
            finish(new Failure({ reason: "protocol", message: "Watchman sent a blank frame" }))
            return
          }
          frame(bytes.subarray(start, end))
          if (terminal) return
          start = end + 1
        }
        input = Buffer.from(bytes.subarray(start))
        if (input.length > MAX_FRAME_BYTES)
          finish(new Failure({ reason: "protocol", message: "Watchman frame exceeded 16 MiB" }))
      }

      const session: Interface = {
        request: (command) =>
          Effect.callback<WatchmanProtocol.Reply, Failure>((resumeRequest) => {
            if (terminal) {
              resumeRequest(Effect.fail(terminal))
              return Effect.void
            }
            if (draining) {
              resumeRequest(Effect.fail(new Failure({ reason: "closed", message: "Watchman session is closing" })))
              return Effect.void
            }
            const pending: Pending = { command, resume: resumeRequest, submitted: false }
            queued.push(pending)
            dispatch()
            return Effect.sync(() => {
              if (active === pending && pending.submitted) {
                finish(new Failure({ reason: "interrupted", message: `Watchman ${command.type} was interrupted` }))
                return
              }
              const index = queued.indexOf(pending)
              if (index >= 0) queued.splice(index, 1)
            })
          }),
        send: (command) =>
          Effect.callback<void, Failure>((resumeSend) => {
            if (terminal) {
              resumeSend(Effect.fail(terminal))
              return
            }
            if (draining || active || queued.length > 0) {
              resumeSend(
                Effect.fail(new Failure({ reason: "closed", message: "Watchman session is not idle for final send" })),
              )
              return
            }
            draining = true
            socket.write(`${JSON.stringify(WatchmanProtocol.encode(command))}\n`, (error) =>
              resumeSend(error ? Effect.fail(new Failure({ reason: "closed", message: error.message })) : Effect.void),
            )
          }),
        close: () =>
          Effect.sync(() => finish(new Failure({ reason: "closed", message: "Watchman session closed" }), true)).pipe(
            Effect.andThen(Effect.promise(() => closed)),
          ),
      }

      socket.on("connect", () => {
        if (terminal) return
        connected = true
        returned = true
        resume(Effect.succeed(session))
        dispatch()
      })
      socket.on("data", data)
      socket.on("error", (error) => finish(new Failure({ reason: connected ? "closed" : "connect", message: error.message })))
      socket.on("end", () => finish(new Failure({ reason: "closed", message: "Watchman ended the connection" })))
      socket.on("close", () => resolveClosed())
      socket.connect(options.socket)
      return session.close()
    }),
    (session) => session.close(),
  )

export type Open = typeof open
