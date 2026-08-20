import { unlink } from "node:fs/promises"
import { Deferred, Effect, Schema, Semaphore } from "effect"
import { makeLedger, makeRootBook, pidAlive, planSweep, readFiles, type RootBook } from "./ledger.js"
import { Client } from "./fb-watchman-esm.js"
import { CapabilityResponse, WatchDelResponse, WatchListResponse, WatchmanError } from "./schema.js"

const COMMAND_TIMEOUT = "10 seconds"
const ROOT_GRACE_MS = 5_000
const SWEEP_SETTLE_MS = 30_000
const SWEEP_POLL_MS = 600_000

export type RawClient = {
  readonly end: () => void
  readonly command: (args: readonly unknown[], callback: (error: Error | null, response?: unknown) => void) => void
  readonly capabilityCheck: (
    capabilities: { readonly required: readonly string[] },
    callback: (error: Error | null, response?: unknown) => void,
  ) => void
  readonly on: (event: string, listener: (value?: unknown) => void) => unknown
}

export type Generation = {
  readonly id: number
  readonly client: RawClient
  readonly closed: Deferred.Deferred<void>
  readonly routes: Map<string, Deferred.Deferred<Route, WatchmanError>>
  readonly subscriptions: Map<string, (value: unknown) => void>
  /** Roots that already existed when this connection was established; never ours to delete. */
  readonly adopted: ReadonlySet<string>
}

export type Route = {
  readonly root: string
  readonly relativeRoot: string
  readonly eventRoot: string
}

export type Manager = {
  readonly current: () => Effect.Effect<Generation, WatchmanError>
  readonly command: <A>(
    generation: Generation,
    args: readonly unknown[],
    schema: Schema.Codec<A, unknown, never, never>,
    stage?: WatchmanError["stage"],
  ) => Effect.Effect<A, WatchmanError>
  readonly retire: (generation: Generation, cause?: unknown) => Effect.Effect<void>
  readonly roots: RootBook
}

export type Options = {
  /** Directory for cross-process root ownership files. Defaults under the opencode data dir. */
  readonly ledgerDirectory?: string
  /** Grace in millis before a released minted root is `watch-del`ed. */
  readonly graceMs?: number
  /** Delay in millis after connecting before the first cleanup sweep. */
  readonly settleMs?: number
  /** Interval in millis between cleanup sweeps. */
  readonly pollMs?: number
  /** Seconds between "still disconnected" warnings while roots are waiting to reconnect. 0 disables. */
  readonly notifySeconds?: number
}

export const make = (options?: Options) =>
  Effect.gen(function* () {
    const lock = Semaphore.makeUnsafe(1)
    const generations = new Set<Generation>()
    const scope = yield* Effect.scope
    let active: Generation | undefined
    let next = 0
    let outageSince: number | undefined

    const ledger = yield* makeLedger(options?.ledgerDirectory)
    const live = (generation: Generation) => !Deferred.isDoneUnsafe(generation.closed)

    const retire = (generation: Generation, cause?: unknown) =>
      Effect.sync(() => {
        if (Deferred.isDoneUnsafe(generation.closed)) return
        Deferred.doneUnsafe(generation.closed, Effect.void)
        generation.client.end()
        generation.routes.clear()
        generation.subscriptions.clear()
        generations.delete(generation)
        if (active === generation) {
          active = undefined
          if (outageSince === undefined && roots.demand() > 0) outageSince = Date.now()
        }
        if (cause) Effect.runFork(Effect.logWarning("watchman connection retired", { generation: generation.id, cause }))
      })

    const command = <A>(
      generation: Generation,
      args: readonly unknown[],
      schema: Schema.Codec<A, unknown, never, never>,
      stage: WatchmanError["stage"] = "command",
    ) =>
      Effect.callback<unknown, WatchmanError>((resume) => {
        generation.client.command(args, (error, value) => {
          if (error) {
            resume(Effect.fail(new WatchmanError(stage, error.message, error)))
            return
          }
          resume(Effect.succeed(value))
        })
      }).pipe(
        Effect.timeoutOrElse({
          duration: COMMAND_TIMEOUT,
          orElse: () =>
            retire(generation, `command timed out: ${String(args[0])}`).pipe(
              Effect.andThen(Effect.fail(new WatchmanError(stage, `Watchman command timed out: ${String(args[0])}`))),
            ),
        }),
        Effect.flatMap((value) =>
          Schema.decodeUnknownEffect(schema)(value).pipe(
            Effect.mapError(
              (error) => new WatchmanError("decode", `Invalid Watchman ${String(args[0])} response`, error),
            ),
          ),
        ),
      )

    const capabilityCheck = (generation: Generation) =>
      Effect.callback<unknown, WatchmanError>((resume) => {
        generation.client.capabilityCheck({ required: ["cmd-watch-project", "relative_root"] }, (error, value) => {
          if (error) {
            resume(Effect.fail(new WatchmanError("connect", error.message, error)))
            return
          }
          resume(Effect.succeed(value))
        })
      }).pipe(
        Effect.timeoutOrElse({
          duration: COMMAND_TIMEOUT,
          orElse: () =>
            retire(generation, "capability check timed out").pipe(
              Effect.andThen(Effect.fail(new WatchmanError("connect", "Watchman capability check timed out"))),
            ),
        }),
        Effect.flatMap((value) =>
          Schema.decodeUnknownEffect(CapabilityResponse)(value).pipe(
            Effect.mapError((error) => new WatchmanError("decode", "Invalid Watchman capability response", error)),
          ),
        ),
      )

    const removeRoot = (generation: Generation, root: string) =>
      command(generation, ["watch-del", root], WatchDelResponse).pipe(
        Effect.as(true),
        Effect.catchCause((cause) =>
          Effect.logWarning("watchman watch-del failed", { root, cause }).pipe(Effect.as(false)),
        ),
      )

    const claimedElsewhere = (root: string) =>
      Effect.map(
        readFiles(ledger.directory),
        (files) => files.some((file) => file.path !== ledger.path && file.roots.includes(root) && pidAlive(file.pid)),
      ).pipe(Effect.catchCause(() => Effect.succeed(false)))

    const roots = yield* makeRootBook({
      ledger,
      graceMs: options?.graceMs ?? ROOT_GRACE_MS,
      remove: (root) => {
        const generation = active
        if (!generation || !live(generation)) return Effect.succeed(false)
        return removeRoot(generation, root)
      },
      claimedElsewhere,
    })

    const sweep = (generation: Generation) =>
      Effect.gen(function* () {
        const listed = yield* command(generation, ["watch-list"], WatchListResponse).pipe(
          Effect.catchCause(() => Effect.succeed(undefined)),
        )
        if (!listed) return
        const plan = planSweep({ files: yield* readFiles(ledger.directory), self: ledger.path, seed: roots.orphans() })
        for (const file of plan.stale) {
          yield* Effect.promise(() => unlink(file)).pipe(Effect.catchCause(() => Effect.void))
        }
        for (const root of plan.abandon) yield* ledger.release(root)
        for (const root of plan.deletable) {
          if (yield* removeRoot(generation, root)) yield* ledger.release(root)
        }
        if (plan.deletable.size > 0 || plan.stale.length > 0) {
          yield* Effect.logInfo("watchman sweep", {
            deleted: plan.deletable.size,
            stale: plan.stale.length,
            generation: generation.id,
          })
        }
      })

    const create = Effect.gen(function* () {
      const adopted = new Set<string>()
      const generation: Generation = {
        id: ++next,
        client: new Client(),
        closed: Deferred.makeUnsafe<void>(),
        routes: new Map(),
        subscriptions: new Map(),
        adopted,
      }
      generations.add(generation)
      const disconnect = (cause?: unknown) => Effect.runFork(retire(generation, cause))
      generation.client.on("subscription", (value: unknown) => {
        if (!value || typeof value !== "object" || !("subscription" in value)) return
        const name = Reflect.get(value, "subscription")
        if (typeof name === "string") generation.subscriptions.get(name)?.(value)
      })
      generation.client.on("log", (value: unknown) => Effect.runFork(Effect.logDebug("watchman log", { value })))
      generation.client.on("connect", () => {
        if (Deferred.isDoneUnsafe(generation.closed)) generation.client.end()
      })
      generation.client.on("error", disconnect)
      generation.client.on("end", disconnect)
      yield* capabilityCheck(generation).pipe(Effect.tapError((error) => retire(generation, error)))
      // The adopted snapshot completes before the generation becomes visible,
      // so every route resolution classifies against the full pre-existing set.
      for (const root of (yield* command(generation, ["watch-list"], WatchListResponse, "connect")).roots) {
        adopted.add(root)
      }
      active = generation
      outageSince = undefined
      yield* Effect.logInfo("watchman connected", { generation: generation.id, adopted: adopted.size })
      yield* Effect.gen(function* () {
        yield* Effect.sleep(options?.settleMs ?? SWEEP_SETTLE_MS)
        while (live(generation)) {
          yield* sweep(generation)
          yield* Effect.sleep(options?.pollMs ?? SWEEP_POLL_MS)
        }
      }).pipe(Effect.forkIn(scope))
      return generation
    })

    const current = () =>
      lock.withPermit(
        Effect.gen(function* () {
          if (active && !Deferred.isDoneUnsafe(active.closed)) return active
          return yield* create
        }),
      )

    const notifySeconds = options?.notifySeconds ?? 0
    if (notifySeconds > 0) {
      yield* Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep(notifySeconds * 1000)
          if (outageSince !== undefined && roots.demand() > 0) {
            yield* Effect.logWarning("watchman disconnected; subscriptions waiting to reconnect", {
              outageSeconds: Math.round((Date.now() - outageSince) / 1000),
              waitingRoots: roots.demand(),
            })
          }
        }
      }).pipe(Effect.forkScoped)
    }

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const generation = active
        if (generation && live(generation)) {
          for (const root of ledger.claimed()) {
            // Another live process depends on this root: drop only our claim.
            if (yield* claimedElsewhere(root)) {
              yield* ledger.release(root)
              continue
            }
            if (yield* removeRoot(generation, root)) yield* ledger.release(root)
          }
        }
        for (const retired of generations) yield* retire(retired)
        yield* ledger.close()
      }),
    )
    return { current, command, retire, roots } satisfies Manager
  })
