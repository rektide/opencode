---
type: EvidenceAudit
title: E11 shared Watchman acquisition circuit audit
description: Primary-source audit of circuit transitions, cancellation, failure classification, transport topology, daemon isolation, and observed root cardinality.
resource: /.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md
tags: [opencode, watchman, acquisition, concurrency, topology, evidence]
status: draft
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: v4, resource: "file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md" }
  - { id: donor, resource: "/packages/core/src/filesystem/watcher/watchman/acquisition.ts" }
  - { id: transport, resource: "file:///home/rektide/src/watchman-esm/watchman/node/index.js" }
  - { id: watchman, resource: "https://github.com/facebook/watchman" }
  - { id: watchwoman, resource: "https://github.com/rektide/watchwoman" }
---

# E11 shared Watchman acquisition circuit audit

## One-sentence proof status

Primary sources establish a bounded, single-probe donor circuit and one-socket-per-raw-`Client` transport, but they also show that v4 overstates epoch fencing, that the donor's phase-labelled errors cannot classify transport availability consistently, that both daemons share watched roots beyond individual client sessions, and that exact-root demand can be in the tens, leaving circuit necessity and the topology choice unresolved.

## Scope and evidence labels

This is a bounded evidence audit, not an architecture selection. It does not
choose per-root or multiplexed clients, propose a replacement circuit, or assess
the adjacent controller design except where it determines E11 behavior.

- **Implemented** means the donor source does this now.
- **Proposed** means v4 or its linked acquisition specification requires it.
- **Established** means primary source fixes the fact independently of either
  design.
- **Unresolved** means the inspected material cannot support the claim.

## Pinned revisions

| Material | Revision inspected | Caveat |
| --- | --- | --- |
| v4 E11 design | working commit `e77301b4418895e27c1baf23a95dcda4a5e2f472`; file SHA-256 `8db319048c3dcee0c84b364266112981a6d4f4c12124b80d0ab195c21eb43c6c` | The v4 file is uncommitted in that workspace. |
| OpenCode carrier and planners | [`4306c07b340b9a0504e65785f366d2793cd1b169`](https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169), `origin/v2` | Required carrier pin, not the checkout's later `HEAD`. |
| Donor code/tests | tree at parent `cb7cba92e23d496d83390f388ce3afb22cf49c10` | Working-copy changes were documentation-only before this report. Source hashes: `acquisition.ts` `8ad4a5c0…`, `client.ts` `9563a97b…`, `root.ts` `8d0e104f…`, root test `3284a617…`. |
| JS transport fork | content commit `3a463955acf6843301ceae387f7a1a0f187e4a65` (empty working commit `8ed9bbf44fec…`) | Package is `@superbfowle/fb-watchman-esm@3.0.0`; `index.js` SHA-256 `4221933d…`. |
| Stock Watchman | [`923b0935155590be54c0fc052fdca0201f8ebc4b`](https://github.com/facebook/watchman/commit/923b0935155590be54c0fc052fdca0201f8ebc4b) | Detached local checkout, described as `v2026.08.31.00-2-g923b09351`. |
| Watchwoman | [`a1e16cbf35b6bb1e4b429af53d65e738f955c32b`](https://github.com/rektide/watchwoman/commit/a1e16cbf35b6bb1e4b429af53d65e738f955c32b) | Source target supplied for this audit; no evidence says this exact revision is the deployed binary. |
| Effect | [`effect@4.0.0-rc.112`](https://github.com/Effect-TS/effect/tree/effect%404.0.0-rc.112), commit `2600f62f4532026928454dcea8d1c48557b3f942` | This is OpenCode `4306c07b`'s catalog pin. The local Effect worktree itself is on a different revision, so all cited Effect source was read at the tag. |
| Local lifecycle evidence | `/home/rektide/.local/share/opencode/log/{opencode.log,opencode-local.log}`, runs `d757966f` and `520dfd4a`, plus a 27-run exact-intent cohort | Append-only local evidence with build identifiers, not commit IDs; paths were counted but are not reproduced here. |

## Circuit boundary actually implemented

The donor creates one coordinator inside each `makeRegistry`, passes it to every
`RcMap` root connection, and admits `create`, which comprises factory invocation,
capability negotiation, and `watch` route resolution
([`root.ts:71-85`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L71-L85),
[`root.ts:159-197`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L159-L197),
[`root.ts:299-317`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L299-L317)).
It does **not** admit `clock`, `subscribe`, steady-state PDU handling, or
`unsubscribe`.

The coordinator is registry-local, not a static cross-process singleton. The
carrier marks `Watcher` as a global graph node and compiles global-tagged nodes
through the shared memo map, so one normal OpenCode runtime shares its physical
watch `RcMap`; independently built runtimes and separate processes do not share
the coordinator
([carrier `watcher.ts:84-151`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L84-L151),
[`layer-node.ts:225-318`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/util/src/effect/layer-node.ts#L225-L318)).

### Proposed transition contract (v4 plus its linked acquisition specification)

`E` is the circuit epoch and `a` is the shared retry index. Completing an
open-state delay only marks its `ready` gate done; a caller must still claim the
probe.

| State before | Input | Proposed state/result |
| --- | --- | --- |
| `Closed(E)` | Caller snapshots admission and later obtains a permit while still current | Run the complete acquisition, remaining `Closed(E)` during the work. |
| `Closed(E)` | Current ordinary acquisition returns connection-class failure | `Open(E+1, 0, ready)`; wait `min(cap, base × 2^0)`. |
| `Closed(E)` | Acquisition succeeds or returns a root-local result | Remain closed; return success or propagate the local failure. |
| `Open(E,a,ready=pending)` | Caller arrives | Wait interruptibly on `ready`; do not consume a permit. |
| `Open(E,a,ready=pending)` | Delay expires | Remain `Open(E,a,ready=done)`; no acquisition starts by timer action alone. |
| `Open(E,a,ready=done)` | First caller reevaluates | Atomically become `HalfOpen(E+1,a,changed)` and make that caller the sole probe. |
| `HalfOpen(E,a,changed)` | Another caller arrives | Wait interruptibly on `changed`. |
| `HalfOpen(E,a,changed)` | Owning probe succeeds | `Closed(E+1)` and wake waiters, which still require permits. |
| `HalfOpen(E,a,changed)` | Owning probe returns a non-connection/root-local failure | `Closed(E+1)`, wake waiters, then propagate the failure locally. |
| `HalfOpen(E,a,changed)` | Owning probe returns connection-class failure | `Open(E+1,a+1,ready)`; use the next capped delay. |
| `HalfOpen(E,a,changed)` | Owning probe is interrupted before another transition | `Open(E+1,a,ready)`; repeat the same delay index rather than reporting success. |
| Any state | Candidate is stale before admitted work starts | Do not run its work; reevaluate from current state. |
| `Open` or `HalfOpen` | Older ordinary acquisition, already running from `Closed`, finishes | **Proposal conflict:** the linked specification says a success or non-connect result is current positive availability evidence and may close the circuit; v4 property 6 says stale admitted results cannot mutate a newer epoch. |

The last row means there is no single exact proposed transition table yet.
[`shared-acquisition-spec0:125-146`](../shared-acquisition-spec0.gpt56solxh.md#L125-L146)
explicitly permits an already-admitted positive result to close a later open
state and fences only stale failures, while
[`v2-readd4:537-549`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L537-L549)
uses the broader phrase "stale admitted results cannot mutate a newer circuit
epoch." This audit does not select either meaning.

### Exact donor transition table

The following follows the mutable state and guards in
[`acquisition.ts:51-168`](../../../packages/core/src/filesystem/watcher/watchman/acquisition.ts#L51-L168).

| Current state / candidate | Event | Implemented result |
| --- | --- | --- |
| `Closed(E)` / none | `decide` | Return `Closed(E)` candidate; state unchanged. |
| `Open(E,a,ready=pending)` / none | `decide` | Return `Wait(ready)`; state unchanged. |
| `Open(E,a,ready=done)` / none | `decide` | Set `HalfOpen(E+1,a,changed)` and return matching `Probe`. The synchronous decision contains no yield, so only one caller can claim it. |
| `HalfOpen(E,a,changed)` / none | `decide` | Return `Wait(changed)`. |
| Any / ordinary or probe candidate | Permit obtained | Run work only if `valid(candidate)` still matches tag and epoch; otherwise return internal `Retry` and reevaluate. |
| `Closed(E)` / matching ordinary candidate | `stage === "connect"` failure | `Open(E+1,0,ready)`; wake prior gate if any; internal `Retry`. |
| Newer state / stale ordinary candidate | `stage === "connect"` failure | State unchanged because tag/epoch guard fails; connect-failure observation still increments; internal `Retry`. |
| `HalfOpen(E,a)` / matching probe | `stage === "connect"` failure | `Open(E+1,a+1,ready)`; wake `changed`; internal `Retry`; probe finalizer then no-ops. |
| Newer state / stale probe | Connection failure | State unchanged; internal `Retry`; finalizer no-ops. |
| `HalfOpen(E,a)` / matching probe | Success | `Closed(E+1)`; wake `changed`; return value; finalizer no-ops. |
| `HalfOpen(E,a)` / matching probe | Typed non-connect failure | `Closed(E+1)`; wake `changed`; propagate failure; finalizer no-ops. |
| `HalfOpen(E,a)` / matching probe | Interruption, defect, or any exit before `trip`/`close` owns a transition | `onExit` calls `abandon`, producing `Open(E+1,a,ready)` and waking `changed`. |
| `Open` or `HalfOpen` / older **ordinary** candidate that began validly | Success | `close(ordinary)` has no ordinary-candidate epoch guard: set `Closed(current epoch+1)`, wake the current gate, return value. |
| `Open` or `HalfOpen` / older **ordinary** candidate that began validly | Typed non-connect failure | The same unguarded close to `Closed`, then propagate the local failure. |
| Any newer `Closed` / older ordinary completion | Success or non-connect failure | `close` sees `Closed` and does not change its epoch; return/propagate normally. |
| Open delay fiber / delay expiry | Timer completes `ready` | No state mutation; blocked callers wake and rerun `decide`. |

Thus the implementation has two distinct stale rules:

1. **Queued candidates and all stale connection failures are epoch-fenced.**
   A candidate is revalidated only after obtaining a semaphore permit
   ([`acquisition.ts:126-151`](../../../packages/core/src/filesystem/watcher/watchman/acquisition.ts#L126-L151)).
2. **Already-running ordinary positive/non-connect results are deliberately not
   epoch-fenced against a non-closed current state.** `close` guards probes but
   not ordinary candidates
   ([`acquisition.ts:86-96`](../../../packages/core/src/filesystem/watcher/watchman/acquisition.ts#L86-L96)).

The donor test source covers the aggregate bound, one probe schedule, capability
connection loss, bounded waiter release, root-local watch/decode failures,
admission-wait cancellation, and cancellation while still open
([`watchman-root.test.ts:184-513`](../../../packages/core/test/filesystem/watchman-root.test.ts#L184-L513)).
It has no case that interrupts an **active half-open probe**, and no adversarial
case for an older ordinary result completing in a later epoch. The metrics test
observes the ordinary open/half-open/closed path only
([`watchman-metrics.test.ts:162-225`](../../../packages/core/test/filesystem/watchman-metrics.test.ts#L162-L225)).

## Stale admission and probe interruption audit

### What Effect rc.112 establishes

- Semaphore waiting is interruptible, unregisters the waiter on interruption,
  and releases an acquired permit on every exit
  ([`Semaphore.ts:207-223`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Semaphore.ts#L207-L223),
  [`Semaphore.ts:287-306`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Semaphore.ts#L287-L306)).
- `Deferred.await` unregisters an interrupted resume callback
  ([`Deferred.ts:173-186`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/Deferred.ts#L173-L186)).
- `onExit` runs for interruption as well as success/failure, with its finalizer
  protected by the runtime's exit handling
  ([`internal/effect.ts:4002-4040`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/internal/effect.ts#L4002-L4040),
  [`Effect.test.ts:2244-2257`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/test/Effect.test.ts#L2244-L2257)).
- The open timer is forked into the registry scope; closing an already-closed
  scope immediately interrupts a newly forked fiber
  ([`internal/effect.ts:5337-5378`](https://github.com/Effect-TS/effect/blob/effect%404.0.0-rc.112/packages/effect/src/internal/effect.ts#L5337-L5378)).

These facts support removal of circuit/admission waiters and eventual reopening
when a probe exits while it still owns `HalfOpen`.

### Limits of that conclusion

1. Once a generation command is submitted, the donor deliberately joins it
   inside `Effect.uninterruptible`; caller interruption is deferred until the
   response, generation close, or timeout
   ([`client.ts:102-149`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L102-L149)).
   An interrupted active probe therefore need not reopen or release its shared
   permit immediately.
2. Raw `Client.end()` cancels queued/current callbacks and closes an existing
   socket, but it does not kill an already-spawned `get-sockname` child and has
   no permanent-ended latch. That child can later call `makeSock` and attempt a
   connection
   ([transport `index.js:175-273`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L175-L273),
   [`index.js:353-361`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L353-L361)).
   The donor's late-`connect` listener immediately ends a socket belonging to a
   closed generation, but it does not prevent the attempt
   ([`root.ts:169-180`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L169-L180)).
3. The donor's "cancel while circuit open" test interrupts the only demand
   before a half-open probe exists; it proves that an elapsed timer alone does
   not manufacture acquisition, not active-probe behavior
   ([`watchman-root.test.ts:490-513`](../../../packages/core/test/filesystem/watchman-root.test.ts#L490-L513)).

Accordingly, **coordinator-level probe ownership and waiter cancellation are
source-supported**, while immediate cancellation after transport submission and
"no later socket attempt" are not established.

## Source-grounded failure taxonomy

The transport reports daemon `{ error: ... }` response PDUs and transport
failures through the same callback/EventEmitter-shaped surface. The donor then
assigns a stage based mostly on which protocol operation was running, not on the
underlying failure kind.

| Failure boundary | Raw behavior | Donor type/stage | Shared-circuit effect now | Audit finding |
| --- | --- | --- | --- | --- |
| Transport module import or export/shape validation | Dynamic import or validation fails before a registry exists. | `WatchmanError("connect", …)` | **None:** `loadFactory` runs in backend construction outside `acquisition.acquire`. | It is named `connect` but is a startup/construction failure, not an implemented circuit transition ([`client.ts:38-55`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L38-L55), [`backend.ts:7-15`](../../../packages/core/src/filesystem/watcher/watchman/backend.ts#L7-L15)). |
| Raw client constructor/factory throws | `Client` construction itself only initializes fields; the donor wraps any factory throw inside admitted `create`. | `stage: "connect"` | Opens/reopens when the candidate is current. | This is the unambiguous construction case admitted by the circuit ([`root.ts:159-167`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L159-L167); transport [`index.js:54-70`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L54-L70)). |
| CLI discovery, socket connect, parser, or socket error while capability is pending | Transport emits `error`; several paths do not themselves settle the command callback. Donor `error` listener closes the generation and `end()` synthesizes callback errors. | Capability wrapper maps callback error, timeout, and `GenerationClosed` to `stage: "connect"`. | Opens/reopens. | Availability classification works in this phase, but depends on donor listeners ([transport `index.js:148-171`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L148-L171), [`index.js:193-271`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L193-L271), donor [`client.ts:85-99`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L85-L99)). |
| Capability callback rejection by a reachable daemon | Daemon error PDU becomes transport `WatchmanError`; unsupported required capabilities can also be synthesized as callback errors. | `stage: "connect"` regardless of reachability. | Opens/reopens. | A protocol incompatibility/rejection is currently indistinguishable from connection outage for the circuit. The raw error may carry `watchmanResponse`, but donor policy does not inspect it ([transport `index.js:131-143`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L131-L143), [`index.js:318-350`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L318-L350)). |
| Capability response decode | Callback succeeds with malformed value. | `stage: "decode"` | Never opens; a half-open probe closes the circuit, then donor latches the root fatal. | Root-local under the circuit, structurally fatal in current donor ([`client.ts:134-138`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L134-L138), [`root.ts:304-315`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L304-L315)). |
| `watch` daemon rejection/policy failure | Reachable daemon returns `{error}` through callback. | `stage: "route"` | Never opens; a half-open probe closes, then root retry policy handles it. | Correctly remains root-local under current stage rule ([`route.ts:19-23`](../../../packages/core/src/filesystem/watcher/watchman/route.ts#L19-L23)). |
| Socket failure or command timeout while `watch` is pending | `end` cancels callbacks before emitting `end`; `error` plus donor close also cancels. Timeout closes generation. | Callback path is `"route"`; closed-fence path is `GenerationClosed` / `"reconnect"`; timeout is `"route"`. | Does **not** open; if it was the probe it closes the circuit as a non-connect result. | The same underlying socket outage is circuit-global during capability and root-local during `watch`; failure classification is phase-dependent. |
| `watch` response decode | Successful callback with malformed response. | `stage: "decode"` | Does not open; current donor fatal-latches that root. | Root-local, not availability evidence. |
| `clock` or `subscribe` callback rejection, generation closure, or timeout | Same raw callback/socket mechanisms, after acquisition has returned. | `"subscribe"`, `"reconnect"`, or `"decode"`. | Outside coordinator; no mutation. | Root/subscription-local regardless of whether the underlying cause was socket-wide ([`root.ts:199-272`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L199-L272)). |
| Matching subscription `canceled: true` PDU | Unilateral protocol event, not socket cancellation. | Decoded `SubscriptionCanceled`; no `WatchmanError` unless malformed. | Outside coordinator. | Donor reattaches that subscription on the existing root generation; v4 separately proposes retiring/replacing its generation. Neither path directly trips acquisition ([`root.ts:375-386`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L375-L386)). |
| Subscription PDU decode | Malformed unilateral object. | `stage: "decode"` | Outside coordinator. | Donor fails that subscription loop; it supplies no shared-availability evidence ([`root.ts:375-377`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L375-L377), [`root.ts:399-435`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L399-L435)). |
| Effect interruption | Runtime interruption cause, not callback `Error`. | Not a `WatchmanError`; typed `catch` branch is not selected. | Ordinary candidate does not trip; owning probe's `onExit` reopens if ownership still matches. | Must be kept distinct from raw `Client.end()` callback cancellation, which is retyped according to protocol stage. |

The taxonomy therefore does **not** establish the v4 phrase "connection-class
failure" as an implementable current predicate. The available signals establish
at least four distinct axes—construction, socket/discovery, daemon rejection,
and protocol phase—but the donor circuit sees only `WatchmanError.stage`.
Moreover, `Generation.closed` carries `void`: an EventEmitter listener may log
the original socket cause, but when the closed-fence side wins the command race,
the coordinator receives only a generic `GenerationClosed`, not the errno or
transport event that caused it
([`client.ts:23-31`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L23-L31),
[`client.ts:112-149`](../../../packages/core/src/filesystem/watcher/watchman/client.ts#L112-L149),
[`root.ts:134-180`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L134-L180)).

## Actual client-to-socket topology

The transport source is unambiguous:

1. Each `new Client()` owns its own `commands`, `currentCommand`, `bunser`, and
   single `socket` fields
   ([`index.js:54-70`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L54-L70)).
2. The first queued command either uses `WATCHMAN_SOCK` or starts that client's
   own `watchman --no-pretty get-sockname` child, then calls
   `net.createConnection(sockname)` for that client
   ([`index.js:114-187`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L114-L187),
   [`index.js:219-272`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L219-L272)).
3. One client permits exactly one command response in flight: `currentCommand`
   blocks dispatch of the next FIFO queue item until a non-unilateral response
   arrives
   ([`index.js:72-93`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L72-L93),
   [`index.js:119-147`](file:///home/rektide/src/watchman-esm/watchman/node/index.js#L119-L147)).
4. The transport has no pool or root binding. One client can issue commands and
   receive named subscriptions for several roots; root topology is imposed by
   its caller, not by `Client`.

A direct diff against stock Watchman's `watchman/node/index.js` at the pinned
revision changes module/dependency syntax and the export shape, not these
socket, queue, discovery, or error mechanics.

The **current donor is not one-client-per-exact-target in every case**. Its
backend maps project-placed targets to one project `RootIntent`, and its root
`RcMap` creates one client generation per intent; the test shows two nested
project interests sharing one raw client
([`backend.ts:16-24`](../../../packages/core/src/filesystem/watcher/watchman/backend.ts#L16-L24),
[`root.ts:83-85`](../../../packages/core/src/filesystem/watcher/watchman/root.ts#L83-L85),
[`watchman-root.test.ts:77-99`](../../../packages/core/test/filesystem/watchman-root.test.ts#L77-L99)).
The v4 exact-root topology removes that donor project placement, so donor live
project-intent counts cannot be treated as direct proof of v4 socket counts.
The exact-intent `d757966f` observation below does establish its donor count,
but remains evidence from a different implementation.

## Daemon sharing and isolation boundaries

### Stock Watchman

- Every accepted Unix connection becomes a distinct `UserClient`, and each
  `UserClient` owns a detached server thread
  ([`listener.cpp:329-379`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/listener.cpp#L329-L379),
  [`Client.cpp:236-260`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/Client.cpp#L236-L260)).
- Watched roots are daemon-global and keyed by canonical path. Concurrent
  first-watch callers may both construct candidates, but insertion is protected
  by the map write lock; the loser adopts the existing root, and only the
  `created` winner starts root threads
  ([`resolve.cpp:181-211`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/root/resolve.cpp#L181-L211),
  [`resolve.cpp:237-293`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/root/resolve.cpp#L237-L293)).
- Repeating `watch` for an established path waits on and returns that same root;
  it does not create a watcher per client
  ([`watch.cpp:280-309`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/cmds/watch.cpp#L280-L309)).
- Subscription names and subscription ownership are per `UserClient`/socket;
  disconnect clears that client's subscriptions only
  ([`Client.h:197-227`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/Client.h#L197-L227),
  [`Client.cpp:255-262`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/Client.cpp#L255-L262)).
- Root cancellation is daemon-root-wide and is fanned out as `canceled: true`
  to every matching client subscription
  ([`threading.cpp:51-75`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/root/threading.cpp#L51-L75),
  [`Client.cpp:387-464`](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/Client.cpp#L387-L464)).

### Watchwoman

- One process serves all roots. Each accepted Unix connection gets its own
  reader/session and writer task; commands are serial on one connection because
  the read loop awaits dispatch before reading the next PDU, while different
  connection tasks can dispatch concurrently
  ([`server.rs:63-82`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/server.rs#L63-L82),
  [`server.rs:106-157`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/server.rs#L106-L157)).
  No explicit connection cap or global dispatch semaphore appears in this
  revision's accept/dispatch path.
- Roots are daemon-global in a `DashMap<PathBuf, Arc<Root>>`; an established
  same-path watch returns the existing root
  ([`state.rs:49-76`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/state.rs#L49-L76),
  [`state.rs:119-127`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/state.rs#L119-L127)).
- Concurrent same-path first watches are **not** single-flighted: the
  get/metadata/initial-scan/insert sequence is non-atomic, so multiple callers
  can scan, insert, and start transient root watchers before displaced `Arc`s
  drop. There is a second same-root window because insertion precedes
  `watcher::spawn`: a follower can find the inserted root and acknowledge
  `watch` while the first caller is still waiting for kernel registration.
  These are source inferences from
  [`state.rs:121-170`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/state.rs#L121-L170)
  and the weak-reference watcher lifecycle in
  [`watcher.rs:21-112`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/watcher.rs#L21-L112)
  plus the immediate command return in
  [`watch.rs:10-21`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/commands/watch.rs#L10-L21).
- Push loops are session-specific, but subscription bookkeeping is root-global
  and keyed only by subscription name. Equal names from separate clients can
  overwrite that bookkeeping, and either loop can later remove the shared key;
  no current multi-client same-name test was found
  ([`subscribe.rs:26-66`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/commands/subscribe.rs#L26-L66),
  [`root.rs:370-384`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/root.rs#L370-L384)).
- Removing a root removes the global map entry and eventually closes its tick
  channel; unlike stock source, no `canceled` PDU path exists in the inspected
  Watchwoman root removal/subscription code
  ([`state.rs:173-185`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/state.rs#L173-L185),
  [`subscribe.rs:98-159`](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/commands/subscribe.rs#L98-L159)).

For both daemons, separate raw clients isolate a client socket/session and its
command queue, **not** the daemon process, canonical root object, filesystem
watch, or global resource pressure. A daemon exit affects every client; a stock
root cancellation affects every subscriber to that root; Watchwoman's current
root removal is likewise global but does not send stock's cancellation signal.

## Measured root cardinality and exact evidence gap

The carrier logs `watcher started` only when its physical `RcMap` lookup has
acquired a native watch, not for every logical subscriber
([carrier `watcher.ts:93-126`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L93-L126)).
That makes lifecycle logs usable as physical exact-target counts, subject to
build and attribution caveats.

| Existing read-only log observation | Measured result | What it establishes |
| --- | --- | --- |
| Run `d757966f`, local build `0.0.0-local-202609021552`, `serve --service`, 2026-09-04 | Five distinct Location services booted; 13 unique `intent.type=exact`, generation-1 root connections and 13 recursive `backend=watchman` physical watches reached a simultaneous high-water of 13; all 13 later stopped. Root records: [`opencode-local.log:18309081-18309411`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L18309081-L18309411); lifecycle window: [`18308975-18309415`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L18308975-L18309415), teardown [`18396950-18396975`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L18396950-L18396975). | This run directly observed 13 simultaneously attached exact donor generations. Given one raw `Client` per donor root generation and one socket per connected `Client`, it establishes a 13-client/13-socket high-water for this run, not merely 13 logical subscribers. |
| Run `520dfd4a`, local build `0.0.0-local-202609050913`, shared server, audit snapshot 2026-09-05 | 34 distinct Location services booted; 34 unique physical recursive directory watches had started, with no directory stop yet and no duplicate path. Startup begins at [`opencode-local.log:21972210`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L21972210); first roots at [`21972370-21972372`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L21972370-L21972372); last counted start at [`21974819`](file:///home/rektide/.local/share/opencode/log/opencode-local.log#L21974819). | The current planner family can maintain at least 34 simultaneous exact recursive targets in one process. Under v4's stated one-client-per-exact-root mapping, 34 distinct attached targets would mean 34 raw clients/sockets, before considering reconnect overlap. This run used inotify, so it is a topology counterfactual rather than a Watchman transport measurement. |

As a broader same-host check, deduplicating `(run, intent.target)` across all
available `watchman root connected` records with `intent.type=exact` found 27
server run IDs from 2026-08-31 through 2026-09-04: 25 runs had 13
lifetime-distinct exact targets, one had 15, and one short/truncated run had 1.
This cohort shows that the 13-root result was repeatable under that host's
configuration, but it is not 27 independent user populations, and a
lifetime-distinct count is not a concurrency high-water unless paired with the
start/stop trace as in `d757966f`.

The count shape is also source-supported rather than accidental: Config plans
one recursive watch for the global config directory plus every present project
`.opencode` ancestor
([`config/watch.ts:8-38`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/config/watch.ts#L8-L38));
Skill watches each resolved directory source and may add out-of-root real
directories
([`config/plugin/skill.ts:36-75`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/config/plugin/skill.ts#L36-L75),
[`skill.ts:77-131`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/config/plugin/skill.ts#L77-L131));
and configured plugin directories outside config roots add long-lived watches
([`config/plugin/source.ts:45-70`](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/config/plugin/source.ts#L45-L70)).

What remains unavailable is equally specific:

- lifecycle records have run and HTTP-span IDs but no Session ID or owning
  Location on each watcher line, while roots are globally shared;
- local build identifiers do not map to a recorded source commit in the log;
- no record pairs logical targets with canonical roots, so symlink overlap is
  unmeasured;
- no current run records v4 raw-client/socket count because v4 is not
  implemented; the exact-intent donor run proves the mapping at 13, but donor
  project placement can change it in other runs and the 34-root run used
  inotify; and
- no CPU, crawl latency, descriptor pressure, connection rejection, or daemon
  saturation measurement accompanies these counts.

Therefore **"order of tens per busy service process" is observed**, but a
representative **per-session** distribution and the operational acceptability of
that socket count remain evidence gaps.

## Per-root and multiplexed factual consequences

This table states consequences of the inspected sources only; it expresses no
preference.

| Dimension | One raw client per exact root | One process client multiplexing roots |
| --- | --- | --- |
| Raw connection count | `N` attached exact-root generations imply approximately `N` Unix sockets; without `WATCHMAN_SOCK`, cold generations can each run their own `get-sockname` child. | One live generation implies one socket and at most one discovery child. |
| Client command concurrency | Each client's FIFO permits one command, so different roots can have commands in flight concurrently, bounded during acquisition by the shared semaphore. | The transport's single `currentCommand` serializes commands for all roots; a slow response is client-wide head-of-line blocking. |
| Daemon watched-root count | Stable same-canonical-path calls share the daemon root; client count does not multiply steady-state root watchers. Distinct exact roots still produce distinct daemon roots. | The same: command transport consolidation does not consolidate distinct daemon roots. |
| Daemon connection work | Stock creates one `UserClient` thread per socket; Watchwoman creates per-connection reader/writer tasks. | One such server-side client/session for this OpenCode process. |
| Socket failure boundary | Loss retires the owning root generation; other root sockets can continue. Daemon-process and shared-root failures remain broader. | Loss retires every subscription and pending command carried by that socket. |
| Command timeout boundary | A submitted timeout closes that root's client generation. | Closing the shared generation affects unrelated roots carried by it. |
| Subscription namespace | Stock names are isolated per socket. Watchwoman's current root-global name map weakens that isolation for equal names on the same daemon root. | Stock's one `UserClient` map is keyed only by name, so names must be unique across all roots on that socket. Watchwoman keys bookkeeping by `(root, name)` in effect, so equal names on different roots do not collide but equal names on one root still do. |
| Disconnect cleanup | Stock clears subscriptions on that one `UserClient`. Watchwoman push loops are session-bound but exit only after observing tick-channel closure, `session.is_closed()`, or a failed send; immediate idle-disconnect cleanup is not tested. | Every process subscription is tied to the one shared session, with the same daemon-specific cleanup semantics. |
| Root watch isolation | Neither topology isolates an exact path from the daemon-global canonical root, external `watch-del`, daemon recrawl/cancellation, or daemon exit. | Same. |
| Cross-process pressure | Every OpenCode process has its own clients, permits, circuit state, and probe; limits multiply across processes. | Connection count is one per process, but circuit/session state remains process-local and daemon roots remain shared. |
| Current donor evidence | The acquisition circuit was implemented and tested around per-`RootIntent` generation creation, including project-intent sharing. | Not implemented or tested by the donor; transport and daemon protocol can carry multiple roots, but orchestration behavior is unproven. |

## Confidence, caveats, and unresolved assumptions

| Finding | Confidence | Caveat |
| --- | --- | --- |
| Donor transition table and partial stale fencing | High | Direct code reading; active-probe/stale-positive tests absent. |
| Interruptible waits, permit cleanup, and `onExit` abandonment | High at Effect primitive level; medium for full composition | Submitted command regions deliberately defer interruption; focused donor tests could not be rerun because this checkout has no installed `effect` package. `bun test test/filesystem/watchman-root.test.ts` stopped at module resolution before executing tests. |
| One socket and FIFO queue per raw `Client` | High | Direct transport source. Late discovery after `end()` remains possible until donor's connect fence closes it. |
| Stock same-root sharing and per-client subscriptions | High | Direct daemon source; no live transcript was needed for these ownership facts. |
| Watchwoman same-root sharing, non-atomic cold registration, and root-global name bookkeeping | High for code shape; medium for operational consequence | No concurrent-same-root or cross-client-same-name test was found; deployed revision is unknown. |
| Root cardinality | High for the two counted process runs and exact-intent cohort; low for per-session inference | Logs omit ownership and source commit, the cohort is one host/configuration family, and the 34-root measurement used inotify. |
| Shared circuit necessity | Unresolved | Root counts and potential concurrency are established, but no pressure threshold, outage storm transcript, daemon saturation result, or acceptable connection budget is supplied. |
| Exact connection-class predicate | Unresolved | Current stage labels conflate reachable capability rejection with outage and treat socket loss differently during capability versus `watch`. |

## E11 paragraph pointers only

- **v4 Acquisition and availability, lines 518-566:** confirms registry-wide
  bounded admission, one deferred-gated probe, and process-local scope; changes
  the assurance on strict stale-result fencing to **contradicted by donor
  ordinary-result behavior**; leaves topology necessity and failure
  classification unresolved.
- **v4 invariants 16-18, lines 671-674:** invariant 16 is directly implemented;
  invariant 18 is established only for queued candidates, probes, and stale
  connection failures, not every already-running ordinary result; invariant 17
  lacks a source-realizable current predicate.
- **v4 E11 row, line 690:** the requested comparison now has source facts and
  process-level counts, but still lacks representative per-session attribution,
  an exact deployed Watchwoman pin, and resource/saturation measurements.
- **v4 provisional list, lines 808-810:** both exact error-to-circuit
  classification and per-root topology remain factually open; this audit makes
  no selection.
- **v4 Acquisition verification row, line 740:** existing donor tests cover the
  ordinary transition path and admission cancellation but omit active-probe
  interruption and stale ordinary completion into a newer epoch.
