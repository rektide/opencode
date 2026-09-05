---
type: Design
title: Watchman v2 re-add first architecture draft (GX, round 5)
description: Independent complete architecture for an opt-in Watchwoman-backed recursive directory watcher on OpenCode v2 — owned wire transport, epoch-fenced acquisition, mailbox-serialized controllers, logical-namespace type-agnostic events including directory rows, and explicit platform, option, owner, and verification boundaries.
resource: /.design/watchman/v2-readd/v2-readd5-draft0.glm53max.md
tags: [opencode, watchman, watchwoman, v2, architecture, draft, gx]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: validation3, resource: /.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md, title: Final research validation and design challenge brief, author: model:openai/gpt-5.6-sol-xhigh, last_modified: 2026-09-05 }
  - { id: validation0, resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md, title: Wave-one evidence validation }
  - { id: validation1, resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md, title: Wave-two daemon/transport validation }
  - { id: validation2, resource: /.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md, title: Wave-three path/owner/release validation }
  - { id: v4, resource: file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md, title: Historical evidence-brief candidate, author: model:openai/gpt-5.6-sol-xhigh }
  - { id: v4-dirty, resource: file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4-dirty.gpt56solxh.md, title: Historical fully-decided candidate, author: model:openai/gpt-5.6-sol-xhigh }
  - { id: e01, resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md, title: E01 daemon target identity }
  - { id: e02, resource: /.design/watchman/v2-readd/v2-readd4-e02-watch-roots0.glm53max.md, title: E02 plain-watch root semantics }
  - { id: e03, resource: /.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md, title: E03 protocol ordering }
  - { id: e03-stock, resource: /.design/watchman/v2-readd/v2-readd4-e03-stock-live0.glm53max.md, title: E03 stock live baseline }
  - { id: e04, resource: /.design/watchman/v2-readd/v2-readd4-e04-interleavings0.gpt56solmax.md, title: E04 interleaving audit }
  - { id: e05, resource: /.design/watchman/v2-readd/v2-readd4-e05-native-failure0.glm53max.md, title: E05 Native failure semantics }
  - { id: e06, resource: /.design/watchman/v2-readd/v2-readd4-e06-expression0.glm53max.md, title: E06 expression semantics }
  - { id: e07, resource: /.design/watchman/v2-readd/v2-readd4-e07-transport-conformance0.glm53max.md, title: E07 transport conformance and actor fidelity }
  - { id: e08, resource: /.design/watchman/v2-readd/v2-readd4-e08-ignore-parity0.glm53max.md, title: E08 Parcel ignore parity }
  - { id: e09-rows, resource: /.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md, title: E09 row shapes }
  - { id: e09-create, resource: /.design/watchman/v2-readd/v2-readd4-e09-create-evidence0.glm53max.md, title: E09 create-vs-update evidence }
  - { id: e10, resource: /.design/watchman/v2-readd/v2-readd4-e10-symlink-sentinel0.glm53max.md, title: E10 symlink sentinel topology }
  - { id: e11, resource: /.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md, title: E11 acquisition circuit audit }
  - { id: e11-races, resource: /.design/watchman/v2-readd/v2-readd4-e11-circuit-races0.glm53max.md, title: E11 circuit race experiments }
  - { id: e11-pressure, resource: /.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md, title: E11/E20 Watchwoman pressure }
  - { id: e12, resource: /.design/watchman/v2-readd/v2-readd4-e12-lifecycle0.gpt56solmax.md, title: E12 lifecycle proof attempt }
  - { id: e12-transport, resource: /.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md, title: E12 raw transport lifecycle }
  - { id: e12-release, resource: /.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md, title: E12 daemon-side session release }
  - { id: e14, resource: /.design/watchman/v2-readd/v2-readd4-e14-skill-lifecycle0.glm53max.md, title: E14 Skill latch lifecycle }
  - { id: e16, resource: /.design/watchman/v2-readd/v2-readd4-e16-safe-loss0.gpt56solxh.md, title: E16 safe connection-loss apparatus }
  - { id: e17, resource: /.design/watchman/v2-readd/v2-readd4-e17-platform0.gpt56solxh.md, title: E17 platform and exact Bun 1.4.2 evidence }
  - { id: e18, resource: /.design/watchman/v2-readd/v2-readd4-e18-server-options0.gpt56solxh.md, title: E18 server-option and generated-client trace }
  - { id: e19, resource: /.design/watchman/v2-readd/v2-readd4-e19-carrier-audit0.gpt56solxh.md, title: E19 carrier disposition audit }
  - { id: o5, resource: /.design/watchman/v2-readd/v2-readd4-owner-directory-signal0.gpt56solxh.md, title: O5 owner-visible directory signal }
  - { id: delta, resource: /.design/watchman/v2-readd/v2-readd4-watchwoman-delta0.glm53max.md, title: Watchwoman deployed-to-tip delta }
  - { id: opencode-pin, resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169, title: OpenCode v2 carrier base (seam independently re-read for this draft) }
---

# Watchman v2 re-add — first architecture draft (GX)

## Status, purpose, independence

This is the GX first draft of the round-5 design challenge issued by
[`v2-readd4-validation3`](v2-readd4-validation3.gpt56solxh.md). It is a complete
architecture, not a summary or a patch of either historical candidate. It was
written from validation0–3, the full accepted v2-readd4 evidence corpus, both
historical v4 candidates (read as inputs only), and a fresh read of the
OpenCode watcher seam at `4306c07b`. The parallel Astra first draft was **not**
read, and no other round-5 draft has influenced this document. No production
code, carrier state, prompt, or existing design file was modified, and nothing
was committed.

Claim vocabulary used throughout:

| Mark | Meaning |
| --- | --- |
| **[F]** | Observed fact, pinned to an accepted evidence record or primary source. |
| **[P]** | Selected policy — this draft's decision, argued from evidence but not itself evidence. |
| **[V]** | Required future executable proof — an obligation, not a demonstrated property. |

## Executive architecture

OpenCode keeps its existing `Watcher` service, `RcMap` physical sharing, and
desired-state owners untouched in shape. A statically selected backend
composite delegates `file`/`entries` to the inherited Node native and routes
recursive `directory` watches to one **controller per physical RcMap key**.
Each controller drives a mailbox-serialized lifecycle state machine
(Acquiring → Attaching → Attached → recovery loops → Released) over a
**purpose-owned wire client**: a small in-repo transport that owns Unix-socket
connection, `get-sockname` discovery (cancellable), BSER framing via
`@superbfowle/bser-esm`, FIFO command execution, our own response/PDU
classification, and a **joinable close**. A process-wide acquisition
coordinator bounds concurrent connection work behind one epoch-fenced
availability circuit. Events are published as **type-agnostic path updates in
the caller's logical namespace — directory rows included** — with Parcel-exact
ignore semantics; create/update distinction is deliberately not classified.
Recovery and daemon-state uncertainty are communicated only through W1's
private invalidation followed by exact rows, and every replacement generation
starts from a fresh daemon clock with a unique subscription name.

```mermaid
flowchart TB
  ConfigOwner[Config FiberMap] --> WatcherService[Watcher.Service + RcMap]
  SkillOwner[Skill FiberMap] --> WatcherService
  PluginSource[Configured plugin source] --> WatcherService

  WatcherService -->|file / entries| NodeNative[Inherited Node native]
  WatcherService -->|directory, default| ParcelNative[Inherited Parcel native]
  WatcherService -->|directory, watchman selected| Backend[watchman/backend.ts composite]

  Backend -->|file / entries| NodeNative
  Backend -->|directory| Controller[watchman/controller.ts exact-root controller]
  Controller --> Acquisition[watchman/acquisition.ts shared circuit + permits]
  Controller --> Wire[watchman/wire.ts owned wire client]
  Controller --> Sentinel[watchman/sentinel.ts parent-entry sentinel]
  Controller --> Mapping[watchman/mapping.ts D/C/L + ignores]
  Wire --> Bser[@superbfowle/bser-esm codec]
  Wire --> Daemon[(Watchwoman daemon)]
  Controller -->|invalidation + exact updates| WatcherService
```

One sentence: **a statically selected, directory-only Watchman backend composed
of five deep modules — owned wire transport, epoch-fenced acquisition,
mailbox-serialized per-root controllers, logical-namespace mapping, and a
symlink sentinel — publishing type-agnostic logical paths (directories
included) through W1 invalidation ordering, with Parcel untouched as the
default and every daemon outage handled by bounded, circuit-gated, fresh-clock
reattachment rather than fallback.**

## Evidence posture

All pins are those established by the corpus:

- OpenCode `4306c07b` on `v2@origin`; Effect `4.0.0-rc.112` (`2600f62f`)
  [F, validation0]. The watcher seam (`NativeInterface`, `RcMap` lookup,
  `subscribeDirectory`, W1 signal channel) was re-read directly at the pin for
  this draft.
- Deployed daemon: Watchwoman `a1e16cbf` (wire version `2026.03.30.00`,
  buildinfo `watchwoman 0.7.0`), running, hash-verified [F, e01]. Local
  `systemd` tip `603f3b5` is 26 unpushed commits; its only protocol deltas are
  a root-retire `canceled` PDU and bounded session queues [F, delta].
- Stock fallback: installed binary `20260708.093114.0` (older than the
  inspected `923b0935` source) [F, e01, e03-stock].
- JS transport under test in the corpus: `@superbfowle/fb-watchman-esm@3.0.0`
  plus `@superbfowle/bser-esm@3.0.0`, byte-identical npm/workspace artifacts
  [F, e07, e17]. Bun 1.4.1 and 1.4.2 both exercised; 1.4.2 is the carrier pin
  [F, e17].
- Committed carrier W1 `620fc620`; uncommitted W2/actor working copy audited
  without modification [F, e19].

## Decisions ledger

Each validation3 decision item, resolved. Evidence column names the records
that force or justify the choice.

| # | Question | Decision [P] | Grounding |
| --- | --- | --- | --- |
| D1 | Formal daemon/platform scope | Watchwoman `a1e16cbf` wire behavior is the only formal target; selection is accepted **on Linux only** and refused at startup elsewhere; stock is a non-gating conformance surface | e01, e17 (only live-verified composition is Linux x86-64/glibc + deployed Watchwoman; no macOS/Windows/arm64/musl run exists) |
| D2 | Transport disposition / physical ownership | **Replace** the fb-watchman client wrapper with an owned ~200-line `wire.ts`; keep `@superbfowle/bser-esm` as the codec dependency; never send `unsubscribe` | e07 (classifier stalls), e12-transport (wedge, dead-socket retention, uncancellable child, nonterminal `end()`), e04 (close-order gaps) |
| D3 | Startup / permanent failure | Module-load/option-decode failure = startup defect; daemon unavailability and root rejection = pending stream + bounded retry forever, never `undefined`, never defect | e05 (undefined kills plugin-source retries silently; pending keeps owner keys occupied while initial authoritative load serves) |
| D4 | Topology / acquisition / circuit / backoff / fencing | One wire client per controller **generation**; shared coordinator admits `connect→version→watch`, default 4 permits; circuit opens only on transport-class failures inside that prefix; `min(2000, 100·2^attempt)` ms, no jitter; **blanket epoch fencing of all stale results** | e11 (per-root isolation trade table), e11-pressure (34 clients fine), e11-races (donor's unguarded stale closes are rejected deliberately) |
| D5 | Controller recovery / ack buffering / freshness / release | Mailbox-serialized supervisor; route-before-submit with pre-ack buffering; `is_fresh_instance` ignored entirely; every loss (socket end/error, timeout, `canceled` PDU, decode failure) = full fresh generation; `Released` absorbing with joinable wire close | e03 (merged ack, PDU-before-ack race, hardcoded-false flag), e16 (cross-incarnation false flag), e04 (transition-ownership gaps), e12 (release joins) |
| D6 | Public event semantics / create-update need | Publish **type-agnostic `{path, type}` updates in the logical namespace, directory rows included**; `exists:false` → `"delete"`, otherwise `"update"`; no baseline/ino classification — **exact create/update identity is not implemented and not needed by any current consumer** | o5 (directory rows are the only Watchwoman signal in subtree rename/delete; consumers are path-predicate rescans), e09-create (no portable intrinsic signal; consumers enumerated), e09-rows |
| D7 | L/C path publication / ignore semantics | Publish under `L`; `D == C` enforced as an invariant (plain watch returns exactly `realpath(C)`); literals resolved `path.resolve(L, v)` matched equal-or-component-below byte-exact in the **logical** namespace; globs via `micromatch` `{dot:true}` full match on POSIX L-relative paths; optional daemon-side literal-exclusion expression for traffic only | e02 (D==C always), e08 (Parcel's exact rule; canonical-namespace literals proven inert in the L≠C experiment) |
| D8 | Symlinks / parent loss / Bun re-arm | Parent-entry sentinel only when the **final component of L is a symlink**; re-read realpath at every sentinel callback; retarget = epoch bump + fresh attach + invalidate; dangling = epoch bump + close + invalidate + retry; ancestor symlinks unsupported (Parcel-blind today); sentinel re-arm always close-before-rearm | e10 (final-component coverage 100%, ancestor blindness both runtimes, parent death silent), e17 (defect reproduces on exact Bun 1.4.2: 0/30 vs 30/30) |
| D9 | Owner readiness/rescan ordering | Keep W1 unchanged; carry the A-class W2 owner hunks (Config `Change` union, Agent/Command/Source invalidation bypass, configured-source readiness); Skill gets the **first-`onReady`-call gate**; detached-gap exposure accepted and documented | e14 (only the first-call gate settles; mutation-checked), e19 (hunk classification), e05 |
| D10 | Option/API/generation boundary | Core `Watcher.Options` gains `backend` + `watchman{binary,commandTimeoutMs,maxConcurrentAcquisitions}`; ServerOptions `fs` mirrors them; CLI decodes `OPENCODE_*` env with real validation that fails startup; no Protocol/HttpApi/OpenAPI/generated-client change | e18 (seam traced; "off-wire but public-type" consequence accepted) |
| D11 | W1/W2/actor carry | W1: keep as-is. W2: carry the five A-class production hunks + owner tests, rewrite the broken supervisor test, add missing Config coalescing and Skill gate tests. Actor: rewrite against the new wire seam. Historical docs: evidence only | e19 |
| D12 | Verification architecture | Four layers: deterministic actor-driven suites; private-daemon live matrix; shared-daemon-safe relay-FIN loss and release-leak proofs (E16 procedures); platform probes before any scope widening | e16 (safe-loss apparatus), e12 (leak proofs now possible because close is owned) |

## Module design

Production code lives under `packages/core/src/filesystem/watcher/watchman/`.
The grouping is domain-shaped, not flat; each module is a deep module with a
small interface that hides a large, sharp invariant set.

| Module | Owns (deep) | Interface (small) | Must not own |
| --- | --- | --- | --- |
| `wire.ts` | Socket, discovery child, BSER framing, FIFO, classification, joinable close | `connect`, `command`, `onPdu`, `close` | Roots, epochs, owners, policy |
| `schema.ts` | Response/PDU decode, failure taxonomy | decode functions, `WatchmanFailure` | Retry, lifecycle |
| `acquisition.ts` | Permits + circuit state machine | `acquire(work)` | Root policy, protocol |
| `controller.ts` | Lifecycle state machine, epochs, mailbox, buffering, recovery, release | `attach`, `stop`, signal queue | Protocol bytes, owner scans |
| `sentinel.ts` | One `fs.watch` parent-entry watcher, close-before-rearm discipline | `arm`, `onChange`, `close` | Path policy, daemon |
| `mapping.ts` | D/C/L pipeline, ignores, row→Update mapping (pure) | `mapRow`, `buildExpression`, `compileIgnores` | Anything effectful |
| `backend.ts` | Composite Native, static selection, shared coordinator construction | `make(nodeNative, options)` | Controller internals |

### `wire.ts` — the owned transport

**Why replacement rather than wrapping** [P]. The corpus proved four
unfenceable defects in the fb-watchman client *from the outside*: the
key-presence classifier routes Watchwoman's `unsubscribe` ack (and both
daemons' `get-log`) to the unilateral path, head-of-line blocking the FIFO
forever [F, e07]; a failed discovery wedges `connecting:true` permanently so
even `end()` plus a corrected binary leaves a new command queued forever [F,
e12-transport S8e]; a socket `error` leaves a dead socket object in place so
no later command recovers without an intervening `end()` [F, e12-transport
S5]; and `end()` neither cancels nor joins the discovery child, which can
connect a live socket after end or outlive the process [F, e12-transport S6,
S7]. A wrapper can mitigate the first by never sending `unsubscribe`, and the
second/third by discarding the whole `Client` per generation — but the fourth
is a physical-survivor class that E12 formally proved has no external owner.
Since the required client is small and its codec is already a proven
dependency, owning the wire converts every E04/E12 "unprovable/unowned" row
into a local, testable property.

```ts
// wire.ts — directional sketch
export type Pdu = {
  readonly subscription: string
  readonly clock: string
  readonly files: ReadonlyArray<{ readonly name: string; readonly exists: boolean; readonly type?: string }>
  readonly canceled?: boolean
  readonly root?: string
}

export type WireError =
  | { readonly _tag: "transport"; readonly reason: string }   // discovery/connect/socket-level
  | { readonly _tag: "rejection"; readonly response: unknown } // daemon {error} PDU
  | { readonly _tag: "timeout" }
  | { readonly _tag: "closed" }                                // client closed under us
  | { readonly _tag: "decode"; readonly detail: string }

export interface WireClient {
  /** FIFO, one command in flight. Deadline starts when written to the socket.
      Uninterruptible once submitted until settle/close/deadline. */
  readonly command: (args: readonly unknown[]) => Effect.Effect<unknown, WireError>
  /** Registered at connect, before any command. Push PDUs only. */
  readonly onPdu: (handler: (pdu: Pdu) => void) => void
  /** Cancel discovery child, settle all pending commands with `closed`,
      end socket, await the OS close event. Terminal for this client. */
  readonly close: () => Effect.Effect<void>
}

export interface Wire {
  /** WATCHMAN_SOCK short-circuit, else spawn binary --no-pretty get-sockname
      (child handle retained; killed on cancel/close), then connect. */
  readonly connect: (options: { readonly binary?: string }) => Effect.Effect<WireClient, WireError>
}
```

Classification rule [P]: a decoded object is a push PDU **iff** it carries a
top-level `subscription` key and no `unsubscribed` key; everything else
settles the current command (`error` key present → rejection). This is correct
without special cases because this design **never issues `unsubscribe`,
`get-log`, or `log-level`** [P] — on Watchwoman `unsubscribe` is registry-only
and delivery continues anyway [F, e03 K6], same-name resubscribe duplicates
PDUs [F, e03 table rows 6–7], and the ack shape stalls the stock-family
classifier [F, e07]; release is always socket close, which terminates
subscriptions on both daemons (stock: `UserClient` destruction clears
subscriptions [F, e11]; Watchwoman: session release chain [F, e12-release]).
Stock's `log`/`get-log` misroute is thereby never exercised [F, e07].

Close ordering [P]: mark closed → settle pending commands (`closed`) → kill
discovery child if any → `socket.end()` → await socket `close`. There is no
post-close window: a command on a closed client fails immediately with
`closed`; the client object is discarded per generation.

Packaging note [F, e07/e17]: the published bser-esm tarball carries no
declarations (and the transport tarball omits its `index.d.ts`), so
`wire.ts` is accompanied by a small local ambient declaration for the two
codec functions we use. BSER v1 framing round-trips under Node 26.6.0, Bun
1.4.1, and checksum-verified Bun 1.4.2 against the deployed daemon [F, e07,
e17].

### `schema.ts` — codecs and failure taxonomy

Effect-Schema decoders for: version response (`version`, `buildinfo`), watch
response (`watch`, `watcher`; `relative_path` retained for diagnosis only —
it is expected never to appear [F, e02]), clock response, subscribe response
(merged-ack form: `subscribe`, `clock`, `is_fresh_instance?`, `root?`,
`files?` — all optional beyond `subscribe`+`clock` because stock's ack
differs [F, e03]), and the push PDU. The taxonomy:

```ts
export type WatchmanFailure =
  | { readonly kind: "transport"; readonly operation: "connect" | "version" | "watch" }
  | { readonly kind: "rejection"; readonly operation: "watch" | "clock" | "subscribe" }
  | { readonly kind: "timeout" }
  | { readonly kind: "decode" }
  | { readonly kind: "released" }
```

Kind drives disposition (below); operation drives logs only. `version`'s
impersonated string is recorded but never branched on [F, e01 caveat].

### `acquisition.ts` — bounded admission, epoch-fenced circuit

One coordinator per backend instance, constructed in the backend layer scope
so circuit timers die with the layer. It admits exactly the expensive prefix
`connect → version → watch C`; clock/subscribe/PDU handling stays
controller-local and can never open the circuit [P, refined from v4-dirty and
e11].

```ts
export interface Acquisition {
  readonly acquire: <A>(work: Effect.Effect<A, WatchmanFailure>) => Effect.Effect<A, WatchmanFailure>
}
```

Circuit states `Closed(epoch)` / `Open(epoch, attempt, ready)` /
`HalfOpen(epoch, attempt, changed)` with the donor's proven transition
mechanics [F, e11-races] and one deliberate divergence: **every completion —
success or failure — is fenced by its candidate epoch; a stale result of any
kind cannot mutate a newer circuit state** [P]. The donor's unguarded
`close(ordinary)` path, which lets an older already-running success close a
newer open circuit and wake waiters early [F, e11-races S5a/b/c], is rejected:
the blanket rule is a single invariant to test, and its cost (discarding a
late positive that might have shortened an outage) is bounded by the probe
schedule. Backoff is exactly `min(2000, 100·2^attempt)` ms, no jitter,
TestClock-deterministic [F, e11-races]; attempt advances only on probe
transport failures, repeats on probe abandonment, resets after a clean close.
Only `kind === "transport"` opens the circuit; rejection, timeout, and decode
are root-local [P, e11's taxonomy finding that phase labels cannot express
"connection-class" is resolved by classifying at the wire, where transport
vs daemon-spoke is distinguishable].

### `controller.ts` — the exact-root lifecycle

One controller per physical RcMap key `(directory, ignore)`; keys compare
structurally upstream so equivalent watches share it. A single supervisor
fiber consumes a serialized signal queue; **no state mutation ever happens
from callback context** — wire PDUs publish through a lock-free epoch check,
and all control events (wire loss, sentinel, retry wake, stop) enqueue [P,
answering E04's gap 5].

```ts
// controller.ts — directional sketch
export interface DirectoryInput {
  readonly target: string                                    // L: resolved spelling from the RcMap key
  readonly ignore: readonly string[]
  readonly publish: (update: Watcher.Update) => void
  readonly invalidate: () => void                            // W1 private channel
  readonly deps: { readonly wire: Wire; readonly acquisition: Acquisition; readonly node: NativeInterface
                   readonly timeoutMs: number }
}

export interface Controller {
  /** Pends until first attach (or forever while retrying). Interruption at any
      point before first attach runs the same release path as stop(). */
  readonly attach: Effect.Effect<Watcher.Subscription>
}
```

Finite transition model. States: `Idle`, `Acquiring` (inside admission
prefix), `Attaching` (clock → route install → subscribe), `Backoff` (timer),
`Attached`, `Released` (absorbing). Inputs: `start`, `admit`, `watchOk`,
`ack`, `pdu(name)`, `loss(transport|timeout|decode)`, `sentinel`, `wake`,
`stop`. This table is complete over the input alphabet:

| State | Input | Action | Next |
| --- | --- | --- | --- |
| Idle | start | resolve `C = realpath(L)`; capture target epoch `e`; install sentinel if final-component symlink | Acquiring |
| Acquiring | admit | build wire client; `version`; `watch C` | Attaching (ok) |
| Acquiring | loss(transport) | release client (joinable close); circuit governs delay | Backoff |
| Acquiring | loss(rejection/decode/timeout) | release client; root-local delay | Backoff |
| Attaching | watchOk → clock → route install → subscribe submit | buffer PDUs by name until ack | (await ack) |
| Attaching | ack, epoch+realpath current, **initial** | discard buffered rows and ack `files`; mark Attached; resolve attach barrier | Attached |
| Attaching | ack, epoch current, **recovery** | `invalidate()`; drain buffer; mark Attached | Attached |
| Attaching | ack, epoch stale | close client (await); loop | Acquiring |
| Attaching | loss | close client; delay | Backoff |
| Attached | pdu(current name) | epoch check → mapping pipeline → publish | Attached |
| Attached | pdu(unknown name) | drop | Attached |
| Attached | pdu(current name, `canceled`) | close; delay | Backoff |
| Attached | loss | close; delay | Backoff |
| Backoff | wake | re-resolve `C`; sentinel health check | Acquiring |
| any | sentinel, `realpath(L)` unchanged | ignore | same |
| any non-Released | sentinel, retarget | `e++` **before** closing old work; close; fresh attach; invalidate after ack | Acquiring |
| any non-Released | sentinel, dangling | `e++`; close; `invalidate()` so owners observe absence; keep sentinel | Backoff |
| any | stop / external interruption | mark Released; stop sentinel; close client (await); drain queue; join supervisor | Released |
| Released | anything | drop | Released |

Buffering rationale [F, e03]: Watchwoman merges initial results into the
subscribe ack and has a code-proven PDU-before-ack race; stock always emits a
separate initial PDU. Buffering until ack plus post-ack epoch/realpath
revalidation covers both without daemon-specific branches. Initial rows are
discarded because the owner's authoritative `onReady` reread follows logical
attachment and is strictly better information [F, e14 lifecycle model];
recovery rows follow `invalidate()` so every subscriber finishes readiness
before seeing exact rows [F, W1 ordering, e14].

`is_fresh_instance` is ignored on both ack and PDUs [P]: it is hardcoded
`false` on Watchwoman push PDUs and provably false-but-full across
incarnations [F, e03, e16], so no behavior keys on it. Daemon incarnation
loss is always detected as socket loss → full replacement; no clock ever
crosses a generation [P].

Cancellation PDU: on stock it is terminal per subscription [F, e03 K2]; the
Watchwoman tip emits a non-stock-shaped `{subscription, canceled, clock}` on
root retire/drop [F, delta]. Both route through the same `pdu(name,
canceled)` row: full fresh replacement [P].

### `sentinel.ts` — parent-entry symlink sentinel

Installed only when `lstat(L)` says the final component is a symlink [P].
Implemented directly over `node:fs` `watch(dirname(L))` with a basename
filter, exactly the primitive E10 characterized: every delete/recreate/
rename-over of `basename(L)` arrives as a `rename` event; state re-read at
callback time converged in 100% of 2,400 reps across both runtimes [F, e10].
Ancestor symlinks above `dirname(L)` are structurally invisible to this and
every available primitive, and today's Parcel behavior is identically blind
[F, e10 probe B] — documented as unsupported rather than half-covered [P].
Parent deletion is silent [F, e10 probe C]; the sentinel is re-created on
every controller attach cycle, always **close-before-rearm** [P] because Bun
1.4.1 and the carrier-pinned 1.4.2 both leave a re-armed watch permanently
deaf while a stale watcher on the deleted directory stays open (0/30 vs
30/30) [F, e10, e17].

Skill already realpaths its recursive roots, so Skill watches have `L == C`
and never gain a backend sentinel; Skill's own logical file watch remains
the coverage for its spelling [F, e10 inventory].

### `mapping.ts` — namespace pipeline and ignores

Pure functions; the entire correctness-critical surface in one testable
place.

```ts
export interface RowContext {
  readonly L: string          // logical root (RcMap key spelling)
  readonly C: string          // realpath(L) at attach
  readonly D: string          // watch response root; invariant: D === C
}

// row → logical update; returns undefined when the row is dropped
export function mapRow(ctx: RowContext, ignores: CompiledIgnores, row: Row): Watcher.Update | undefined
```

Pipeline per row [P]:

```text
abs = path.resolve(D, row.name)
drop unless contained in C (invariant guard; D===C expected — a violation closes the generation as decode-class)
drop if basename starts with ".watchman-cookie-"
logicalAbs = path.join(L, path.relative(C, abs))
drop if literal ignore matches logicalAbs (equal or component-below, byte-exact)
drop if any glob matches path.relative(L, logicalAbs) POSIX-form under micromatch {dot:true}
publish { path: logicalAbs, type: row.exists ? "update" : "delete" }
```

The row request set is `fields: ["name", "exists", "type"]` [P] — `type` is
carried for diagnostics only and **never gates publication**: directory rows
flow to owners exactly as Parcel's type-agnostic events do today [F, o5].
`new` and `ino` are not requested; no prior-state map exists, so backend
memory is O(1) per root [P].

Daemon-side expression, built only when at least one literal ignore exists,
purely for traffic reduction (the client pipeline is the sole authority):

```text
["not", ["anyof",
  ["name",  <D-relative path of each literal>],
  ["dirname", <same>],   // dirname matches descendants; name catches the entry itself
  ... ]]
```

Only `not`/`anyof`/`name`/`dirname` are used — all core, always registered on
both daemons, no capability negotiation needed [F, e06]. Divergent terms are
avoided: no `dirname ""` (root-only on Watchwoman, everything on stock) [F,
e06], no depth operand (ignored on Watchwoman) [F, e06], no `match`/wildcard
cookie term (client filter suffices; Watchwoman strips cookies pre-expression
anyway) [F, e06 K3/K4], no `since`-expression field selector (silently
different meaning on Watchwoman) [F, e09-create K4]. When no literals exist,
no expression is sent. Globs are never pushed daemon-side.

### `backend.ts` — composition and static selection

```ts
export const make = (node: NativeInterface, options: WatchmanOptions): Effect.Effect<NativeInterface> =>
  // dynamic import of watchman modules happens here (lazy, selection-gated);
  // failure of import/validation is a construction failure → startup defect
```

Routes `file`/`entries` to the passed Node native unchanged; `directory` to a
controller; constructs one `Acquisition` in the backend scope. Selection is
static for the process; absent/`"parcel"` uses the inherited native
byte-for-byte; `enabled === false` short-circuits before any import [P, e18
seam]. Platform gate: `"watchman"` is a valid literal only on
`process.platform === "linux"`; elsewhere option decode fails startup with an
explicit message [P, D1].

## Ownership and release

The resource ledger — every row a local, testable property because the wire
is owned [P, closing E12's ledger gaps]:

| Resource | Creator | Owner | Finalizer | Fence |
| --- | --- | --- | --- | --- |
| Wire client socket | `wire.connect` | wire client | `close()`: `socket.end()` + await `close` event | client closed flag; closed clients reject commands |
| Discovery child | `wire.connect` | wire client | killed on cancel/close; handle retained | no post-close spawn path |
| Supervisor fiber | controller `attach` | controller | stop Deferred → join | `Released` absorbing |
| Sentinel watcher | controller attach cycle | controller | close-before-rearm; single instance | `Released` + epoch check |
| Backoff timer | controller `Backoff` | supervisor fiber | interruption clears timer | `Released` |
| Circuit timer | `acquisition` open transition | backend layer scope | scope closure interrupts/joins | epoch |
| Pending commands | wire FIFO | wire client | settle on response/rejection/close/deadline | FIFO preserved; uninterruptible-after-submit |
| Daemon-side subscription | subscribe ack | daemon | socket close (both daemons) | unique per-generation name |

Release sequence on final demand removal: mark `Released` → stop sentinel →
`wire.close()` (settles in-flight commands with `closed`, kills child, ends
socket, awaits close) → join supervisor → resolve the `Subscription`
promise [P]. Because `close()` settles commands without daemon responses,
release latency is **not** bounded by `commandTimeoutMs` — it is the socket
close round-trip (milliseconds), with `commandTimeoutMs` remaining only as
the in-generation command deadline [P, improving on v4-dirty's T-bounded
release which E12 showed was actually up to 2T there]. **Pre-return
interruption** — the E04 gap 7 hole — is closed by wrapping the pending
`attach` effect in an interruption finalizer that performs the same release
sequence, so the interval before `Native.subscribe` returns has an explicit
owner [P].

Daemon-side residue after our release [F, e12-release, e11-pressure]: a
disconnected subscribed Watchwoman session is retained until a matching tick
or root drop, and reconnect cohorts accumulate (`4N` sockets/subscriptions
observed over three cohorts). This is daemon policy (fixed decision:
retention is the daemon's business); client-side verification asserts only
that *our* fds and processes vanish. Operational note for the record: on a
flapping daemon with quiescent roots this accumulates daemon-side sessions
until ticks arrive; the circuit's cap bounds the rate.

## Event and path semantics — worked examples

Given `L = /home/u/proj/.opencode` (a real directory), `C = D = L`:

- Watchwoman dir-rename `agents/old → agents/new` with no child rows [F,
  o5]: rows `{name:"agents/old",exists:false,type:"d"}`,
  `{name:"agents/new",exists:true,type:"d"}` → published deletes/updates at
  `…/agents/old` and `…/agents/new` → Agent's directory-level predicate
  fires → full rescan converges. Under v4-dirty's directory drop these rows
  vanished and Agent stayed stale until an unrelated trigger [F, o5].
- Stock same operation emits per-child tombstones [F, e09-rows op 10]; those
  publish identically. Same code path, no daemon branch.
- Cookie write `.watchman-cookie-777777`: no row ever reaches mapping on
  Watchwoman (stripped pre-expression [F, e06]); on stock the client basename
  filter drops it [F, e06 K3].
- `L = /link/to/.opencode` where `link` is a symlink: `C = realpath(L)`;
  events publish under `/link/to/.opencode/...`; a literal ignore
  `node_modules` resolves against L and matches
  `/link/to/.opencode/node_modules/**` exactly as Parcel does today [F, e08
  B4/K4]. A canonical-namespace literal would be inert — that is why the
  pipeline is logical-first [F, e08 B5].

## Failure and availability policy

| Failure | Class | Effect |
| --- | --- | --- |
| Watchman module import/validation failure; invalid options; `watchman` selected off Linux | startup defect | Layer construction fails; server startup fails [P, e18 seam] |
| Socket refusal, discovery failure/ENOENT, socket `error`/`end` during admission prefix | transport | Opens shared circuit; controllers back off [P] |
| Same losses after admission (clock/subscribe/live) | transport (root-local) | Full fresh replacement of that controller only; circuit untouched [P] |
| `watch` rejection (policy, ENOENT) | rejection | Root-local backoff retry; stream stays pending [P] |
| Command deadline | timeout | Close generation; root-local retry [P] |
| Malformed response/PDU | decode | Close generation; root-local retry; logged once per generation [P] |

Never: stream end (`undefined`), synthetic updates, Parcel fallback, typed
failure across the public surface [P]. Consequences accepted from e05:
Config's per-key `FiberMap` occupancy persists (initial authoritative load
still serves), Skill recovers via refresh, plugin sources stay pending rather
than silently dead, and a permanently rejected root retries at the 2 s cap
with bounded logs. A future slow-retry tier for confirmed-permanent
rejections is an explicit non-goal until a consumer needs it.

## Owner convergence

1. **W1 stays exactly as committed** (`620fc620`): private `NativeSignal`
   invalidation channel, per-subscriber ordered readiness replay [F, e19
   A-class; e14 depends on its exact ordering].
2. **W2 A-class hunks carry**: the Config `Change = Watcher.Update |
   {type:"invalidation", path}` union and widened `changes()`; Agent,
   Command, and Plugin-Source invalidation bypass before path predicates;
   configured-source readiness publishing `configuredChanges`; the
   test-layer `Watcher.Test.invalidate()` [F, e19].
3. **Skill first-call gate** (the only sound latch [F, e14]):

```ts
let initial = true
const onReady = Effect.suspend(() => {
  if (!initial) return PubSub.publish(changes, target).pipe(Effect.asVoid)
  return Effect.sync(() => { initial = false })
})
const updates = yield* watcher.subscribe({ path: target, type }, onReady)
```

4. **Directory rows are the O5 fix**: because this design publishes them,
   Agent/Command/Skill/Plugin rescans fire on subtree renames, deletions,
   replacements, and ignore-boundary moves that Watchwoman signals only
   through directory rows [F, o5]. No owner predicate changes are needed for
   this — the W2 bypass plus existing containment predicates already consume
   them.
5. **Detached gaps accepted**: an invalidation published while an owner is
   logically detached is unrecoverable by any latch; the authoritative scan
   bounds it, the same window Parcel has today [F, e14]. Closing it would
   require scan-after-readiness owner reordering — recorded as a future
   option, not taken.

## Options and API boundary

```ts
// packages/core Watcher.Options (additive)
export const Options = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  backend: Schema.optional(Schema.Literal("parcel", "watchman")),
  watchman: Schema.optional(
    Schema.Struct({
      binary: Schema.optional(Schema.String),
      commandTimeoutMs: Schema.optional(Schema.NumberGreaterThan(0)),
      maxConcurrentAcquisitions: Schema.optional(Schema.NumberGreaterThan(0)),
    }),
  ),
})
```

| Setting | Default | Env (CLI-owned decode) |
| --- | --- | --- |
| `backend` | `"parcel"` | `OPENCODE_WATCHER_BACKEND` |
| `watchman.binary` | transport discovery / `WATCHMAN_SOCK` | `OPENCODE_WATCHMAN_BINARY` |
| `watchman.commandTimeoutMs` | `60000` | `OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS` |
| `watchman.maxConcurrentAcquisitions` | `4` | `OPENCODE_WATCHMAN_ACQUISITION_LIMIT` |

Flow [F, e18]: CLI env decode in `server-process.ts` → `ServerOptions.fs`
(mirrored fields) → routes' existing `Watcher.node.replace(Watcher.configured(...))`
seam → Core. **Owning decode boundaries**: the CLI env parser for environment
strings (invalid values throw → startup fails), and Core `configured()` which
schema-decodes options at layer build for the programmatic path — today's
`ServerOptions` is accepted as a bare type with no runtime decode [F, e18],
so both entry paths need a real validator. Public-type consequence:
`ServerOptions` and SDK `CreateOptions` widen (off-wire but published APIs)
[F, e18] — accepted and documented. **No Protocol, HttpApi, OpenAPI, or
generated-client change**; client regeneration is not required [F, e18
trigger matrix]. Workerd keeps `filewatcher:false` and never sees the
watchman branch. `watcher.ignore` project config is unrelated location-scoped
data and stays untouched [F, e18].

Dependencies added via the package manager, never hand-edited:
`@superbfowle/bser-esm@3.0.0`, `is-glob@4.0.3`, `micromatch@4.0.8` (matching
Parcel's pinned matcher versions [F, e08]) plus their type packages.
`@superbfowle/fb-watchman-esm` is **not** added.

## Platform and daemon scope

- **Linux**: supported selection; the release gate [P].
- **macOS**: selection refused at startup until the [V] platform obligations
  below are discharged; Watchwoman v0.7.0 ships macOS artifacts [F, e17] but
  nothing in the corpus executed the transport there.
- **Windows**: out of scope permanently for Watchwoman (no daemon exists)
  [F, e17]; stock-on-Windows is doubly out (no artifact, CI red at the pin)
  [F, e17].
- **Watchwoman `a1e16cbf`**: the formal target. The design's protocol subset
  (version/watch/clock/subscribe + push PDU + `canceled`) is wire-compatible
  with the local tip and stock, but only Watchwoman is gated.
- **Stock Watchman**: non-gating conformance surface — the deterministic
  suites must stay daemon-neutral and the live matrix may run stock cells for
  information, since every protocol element this design uses is
  live-verified on both [F, e02, e03, e03-stock, e06, e09-rows].

## Invariants

1. Public `WatchInput`, `Watcher.Update`, and logical `subscribe` shapes are
   unchanged; invalidation stays private (W1).
2. Directory rows are published, mapped like any row; `type` in the public
   event carries only `update`/`delete`.
3. Node owns `file`/`entries` under every selection; Parcel is the default
   and never a Watchman fallback.
4. One controller per physical key; final release happens exactly once.
5. PDU handler registration precedes the first command; routes (names) are
   generation-unique.
6. Every attach obtains a fresh clock; no cursor or clock crosses
   generations; `is_fresh_instance` is never consulted.
7. No retired generation's callback, PDU, timer, or sentinel event can
   publish (epoch + closed + name fences).
8. `D === C` is asserted per attach; a violation is decode-class and closes
   the generation.
9. Ignores evaluate in the logical namespace with Parcel-exact semantics;
   cookies are basename-filtered client-side.
10. Recovery emits `invalidate()` after ack and before any withheld row.
11. Socket `error` and `end` coalesce into at most one replacement.
12. `wire.close()` cancels the discovery child, settles commands, and joins
    socket close; no client-owned fd or child survives release or shutdown.
13. Release is final from every state, including pre-return interruption;
    release latency is not bounded by `commandTimeoutMs`.
14. Acquisition never exceeds its limit; only transport-class failures inside
    the admission prefix open the circuit; **all** stale results are
    epoch-fenced.
15. Never send `watch-project`, `watch-del`, `relative_root`, `unsubscribe`,
    `get-log`, or any cursor.
16. Selected-backend construction or option validation failure fails startup;
    daemon unavailability never ends a stream or falls back.
17. Owner convergence flows only through W1 invalidation and exact rows; the
    Skill gate flips inside the first `onReady` call.
18. The sentinel is single-instance, final-component-only, and always
    close-before-rearm.

## Performance characteristics

Steady state per root: one daemon socket, one in-process supervisor fiber,
one sentinel (only symlinked final roots), O(1) memory (no baseline map).
Watchwoman batches rows into ≤5 ms / ≤1024-entry ticks; stock is
settle-driven (~20 ms observed) [F, e03, e03-stock]. Client cost per row is
one path join + containment + literal prefix checks + (Config case) one
micromatch match — the same class Parcel performs in native code today.
Measured acquisition envelopes at the daemon: connect p50 ≈ 3–5 ms, watch ≈
2–8 ms, subscribe ≈ 2–10 ms through 34 concurrent clients with no rejection
or saturation [F, e11-pressure]; the 4-permit admission cap plus per-command
timeouts bound worst-case storms. Transient duplicate-root construction
during synchronized same-root acquisition (3–10 transient roots observed)
settles to one within ~100 ms and needs no client dedup [F, e11-pressure].

## Carrier disposition

| Artifact | Disposition |
| --- | --- |
| W1 `620fc620` (signal channel + readiness replay + test) | Keep verbatim [F, e19 A/C] |
| W2 Config `Change` union, Agent/Command/Source bypass hunks + tests | Carry [F, e19 A] |
| W2 `Watcher.Test.invalidate()` test layer | Carry [F, e19 C] |
| W2 broken `supervisor-reload` reacquisition test | Rewrite (TestClock deadlock + inverted assertion) [F, e19 B] |
| Missing Config end-to-end coalescing test; Skill gate + anti-loop test | Add (obligation) [F, e19] |
| Scripted actor | Rewrite against the `WireClient` seam; retain FIFO/fault controls; drop fb-watchman-specific classification [F, e19 C, e07] |
| v4 / v4-dirty / prompt0 / journals | Historical evidence; superseded as authority [F, e19 D/B] |

## Implementation ordering (logical commits)

1. **Selection + options**: additive `Watcher.Options`, schema decode in
   `configured()`, composite `backend.ts` skeleton delegating everything to
   the inherited native; platform gate; selection tests (default equals
   upstream, disabled short-circuit, invalid values fail construction).
2. **Wire module + local bser declarations**: connect/discovery/child-kill,
   FIFO, classification, joinable close; unit tests with a socket-pair
   server and a fake locator child (cancel, wedge-free reconnect, close
   join, post-close command rejection).
3. **Schema + mapping**: decoders, failure taxonomy, pure pipeline tests
   including D==C guard, logical ignores, cookies, directory rows, L≠C
   symlink mapping.
4. **Acquisition**: permits + circuit with blanket fencing; TestClock tests
   for limit, probe uniqueness, stale success/failure discards, abandonment
   repeat, shutdown.
5. **Controller attach**: state machine through first attach; release at
   every barrier including pre-return interruption; actor-driven tests.
6. **Controller recovery**: loss/timeout/decode/canceled replacement,
   pre-ack buffering, invalidate-before-drain, epoch-stale ack disposal.
7. **Sentinel + symlink policy**: retarget/dangling/recreate cycles,
   close-before-rearm test that fails if ordering flips.
8. **Owner convergence**: W2 carry, Skill first-call gate, supervisor test
   rewrite, Config coalescing and Skill anti-loop tests.
9. **Live acceptance**: private-daemon matrix + shared-safe relay loss +
   release-leak proofs (below).
10. **Docs + carry audit**: option/env documentation, exclusion grep,
    carrier reconciliation.

Each commit keeps the focused suites green from its package directory; no
commit mixes generic owner work with backend work.

## Verification architecture

### Deterministic (actor-driven, TestClock, no daemon)

- **Wire**: FIFO order; response vs PDU classification; rejection/timeout/
  decode taxonomy; close settles commands and joins socket; discovery child
  killed on cancel; no post-close socket.
- **Acquisition**: every invariant-14 row; the two E11-races counterexamples
  (stale ordinary success, stale ordinary failure) must **not** mutate
  circuit state.
- **Controller**: full transition table row coverage; pre-ack PDU buffering;
  initial-discard vs recovery-drain; error+end coalescing; release from
  every state; pre-return interruption leaves no client/sentinel/timer.
- **Mapping**: the worked examples above; o5's operation matrix replayed as
  fixtures (rename, rename-then-delete, replacement, ignore-boundary moves)
  asserting owner-visible rows survive.
- **Owners**: Config invalidation bypass + coalescing; Skill gate settles
  (growth detector per e14); supervisor reacquisition (rewritten); shared
  entry release-once.
- **Selection**: parity of absent/parcel with upstream; watchman never
  touches file/entries; disabled imports nothing.

### Live (private daemons, `env -u WATCHMAN_SOCK`)

Full matrix per E16 procedure A on private Watchwoman (and optional stock
informational cells): attach transcript (version/watch/clock/subscribe with
exact fields), create/update/delete/directory-row delivery in L namespace,
ignore and cookie negatives, forced relay-FIN loss (procedure B) with
fresh-clock replacement, `invalidate`-before-exact ordering observed at an
owner, Watchwoman two-tick post-loss subscription cleanup asserted, and
final release with **no surviving client fd, child process, or daemon socket
growth beyond documented daemon retention**. Live tests are explicit opt-in
via environment; they never contact the ambient service and never issue a
forbidden command.

### Resource-release proofs

Because close is owned: end-to-end leak assertions after release at each
controller state (fds via `/proc`, process tree, supervisor join), and
backend layer shutdown joining all controllers and circuit timers.

### Platform obligations [V]

Before widening selection beyond Linux: repeat the wire conformance probes
and the E16 loss matrix on the target platform; record daemon artifact
provenance; only then relax the platform gate. Before treating the
Watchwoman tip as target: rerun the tip's canceled-PDU cell through this
controller (its shape routes correctly by name, but the GC-reap delivery is
untested upstream [F, delta]).

## Rejected alternatives

1. **Wrap `fb-watchman-esm` with never-reuse discipline** — fixes the
   classifier stall only by forbidding `unsubscribe`, but leaves the wedge
   state, dead-socket retention, nonterminal `end()`, and the uncancellable
   discovery child, at least the last of which is provably unownable from
   outside [F, e12-transport].
2. **Patch and republish the fork** — couples the carrier to an upstream
   release cycle for what is, once the codec is a dependency, a smaller
   in-repo client; a fork would still leave socket/discovery lifecycle
   semantics shaped by EventEmitter conventions we do not want.
3. **Multiplexed single process client** — one `currentCommand` FIFO
   head-of-line blocks all roots and one socket loss couples every root; the
   measured cost of per-root clients through 34 is negligible [F, e11].
4. **Suppressing directory rows (v4-dirty)** — erases the only owner-visible
   signal in exact Watchwoman subtree operations and strands Agent, Command,
   Skill, and plugin state until unrelated triggers [F, o5].
5. **Baseline+inode create/update classifier** — no portable intrinsic signal
   exists; the client-side model leaves ghosts and missing descendants that
   same-root reconnection does not repair [F, e09-create, o5]; and no current
   consumer of recursive directory updates discriminates create from update
   [F, e09-create inventory, o5].
6. **Daemon-side create filters (`since cclock`, `new` mapping)** — both
   silently change meaning across daemons [F, e09-create K2/K4, e09-rows].
7. **Ancestor-symlink coverage** — no primitive exists on either runtime;
   Parcel is identically blind today [F, e10]; pretending otherwise adds
   machinery without coverage.
8. **Donor circuit verbatim** — its unguarded stale-ordinary close mutates
   newer epochs [F, e11-races]; the blanket fence is chosen despite losing
   early-wake behavior.
9. **`unsubscribe` on release** — useless on Watchwoman (registry-only,
   delivery continues, duplicates on reuse) and stall-prone through the
   stock-family classifier [F, e03, e07]; socket close is the real release
   on both daemons.
10. **Cursors/persistent clocks and `is_fresh_instance` reactions** —
    incarnation-trap evidence [F, e16]; fresh clocks make both moot.
11. **`undefined` (stream end) on daemon failure** — silently kills
    plugin-source watches with no retry path [F, e05]; pending-retry chosen.
12. **Per-command Watchman→Parcel fallback or promotion** — excluded by the
    fixed product decisions and unchanged here.
13. **Public config/endpoint exposure of backend selection** — would cross
    into Protocol/generated clients for no current need [F, e18].

## Separation ledger

- **Observed facts**: everything marked [F] above, all pinned to accepted
  corpus records or the re-read pin.
- **Selected policies**: D1–D12 and every [P]; these are decisions a human
  may overturn, each with its evidence argument stated.
- **Required future executable proofs**: all [V] items plus the verification
  architecture's live/leak/platform layers, which no prose here satisfies.

## Cross-references

- [`v2-readd4-validation3.gpt56solxh.md`](v2-readd4-validation3.gpt56solxh.md) — the design challenge brief this draft answers.
- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md), [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md), [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — corpus validation lineage.
- [`v2-readd4-e07-transport-conformance0.glm53max.md`](v2-readd4-e07-transport-conformance0.glm53max.md) and [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md) — the transport-defect catalog motivating the owned wire.
- [`v2-readd4-owner-directory-signal0.gpt56solxh.md`](v2-readd4-owner-directory-signal0.gpt56solxh.md) — the directory-row contract driving the event semantics.
- [`v2-readd4-e14-skill-lifecycle0.glm53max.md`](v2-readd4-e14-skill-lifecycle0.glm53max.md) — the Skill gate proof carried here.
- [`v2-readd4-e16-safe-loss0.gpt56solxh.md`](v2-readd4-e16-safe-loss0.gpt56solxh.md) — the live loss apparatus adopted as the verification template.
- [`v2-readd4-e18-server-options0.gpt56solxh.md`](v2-readd4-e18-server-options0.gpt56solxh.md) — the option/API boundary this design stays inside.
- [`v2-readd4-e19-carrier-audit0.gpt56solxh.md`](v2-readd4-e19-carrier-audit0.gpt56solxh.md) — carrier dispositions above are its classifications.
- Historical inputs only: v4 and v4-dirty in the carrier workspace (frontmatter sources).
