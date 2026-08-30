export * as WatchInterests from "./interests.js"

import path from "node:path"
import { Deferred, Effect, FiberMap, Queue, Stream } from "effect"
import { Watcher } from "../watcher.js"
import { WatcherInternal } from "./internal.js"
import { Location } from "../../location.js"

export type Input = Watcher.WatchInput

export type Interface = {
  readonly changes: Stream.Stream<Watcher.Update, Error>
  readonly ensure: (inputs: readonly Input[]) => Effect.Effect<void>
  readonly reconcile: (inputs: readonly Input[]) => Effect.Effect<void>
}

export const make = Effect.fn("WatchInterests.make")(function* () {
  const watcher = yield* Watcher.Service
  const location = yield* Location.Service
  const watches = yield* FiberMap.make<string>()
  const changes = yield* Queue.unbounded<Watcher.Update>()
  yield* Effect.addFinalizer(() => Queue.shutdown(changes))
  const failure = Deferred.makeUnsafe<void, Error>()

  const key = (input: Input) => JSON.stringify(WatcherInternal.normalize(input))

  const ensure = Effect.fn("WatchInterests.ensure")(function* (inputs: readonly Input[]) {
    yield* Effect.forEach(
      new Map(inputs.map((input) => [key(input), WatcherInternal.normalize(input)])).entries(),
      Effect.fnUntraced(function* ([id, input]) {
        if (yield* FiberMap.has(watches, id)) return
        const updates = yield* watcher.subscribe(
          WatcherInternal.attach(input, {
            ready: () => Queue.offerUnsafe(changes, { path: input.path, type: "update" as const }),
            placement:
              input.type === "directory" && contains(location.project.directory, input.path)
                ? { type: "project", root: path.resolve(location.project.directory) }
                : { type: "exact" },
          }),
        )
        yield* FiberMap.run(
          watches,
          id,
          updates.pipe(
            Stream.runForEach((update) => Queue.offer(changes, update).pipe(Effect.asVoid)),
            Effect.tapError((error) => Effect.sync(() => Deferred.doneUnsafe(failure, Effect.fail(error)))),
          ),
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

  return {
    changes: Stream.fromQueue(changes).pipe(Stream.interruptWhen(Deferred.await(failure))),
    ensure,
    reconcile,
  } satisfies Interface
})

function contains(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
