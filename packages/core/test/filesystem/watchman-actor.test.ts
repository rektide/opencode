import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { makeWatchmanActor } from "./fixture/watchman/client.ts"
import { it } from "../lib/effect.ts"

type CallbackResult = {
  readonly error: Error | null
  readonly response?: unknown
}

it.effect("serializes complete command payloads and sends capability checks through the command queue", () =>
  Effect.gen(function* () {
    const version = ["version", { optional: ["term-dirname"], required: ["wildmatch"] }] as const
    const watch = ["watch", "/repo"] as const
    const actor = makeWatchmanActor({
      plan: [
        {
          type: "client",
          commands: [version, watch],
          listenersBeforeFirstCommand: ["subscription", "log", "connect", "error", "end"],
        },
      ],
    })
    const awaitingConstruction = yield* actor.awaitConstruction(0).pipe(Effect.forkScoped({ startImmediately: true }))
    const raw = actor.factory()
    const construction = yield* Fiber.join(awaitingConstruction)
    if (construction.type === "failure") throw construction.error
    const client = construction.client
    expect(raw).toBe(client)

    const awaitingSubscriptionListener = yield* client
      .awaitListener("subscription")
      .pipe(Effect.forkScoped({ startImmediately: true }))
    raw.on("subscription", () => {})
    raw.on("log", () => {})
    raw.on("connect", () => {})
    raw.on("error", () => {})
    raw.on("end", () => {})
    expect((yield* Fiber.join(awaitingSubscriptionListener)).event).toBe("subscription")
    expect(client.listeners("subscription")).toBe(1)

    const capabilityResult = yield* Deferred.make<CallbackResult>()
    const watchResult = yield* Deferred.make<CallbackResult>()
    raw.capabilityCheck({ optional: ["term-dirname"], required: ["wildmatch"] }, (error, response) => {
      Deferred.doneUnsafe(capabilityResult, Effect.succeed({ error, response }))
    })
    raw.command(watch, (error, response) => {
      Deferred.doneUnsafe(watchResult, Effect.succeed({ error, response }))
    })

    expect(client.submitted()).toEqual([version, watch])
    expect(client.transcript()).toEqual([version])
    expect(client.pending()).toBe(2)

    const capability = yield* client.nextCommand(version)
    client.assertListenersBefore(capability, ["subscription", "log", "connect", "error", "end"])
    yield* capability.respond({ version: "2026.09.05", capabilities: { "term-dirname": true, wildmatch: true } })
    expect(yield* Deferred.await(capabilityResult)).toEqual({
      error: null,
      response: { version: "2026.09.05", capabilities: { "term-dirname": true, wildmatch: true } },
    })
    expect(yield* capability.awaitReply()).toMatchObject({ type: "response", late: false })

    const watchCommand = yield* client.nextCommand(watch)
    yield* watchCommand.respond({ watch: "/repo" })
    expect(yield* Deferred.await(watchResult)).toEqual({ error: null, response: { watch: "/repo" } })
    expect(client.transcript()).toEqual([version, watch])
    expect(client.pending()).toBe(0)
    client.assertIdle()
    actor.assertComplete()
  }),
)

it.effect("controls callback failure, unilateral PDUs, socket loss, held late replies, and termination", () =>
  Effect.gen(function* () {
    const watch = ["watch", "/repo"] as const
    const clock = ["clock", "/repo"] as const
    const actor = makeWatchmanActor({
      plan: [{ type: "client", commands: [watch, clock] }],
    })
    const raw = actor.factory()
    const client = yield* actor.awaitClient(0)
    const subscriptions: unknown[] = []
    const subscriptionCopies: unknown[] = []
    const logs: unknown[] = []
    const errors: unknown[] = []
    const connects: undefined[] = []
    const ends: undefined[] = []
    raw.on("subscription", (value) => subscriptions.push(value))
    const awaitingSecondSubscriptionListener = yield* client
      .awaitListener("subscription", 1)
      .pipe(Effect.forkScoped({ startImmediately: true }))
    raw.on("subscription", (value) => subscriptionCopies.push(value))
    raw.on("log", (value) => logs.push(value))
    raw.on("connect", () => connects.push(undefined))
    raw.on("error", (value) => errors.push(value))
    raw.on("end", () => ends.push(undefined))
    expect((yield* Fiber.join(awaitingSecondSubscriptionListener)).index).toBe(1)

    const watchResult = yield* Deferred.make<CallbackResult>()
    const clockResult = yield* Deferred.make<CallbackResult>()
    const clockCallbacks: CallbackResult[] = []
    raw.command(watch, (error, response) => {
      Deferred.doneUnsafe(watchResult, Effect.succeed({ error, response }))
    })
    raw.command(clock, (error, response) => {
      clockCallbacks.push({ error, response })
      Deferred.doneUnsafe(clockResult, Effect.succeed({ error, response }))
    })

    const watchCommand = yield* client.nextCommand(watch)
    const pdu = { subscription: "opencode-1-1", files: [{ name: "src/index.ts", exists: true }] }
    const log = { log: "debug", message: "crawl complete" }
    client.emitSubscription(pdu)
    client.emitLog(log)
    client.emitConnect()
    expect(subscriptions).toEqual([pdu])
    expect(subscriptionCopies).toEqual([pdu])
    expect(logs).toEqual([log])
    expect(connects).toHaveLength(1)

    const callbackError = new Error("watch rejected")
    yield* watchCommand.fail(callbackError)
    expect(yield* Deferred.await(watchResult)).toEqual({ error: callbackError, response: undefined })
    expect(yield* watchCommand.awaitReply()).toMatchObject({ type: "error", error: callbackError, late: false })

    const clockCommand = yield* client.nextCommand(clock)
    yield* clockCommand.hold()
    expect(clockCommand.state()).toBe("held")
    const awaitingTermination = yield* client.awaitTermination().pipe(Effect.forkScoped({ startImmediately: true }))
    const socketError = new Error("socket lost")
    client.emitError(socketError)
    client.emitEnd()
    raw.end()
    expect(errors).toEqual([socketError])
    expect(ends).toHaveLength(1)
    expect((yield* Fiber.join(awaitingTermination)).index).toBe(0)
    expect(client.ended()).toBe(1)

    const canceled = yield* Deferred.await(clockResult)
    expect(canceled.error?.message).toBe("The watchman connection was closed")
    expect(yield* clockCommand.awaitReply()).toMatchObject({ type: "error", late: true })
    yield* clockCommand.lateRespond({ clock: "c:2" })
    expect(clockCallbacks).toHaveLength(2)
    expect(clockCallbacks[1]).toEqual({ error: null, response: { clock: "c:2" } })
    client.assertIdle()
    actor.assertComplete()
  }),
)

it.effect("fails mismatched, duplicate, and missing command scripts with diagnostics", () =>
  Effect.gen(function* () {
    const expected = ["watch", "/expected"] as const
    const mismatched = makeWatchmanActor({
      plan: [{ type: "client", commands: [expected] }],
    })
    const mismatchedRaw = mismatched.factory()
    expect(() => mismatchedRaw.command(["watch", "/received"], () => {})).toThrow(
      /Watchman client 0 command 0 payload mismatch[\s\S]*expected[\s\S]*received/i,
    )

    const duplicate = makeWatchmanActor({
      plan: [{ type: "client", commands: [expected] }],
    })
    const duplicateRaw = duplicate.factory()
    duplicateRaw.command(expected, () => {})
    const duplicateClient = yield* duplicate.awaitClient(0)
    const duplicateCommand = yield* duplicateClient.nextCommand(expected)
    yield* duplicateCommand.respond({ watch: "/expected" })
    expect(() => duplicateRaw.command(expected, () => {})).toThrow(/Unexpected Watchman client 0 command 1/)

    const missing = makeWatchmanActor({
      plan: [{ type: "client", commands: [expected] }],
    })
    missing.factory()
    expect(() => missing.assertComplete()).toThrow(
      "Incomplete Watchman client 0 command submissions: expected 1, observed 0",
    )

    const constructionError = new Error("daemon unavailable")
    const failedConstruction = makeWatchmanActor({
      plan: [{ type: "failure", error: constructionError }],
    })
    const awaitingFailure = yield* failedConstruction
      .awaitConstruction(0)
      .pipe(Effect.forkScoped({ startImmediately: true }))
    expect(() => failedConstruction.factory()).toThrow(constructionError)
    const failure = yield* Fiber.join(awaitingFailure)
    expect(failure).toEqual({ type: "failure", index: 0, sequence: 0, error: constructionError })
    failedConstruction.assertComplete()
  }),
)
