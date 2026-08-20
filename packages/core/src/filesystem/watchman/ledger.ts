import { randomUUID } from "node:crypto"
import { mkdir, readdir, unlink } from "node:fs/promises"
import path from "node:path"
import { roots } from "@opencode-ai/util/global-roots"
import { Effect, Fiber, Option, Schema, Scope } from "effect"

/**
 * Roots this process minted in the Watchman daemon. The daemon has no
 * per-client refcounting — `watch-del` kills a root for every client — so
 * ownership must be coordinated between opencode processes through files in
 * `<data>/watchman-ledger/`, one per process. Sweep decisions bias toward NOT
 * deleting: roots observed pre-existing at connect (adopted, e.g. an
 * editor's) and roots claimed by any live process are always protected.
 */
const LedgerFile = Schema.Struct({
  version: Schema.Literal(1),
  pid: Schema.Number,
  started: Schema.String,
  roots: Schema.Array(Schema.String),
})
export type LedgerFile = typeof LedgerFile.Type & { readonly path: string }

export const defaultDirectory = () => path.join(roots("opencode").data, "watchman-ledger")

function pidAlive(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but is owned by someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM"
  }
}

export { pidAlive }

export type Ledger = {
  readonly directory: string
  readonly path: string
  /** True while ledger writes have succeeded; cleanup is disabled otherwise. */
  readonly enabled: () => boolean
  readonly claim: (root: string) => Effect.Effect<void>
  readonly release: (root: string) => Effect.Effect<void>
  readonly claimed: () => ReadonlySet<string>
  /** Removes our file once no claims remain; leaves it for post-mortem sweep otherwise. */
  readonly close: () => Effect.Effect<void>
}

export const makeLedger = (directory: string = defaultDirectory()) =>
  Effect.gen(function* () {
    const file = path.join(directory, `watchman-${process.pid}-${randomUUID()}.json`)
    const claimed = new Set<string>()
    const started = new Date().toISOString()
    let enabled = true

    const persist = Effect.promise(() =>
      Bun.write(file, JSON.stringify({ version: 1, pid: process.pid, started, roots: [...claimed] })),
    ).pipe(
      Effect.catchCause((cause) =>
        // Unwritable ledger means other processes cannot see our claims, so we
        // must never delete roots on their behalf.
        Effect.logWarning("watchman ledger write failed; proactive cleanup disabled", { file, cause }).pipe(
          Effect.tap(() => Effect.sync(() => (enabled = false))),
        ),
      ),
    )

    yield* Effect.promise(() => mkdir(directory, { recursive: true })).pipe(Effect.catchCause(() => Effect.void))
    yield* persist

    return {
      directory,
      path: file,
      enabled: () => enabled,
      claim: (root: string) =>
        Effect.sync(() => {
          claimed.add(root)
        }).pipe(Effect.andThen(persist)),
      release: (root: string) =>
        Effect.sync(() => {
          claimed.delete(root)
        }).pipe(Effect.andThen(persist)),
      claimed: () => claimed,
      close: () =>
        Effect.gen(function* () {
          if (claimed.size > 0 || !enabled) return
          yield* Effect.promise(() => unlink(file)).pipe(Effect.catchCause(() => Effect.void))
        }),
    } satisfies Ledger
  })

/** Reads every parseable ledger file in the directory; unparseable files are skipped. */
export const readFiles = (directory: string): Effect.Effect<readonly LedgerFile[]> =>
  Effect.gen(function* () {
    const names = yield* Effect.promise(() => readdir(directory)).pipe(Effect.catchCause(() => Effect.succeed([])))
    const files: LedgerFile[] = []
    for (const name of names) {
      if (!name.endsWith(".json")) continue
      const file = path.join(directory, name)
      const value = yield* Effect.promise(() => Bun.file(file).json()).pipe(Effect.catchCause(() => Effect.succeed(undefined)))
      if (value === undefined) continue
      const decoded = Schema.decodeUnknownOption(LedgerFile)(value)
      if (Option.isNone(decoded)) continue
      files.push({ ...decoded.value, path: file })
    }
    return files
  })

export type SweepPlan = {
  /** Roots safe to `watch-del`: claimed only by dead processes (or our own orphans), by no live claimant. */
  readonly deletable: ReadonlySet<string>
  /** Our orphaned claims a live sibling now owns; drop our claim without deleting. */
  readonly abandon: ReadonlySet<string>
  /** Ledger files from dead processes, to remove from disk. */
  readonly stale: readonly string[]
}

/**
 * Pure sweep computation. `seed` are roots this process still claims but no
 * longer needs (refcount zero). Roots claimed by any live process are
 * protected — for this process's own file only the non-seeded roots protect,
 * so our orphans can be reclaimed.
 */
export function planSweep(options: {
  readonly files: readonly (Omit<LedgerFile, "path"> & { readonly path: string })[]
  readonly self: string
  readonly seed: Iterable<string>
  readonly pidAlive?: (pid: number) => boolean
}): SweepPlan {
  const alive = options.pidAlive ?? pidAlive
  const seed = new Set(options.seed)
  const guarded = new Set<string>()
  const stale: string[] = []
  const candidates = new Set<string>(seed)
  for (const file of options.files) {
    if (file.path === options.self) continue
    if (alive(file.pid)) {
      for (const root of file.roots) guarded.add(root)
      continue
    }
    stale.push(file.path)
    for (const root of file.roots) candidates.add(root)
  }
  const own = options.files.find((file) => file.path === options.self)
  if (own) for (const root of own.roots) if (!seed.has(root)) guarded.add(root)
  const deletable = new Set<string>()
  const abandon = new Set<string>()
  for (const root of candidates) (guarded.has(root) ? abandon : deletable).add(root)
  return { deletable, abandon, stale }
}

export type RootBook = {
  /** Records that a subscription needs `root`, classifying it against the generation's adopted snapshot. */
  readonly acquire: (generation: { readonly adopted: ReadonlySet<string> }, root: string) => Effect.Effect<void>
  readonly release: (root: string) => Effect.Effect<void>
  /** Roots we claimed but no subscription uses: deletion candidates. */
  readonly orphans: () => ReadonlySet<string>
  /** Live subscriptions across all roots; nonzero means this process still wants Watchman. */
  readonly demand: () => number
}

/**
 * Process-global refcount over daemon roots, surviving connection
 * generations. When a minted (non-adopted) root's refcount hits zero, a grace
 * delay runs before `watch-del`; reacquisition inside the grace cancels it.
 */
export const makeRootBook = (options: {
  readonly ledger: Ledger
  /** Grace in millis before a released minted root is `watch-del`ed. */
  readonly graceMs: number
  readonly remove: (root: string) => Effect.Effect<boolean>
  /** True when a live foreign process claims the root, in which case we drop only our claim. */
  readonly claimedElsewhere: (root: string) => Effect.Effect<boolean>
}): Effect.Effect<RootBook, never, Scope.Scope> =>
  Effect.gen(function* () {
    type Entry = { refcount: number; adopted: boolean; grace?: Fiber.Fiber<void, unknown> }
    const book = new Map<string, Entry>()
    const scope = yield* Effect.scope
    let demand = 0

    const reap = (root: string, entry: Entry) =>
      Effect.gen(function* () {
        if (entry.refcount !== 0) return
        // Adoption is sticky across generations: a root observed as
        // pre-existing once is never ours to delete, even after a daemon
        // restart re-mints it through our own watch-project.
        if (entry.adopted || !options.ledger.claimed().has(root)) return
        if (yield* options.claimedElsewhere(root)) {
          yield* options.ledger.release(root)
          book.delete(root)
          return
        }
        if (yield* options.remove(root)) {
          yield* Effect.logInfo("watchman root released", { root })
          yield* options.ledger.release(root)
          book.delete(root)
        }
        // Removal failed (daemon gone or generation retired): keep the claim
        // so the reconnect sweep retries it.
      })

    return {
      acquire: (generation, root) =>
        Effect.gen(function* () {
          const entry = book.get(root) ?? { refcount: 0, adopted: false }
          book.set(root, entry)
          if (entry.grace) {
            yield* Fiber.interrupt(entry.grace)
            entry.grace = undefined
          }
          if (generation.adopted.has(root)) entry.adopted = true
          entry.refcount++
          demand++
          // An adopted root claimed by another opencode process was minted on
          // our behalf; take over the claim so their shutdown cannot
          // `watch-del` a root we still use. Unclaimed adopted roots (an
          // editor's) are never claimed and never deleted.
          if (entry.adopted && !options.ledger.claimed().has(root) && (yield* options.claimedElsewhere(root))) {
            entry.adopted = false
            yield* options.ledger.claim(root)
            return
          }
          if (!entry.adopted && !options.ledger.claimed().has(root)) yield* options.ledger.claim(root)
        }),
      release: (root) =>
        Effect.gen(function* () {
          const entry = book.get(root)
          if (!entry) return
          entry.refcount--
          demand--
          if (entry.refcount > 0 || entry.adopted || !options.ledger.claimed().has(root)) return
          if (!options.ledger.enabled()) return
          entry.grace = yield* Effect.sleep(options.graceMs).pipe(
            Effect.andThen(reap(root, entry)),
            Effect.catchCause(() => Effect.void),
            Effect.forkIn(scope),
          )
        }),
      orphans: () =>
        options.ledger.enabled()
          ? new Set(
              [...book.entries()]
                .filter(([root, entry]) => entry.refcount === 0 && !entry.adopted && options.ledger.claimed().has(root))
                .map(([root]) => root),
            )
          : new Set<string>(),
      demand: () => demand,
    } satisfies RootBook
  })
