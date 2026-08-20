import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect } from "bun:test"
import { Deferred, Effect } from "effect"
import * as TestClock from "effect/testing/TestClock"
import { makeLedger, makeRootBook, planSweep, readFiles, type LedgerFile } from "../../src/filesystem/watchman/ledger.ts"
import { it } from "../lib/effect.ts"

function file(pid: number, roots: string[], path: string): LedgerFile {
  return { version: 1 as const, pid, started: "2026-08-20T00:00:00Z", roots, path }
}

const self = "/ledger/self.json"

const tempLedger = () =>
  Effect.promise(() => mkdtemp(path.join(tmpdir(), "watchman-ledger-"))).pipe(Effect.flatMap(makeLedger))

it.effect("sweep deletes only unclaimed roots", () =>
  Effect.sync(() => {
    const plan = planSweep({
      self,
      pidAlive: (pid) => pid !== 3,
      files: [
        file(1, ["/a"], self),
        file(2, ["/b", "/shared"], "/ledger/live.json"),
        file(3, ["/shared", "/dead"], "/ledger/dead.json"),
      ],
      seed: ["/seed"],
    })
    expect([...plan.deletable].sort()).toEqual(["/dead", "/seed"])
    expect([...plan.abandon]).toEqual(["/shared"])
    expect(plan.stale).toEqual(["/ledger/dead.json"])
  }),
)

it.effect("sweep keeps roots a live foreign process claims", () =>
  Effect.sync(() => {
    const plan = planSweep({
      self,
      pidAlive: (pid) => pid === 7,
      files: [file(7, ["/editor"], "/ledger/other.json")],
      seed: [],
    })
    expect([...plan.deletable]).toEqual([])
    expect(plan.stale).toEqual([])
  }),
)

it.effect("ledger files round-trip and disappear when empty", () =>
  Effect.gen(function* () {
    const directory = yield* Effect.promise(() => mkdtemp(path.join(tmpdir(), "watchman-ledger-")))
    const ledger = yield* makeLedger(directory)
    yield* ledger.claim("/repo")
    const files = yield* readFiles(directory)
    expect(files).toHaveLength(1)
    expect(files[0].roots).toEqual(["/repo"])
    expect(files[0].pid).toBe(process.pid)
    yield* ledger.release("/repo")
    yield* ledger.close()
    expect(yield* readFiles(directory)).toHaveLength(0)
  }),
)

it.effect("root book reaps minted roots after grace", () =>
  Effect.gen(function* () {
    const removed: string[] = []
    const ledger = yield* tempLedger()
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: (root) =>
        Effect.sync(() => {
          removed.push(root)
          return true
        }),
      claimedElsewhere: () => Effect.succeed(false),
    })
    yield* book.acquire({ adopted: new Set<string>() }, "/repo")
    yield* book.release("/repo")
    yield* TestClock.adjust(6000)
    expect(removed).toEqual(["/repo"])
    expect(ledger.claimed().size).toBe(0)
  }),
)

it.effect("root book never reaps adopted roots", () =>
  Effect.gen(function* () {
    const removed: string[] = []
    const ledger = yield* tempLedger()
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: (root) =>
        Effect.sync(() => {
          removed.push(root)
          return true
        }),
      claimedElsewhere: () => Effect.succeed(false),
    })
    yield* book.acquire({ adopted: new Set(["/editor"]) }, "/editor")
    yield* book.release("/editor")
    yield* TestClock.adjust(6000)
    expect(removed).toEqual([])
    expect(ledger.claimed().size).toBe(0)
    expect([...book.orphans()]).toEqual([])
  }),
)

it.effect("reacquisition inside grace cancels the reaper", () =>
  Effect.gen(function* () {
    const removed: string[] = []
    const ledger = yield* tempLedger()
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: (root) =>
        Effect.sync(() => {
          removed.push(root)
          return true
        }),
      claimedElsewhere: () => Effect.succeed(false),
    })
    const generation = { adopted: new Set<string>() }
    yield* book.acquire(generation, "/repo")
    yield* book.release("/repo")
    yield* TestClock.adjust(3000)
    yield* book.acquire(generation, "/repo")
    yield* TestClock.adjust(3000)
    expect(removed).toEqual([])
    yield* book.release("/repo")
    yield* TestClock.adjust(6000)
    expect(removed).toEqual(["/repo"])
  }),
)

it.effect("adopting a claimed root migrates ownership", () =>
  Effect.gen(function* () {
    const removed: string[] = []
    const ledger = yield* tempLedger()
    let elsewhere = true
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: (root) =>
        Effect.sync(() => {
          removed.push(root)
          return true
        }),
      claimedElsewhere: (root) => Effect.succeed(elsewhere && root === "/repo"),
    })
    // Another opencode process minted /repo; we saw it in watch-list.
    yield* book.acquire({ adopted: new Set(["/repo"]) }, "/repo")
    expect([...ledger.claimed()]).toEqual(["/repo"])
    // The other process goes away; now we are the sole claimant.
    elsewhere = false
    yield* book.release("/repo")
    yield* TestClock.adjust(6000)
    expect(removed).toEqual(["/repo"])
  }),
)

it.effect("roots claimed elsewhere are released, not deleted", () =>
  Effect.gen(function* () {
    const removed: string[] = []
    const ledger = yield* tempLedger()
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: (root) =>
        Effect.sync(() => {
          removed.push(root)
          return true
        }),
      claimedElsewhere: () => Effect.succeed(true),
    })
    yield* book.acquire({ adopted: new Set<string>() }, "/repo")
    yield* book.release("/repo")
    yield* TestClock.adjust(6000)
    expect(removed).toEqual([])
    expect(ledger.claimed().size).toBe(0)
  }),
)

it.effect("claim keeps retrying when removal fails", () =>
  Effect.gen(function* () {
    const ledger = yield* tempLedger()
    let succeed = false
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: () => Effect.succeed(succeed),
      claimedElsewhere: () => Effect.succeed(false),
    })
    yield* book.acquire({ adopted: new Set<string>() }, "/repo")
    yield* book.release("/repo")
    yield* TestClock.adjust(6000)
    expect([...ledger.claimed()]).toEqual(["/repo"])
    expect([...book.orphans()]).toEqual(["/repo"])
    succeed = true
    // The reconnect sweep seeds orphans; the retry removes them.
    const plan = planSweep({ files: yield* readFiles(ledger.directory), self: ledger.path, seed: book.orphans() })
    expect([...plan.deletable]).toEqual(["/repo"])
  }),
)

it.effect("demand tracks live subscriptions", () =>
  Effect.gen(function* () {
    const ledger = yield* tempLedger()
    const book = yield* makeRootBook({
      ledger,
      graceMs: 5000,
      remove: () => Effect.succeed(true),
      claimedElsewhere: () => Effect.succeed(false),
    })
    const generation = { adopted: new Set<string>() }
    yield* book.acquire(generation, "/a")
    yield* book.acquire(generation, "/b")
    expect(book.demand()).toBe(2)
    yield* book.release("/a")
    expect(book.demand()).toBe(1)
    expect(Deferred.isDoneUnsafe(Deferred.makeUnsafe<void>())).toBe(false)
  }),
)
