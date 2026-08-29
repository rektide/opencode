# Externally managed service mode + contender observability (`explicit-port`)

This workspace holds the "external mode + observability" patch stack (Stack 2
of the externally managed background service proposal) for OpenCode v2's
managed background service: an opt-in mode where clients never spawn, evict,
or stop the service because a supervisor such as systemd owns it, plus
contender outcome reporting so service election timelines are visible.
Workspace `~/src/opencode-explicit-port` (jj workspace sharing the repo at
`~/archive/anomalyco/opencode`). Floating bookmark `explicit-port`; immutable
snapshot `explicit-port-20260818`. Manifest: "Externally managed service mode"
in the accepted `working` table and Stack 2 of "Externally managed background
service (systemd) + patient reap" under On deck in
[`patches.md`](/opencode/patches.md). Composes independently of Stack 1
(`service-reap-patience`, workspace `~/src/opencode-noreap`).

## Why

Any client (`ensure` on every TUI/`run`/reconnect path) could previously evict
a merely busy registered server after three health-probe timeouts and a short
SIGTERM-to-SIGKILL window, racing replacement contenders for the port. A
supervisor such as systemd cannot own a process that clients feel entitled to
kill. The system unit runs `opencode serve --service` in the foreground (port
already configurable via `service set port <n>`); external mode makes clients
respect that ownership. Nothing changes unless `service.external` or
`OPENCODE_SERVICE_EXTERNAL` is set.

Additionally, contender startup time was invisible: contenders run detached
with ignored stdio, so the spawning client is the only observer of election
outcomes. The stack emits contender lifecycle events to the client and logs
outcomes with elapsed time to stderr, and the server logs its own startup
elapsed time at readiness.

## Stack

Freshened 2026-08-29 onto upstream `e70d667a9fe3` (`fix(ai): preserve
Anthropic finish across usage deltas`, the `v2@origin` tip at that fetch);
see History for the conflict set and resolutions. Floating bookmark
`explicit-port` = snapshot `explicit-port-20260829` at `26b018bfb814`
(change `uqtswvow`); prior snapshot `explicit-port-20260818` at `06e8f03a574d`
(change `rszvwskr`) over base `044d04df` remains the immutable record of the
previous freshen. Inspected from this workspace's clean working copy on top of
that tip; line numbers below are from the 2026-08-18 tree over `044d04df` unless
noted.

| # | Commit | Change | Subject |
| ---: | --- | --- | --- |
| 1 | `c834d4f2380c` | `vrvzmysoyxyl` | feat(cli): external service mode |
| 2 | `46d9bd84b653` | `mkyoqtxzxoyq` | feat(cli): guard service commands for external mode |
| 3 | `7e439bfc330f` | `tswpqqtlutvw` | feat(client): contender event API |
| 4 | `4fcfc5f655c5` | `uulmzosvuxrp` | feat(client): emit contender lifecycle events |
| 5 | `b4b053544ea6` | `vtkyooykwxzy` | feat(server): log elapsed time at readiness |
| 6 | `06e8f03a574d` | `rszvwskrvlkt` | feat(cli): log contender outcomes to stderr |

One-line scopes:

1. **external service mode** — `service.external` config key
   (`packages/cli/src/services/service-config.ts:19`, settable via
   `opencode service set external true`) with the `OPENCODE_SERVICE_EXTERNAL`
   override (`service-config.ts:159-162`); `ServerConnection.resolve`
   (`packages/cli/src/services/server-connection.ts:47-58`) only ever
   discovers through the registration file in external mode, failing fast
   with the expected URL and a pointer at the service manager
   (`unavailableError`, `server-connection.ts:62-71`) instead of promoting
   the client to owner; config mutations skip stopping the service
   (`stopUnlessExternal`, `service-config.ts:211`).
2. **guard service commands** — `service start/stop/restart` refuse under
   external mode with the service-manager hint
   (`packages/cli/src/commands/handlers/service/{start,stop,restart}.ts`);
   `login`/`pair`/`mini`/`default` resolve through `ServerConnection` so they
   honor the mode.
3. **contender event API** — `ContenderEvent` union and the optional
   `onContender` callback on ensure options
   (`packages/client/src/service.ts:28-46`), state carried in
   `packages/client/src/service-contender.ts`.
4. **emit contender lifecycle events** — both ensure variants (Effect and
   promise, `packages/client/src/{effect,promise}/service.ts`) observe
   contender exits every poll iteration so a loser that yields after the
   winner registers is still reported, emitting spawn/finish events with
   elapsed milliseconds.
5. **server readiness elapsed log** — `server ready in Nms` at readiness
   (`packages/server/src/process.ts:107`).
6. **CLI contender stderr logging** — `ServiceConfig.options` wires
   `onContender` (`packages/cli/src/services/service-config.ts:118`) writing
   each contender's outcome and elapsed startup time to stderr, plus the
   client-side test for contender outcome events
   (`packages/client/test/service.test.ts:338`).

## Verification

Run from package directories, never the repo root. Results identical on the
repaired stack over `b0c3a16e`, on the freshened stack over `044d04df`, and on
the 2026-08-29 freshen over `e70d667a` (client count rose to 28 with upstream's
fixture-driven suite growth):

- `packages/cli`: `bun test test/server-connection.test.ts` — **4 pass**
  (resolution groups, version gating, external discover-only fail-fast,
  `OPENCODE_SERVICE_EXTERNAL` override).
- `packages/client`: `bun test test/service.test.ts test/promise-service.test.ts`
  — **27 pass** on `044d04df` / **28 pass** on `e70d667a` (18+9 → 18+10,
  including "reports contender outcomes with elapsed time").
- `packages/cli`, `packages/client`: `bun typecheck` (`tsgo --noEmit`) clean;
  `packages/server`: `bun typecheck` (`tsgo -b`) clean.

Known unrelated failures: `packages/client` `effect.test.ts`,
`promise.test.ts`, and `contract-identity.test.ts` each fail one
"exposes every standard HTTP API group"-family assertion (test expects a
`question` API group the built client lacks). They reproduce identically on
bare `b0c3a16e` and `044d04df` without this stack — pre-existing baseline
artifact, not touched by these commits.

Env: this stack reads only `OPENCODE_SERVICE_EXTERNAL` (not set in test
shells). The host's live `OPENCODE_SERVICE_EVICTION_STRIKES` /
`OPENCODE_SERVICE_KILL_GRACE` exports belong to the separate reap stack and
are not read by any code in this workspace; client tests accelerate timing
via `withEnsureTiming` options, not env.

## Deployment

- Enable: `opencode service set external true`, or export
  `OPENCODE_SERVICE_EXTERNAL=1`. With the key set, `opencode service
  start|stop|restart` refuse and every client attach path only discovers via
  the registration file.
- The service unit runs `opencode serve --service` in the foreground; port via
  `opencode service set port <n>`. Readiness shows `server ready in Nms`;
  contender outcomes appear on the attaching client's stderr as
  `opencode: service contender <pid> <outcome> after <n>ms`.
- systemd adoption pending a user unit running `opencode serve --service`
  plus `opencode service set external true` (see manifest deployment note).

## History

- 2026-08-29: freshened onto `e70d667a9fe3` via duplicate-and-rebase (the
  dated snapshots stay on the untouched originals). Four conflicted commits,
  five conflict sites, all the same shape — upstream evolved the exact lines
  this stack touches:
  1. `service-config.ts` keys/configKey/set/unset: upstream added a `cors`
     config key where this stack adds `external`; merged to
     `["hostname", "port", "password", "cors", "env", "external"]` and both
     switch cases, with upstream's new `cors` set/unset bodies adapted to the
     stack's `stopUnlessExternal()` guard instead of raw `Service.stop`.
  2. `commands/handlers/service/stop.ts`: upstream now calls
     `ServerConnection.shutdownPersistentPty(options)` before `Service.stop`;
     kept that body and prepended the stack's `requireInternal("stop")` guard.
  3. `client/src/promise/service.ts` spawn site: upstream now
     `await spawnContender()` before adding to the contender set; kept the
     await and emit `onContender({ type: "spawned", ... })` after it. The
     Effect variant merged clean (already `yield* spawnContender`).
  4. `server/src/process.ts` readiness: upstream renamed
     `Deferred.await(shutdown)` to `shutdown.await`; kept the new form and the
     stack's `server ready in Nms` log before the return.
  5. `client/test/service.test.ts`: upstream rewrote the suite onto the
     `serviceFixture`/`accelerate` structure (`await using` disposal,
     `fixture.command(mode)`, `fixture.track(pid)`); the stack's
     "reports contender outcomes with elapsed time" test was re-expressed
     against it (`fixture.command("coordinated")`, track+dispose instead of
     manual kill/waitForExit), still expecting 2 spawned + 1 finished
     "yielded" with elapsed > 0. An orphaned `>>>>>>>` marker from the first
     resolution pass was caught by the test run and folded out of the feature
     tip (`26b018bf`).
  Verification on the new base: CLI `bun test test/server-connection.test.ts`
  **4 pass**; client `bun test test/service.test.ts test/promise-service.test.ts`
  **28 pass**; `bun typecheck` clean in `packages/cli` (`tsgo --noEmit`),
  `packages/client` (`tsgo --noEmit`), and `packages/server` (`tsgo -b`).
- 2026-08-18: freshened onto `044d04df` and repaired the incomplete
  restructure. The mid-flight restructure (which split the original 4-commit
  stack into the current shape) had absorbed the final commit `b13d9cf4`
  ("feat(cli): log contender outcomes to stderr") *into* commit 4 while
  leaving the original change orphaned and unbookmarked — the feature content
  was never actually missing, but the promised 6-commit shape was. Restored
  by `jj split --insert-after` of the CLI wiring + client test out of commit
  4 into a new commit 6 carrying `b13d9cf4`'s exact message and content
  (`+10/-1` `service-config.ts`, `+32/-1` `service.test.ts`); commit 4's
  description dropped its now-stale "wire the CLI" sentence. Rebases onto
  `b0c3a16e` (repair) and `044d04df` (freshen) were conflict-free. Earlier
  2026-08-18 resting points on base `b0c3a16e`: the pre-restructure 4-commit
  stack `fa3f32cd`/`20ac793a`/`b5887c12`/`b13d9cf4`, then the restructured
  5-commit chain ending `24fcd5a1`.

## Open questions

- Does upstream want the `onContender` callback surface, or only the stderr
  logging? (From the manifest.)
- Should external-mode discovery failure distinguish "unreachable" from
  "incompatible" incumbents? The restructure collapsed both into
  `unavailableError` with one message.
- Should `service set`/`unset` of `external` itself require the service to be
  reachable, or is refusing *mutations of other keys while external* (current
  `stopUnlessExternal` behavior for `env`) the right boundary?
