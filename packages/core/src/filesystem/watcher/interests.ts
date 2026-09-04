export * as WatchInterests from "./interests.js"

import path from "node:path"
import { Cause, Effect, FiberMap, PubSub, Stream } from "effect"
import { Watcher } from "../watcher.js"
import { WatcherInternal } from "./internal.js"
import { Location } from "../../location.js"
import { FSUtil } from "@opencode-ai/util/fs-util"

export type Input = Watcher.WatchInput & {
  readonly placement?: WatcherInternal.Placement
}

type NormalizedInput = Input & {
  readonly placement: WatcherInternal.Placement
}

export type ContinuityReason = WatcherInternal.ContinuityReason | "terminal"

export type Signal =
  | { readonly type: "ready"; readonly input: Input }
  | { readonly type: "change"; readonly input: Input; readonly update: Watcher.Update }
  | { readonly type: "invalidation"; readonly input: Input; readonly reason: ContinuityReason }
  | { readonly type: "failure"; readonly input: Input; readonly error: Error }

export type Interface = {
  readonly signals: Stream.Stream<Signal>
  readonly changes: Stream.Stream<Watcher.Update, Error>
  readonly ensure: (inputs: readonly Input[]) => Effect.Effect<void>
  readonly reconcile: (inputs: readonly Input[]) => Effect.Effect<void>
}

export const make = Effect.fn("WatchInterests.make")(function* () {
  const watcher = yield* Watcher.Service
  const location = yield* Location.Service
  const watches = yield* FiberMap.make<string>()
  const desired = new Map<string, NormalizedInput>()
  const suppressed = new Set<string>()
  const events = yield* PubSub.unbounded<Signal>()
  yield* Effect.addFinalizer(() => PubSub.shutdown(events))
  yield* Effect.addFinalizer(() => Effect.sync(() => desired.clear()))

  const normalize = (input: Input): NormalizedInput => {
    const normalized = WatcherInternal.normalize(input)
    const requested = input.placement
    const placement =
      normalized.type !== "directory"
        ? ({ type: "exact" } as const)
        : requested?.type === "project"
          ? ({ type: "project", root: path.resolve(requested.root) } as const)
          : (requested ??
            (FSUtil.contains(location.project.directory, normalized.path)
              ? ({ type: "project", root: path.resolve(location.project.directory) } as const)
              : ({ type: "exact" } as const)))
    return { ...normalized, placement }
  }
  const key = (input: NormalizedInput) => JSON.stringify(input)
  const emit = (signal: Signal) => PubSub.publish(events, signal).pipe(Effect.asVoid)

  const terminal = Effect.fnUntraced(function* (id: string, input: NormalizedInput, error: Error) {
    if (!desired.has(id) || suppressed.has(id)) return
    suppressed.add(id)
    yield* emit({ type: "invalidation", input, reason: "terminal" })
    yield* emit({ type: "failure", input, error })
  })

  const start = Effect.fnUntraced(function* (id: string, input: NormalizedInput) {
    const updates = yield* watcher.subscribe(
      WatcherInternal.attach(WatcherInternal.normalize(input), {
        placement: input.placement,
        ready: () => PubSub.publishUnsafe(events, { type: "ready", input }),
        invalidated: (reason) => PubSub.publishUnsafe(events, { type: "invalidation", input, reason }),
      }),
    )
    yield* FiberMap.run(
      watches,
      id,
      updates.pipe(
        Stream.runForEach((update) => emit({ type: "change", input, update })),
        Effect.matchCauseEffect({
          onFailure: (cause) => {
            const error = Cause.squash(cause)
            return terminal(
              id,
              input,
              error instanceof Error ? error : new Error("Watcher interest failed", { cause: error }),
            )
          },
          onSuccess: () => terminal(id, input, new Error("Watcher interest ended")),
        }),
      ),
      { onlyIfMissing: true, startImmediately: true },
    )
  })

  const ensure = Effect.fn("WatchInterests.ensure")(function* (inputs: readonly Input[]) {
    const additions = new Map(inputs.map((input) => normalize(input)).map((input) => [key(input), input]))
    yield* Effect.forEach(
      additions,
      Effect.fnUntraced(function* ([id, input]) {
        if (!desired.has(id)) desired.set(id, input)
        if (suppressed.has(id) || (yield* FiberMap.has(watches, id))) return
        yield* start(id, input)
      }),
      { discard: true },
    )
  })

  const reconcile = Effect.fn("WatchInterests.reconcile")(function* (inputs: readonly Input[]) {
    const next = new Map(inputs.map((input) => normalize(input)).map((input) => [key(input), input]))
    yield* ensure(Array.from(next.values()))
    yield* Effect.forEach(
      Array.from(desired).filter(([id]) => !next.has(id)),
      Effect.fnUntraced(function* ([id]) {
        desired.delete(id)
        suppressed.delete(id)
        yield* FiberMap.remove(watches, id)
      }),
      { discard: true },
    )
  })

  const signals = Stream.fromPubSub(events)
  return {
    signals,
    changes: signals.pipe(
      Stream.mapEffect((signal) => {
        if (signal.type === "failure") return Effect.fail(signal.error)
        if (signal.type === "change") return Effect.succeed(signal.update)
        return Effect.succeed({ path: signal.input.path, type: "update" as const })
      }),
    ),
    ensure,
    reconcile,
  } satisfies Interface
})
