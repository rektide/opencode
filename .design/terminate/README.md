# Managed service forced-exit deadline (`terminate`)

This workspace holds the server-side shutdown backstop for OpenCode v2's
managed background service: a 60s deadline armed at every shutdown entry
point that force-exits the process if teardown never completes. Workspace
`~/src/opencode-terminate`. Floating bookmark `terminate`; immutable snapshot
`terminate-20260818`. Manifest: "Managed service forced-exit deadline" in the
accepted `working` table (same title under On deck retains the original
rationale) in [`patches.md`](/opencode/patches.md).

## Why

Forensic postmortem of four immortal `opencode2 serve --service` processes
(2026-08-17, PIDs 396517/433387/449787/460177). Each was an *elected winner* —
bound the port, registered, served `/api/event` streams for ~30–60s — then
received the graceful-stop trigger (registration replacement via the 5s
ownership watchdog), began teardown (listener released, DB closed), and hung
forever inside uninterruptible Effect finalizers (surviving `fs.watch`
threads are the prime suspect). The ownership watchdog worked; nothing
converted *requested* death into *completed* death.

Each hang freed the port early, so the next contender bound and repeated the
cycle — a self-sustaining dethrone cascade. `kill` was useless because
`NodeRuntime.runMain` translates SIGTERM into a fiber interrupt that joins
the pile-up rather than exiting, and the CLI's explicit `process.exit` is an
`Effect.tap` *after* root-fiber completion, so a stuck fiber means no exit.
The server-side deadline is the missing backstop; it composes with the
reap-patience and external-mode stacks, which govern client-side eviction
policy.

## Patch shape

Two commits directly on the `v2@origin` tip (never on `dev`):

1. **`fix(cli): force managed service exit when shutdown stalls`** — adds
   `makeShutdownDeadline` in `packages/cli/src/server-process.ts` and the
   regression test. In service mode only
   (`packages/cli/src/server-process.ts:45`), a deadline object is created
   that arms a 60s one-shot timer from three entry points: SIGTERM/SIGINT
   signal listeners (reason = signal name), fiber interruption
   (`Effect.onInterrupt`, reason `"server interrupted"`,
   `packages/cli/src/server-process.ts:162`), and resolution of the deferred
   server shutdown (`reason "service shutdown requested"`,
   `packages/cli/src/server-process.ts:154`). On expiry it logs
   `shutdown deadline exceeded; forcing exit` with the arming reason, pid,
   and deadline, then calls `process.exit(1)` directly (250ms later, after
   log flush) — no fiber cooperation required. Test hook
   `OPENCODE_TEST_SHUTDOWN_STALL` swaps the post-shutdown step for
   `Effect.never` (`packages/cli/src/server-process.ts:156`) so a stalled
   teardown is injectable; the test
   `a stalled managed service shutdown is forced out at the deadline`
   (`packages/cli/test/service.test.ts:239`) asserts forced exit code 1,
   foreign registration preserved, and the port freed.
2. **`fix(cli): extend managed service shutdown deadline and drop dead handle
   probe`** — raises the deadline from 10s to 60s (busy but healthy teardown
   can legitimately take tens of seconds) and drops an attempted
   active-handles log at expiry (see exclusions).

## Verification

Freshened 2026-08-18 onto `v2@origin` `044d04df` ("fix(cli): preserve clean
build manifest", the tip current at that fetch; prior base `b0c3a16e`).
Upstream's delta between the two bases touches neither
`packages/cli/src/server-process.ts` nor `packages/cli/test/service.test.ts`,
so the rebase was conflict-free and both per-commit diffs came out
byte-identical.

From `packages/cli`, with host-exported `OPENCODE_SERVICE_EVICTION_STRIKES`
and `OPENCODE_SERVICE_KILL_GRACE` stripped (tests must control their own env;
`serviceEnv()` in the test spreads `process.env` into spawned services):

- `bun test test/service.test.ts -t "a stalled managed service shutdown is
  forced out at the deadline"` — 1 pass (~68s: 60s deadline + stall).
- `bun test test/service.test.ts` — 20/21 pass. The single failure, `a failed
  service stays registered and owns the selected port until stopped`
  (`packages/cli/test/service.test.ts:510`, an upstream test unmodified by
  this stack), reproduces identically on bare `044d04df`: same
  `Timed out waiting for service registration` at `waitForInfo`. Pre-existing,
  not new.
- `bun typecheck` — clean.

## Deliberately not included

- **Naming the stuck finalizer at deadline.** Effect v4 has no fiber
  introspection (v3 `Fiber.dump` is gone), and Bun stubs
  `process._getActiveHandles`/`getActiveResourcesInfo` to always return `[]`
  (verified: Node returns real handles, Bun returns empty even with live
  server/watcher/timers). Revisit with OTel spans or v4 introspection.
- Eviction's `same()`-check SIGKILL bail-out under contention.
- Sweeping the ~1,050 leaked `service-local.json.<uuid>.tmp` registration
  temps in the state dir.

## Open questions

- Should the deadline log dump the set of in-flight Effect scopes or running
  fibers once a v4 introspection path exists?
- Does 60s need to be configurable (`OPENCODE_SERVICE_SHUTDOWN_DEADLINE`)
  once real-world teardown timings are known, or does the fixed value hold?
