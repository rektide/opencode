# Patient background-service reap (`noreap`)

This workspace holds the "patient reap" patch stack for OpenCode v2's managed
background service: it stops ordinary clients from killing a merely busy
service process, and makes eviction — when it finally happens — graceful.
Workspace `~/src/opencode-noreap` (renamed 2026-08-18 from `opencode-reap`;
the jj workspace name matches the directory). Floating bookmark
`service-reap-patience`; immutable snapshots `service-reap-patience-20260817`
and `service-reap-patience-20260818`. Manifest: "Background service reap
patience" in the accepted `working` table and "Externally managed background
service (systemd) + patient reap" under On deck in
[`patches.md`](/opencode/patches.md).

## Why

Every client surface (TUI, `run`, reconnect, `service start/restart`) resolves
its server through `Service.ensure`. Before this stack, `ensure` polled the
registered incumbent's `/api/health`, and after **3 consecutive probe
timeouts** — with the historical 2s probe timeout and 1s poll spacing that is
~9s — it evicted the incumbent: SIGTERM, then SIGKILL after a ~5s grace,
while simultaneously spawning replacement contenders that race the dying
incumbent for its port. A server that was merely busy (event loop saturated by
a long synchronous step, GC, startup, or a wedged-but-recoverable state)
looked identical to a dead one, so any client launch could destroy live
sessions on a healthy-but-slow server.

That policy makes the process unownable: a supervisor such as systemd cannot
manage a process that arbitrary client invocations feel entitled to kill.
Worse, the kill path escalated straight to signals, so sessions never
suspended and the registration file was left for the replacement to trample.
This is the client-side half of the story told by the immortal-server
postmortem (manifest, "Managed service forced-exit deadline" — elected
winners torn down mid-flight, freeing the port early and cascading); the
server-side `terminate` stack adds the shutdown deadline backstop, and the
`explicit-port` stack adds the externally managed mode where clients never
evict at all.

The stack deliberately changes no defaults: policy stays at historical values
unless a deployment opts into patience via options or env vars.

## Stack

Freshened 2026-08-18 onto upstream `b0c3a16e` (`feat(plugin): expose server
plugin status`). Snapshot `service-reap-patience-20260818` = floating bookmark
`service-reap-patience` at `ddc900fe` (change `moqpypyr`). Inspected from this
workspace's clean working copy on top of that tip; all line numbers below are
from that tree. (The `service-reap-patience-20260817` snapshot at `3956b17d`
carries the pre-freshen change IDs `nqlqurzn` / `nlxpsylp` / `twrxpuns` /
`qlumuuxm` for the same four commits, in the same order.)

| # | Commit | Change | Subject |
| ---: | --- | --- | --- |
| 1 | `31dccefe9e0b` | `xkoqspzn` | feat(client): parameterize background service reap thresholds |
| 2 | `e1fd07716cd0` | `vultouwp` | fix(client): request graceful stop before evicting a service |
| 3 | `43880f0c1198` | `qxokmpzz` | fix(client): hold contenders while the incumbent service is unresponsive |
| 4 | `ddc900feca93` | `moqpypyr` | feat(cli): add env vars for background service reap patience |

Files touched across the stack: `packages/client/src/service.ts`,
`packages/client/src/service-timing.ts`, `packages/client/src/effect/service.ts`,
`packages/client/src/promise/service.ts`,
`packages/client/test/fixture/service.ts`,
`packages/client/test/service.test.ts`,
`packages/client/test/promise-service.test.ts`,
`packages/cli/src/services/service-config.ts`,
`packages/cli/test/server-connection.test.ts`. Both client variants (Effect
and promise) receive mirror-image changes; the Effect variant is cited below.

## Commit 1 — parameterize reap thresholds (`31dccefe`, change `xkoqspzn`)

Public patience options on the local service lifecycle API, defaults
preserving historical behavior exactly:

- `packages/client/src/service.ts` — `probeTimeoutSeconds` on
  `DiscoverOptions`; `evictionStrikes` and `killGraceSeconds` on
  `EnsureOptions`; `killGraceSeconds` on `StopOptions`. Exported defaults
  `defaultProbeTimeoutSeconds = 2`, `defaultEvictionStrikes = 3`,
  `defaultKillGraceSeconds = 5`. Doc comments state the cost model: each
  strike costs one probe timeout plus one second of poll spacing.
- `packages/client/src/service-timing.ts` — new `PatienceOptions` and
  `timingFromOptions()` (`:24`) derive the internal `EnsureTiming` (which
  upstream had extracted into this module):

  - `requestTimeout = probeTimeoutSeconds * 1000`
  - `promiseTimeout = max(120s, strikes × (probeTimeout + 1s) + killGrace + 60s)`
    (`:30`) — the overall `ensure` deadline now scales with the configured
    window instead of the old flat 120s bound, so a patient configuration is
    never cut short mid-strike-window.
  - `attempts = promiseTimeout / pollInterval` (1s polls)
  - `stopPollAttempts = max(1, killGrace × 20)` at the existing 50ms
    `stopPollInterval`, i.e. the wait-for-exit poll covers the full kill
    grace.

  `defaultEnsureTiming = timingFromOptions({})` (`:47`) reproduces the
  historical table; `ensureTiming(options)` (`:49`) resolves per-call options
  through a WeakMap; `withEnsureTiming` keeps test timing overrides winning
  over derived patience so accelerated tests keep configured windows.
- Effect and promise clients compare the strike counter against
  `timing.evictionStrikes` instead of the literal `3`
  (`packages/client/src/effect/service.ts:92`), and `stop()` derives its
  timing from its options' `killGraceSeconds`.

## Commit 2 — request graceful stop before evicting (`e1fd0771`, change `vultouwp`)

**Before**: when strikes ran out, eviction (`terminate` in the current
upstream shape) escalated straight to `process.kill(pid, "SIGTERM")`, polled
for exit, then SIGKILLed. Sessions died mid-flight; the registration file was
removed only afterward by the evicting client.

**After**: eviction first asks the incumbent to stop *itself*. The commit adds
`endpointOf(info)` and `requestStop()` to both client variants
(`packages/client/src/effect/service.ts:294`): an authenticated
`POST /api/service/stop` with the incumbent's `instanceID`, bounded by
`timing.requestTimeout`. Outcomes:

- `"accepted"` — server answered `{accepted: true}`; it will suspend active
  sessions and release its registration cleanly.
- `"unsupported"` — no instance id, legacy registration, HTTP 404/405 (no stop
  endpoint), or the fetch itself failed/timed out. **A genuinely hung server
  lands here**, so this path degrades to exactly the old signal behavior
  after one probe-timeout of extra delay.
- `"rejected"` — the server answered but declined (`accepted` not true). The
  incumbent is alive and refusing; eviction aborts entirely (`terminate`
  returns without sending any signal).

`terminate` (`packages/client/src/effect/service.ts:276`) then becomes:
`same()`-guarded re-read of the registration → `requestStop` → on
`"unsupported"` SIGTERM → poll `stopped(pid)` through the timing window →
if still alive, `same()`-guard again then SIGKILL → remove the registration
file. The `same()` guards ensure a client never signals a PID that a newer
registration has already replaced. `stop()` and the version-mismatch
replacement path share `terminate`, so they inherit the graceful-first
escalation too.

**Tests**: fixture mode `hanging-graceful`
(`packages/client/test/fixture/service.ts:52`) serves a never-resolving
`/api/health` (so strikes still accumulate exactly as for a wedged server)
while `/api/service/stop` records its request body to `<registration>.stop`,
self-shuts-down cleanly, and answers `accepted: true`. Both variants gain
"evicts an unresponsive service through a graceful stop request": the stop
request carried the *original* instance ID, the incumbent exits 0, and a
replacement takes over the registration.

## Commit 3 — hold contenders while the incumbent is merely unresponsive (`43880f0c`, change `qxokmpzz`)

**Before**: contender spawning in the `ensure` loop was gated only on
`contenders.size < 2 && Date.now() - lastSpawn >= spawnDelay`. A merely
unresponsive incumbent therefore got replacement contenders spawned against
it within seconds — racing it for the port *while* its strikes were still
accumulating, i.e. before the system had even decided it deserved
replacement.

**After**: the spawn gate additionally requires `!registration.timedOut`
(`packages/client/src/effect/service.ts:122`,
`packages/client/src/promise/service.ts:100`). While the registered incumbent
is probe-unresponsive, no contender spawns at all; the strike window alone
decides whether the incumbent is replaced. Strikes increment per poll while
`timedOut` holds and the registration is unchanged
(`packages/client/src/effect/service.ts:87-95`), reset to zero on any
successful probe, and on reaching `evictionStrikes` trigger
`announce("missing")` + `terminate(...)` + strike reset +
`lastSpawn = Date.now() - spawnDelay` — so the moment eviction completes, a
replacement contender may spawn immediately without waiting out the backoff.

**Tests**: fixture mode `stall` (`packages/client/test/fixture/service.ts:66`)
stalls its first health response until a `.release` marker file appears, then
answers healthy. Both variants gain "a briefly unresponsive registered
service recovers instead of being evicted": `ensure` runs with
`command: []` — any contender spawn would throw and fail the ensure — plus
`probeTimeoutSeconds: 0.5`, `evictionStrikes: 100`. After 2s of solid
unresponsiveness (many strike opportunities, and historically enough for
eviction+replacement), the incumbent is released and `ensure` must resolve to
the *same* incumbent (same URL, same PID, still process-alive), proving both
that no contender was spawned and that no eviction fired.

## How 2 and 3 compose

Busy ⇒ wait: a slow-but-alive incumbent accumulates strikes without any
replacement being spawned against it (commit 3), and a single successful
health probe clears the strikes and lets `ensure` adopt the incumbent.

Strikes exhausted ⇒ graceful stop ⇒ signals: once the configured window
expires, eviction asks first (commit 2); a server that can still answer stops
itself with sessions suspended and the registration released, a server that
cannot answer gets SIGTERM within one probe-timeout of the same instant, and
a defiantly alive server that declines is left entirely alone. SIGKILL
remains the last resort behind the `same()` guards. After eviction the
contender backoff is pre-expired so replacement startup is immediate.

## Commit 4 — env vars (`ddc900fe`, change `moqpypyr`)

`ServiceConfig.options` (`packages/cli/src/services/service-config.ts:105-107`)
reads `OPENCODE_SERVICE_PROBE_TIMEOUT` (seconds), `OPENCODE_SERVICE_EVICTION_STRIKES`
(positive integer), and `OPENCODE_SERVICE_KILL_GRACE` (seconds) and forwards
them into the client's patience options, so every CLI client surface — TUI,
mini, `service start/restart`, reconnect — inherits the tuned window without
code changes. The `seconds()` / `positiveInteger()` helpers treat missing,
non-finite, non-positive, or non-integer values as unset, falling back to the
client library's historical thresholds.

## Deployment on this host

The shell exports `OPENCODE_SERVICE_EVICTION_STRIKES=100` and
`OPENCODE_SERVICE_KILL_GRACE=240` (`~/.zshenv` / `~/.zshrc`): a ~5-minute
strike window (100 × ~3s) and a 4-minute kill grace for the pathological
hang case, per the commit-1 cost model. Systemd adoption (user unit running
`opencode serve --service` plus the `explicit-port` stack's external mode) is
still pending.

Because those env vars are real deployment knobs, the CLI test
"service patience env vars parameterize probe and eviction thresholds"
(`packages/cli/test/server-connection.test.ts:12`) snapshots and restores the
three variables rather than assuming a clean environment — it must keep doing
so on this host, where they are set (this is regression-guarded).

## Verification

- The four tests added by the stack (graceful-stop eviction ×2 variants,
  stall-recovery ×2 variants) plus the CLI env-var test are the focused
  suite; the manifest records the 2026-08-18 freshen verification ("Client
  service tests 28 pass; CLI server-connection tests 3 pass; client+cli
  typecheck clean") for `13b2d302`, and the 14:52 re-freshen to `ddc900fe`
  kept the same test shapes (diff stats identical modulo upstream's
  `evict`→`terminate` rename, which commit 2 now reworks as described above).
- This README's per-commit claims were re-verified against
  `jj show` of each freshened commit (`31dccefe`, `e1fd0771`, `43880f0c`,
  `ddc900fe`) and the tree at `ddc900fe` on 2026-08-18.

## Open questions

- Should eviction strikes be shared across clients (e.g. a strike counter in
  the registration directory) so N concurrent clients don't each run
  independent fuses against the same incumbent?
- `/api/health` is served on the server's event loop, so a wedged loop and a
  busy loop are indistinguishable to probes; the durable fix is serving
  health from outside the loop (worker thread), which would let the strike
  window stay short without collateral eviction.
- (Stack 2 question, recorded here for context) Does upstream want the
  `onContender` callback surface, or only the stderr logging?

## Maintenance notes

- The 2026-08-18 re-freshen landed on `b0c3a16e`, one commit below the
  `v2@origin` tip `02f3f3cb` (`test(core): remove flaky webfetch checks
  (#43278)` — core test-only, no client overlap; the baseline was pinned
  while origin moved during the freshen). The next refresh should rebase the
  four commits onto the then-current tip as usual.
- Upstream renamed the eviction helper `evict` → `terminate` and dropped the
  standalone `requestStop` between the 20260817 and 20260818 baselines;
  commit 2 now introduces `requestStop` itself and threads it into
  `terminate`. Expect this seam to keep moving — verify against the diff, not
  this prose.
