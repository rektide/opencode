---
type: EvidenceExperiment
title: E11 follow-up circuit races — active-probe interruption and stale ordinary completion
description: Controlled TestClock experiments against the verbatim donor acquisition coordinator on effect 4.0.0-rc.112, covering probe interruption at every observable barrier, stale ordinary outcomes in newer epochs, and the exact fixed backoff sequence.
resource: /.design/watchman/v2-readd/v2-readd4-e11-circuit-races0.glm53max.md
tags: [opencode, watchman, acquisition, circuit, interruption, backoff, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: donor-acquisition
    resource: file:///home/rektide/src/opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/acquisition.ts
    title: Donor acquisition coordinator (verbatim copy exercised)
  - id: donor-root
    resource: file:///home/rektide/src/opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/root.ts
    title: Donor root wiring including RETRY_BASE_MS / RETRY_CAP_MS
  - id: harness
    resource: file:///home/rektide/tmp-opencode/v4-n4-circuit-races/harness.ts
    title: Executable harness (18 scenarios, TestClock)
  - id: raw
    resource: file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output.txt
    title: Raw output of the final run
  - id: raw-run1
    resource: file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output-run1.txt
    title: Preserved first run with the S5b2 no-fresh-gate cascade
  - id: e11
    resource: /.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md
    title: E11 acquisition circuit audit (source-reading baseline)
  - id: validation0
    resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
    title: Wave validation and N4 assignment
---

# E11 follow-up: circuit races under controlled execution

## Result

Executing the verbatim donor coordinator against `effect@4.0.0-rc.112` under
TestClock shows that interrupting an active half-open probe always reopens the
circuit at the *same* backoff attempt and never returns the probe's produced
value to its caller, while an older already-running ordinary success or
non-connect failure closes a *newer* open or half-open circuit through the
unguarded `close(ordinary)` path and wakes its gate waiters immediately — and
the donor's fixed backoff is exactly `min(2000 ms, 100 ms · 2^attempt)` with
attempt advanced only by probe connect-failures, repeated by abandonment, and
reset by ordinary trips.

This report records executable evidence only. It does not choose circuit
semantics, propose rules, redesign anything, edit v4 or shared documents, or
recommend an E13 policy.

## Apparatus and pins

| Pin | Value |
| --- | --- |
| Donor `acquisition.ts` | byte-identical copy exercised; SHA-256 `8ad4a5c029e478ebfdcdcbc98f039a7ab3c7d910b2b68b8603a408d1a44f39ba` — equal to the donor working copy at `opencode-watchman-old` commit `9920ff54fd89` and to the hash E11 recorded for the file |
| Donor `schema.ts` | byte-identical copy; SHA-256 `7894bba6d6fa6e91723da6f0a3e646cb433290fafa1122e55cb6f7c085af3e08` (provides `WatchmanError.stage`) |
| Effect | `effect@4.0.0-rc.112`, isolated `bun add` in the scratch directory (lockfile recorded); no code workspace installed or edited |
| Runtime | bun 1.4.1, Linux |
| Time control | `TestClock.adjust` only; zero real sleeps; sequencing by scheduler turns (`Effect.yieldNow`) |
| Interruption | `Fiber.interrupt` on forked acquire callers |
| Observation surface | the coordinator's own `options.observe` events (`admission{waiting,inFlight}`, `circuit_wait{±1}`, `connect_failure`, `circuit{open|half_open|closed}`), plus the coordinator's own `logWarning`/`logInfo` lines carrying `reason`, `attempt`, `delay`, and per-caller exit summaries (`success` / `interrupted` / `failure{stage}`) |
| Coordinator options | `limit` 1 or 4; S6 uses base/cap 1000/8000 for wide measurement boundaries; S7 uses the donor production constants base=100, cap=2000 ([`root.ts:68-69`](file:///home/rektide/src/opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/root.ts)) |
| Scratch | `/home/rektide/tmp-opencode/v4-n4-circuit-races/` — `harness.ts` (18 scenarios, all `status: ok`), `out/raw-output.txt` (final), `out/raw-output-run1.txt` (preserved earlier run) |

Named barriers used (defined in [`harness.ts`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/harness.ts)):

- `admit-wait` — candidate parked on the admission semaphore.
- `after-decide` — between the `Probe` decision and admission take.
- `work-yield` — probe parked inside interruptible work.
- `work-joined` — probe parked inside `Effect.uninterruptible` work (donor-style command join, cf. `client.ts:102-149`).
- `race-complete-interrupt` — gate completed and interrupt issued in the same driver step.
- `post-complete-close` — gate completed and settled, interrupt issued after.

Work is a parameter of `acquire`, so barriers inside work are pinned by named
`Deferred` gates the driver completes or fails with `WatchmanError`
`stage:"connect"` or `"route"`. Every claim below is a direct read of the
journal/log lines in [`out/raw-output.txt`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output.txt); scenario ids (S0–S7) index into that file.

## Experiment 1 — active half-open probe interrupted at each observable barrier

### Barrier reachability

- **`admit-wait` is unreachable for probes.** Opening the circuit requires a
  candidate to run its connect-failing work inside a permit, and that permit is
  released at trip time; every caller that re-decides after `ready` completes
  finds at least that freed permit. S1 executes the reachable configuration
  (limit=1, one parked holder, one queued candidate, then a trip) and the
  journal shows the probe's admission take with no intervening park
  (`admission{waiting:-1,inFlight:1}` → `work-start` in one block).
- **`after-decide` is narrower than one scheduler turn.** In S4iv a probe
  forked and given exactly one `yieldNow` had already emitted `half_open`,
  admission, and `work-start`; the interrupt then behaved exactly like
  `work-yield`. The pre-admission window could not be pinned from a driver
  fiber at turn granularity.
- `admit-wait` **is reachable for ordinary candidates** and was exercised: S1
  shows the queued candidate taking the freed permit after the holder's trip
  and releasing it with **no `work-start` between** — the `valid(candidate)`
  epoch fence rejects it before work runs (`acquisition.ts:126-143`).

### Outcomes by barrier

| Barrier (scenario) | Returned exit of the probe caller | State transition observed | Permits / waiters |
| --- | --- | --- | --- |
| `work-yield`, interruptible mid-work (S2, S4i, S4iv, S6 segment A) | **interrupted** | `abandon` → `Open(E+1, same attempt)`; WARN `reason:"probe_interrupted"`, same `delay` as before; the probe's already-completed gate is inert if completed afterwards (S4i: no `work-end`, no close) | permit released (`admission{waiting:0,inFlight:-1}`); `changed`-waiter woke, re-decided, re-parked on the new `ready` (`circuit_wait +1` again); after the repeated delay the **same waiter** claimed the next probe |
| `work-joined`, work then **succeeds** (S3a) | **interrupted — the produced value is discarded**; no `work-end`-to-caller path, no `closed` observe | interruption deferred while joined (no exit before the driver checkpoint); after the gate completes: permit release, then `abandon` → `Open(same attempt, probe_interrupted)`. **`close` never ran** even though the work succeeded | waiter wake as above |
| `work-joined`, work then **fails connect** (S3b) | **failure `{stage:"connect"}` — the caller receives the connect error, not an interrupt** | interruption deferred while joined; after the gate fails: permit release, then `abandon` → `Open(same attempt, probe_interrupted)`. **`trip` never ran: no `connect_failure` observe fired and no attempt advance** | waiter wake as above |
| `race-complete-interrupt` (S4ii) | **success `value-of-P`** — completion runs to exit synchronously; the same-step interrupt lands on an already-exited fiber and is a no-op | `close(Probe)` ran: `closed` observe, permit release, exit success | none parked |
| `post-complete-close` (S4iii) | **success `value-of-P`**; later interrupt is a no-op | `closed` as above | none parked |

Two runtime facts underpin the race rows and are themselves observations of
`effect@4.0.0-rc.112` under bun:

1. `Deferred.doneUnsafe` resumes waiting fibers' continuations **synchronously
   inside the completing step** — visible in S5a where a `ready`-waiter is
   admitted to new work *before* the completing `close` emits its own
   `circuit closed` observe, and in S4ii where completion beats the interrupt.
2. A pending interrupt delivered while a probe is inside an uninterruptible
   region is resolved at the region boundary in favor of interruption when the
   region succeeds (S3a: exit interrupted, `close` skipped) and in favor of the
   failure value when the region fails (S3b: exit `failure{connect}`, `catch`
   continuation skipped), with the circuit mutated by `onExit`→`abandon` in
   both cases rather than by `close`/`trip`.

### Exit tally across the final run

14 `success`, 3 `failure` (S3b connect, S5b3 route, S5c route), 34
`interrupted` (including scenario-end drains, clearly marked after each
`drain` journal entry). Seven opens carry `reason:"probe_interrupted"`.

## Experiment 2 — older ordinary completion in a newer circuit epoch

Setup: caller A decides under `Closed(E0)` and parks holding a permit; a second
caller trips `Open(E1, a0)`; the tripper is removed; time/claiming then places
the circuit in the pre-state listed. A then completes.

| Pre-state when old ordinary A completes | A's completion | Newer-circuit effect | A's caller receives | Waiter effect (journal) |
| --- | --- | --- | --- | --- |
| `Open(ready pending)` (S5a) | success | **unguarded `close(ordinary)` → `Closed(E2)`**; `wake(previous)` completes the pending `ready` **without any clock advance** | success value | `circuit_wait -1`, then admission take and `work-start W` — all before the `closed` observe line; W runs as ordinary |
| `Open(ready done, unclaimed)` (S5a2) | success | same unguarded close → `Closed(E2)` | success value | next caller admitted as ordinary with **no** `circuit_wait` and no `half_open` |
| `HalfOpen` with active probe C and a `changed`-waiter (S5b1/2/3) | success | same unguarded close → `Closed(E2)`; `wake` completes `changed`; **probe C is displaced (staled)** | success value | waiter woke → ordinary admission → `work-start W` |
| `Open(ready pending)` (S5c) | **route failure** | **same unguarded close → `Closed`**; then the failure propagates | failure `{stage:"route"}` | waiter woke and was admitted as ordinary |

Displaced (stale) probe outcomes after A's close, all executed:

| Stale probe C completes with | State effect | Metric effect | C's caller receives | Subsequent behavior (journal) |
| --- | --- | --- | --- | --- |
| success (S5b1) | **none** — `close(Probe)` guard fails (`circuit._tag !== "HalfOpen"`), no epoch bump, no `closed` observe | none | **success `value-of-C`** (its own value is returned) | exits cleanly |
| connect failure (S5b2) | **none** — `trip(Probe)` guard fails, no open, no attempt change | **`connect_failure` observe fires anyway** (it precedes the guard, `acquisition.ts:100`) | does not exit; internal `Retry` | re-decides on `Closed`, re-admitted as **ordinary** with no wait, parks at fresh work (`work-start C#1`) |
| route failure (S5b3) | **none** — `close(Probe)` guard fails | none | failure `{stage:"route"}` propagated | exits |

Stale ordinary connect-failure (S5d): A's `trip(ordinary)` guard fails
(`circuit` is `Open(E1)`, not `Closed(E0)`) → **no state mutation**, but the
`connect_failure` observe fires; A does not exit — it transitions into a
`ready`-waiter (`circuit_wait +1`) like any new caller.

A preserved accidental variant ([`out/raw-output-run1.txt`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output-run1.txt), S5b2 of run 1)
adds one more executable fact: when the stale probe's connect failure leaves
its *own* retry work immediately failing again (no fresh gate), the retry
re-admits as an ordinary candidate against the now-`Closed` circuit and trips
it **at attempt 0** — epoch fencing defers, but does not by itself prevent,
re-opening when the retried work fails again on its own.

## Permit, waiter, and gate counts

- Under `Closed` with `limit=4`, concurrent ordinary admissions are directly
  observed (S0: N and M both admitted and parked; `inFlight` reaches 2).
- A half-open probe is always alone by construction: the first re-decider
  claims `Probe` synchronously in `decide`; later callers get `Wait(changed)`
  (S2: one `circuit_wait +1` for the waiter while the probe parks).
- Waiter accounting is balanced in every scenario: each `circuit_wait +1` is
  paired with `-1` on wake or on interrupt (e.g. the interrupted tripper in
  every scenario's prologue).
- Gate wakes observed: `abandon` wakes `changed`; `close` wakes whichever gate
  the previous state held (`ready` or `changed`) — including a still-pending
  `ready` (S5a), which short-circuits the remaining open delay for all
  waiters; the delay timer itself keeps running but its later
  `doneUnsafe(ready)` is idempotent.

## Exact donor fixed backoff sequence (E13 record)

Source formula ([`acquisition.ts:70`](file:///home/rektide/src/opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/acquisition.ts)):
`delay = min(retryCapMs, retryBaseMs · 2 ** attempt)`. Donor production
constants ([`root.ts:68-69`](file:///home/rektide/src/opencode-watchman-old/packages/core/src/filesystem/watcher/watchman/root.ts)):
`RETRY_BASE_MS = 100`, `RETRY_CAP_MS = 2000` — numerically identical to v4's
provisional "100 ms base and 2 seconds cap, no jitter".

Measured with production constants (S7, wake-boundary method: advance
`candidate−1` → assert no wake → advance 1 → assert wake):

| Attempt after | Sequence position | Measured delay |
| --- | --- | --- |
| ordinary trip (attempt 0) | 1st open | 100 ms |
| probe connect-failure (attempt 1) | 2nd open | 200 ms |
| attempt 2 | 3rd open | 400 ms |
| attempt 3 | 4th open | 800 ms |
| attempt 4 | 5th open | 1600 ms |
| attempt 5 | 6th open | 2000 ms (cap engages: 2^5·100 = 3200 → 2000) |
| attempt 6 | 7th open | 2000 ms |

Attempt dynamics, all executed (S6, base/cap 1000/8000 for wide boundaries,
corroborated by the coordinator's own WARN `delay` fields):

- **Probe connect-failure advances** the attempt: measured 1000 → 2000 → 4000
  → 8000 → 8000 for attempts 0–4.
- **Probe abandonment repeats the same attempt and the same delay**: interrupt
  at attempt 0 → WARN `probe_interrupted, attempt 0, delay 1000`; the next
  probe window measured 1000 again (not 2000); only the subsequent
  connect-failure produced 2000.
- **Ordinary trip after a close resets the attempt to 0**: after a probe
  success closed the circuit, a fresh ordinary connect-failure measured 1000
  with WARN `attempt 0`.
- No jitter exists anywhere in the donor; the whole schedule is
  TestClock-deterministic (this harness ran it entirely on `TestClock.adjust`).

## Source-vs-observation table

| Claim read from donor source | Executable observation | Verdict |
| --- | --- | --- |
| `close` guards probes but not ordinary candidates (`acquisition.ts:86-96`) | S5a/S5a2/S5b1/S5c: older ordinary success and route-failure close newer Open/HalfOpen circuits; stale probe `close` is a no-op | **Confirmed** |
| `trip` observes `connect_failure` before any guard (`acquisition.ts:100`) | S5d and S5b2: stale connect-failures fire the observe without mutating state | **Confirmed** |
| `abandon` reopens with the same attempt for an owning probe (`acquisition.ts:109-114`) | S2/S3a/S3b/S4i/S4iv/S6: WARN `probe_interrupted` with unchanged attempt and repeated delay | **Confirmed** |
| `valid()` fences queued candidates after permit acquisition (`acquisition.ts:126-143`) | S1: queued stale candidate takes and releases the freed permit with no `work-start` | **Confirmed** |
| `open` wakes the previous state's gate (`acquisition.ts:58-69`) | S2: `changed`-waiter woke on abandon; S5a: pending `ready` completed early on close | **Confirmed** |
| Probe decides synchronously, one claimant (`acquisition.ts:116-124`) | S4iv: decide+admit+work-start within one scheduler turn; later callers always waited | **Confirmed** |
| (not stated in source) success value of an interrupted joined probe | S3a: value discarded, exit interrupted, `close` skipped, abandon reopens | **New executable fact** |
| (not stated) failure value of an interrupted joined probe | S3b: exit is the connect failure, `trip` skipped (no metric), abandon reopens | **New executable fact** |
| (not stated) probe can wait on the admission semaphore | Unreachable: opener's freed permit is always available to the first re-decider (counting argument + S1) | **New executable fact** |
| (not stated) close's interaction with a pending open delay | S5a: waiters wake immediately; remaining delay short-circuited | **New executable fact** |
| Backoff `min(cap, base·2^a)`, constants 100/2000 | S6/S7 measured sequences and WARN `delay` fields | **Confirmed exactly** |

## E11 / E13 factual disposition

- **E11**: the executable results agree with E11's donor transition table on
  every row re-tested (queued-candidate fencing, stale connect-failure
  non-mutation, probe-guarded close/trip, abandon semantics, waiter wakes) and
  extend it with the four new facts above. E11's finding that "an older
  already-running ordinary success or non-connect result can close a newer
  open/half-open circuit" is now executable, including its secondary effects
  (early `ready` completion, displaced-probe outcomes, metric-only stale
  connect-failures). What remains outside this experiment: none of this
  selects between the v4 property-6 reading and the linked
  shared-acquisition-spec reading of stale positives — both describe rule
  choices, and this report records behavior only.
- **E13**: the donor's fixed backoff policy is executably
  `min(2000, 100·2^attempt)` ms, no jitter, TestClock-deterministic, with
  attempt advanced only by probe connect-failures, repeated on probe
  abandonment, and reset to 0 by ordinary trips after a close. The donor
  constants equal v4's provisional 100 ms/2 s exactly. Whether to adopt that
  policy is not addressed here.

## Confidence and caveats

| Finding | Confidence | Caveat |
| --- | --- | --- |
| All barrier outcomes in Experiment 1 and 2 | High | Deterministic TestClock runs; byte-identical donor file; single runtime (bun 1.4.1) — scheduler-order facts (synchronous `doneUnsafe` resume, same-step race) are properties of `effect@4.0.0-rc.112` as observed under bun |
| `admit-wait` unreachability for probes | High | Counting argument from the algorithm plus the reachable-configuration run; not a state-space proof |
| `after-decide` unpinnable | Medium | Negative observation at one-turn granularity from a driver fiber |
| Backoff sequence and attempt dynamics | High | Wake-boundary measurement plus the coordinator's own logged `delay`/`attempt` fields; production constants exercised in S7 |
| Stale-probe immediate-retry cascade (run-1 S5b2) | High | Requires the probe's retry work to fail again on its own; preserved in `out/raw-output-run1.txt` |
| Applicability to real transport failures | Medium | Failures are synthetic `WatchmanError`s at chosen stages; the donor's phase-dependent stage assignment (E11 taxonomy) determines which of these paths real socket errors take, and is unchanged by this experiment |

## Cross-references

- [`v2-readd4-e11-acquisition0.gpt56solmax.md`](v2-readd4-e11-acquisition0.gpt56solmax.md) — source-level circuit audit this experiment executes against; its transition table rows are the baseline verified here.
- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — wave validation that assigned N4 and framed both questions.
- [`v2-readd4-e12-lifecycle0.gpt56solmax.md`](v2-readd4-e12-lifecycle0.gpt56solmax.md) — the `work-joined` barrier models the donor command join whose pre-return ownership gaps E4/E12 audit; those transport-level gaps are out of scope here.
- Scratch apparatus: [`harness.ts`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/harness.ts), [`raw-output.txt`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output.txt), [`raw-output-run1.txt`](file:///home/rektide/tmp-opencode/v4-n4-circuit-races/out/raw-output-run1.txt).
