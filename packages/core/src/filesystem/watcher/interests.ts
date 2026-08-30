export * as WatchInterests from "./interests.js"

import path from "node:path"
import { Effect, FiberMap, Queue, Stream } from "effect"
import { Watcher } from "../watcher.js"
import { WatcherInternal } from "./internal.js"
import { Location } from "../../location.js"
import { FSUtil } from "@opencode-ai/util/fs-util"

export type Input = Watcher.WatchInput

export type Interface = {
  readonly changes: Stream.Stream<Watcher.Update, Error>
  readonly ensure: (inputs: readonly Input[]) => Effect.Effect<void>
  readonly reconcile: (inputs: readonly Input[]) => Effect.Effect<void>
}

type Change =
  | { readonly type: "update"; readonly update: Watcher.Update }
  | { readonly type: "failure"; readonly error: Error }

export const make = Effect.fn("WatchInterests.make")(function* () {
  const watcher = yield* Watcher.Service
  const location = yield* Location.Service
  const watches = yield* FiberMap.make<string>()
  const changes = yield* Queue.unbounded<Change>()
  yield* Effect.addFinalizer(() => Queue.shutdown(changes))

  const key = (input: Input) => JSON.stringify(WatcherInternal.normalize(input))

  const ensure = Effect.fn("WatchInterests.ensure")(function* (inputs: readonly Input[]) {
    yield* Effect.forEach(
      new Map(inputs.map((input) => [key(input), WatcherInternal.normalize(input)])).entries(),
      Effect.fnUntraced(function* ([id, input]) {
        if (yield* FiberMap.has(watches, id)) return
        const updates = yield* watcher.subscribe(
          WatcherInternal.attach(input, {
            ready: () =>
              Queue.offerUnsafe(changes, {
                type: "update",
                update: { path: input.path, type: "update" },
              }),
            placement:
              input.type === "directory" && FSUtil.contains(location.project.directory, input.path)
                ? { type: "project", root: path.resolve(location.project.directory) }
                : { type: "exact" },
          }),
        )
        yield* FiberMap.run(
          watches,
          id,
          updates.pipe(
            Stream.runForEach((update) => Queue.offer(changes, { type: "update", update }).pipe(Effect.asVoid)),
            Effect.tapError((error) => Queue.offer(changes, { type: "failure", error }).pipe(Effect.asVoid)),
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
    changes: Stream.fromQueue(changes).pipe(
      Stream.mapEffect((change) =>
        change.type === "failure" ? Effect.fail(change.error) : Effect.succeed(change.update),
      ),
    ),
    ensure,
    reconcile,
  } satisfies Interface
})
