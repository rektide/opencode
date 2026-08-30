export * as WatchInterests from "./interests.js"

import path from "node:path"
import { Effect, FiberMap, PubSub, Stream } from "effect"
import { Watcher } from "../watcher.js"
import { WatcherInternal } from "./internal.js"

export type Input = Watcher.WatchInput

export type Interface = {
  readonly changes: Stream.Stream<Watcher.Update>
  readonly ensure: (inputs: readonly Input[]) => Effect.Effect<void>
  readonly reconcile: (inputs: readonly Input[]) => Effect.Effect<void>
}

export const make = Effect.fn("WatchInterests.make")(function* () {
  const watcher = yield* Watcher.Service
  const watches = yield* FiberMap.make<string>()
  const changes = yield* PubSub.unbounded<Watcher.Update>()

  const normalize = (input: Input): Input => {
    const target = path.resolve(input.path)
    if (input.type === "file") return { path: target, type: "file" }
    const ignore = [...new Set(input.ignore ?? [])].toSorted()
    return ignore.length ? { path: target, type: "directory", ignore } : { path: target, type: "directory" }
  }

  const key = (input: Input) => JSON.stringify(normalize(input))

  const ensure = Effect.fn("WatchInterests.ensure")(function* (inputs: readonly Input[]) {
    yield* Effect.forEach(
      new Map(inputs.map((input) => [key(input), normalize(input)])).entries(),
      Effect.fnUntraced(function* ([id, input]) {
        if (yield* FiberMap.has(watches, id)) return
        const updates = yield* watcher.subscribe(
          WatcherInternal.attach(input, {
            ready: () => PubSub.publishUnsafe(changes, { path: input.path, type: "update" as const }),
          }),
        )
        yield* FiberMap.run(
          watches,
          id,
          updates.pipe(Stream.runForEach((update) => PubSub.publish(changes, update).pipe(Effect.asVoid))),
          { onlyIfMissing: true, startImmediately: true },
        )
      }),
      { discard: true },
    )
  })

  const reconcile = Effect.fn("WatchInterests.reconcile")(function* (inputs: readonly Input[]) {
    yield* ensure(inputs)
    const desired = new Set(inputs.map(key))
    yield* Effect.forEach(
      Array.from(watches).filter(([id]) => !desired.has(id)),
      ([id]) => FiberMap.remove(watches, id),
      { discard: true },
    )
  })

  return { changes: Stream.fromPubSub(changes), ensure, reconcile } satisfies Interface
})
