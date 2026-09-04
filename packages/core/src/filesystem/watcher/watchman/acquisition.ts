import { Deferred, Effect, Semaphore } from "effect"
import { WatchmanError } from "./schema.js"

export const DEFAULT_MAX_CONCURRENT_ACQUISITIONS = 4

type Options = {
  readonly limit: number
  readonly retryBaseMs: number
  readonly retryCapMs: number
}

type Closed = {
  readonly _tag: "Closed"
  readonly epoch: number
}

type Open = {
  readonly _tag: "Open"
  readonly epoch: number
  readonly attempt: number
  readonly ready: Deferred.Deferred<void>
}

type HalfOpen = {
  readonly _tag: "HalfOpen"
  readonly epoch: number
  readonly attempt: number
  readonly changed: Deferred.Deferred<void>
}

type Circuit = Closed | Open | HalfOpen
type Admission =
  | { readonly _tag: "Closed"; readonly epoch: number }
  | { readonly _tag: "Probe"; readonly epoch: number; readonly attempt: number }
type Decision = { readonly _tag: "Wait"; readonly changed: Deferred.Deferred<void> } | Admission
type Result<A> = { readonly _tag: "Retry" } | { readonly _tag: "Success"; readonly value: A }

export type AcquisitionCoordinator = {
  readonly acquire: <A, R>(
    work: Effect.Effect<A, WatchmanError, R>,
  ) => Effect.Effect<A, WatchmanError, R>
}

export const makeAcquisitionCoordinator = (options: Options) =>
  Effect.gen(function* () {
    const scope = yield* Effect.scope
    const admission = Semaphore.makeUnsafe(options.limit)
    let epoch = 0
    let circuit: Circuit = { _tag: "Closed", epoch }

    const wake = (state: Circuit) => {
      if (state._tag === "Open") Deferred.doneUnsafe(state.ready, Effect.void)
      if (state._tag === "HalfOpen") Deferred.doneUnsafe(state.changed, Effect.void)
    }

    const open = (attempt: number) =>
      Effect.uninterruptible(
        Effect.gen(function* () {
          const ready = Deferred.makeUnsafe<void>()
          const previous = circuit
          circuit = { _tag: "Open", epoch: ++epoch, attempt, ready }
          wake(previous)
          const delay = Math.min(options.retryCapMs, options.retryBaseMs * 2 ** attempt)
          yield* Effect.sleep(delay).pipe(
            Effect.andThen(Effect.sync(() => Deferred.doneUnsafe(ready, Effect.void))),
            Effect.forkIn(scope),
          )
        }),
      )

    const close = (candidate: Admission) =>
      Effect.sync(() => {
        if (candidate._tag === "Probe" && (circuit._tag !== "HalfOpen" || circuit.epoch !== candidate.epoch))
          return
        if (circuit._tag === "Closed") return
        const previous = circuit
        circuit = { _tag: "Closed", epoch: ++epoch }
        wake(previous)
      })

    const trip = (candidate: Admission) =>
      Effect.suspend(() => {
        if (candidate._tag === "Probe") {
          if (circuit._tag !== "HalfOpen" || circuit.epoch !== candidate.epoch) return Effect.void
          return open(candidate.attempt + 1)
        }
        if (circuit._tag !== "Closed" || circuit.epoch !== candidate.epoch) return Effect.void
        return open(0)
      })

    const abandon = (candidate: Admission) =>
      Effect.suspend(() => {
        if (candidate._tag !== "Probe") return Effect.void
        if (circuit._tag !== "HalfOpen" || circuit.epoch !== candidate.epoch) return Effect.void
        return open(candidate.attempt)
      })

    const decide = Effect.sync((): Decision => {
      if (circuit._tag === "Closed") return { _tag: "Closed", epoch: circuit.epoch }
      if (circuit._tag === "HalfOpen") return { _tag: "Wait", changed: circuit.changed }
      if (!Deferred.isDoneUnsafe(circuit.ready)) return { _tag: "Wait", changed: circuit.ready }
      const changed = Deferred.makeUnsafe<void>()
      circuit = { _tag: "HalfOpen", epoch: ++epoch, attempt: circuit.attempt, changed }
      return { _tag: "Probe", epoch: circuit.epoch, attempt: circuit.attempt }
    })

    const valid = (candidate: Admission) =>
      candidate._tag === "Closed"
        ? circuit._tag === "Closed" && circuit.epoch === candidate.epoch
        : circuit._tag === "HalfOpen" && circuit.epoch === candidate.epoch

    const run = <A, R>(candidate: Admission, work: Effect.Effect<A, WatchmanError, R>) => {
      const admitted = admission.withPermit(
        Effect.suspend(() => {
          if (!valid(candidate)) return Effect.succeed({ _tag: "Retry" } as const)
          return work.pipe(
            Effect.flatMap((value) => close(candidate).pipe(Effect.as({ _tag: "Success", value } as const))),
            Effect.catch((error) =>
              error.stage === "connect"
                ? trip(candidate).pipe(Effect.as({ _tag: "Retry" } as const))
                : close(candidate).pipe(Effect.andThen(Effect.fail(error))),
            ),
          )
        }),
      )
      return candidate._tag === "Probe" ? admitted.pipe(Effect.onExit(() => abandon(candidate))) : admitted
    }

    const acquire: AcquisitionCoordinator["acquire"] = <A, R>(work: Effect.Effect<A, WatchmanError, R>) =>
      Effect.suspend(() =>
        decide.pipe(
          Effect.flatMap((decision): Effect.Effect<Result<A>, WatchmanError, R> => {
            if (decision._tag === "Wait")
              return Deferred.await(decision.changed).pipe(Effect.as({ _tag: "Retry" } as const))
            return run(decision, work)
          }),
          Effect.flatMap((result) => (result._tag === "Retry" ? acquire(work) : Effect.succeed(result.value))),
        ),
      )

    return { acquire } satisfies AcquisitionCoordinator
  })
