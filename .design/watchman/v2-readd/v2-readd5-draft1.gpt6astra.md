---
type: ArchitectureProposal
title: Watchman v2 re-add — convergent owners over owned sessions, second draft
description: Cross-informed Astra architecture comparing both independent first drafts and selecting a narrow JSON socket adapter, bounded attachment and release, snapshot-first recovery, and explicit daemon verification gates.
resource: /.design/watchman/v2-readd/v2-readd5-draft1.gpt6astra.md
tags: [opencode, watchman, watchwoman, architecture, deep-modules, v2, cross-review]
status: draft
generated: { by: model:openai/gpt-6-astra, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: astra0, resource: /.design/watchman/v2-readd/v2-readd5-draft0.gpt6astra.md, title: Independent Astra first draft }
  - { id: gx0, resource: /.design/watchman/v2-readd/v2-readd5-draft0.glm53max.md, title: Independent GX first draft }
  - { id: validation, resource: /.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md, title: Accepted research validation and design challenge }
  - { id: opencode, resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169, title: Canonical OpenCode implementation base }
  - { id: effect, resource: https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942, title: Effect 4.0.0-rc.112 }
  - { id: watchwoman, resource: https://github.com/rektide/watchwoman/commit/a1e16cbf35b6bb1e4b429af53d65e738f955c32b, title: Intended deployed daemon target }
  - { id: stock, resource: https://github.com/facebook/watchman/commit/923b0935155590be54c0fc052fdca0201f8ebc4b, title: Stock source comparison, distinct from installed binary }
---

# Watchman v2 re-add — convergent owners over owned sessions

## 1. Common ground

This is a **complete second architecture draft**, not an addendum. It directly compares [Astra draft0](/.design/watchman/v2-readd/v2-readd5-draft0.gpt6astra.md) and [GX draft0](/.design/watchman/v2-readd/v2-readd5-draft0.glm53max.md), then makes a new selection. Neither first draft is an authority. No same-round peer second draft was consulted.

Both first drafts converge on the most valuable simplification: **recursive events are path invalidation hints, not a filesystem history requiring an inode baseline**. Both preserve directory rows, publish in logical paths, reject exact create/update classification, retain W1 readiness ordering, keep Node for `file`/`entries` and Parcel as the default, replace the broken generic client, use one session per physical watch key, fence stale circuit results, and keep startup selection off the HTTP wire. Both preserve the carrier rather than overwrite its work.

The remaining differences concern what the implementation promises when observation is incomplete: how much work admission bounds, whether external failures can recover without a restart, which topology changes are noticed, whether first readiness actually repairs a late attachment, and what physical release means. These cannot be settled by calling every helper a deep module or every retry a recovery.

Claim labels throughout: **[F]** is accepted executed evidence or an explicitly cited source fact; **[P]** is selected policy; **[V]** is future executable proof. A source-derived race or feedback prediction is labeled as such, not as a newly reproduced bug. No production implementation or daemon experiment was run for this draft.

## 2. Tensions and decisions

| Topic | Astra first draft | GX first draft | Second-draft decision and reason |
| --- | --- | --- | --- |
| Wire and discovery | JSON, explicit socket, no child | BSER codec plus cancellable CLI discovery | **Retain JSON/explicit socket.** Framing and discovery are independent choices; BSER is viable but not needed for three string/boolean row fields. Killing a locator does not undo its daemon spawn or socket unlink. |
| Formal target | Watchwoman and installed stock both live gates | Watchwoman only; stock informational | **Adopt GX's target distinction.** Watchwoman is the intended enabled product target; stock is mandatory deterministic protocol coverage but secondary, non-gating live conformance. A failing stock cell must be reported, not represented as stock support. |
| Platform | Linux x64/glibc, exact runtime lanes | All Linux admitted, only x64/glibc evidenced | **Retain the narrower host gate.** A Linux enum check does not validate arm64 or musl. No permanent claim about future Windows support. |
| Admission | Full attach plus same-`C` serialization | Prefix `connect→version→watch`; later work unlimited | **Retain full-attach admission.** A hung `clock`/`subscribe` otherwise escapes the limit. Prefix failure location does not classify an outage. |
| External failure | Restart-only compatibility parking; three malformed generations then park | Retry forever at 2 s cap | **Converge on continued recovery, with slow tiers.** Static invalid options fail construction; external rejection, capability deficit, EACCES, and protocol failure can change and are rechecked, not permanently parked. Keep availability circuit separate. |
| Freshness | Positive freshness invalidates; false proves nothing | Ignore it entirely | **Retain asymmetric interpretation.** Stock can produce a fresh result without losing its connection. Every replacement also invalidates regardless of the bit. |
| Pre-attachment data | Buffer/drain overlapping ack and push rows | Discard initial rows, drain recovery | **Adopt and generalize GX's discard.** Discard data until installation on every generation, then force readiness/rescan. No pre-ack row queue or fabricated ordering between overlapping snapshots. Requires the Skill change below. |
| Root observation | Every logical root checked periodically; sentinel; heartbeat; permanent inode quarantine | Final-component symlink sentinel only, no heartbeat | **Retain active observation, narrow quarantine.** One-second identity sampling plus parent sentinel; 30-second clock check. A detected replaced inode waits for a changed daemon-root clock identity, not necessarily host restart. No lifetime registry of healthy abandoned roots. |
| Skill | Retain desired watch fibers; notify every readiness | Keep clearing; first-call gate | **Retain reconciliation.** E14 proves the latch only within the clear/rebuild algorithm and demonstrates its late-attachment miss. The new algorithm needs its own proof. |
| Unsubscribe and close | Optional 500 ms unsubscribe; destroy and join local close | Never unsubscribe; `end()` and wait | **Retain bounded best effort plus forced local close.** Unsubscribe changes stale-GC eligibility even though it does not stop the loop. FIN can leave the local read half waiting on this daemon; `destroy()` avoids depending on peer cooperation. |
| Mapping and expressions | Client parity plus literal and cookie expression reduction | Client cookies, literal-only expression reduction | **Adopt client-only cookies.** Keep safe literal pruning with explicit `wholename`, full matcher parity, and capability checks only for terms actually used. |
| Module shape | Two deep effectful modules, internal mapping/path code | Seven files described as five deep modules | **Keep two externally meaningful modules.** Pure mapping can be a separate internal file; exported pass-through backend/controller/circuit/sentinel protocols add no caller leverage. |
| Memory bounds | Bounded local framing/inbox; unbounded W1 explicitly noted | O(1) per root despite unbounded rows/queues | **Keep honest per-layer accounting.** No baseline is not O(1) memory. Specify byte and row limits, transient decoding, control coalescing, and the existing downstream unbounded queue. |

### Change log from Astra draft0

1. Stock moves from a second product release target to a secondary conformance lane, following GX's sharper distinction between intended deployment and protocol comparison.
2. Initial data discard becomes **all pre-install data discard**, including replacement acknowledgements. This removes a buffer and a misleading event-order promise; readiness owns reconciliation.
3. Cookie suppression is client-only. Remove cookie wildcard capabilities and the corresponding daemon expression.
4. Remove runtime daemon-brand gating and the arbitrary three-strike, restart-only protocol parking rule. Version/build strings are diagnostics, not proof of a binary pin; external problems receive bounded-rate retries.
5. Reduce root witnesses to active roots plus unresolved replacement records. Replacement can unblock after an observed new daemon-root identity and a stable path check; healthy abandoned roots do not accumulate forever.
6. Clarify that topology polling and heartbeat are selected extensions beyond Parcel parity, not existing primitive guarantees. Skill's hidden logical ancestor remains explicitly unsupported.
7. Correct the earlier coarse statement that JSON avoids every precision issue: the three requested row fields avoid inode-number precision; transport still must reject invalid UTF-8/framing and bound retained bytes.
8. Keep the three original source concerns, but tighten their status: attach gap is an architecture constraint; locator unlink is a discovery constraint that explicit sockets eliminate; read/open feedback is a mandatory real-owner release gate, not an asserted live failure.

## 3. Revised architecture and product contract

**[P] One opt-in deep directory-watch adapter behind `Watcher.Native` owns terminal JSON Unix sessions, bounded full attachments and target observation; it discards pre-install data, publishes directory-inclusive logical-path hints after installation, and repairs uncertainty through readiness-triggered authoritative owner scans.**

The implementation base is OpenCode `4306c07b340b9a0504e65785f366d2793cd1b169` with Effect `4.0.0-rc.112`. W1 at carrier `620fc620` supplies private invalidation ordering. Core owns behavior; Server maps host startup options; CLI maps environment spellings; SDK inherits explicit host options. This document neither edits nor authorizes edits to the carrier, production, historical designs, or prompts.

### Contract callers can rely on

- `WatchInput`, `Watcher.Update`, and `subscribe(input, onReady?)` stay unchanged. Selected Watchman directories never return `undefined`, silently end the stream, or fall back to Parcel on daemon failure.
- One upstream physical key `(directory, logical target, normalized ignore list)` owns one controller; logical subscribers share it through existing RcMap references.
- Before initial readiness, the owner's initial authoritative load may serve without a working daemon. **Every eventual first readiness must arrange another authoritative scan**, including Skill. There is no claim of data delivery while no logical subscriber exists.
- After installed observation, rows are type-agnostic hints: existing path → `update`, absent path → `delete`. Directories and symlinks are not excluded. Exact operation chronology, `create`, or complete descendant rows are not promised.
- Recovery installation and positive freshness enqueue private invalidation before subsequently accepted rows. Each logical subscriber completes its readiness effect before receiving later rows. A readiness effect may enqueue a debounced scan; W1 is not a global all-owners scan-completion barrier.
- Final release is absorbing and joins owned local work, including acquisition before Native returns. It does not promise the external daemon has released its root, push loop, or accepted socket.

### Non-goals and scope limits

No `watch-project`, `relative_root`, project consolidation, persistent cursor, per-file/inode baseline, exact filesystem journal, automatic root deletion, daemon spawn/install/restart, fake filesystem updates, VCS changes, HTTP health endpoint, or general-purpose Watchman command client. No content polling or following arbitrary child symlink targets. Config discovery/planning remains domain-owned and unchanged.

Read/open feedback, stale daemon indexes and retained daemon sessions are not silently repaired by suppressing directory paths. The supported composition must pass the specific gates below; a compatibility target is not automatically releasable because it appears in a table.

## 4. Peer claim checks and the three source concerns

The following material claims were checked against the accepted corpus and exact source objects, not accepted from either draft's prose.

| Claim tested | Checked result and architectural consequence |
| --- | --- |
| GX: socket close terminates subscriptions on both daemons (§wire, ownership table) | **Contradicted if read as daemon completion.** [E12 release](/.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md) x2/x6 holds quiescent sockets and loops; unsubscribe alone removes the registry. Local close and external completion need separate rows. |
| GX: close latency is the socket round trip, milliseconds | **Not proven.** `end()` half-closes; this daemon's reader can await a writer kept alive by a push-loop clone. Local `destroy()` plus `close` join is selected; no hard wall-clock claim under a stalled runtime. |
| GX: all incarnation loss is detected by socket loss | **Too strong.** [E03](/.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md) and [daemon delta](/.design/watchman/v2-readd/v2-readd4-watchwoman-delta0.glm53max.md) distinguish root retirement from connection loss; deployed root drop can be silent. Positive freshness and clock health checks remain useful. |
| GX: stock always emits a separate initial PDU | **Qualified.** [`subscribe.cpp` L269–276, 606–635](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/cmds/subscribe.cpp#L269-L276) suppresses empty nonfresh results. Acknowledgement, not a second frame, completes attachment. |
| GX: ancestor symlinks are invisible to every available primitive | **Overgeneralized.** [E10](/.design/watchman/v2-readd/v2-readd4-e10-symlink-sentinel0.glm53max.md) proves the immediate-parent event primitive is blind; a new `realpath(L)` observes stable current resolution. Polling is a policy with cost and latency, not impossible coverage. |
| GX: first-call Skill gate is the only sound solution | **True only for the tested clear/rebuild latch alternatives.** [E14](/.design/watchman/v2-readd/v2-readd4-e14-skill-lifecycle0.glm53max.md) test 7 demonstrates a missed slow initial attach; the retained-watch algorithm changes the premise and requires new tests. |
| GX: 34 clients prove negligible cost and no need for same-root serialization | **Not established.** [Pressure](/.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md) found no saturation in its cells and 3–10 duplicate cold root constructions. It neither proves universal negligible cost nor proves persistent damage. Serialization is selected to avoid measured redundant local work, not claimed necessary for clustered correctness. |
| Both: client-only literal matching reproduces Parcel | **Only with the exact algebra.** [E08](/.design/watchman/v2-readd/v2-readd4-e08-ignore-parity0.glm53max.md) uses logical absolute equality/containment and independently compiled glob regexes. `name` defaults to basename; daemon pruning must explicitly request `wholename`. |
| Astra: every external protocol problem should eventually park | **Policy revised.** No evidence says three failures establish permanent incompatibility. Daemon upgrades/permissions can change without host restart. Slow retry preserves recovery while bounding churn. |

### C1 — Initial query precedes tick registration

**[F, source]** Deployed [`subscribe.rs` L26–41](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/commands/subscribe.rs#L26-L41) runs `query::run` at L29, then installs the tick receiver at L40 and captures `start_tick` at L41. Its comment claims the opposite order. A mutation in the intervening interval can be absent from the initial query and precede the push loop's `since` tick. This is a source-supported loss-window hypothesis, **not a controlled timing reproduction from this writing round**.

**Decision: architecture constraint and targeted acceptance trace.** Owners scan after every installed readiness. Pre-install data is not a complete baseline and need not be retained. The post-readiness scan covers state that settled before observation installation; later events drive subsequent scans. No daemon patch is required solely to promise this eventual-snapshot contract. Exact event-history support would require stronger daemon ordering.

### C2 — Refused socket is unlinked before `no_spawn`

**[F, source]** [`cli.rs` L1261–1286](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/cli.rs#L1261-L1286) unlinks on ECONNREFUSED at L1271 and only then checks `no_spawn`. This is actually reachable by `get-sockname`: `run` routes ordinary commands into `run_client`, which builds the request and calls `send_and_print` → `connect_or_spawn` (L579–585, L881–918, `GetSockname` request at L970). It is not a special read-only local lookup.

**Decision: discovery constraint, eliminated rather than repaired.** GX's `--no-pretty get-sockname` can additionally spawn a detached daemon; even adding `--no-spawn` does not guarantee nonmutation. A retained/killed/joined locator child does not own or reverse those side effects. Core receives an explicit socket and never starts the locator. No new daemon experiment or patch is needed for that selected interface.

### C3 — Access/open becomes upsert, potentially feeding owner rereads

**[F, source]** Deployed [`watcher.rs` L48–58, 115–155](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/watcher.rs#L115-L155) uses the recommended notify watcher and converts every non-Remove event into an upsert. Its locked notify `8.2.0` registers `WatchMask::OPEN` and emits `EventKind::Access(Open(...))` ([local dependency implementation](file:///home/rektide/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/notify-8.2.0/src/inotify.rs#L349-L355), mask L425–432). [`Root.apply_changes` L300–340](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/root.rs#L300-L340) advances clocks and records upserts without an equality suppression. The relevant collector also remains at local tip `603f3b5`.

**[F, executed but narrower]** E09 saw directory-open upserts from watcher activity; E14 used scripted external signals, not real read-generated daemon traffic. Neither is a production-owner fixed-point test.

**Decision: mandatory real-owner quietness gate.** The predicted read → upsert → rescan loop is not declared reproduced here. If the gate reproduces it, Watchwoman `a1e16cbf` cannot be the enabled release composition under this design. Require separately authorized daemon correction and a new tested pin. Filter proven read-only notification kinds while preserving actual mutations; do not prescribe dropping every `Access` variant, because close-after-write semantics require review. Reject timestamp fingerprints, ignored scan windows, directory suppression, and debounce-as-proof. Stock passing does not silently substitute for the intended Watchwoman target.

## 5. Platform, startup, and external failure policy

### Platform/daemon matrix [P]

| Composition | Initial policy |
| --- | --- |
| Linux x86-64/glibc, Bun 1.4.2, Watchwoman `a1e16cbf` | Intended experimental release composition; mandatory new-implementation protocol, owner, quietness, and release gates. Not certified by the old transport's successful probes. |
| Same host, installed stock `54602bcad27e0887fd26f77c6747a38f0d701fc7` (`20260708.093114.0`) | Secondary live conformance. Always retain its differing acknowledgement/freshness/control shapes in deterministic tests. Do not advertise formal stock support from these partial checks. |
| Stock source `923b0935` | Primary source comparison; not the installed binary and not an executed exact-pin certification. |
| Watchwoman local tip `603f3b5` | Forward-shaped cancellation/queue fixtures, not a silently promoted deployment. |
| Node embedding / distributed Node CLI | Existing package probes do not certify the new implementation. Require actual transport/owner tests under Node 26.6.0 and distribution smoke under the CLI's 26.4.0 pin before claiming those compositions. |
| macOS, Windows, arm64, musl, unknown libc | Selected Watchman path refused for this first release. Default Parcel/Node paths unchanged. Future support needs host-specific live gates; no permanent impossibility claim. |

Core obtains a small internal host classification from runtime/build metadata; unknown libc does not default to glibc. No new public platform override. Programmatic callers and CLI share this check. Watchwoman's runtime version/build string cannot identify its Git commit; checksums belong in release records, not a daemon-family whitelist.

### Static errors versus changing external conditions

**[P]** Core decodes options once at configured-layer construction, even for JavaScript callers. Invalid selector/socket/integer constraints, unsupported enabled platform, and failure to load the selected module fail construction with `WatcherStartupError`. Do not convert known invalid configuration into a pending watch or an untyped hidden defect. Syntactic decode precedes disabled short-circuit; disabled skips host checks and backend I/O/imports. Socket existence is not a startup requirement.

All **demand-time external conditions** leave the logical stream pending before first install, or subscribed and stale during recovery. Retry while demanded; never synthesize healthy readiness while failing.

| Cause | Scope and selected disposition |
| --- | --- |
| ENOENT/ECONNREFUSED/connect reset, EOF/error, command timeout in full attachment | Shared availability circuit; root retires session; gated retry. Classification follows cause, not command label. |
| Socket EACCES, decoded daemon root rejection | Root retry with exponential 100 ms base, 30 s cap; rate-limited warning. Permissions/policy can change. |
| Explicit required capability `false`, malformed version/response/data, oversize frame | Retire; 60 s compatibility retry for that key, not permanent parking or immediate rapid cycling. Missing capability data is decode failure, not inferred support. |
| Root missing/dangling/non-directory | No socket per identity poll. Wait for path observer; invalidate once on an observed transition from a previously installed target. |
| Existing subscription canceled | Retire and root retry. No global outage inference merely from cancellation. |
| Detected same-`C` inode replacement | Block **subscription installation** until daemon-root identity changes; 30 s full admission probes, never root deletion. Detailed below. |
| Release/interruption/shutdown | Join cleanup; no failure counter or new retry. |

A successful installed generation resets root failure delay. Compatibility and ordinary root retries do not mutate availability epochs. A compatibility failure of the half-open probe releases its claim without counting a new availability failure. Diagnostics identify classification, scope, whether observation ever installed, retry delay, and corrective action; do not log full frame contents. Recovery emits a single transition log. No custom health endpoint is added.

## 6. Deep modules, interfaces, and dependencies

The external **seam** remains `Watcher.Native`. Its **interface** includes pending-first-attachment, reference sharing, readiness ordering, and joined release, not just a `subscribe` signature. The Watchman directory **adapter** supplies substantial **depth** at that seam; the other real adapters are existing Node/Parcel and the deterministic Native used by tests.

```text
packages/core/src/filesystem/
  watcher.ts                  existing Watcher / RcMap / W1, static selection
  watcher/watchman/
    options.ts                Core-owned schema/defaults and startup error
    directory.ts              deep adapter; controllers, admission, observation, cleanup
    session.ts                deep owned socket/framing/command-association module
    mapping.ts                internal pure logical path/ignore/expression implementation

packages/core/src/config/plugin/skill.ts       retained owner watch reconciliation
packages/server/src/options.ts                exported host types reference Core schema
packages/server/src/routes.ts                 single host-to-Core mapping
packages/cli/src/server-process.ts            environment decoding adapter

packages/core/test/filesystem/watchman/
  directory.test.ts           real Native/Watcher seam + controlled internal adapters
  session.test.ts             actual private Unix sockets
  mapping.test.ts             pure parity fixtures and real Parcel comparison
  topology.test.ts            real filesystem and pinned Bun rearm cases
  fixture/peer.ts             scripted Session adapter with fault barriers
  fixture/socket.ts           actual socket peer / isolated relay
```

The domain directory is not a pass-through stack. `options.ts` and `mapping.ts` are implementation files, not another pair of runtime services. Extract local path-observer code into another file only if it improves maintainability; do not make owners learn a `Sentinel` lifecycle. Tests can replace a Session/path observer internally without publishing constructors through Server or SDK options.

| Module | Small interface and external knowledge | Hidden implementation | Deletion test / test seam |
| --- | --- | --- | --- |
| Watchman directory | Scoped construction returns existing `NativeInterface`; directory demand pends until install; unsubscribe joins | Finite controller, all attempt ownership, topology observation, circuit/leases, subscription setup, invalidation and mapping | Removing it pushes daemon failure and path uncertainty into every owner. Main tests cross actual Watcher/Native, with internal controlled Session and path observations. |
| Owned Session | Scoped `open`, serialized typed `request`, terminal idempotent `close`; callbacks registered before connect | UTF-8/JSON framing, expected-response decode, PDU discrimination, byte bounds, deadlines and local socket release | Removing it pushes framing/physical resource details into controller tests. Production Unix socket and actual local peer fixture justify the seam. |
| Mapping implementation | Immutable compile plus row mapping, pure | Parcel literal/glob algebra, logical suffix validation, safe expression pruning | Locality for pure tests; no additional runtime ownership or required public service. |

### TypeScript interface sketches

These define selected types/ownership, not typechecked implementation. Imports in implementation use explicit `.ts`; named Effect imports and local namespace self-exports follow the package conventions.

```ts
type DirectoryOptions =
  | { readonly backend: "parcel" }
  | {
      readonly backend: "watchman"
      readonly socket: string
      readonly commandTimeoutMs?: number
      readonly maxConcurrentAcquisitions?: number
    }

declare const make: (
  inherited: Watcher.NativeInterface,
  options: ValidatedWatchmanOptions,
) => Effect.Effect<Watcher.NativeInterface, WatcherStartupError, Scope.Scope>

// Internal session seam. Command/result unions are decoded once here.
type Command =
  | { readonly type: "version"; readonly required: readonly string[] }
  | { readonly type: "watch"; readonly root: string }
  | { readonly type: "clock"; readonly root: string }
  | { readonly type: "subscribe"; readonly root: string; readonly name: string;
      readonly since: string; readonly expression?: Expression }
  | { readonly type: "unsubscribe"; readonly root: string; readonly name: string }

type Push =
  | { readonly type: "batch"; readonly subscription: string; readonly root: string;
      readonly clock: RootClock; readonly fresh: boolean; readonly files: readonly Row[] }
  | { readonly type: "canceled"; readonly subscription: string; readonly clock?: RootClock }
  | { readonly type: "state"; readonly subscription: string; readonly name: string;
      readonly direction: "enter" | "leave" }

type Delivery = { readonly frame: Push; readonly encodedBytes: number }

interface Session {
  readonly request: (command: Command) => Effect.Effect<Reply, SessionFailure>
  readonly close: () => Effect.Effect<void>
}

declare const open: (
  options: { readonly socket: string; readonly commandTimeoutMs: number },
  push: (delivery: Delivery) => void,
  lost: (failure: SessionFailure) => void,
) => Effect.Effect<Session, SessionFailure, Scope.Scope>
```

`Reply` is tagged by command type; no general `unknown[]` command interface or repeated schema checking in owners. Subscribe-reply decoding validates then discards merged rows and returns only installation metadata, so an async post-ack path check cannot accidentally retain the entire snapshot. `Delivery.encodedBytes` comes from the actual frame length for inbox accounting, not a second serialization of decoded rows. Data batches require fields, cancellation does not; do not inherit GX's sketch requiring `files` on every cancellation. State PDUs decode separately and cannot consume the current command. Unexpected state notifications do not create deferred-state policy; the chosen subscription uses no state defer/drop clauses.

**Dependency direction:** Schema → Core and Protocol; Core and Protocol → Server; Schema/Protocol → Client; Client/Core/Server → SDK. Arrows mean “provides a dependency to.” Server imports the Core option schema, never the reverse. Client runtime never imports Core/Server. The new host-specific `node:net` implementation loads dynamically only on the enabled selected path; workerd remains disabled. The only watcher-specific new runtime dependencies are the Parcel-compatible matcher libraries, not the fb-watchman transport or BSER codec.

## 7. Owned JSON session

### Why these bytes, and why this socket [P]

Use compact newline-delimited UTF-8 JSON with **array** request envelopes. Both daemons support it; accepted E02/E03/E09/E12 experiments already use JSON and stock [`PDU.cpp` L76–86, 115–145](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/PDU.cpp#L76-L145) identifies compact JSON and reads newline-delimited frames. The older installed stock binary can abort on object-form requests; never use those.

BSER and owned discovery are not inseparable. A BSER codec would remain viable with an explicit socket and the same lifecycle; retaining an already exercised codec is GX's strongest wire argument. I reject it here because no measured requirement justifies that additional dependency/type/framing surface for the selected rows. **[V]** New JSON throughput and artifact tests must pass; old BSER measurements do not prove them. Do not estimate the transport at “~200 lines” as evidence of ownership completeness.

Core accepts an explicit Unix socket pathname. CLI maps `OPENCODE_WATCHMAN_SOCKET`, else `WATCHMAN_SOCK`, into it. SDK/direct Core callers set it explicitly. No locator, binary option, shell, unlink, or daemon process is owned or invoked. External socket activation on connect is the service manager's behavior, not a child OpenCode claims to join.

### Physical protocol rules

1. Register cleanup and all connect/data/error/end/close handlers before connection starts. A Session object is single-use; it never reconnects after any terminal event.
2. One FIFO/permit controls requests. No second opaque raw-client FIFO. Permit waiting is interruptible; deadline begins when bytes are submitted. Connection itself uses the configured deadline. Handle write backpressure; a failed/stalled write closes rather than queuing another request behind ambiguous partial submission.
3. Interruption **after submission** closes the whole Session. A response must never be orphaned so that a successor request consumes it. Single-key sockets make this cancellation policy local.
4. Remote EOF/error, deadline, parse/framing error, and explicit close set a synchronous terminal flag **before** settling callbacks or notifying the controller. Settle once, reject later requests, destroy the socket and await local `close`; clear timers/queued waiters and decoder retention.
5. Repeated close joins the same completion. A close listener registered from construction also handles connect failure before the Session returns. `socket.end()` alone is not completion; do not wait for peer FIN on the destruction path.
6. Cleanup finalizers use the same operation. No detached unsubscribe task, locator completion compensator, or timeout that abandons an unclosed owned socket.

### Response association [P]

Validate unknown values once in Session with Effect Schema JSON decoding. Recognize typed shapes, not merely a top-level key:

| Frame shape | Association |
| --- | --- |
| `unilateral:true` plus supported data/state/cancellation shape | Unsolicited push; never takes a request slot. |
| Watchwoman-tip `{subscription, canceled:true, clock?}` without `unilateral` | Unsolicited cancellation; files/root/version are not required. |
| Pending unsubscribe, matching `{subscription, unsubscribed:boolean}` | Watchwoman command reply, not a push. |
| Pending stock unsubscribe `{unsubscribe, deleted:boolean}` | Stock command reply. |
| Pending command's expected response, including subscribe's merged files | Typed command reply. `subscribe` and `subscription` are different fields. |
| Ordinary `{error:string}` with any requested capability booleans preserved | Typed rejection for current command, not proof of transport failure. |
| Otherwise valid unsolicited unknown subscription name | Drop without changing the active request. |
| Unassociated ordinary frame / malformed claimed push | Protocol failure; retire. Do not advance FIFO speculatively. |

No `get-log`, logging subscription, trigger, state-management command, or arbitrary passthrough. The old package's classifier failure is a regression scenario, not a reason to expand the command surface.

### Framing and mailbox bounds

**[P]** Limit any input JSON frame to **16 MiB encoded bytes**, enforced incrementally before unbounded concatenation. Decode UTF-8 strictly; actual newlines delimit frames, escaped newlines remain filename characters. Test split multibyte sequences, split delimiter, multiple frames in one chunk, invalid encoding, giant complete and unterminated frames. Unsupported non-UTF-8 filenames receive no byte-perfect path promise through this string interface.

There is no retained pre-install row buffer (§8). After install the controller keeps at most **4,096 queued rows or 4 MiB of retained encoded-frame payload**, whichever is reached first. Account whole retained frames rather than pretending exact JS heap bytes are known. If a frame cannot fit, drop pending data and replace it with one private invalidation marker, then accept later data only after that marker's sequence. Reject malformed data, but overflow of otherwise valid pending data is not a reconnect trigger.

Control slots are separate and coalesced: one terminal cause, one latest topology result/dirty bit, one current command outcome, one wake, one freshness/overflow marker. Release fences synchronously outside the backlog. Callbacks never wait for a consumer; they enqueue/coalesce. Do not solve pressure by pausing reads indefinitely against deployed Watchwoman's unbounded outbound queue.

Transient JSON parse/schema allocation is proportional to one bounded frame and can exceed its encoded byte count; runtime socket buffers are additional. Existing W1 downstream PubSub is unbounded, so **this is not a total process-memory bound**. These are explicit assurance limits, not GX's O(1)-per-root claim.

## 8. Controllers, installation, and finite transitions

### Identity and atomicity

Each physical key has a lifetime ID, target epoch, connection generation, finite phase, child scope, installation Deferred, session/worker ownership and bounded inbox. Subscription names contain a random backend-run nonce and controller/generation counters. No name or reconnect cursor is reused.

The backend separately owns a circuit epoch and active same-`C` lease table. Daemon `RootClock` is the supported `c:<start>:<pid>:<root>:<tick>` form decoded into string components; the first three identity components distinguish a daemon-root record, the tick is used for immediate `since`. Do not conflate these three sorts of epoch.

One controller worker serializes transitions. Socket callbacks perform only terminal latching or bounded inbox operations, never path publication. Each async completion carries its generation/target tokens; apply only if current. Immediately before calling `publish`/`invalidate`, recheck release/retirement fences. Effect rc.112 may resume a Deferred synchronously, so mutate state before completing it. Async workers own any session they produce until installation accepts it; ignoring a stale result is not resource disposal.

### Scope-free Native with pre-return ownership

The configured backend captures its layer Scope. Within a short interruption mask, each directory demand creates/registers an owned child controller scope and idempotent `stopAndJoin` before starting any path or socket work. The pending Native effect installs interruption cleanup, restores interruption while awaiting first install, and on interruption calls the same stop operation. A successful return transfers a captured release Promise to upstream RcMap's acquire/release registration under the masked transfer seam.

The controller worker must live in the controller/backend scope, not in the short acquisition fiber. A worker does not close a scope that requires it to join itself: release is driven by the outside owner. Captured finalizer ownership covers both “Native never returned” and “last logical reference released.” Stop completion unregisters controller ownership so released controllers do not accumulate.

On backend shutdown, first fence backend and all registered controllers synchronously, then start every stop before joining any. This makes shutdown independent of upstream RcMap's sequential finalizer ordering. Cleanup operations are idempotent if RcMap and backend scope both initiate them. **[V]** Prove the transfer interval through actual RcMap cancellation, not only by calling a returned Subscription.

### Attach sequence [P]

```text
resolve logical L to current canonical C and root identity
take same-C lease, then shared admission; recheck epochs/demand/path
connect explicit socket
["version", {"required": requiredCapabilities}]
["watch", C]                    => exactly C; no adopted ancestor root
["clock", C]                    => new current RootClock
check any outstanding root-replacement record
register expected unique subscription name before submission
["subscribe", C, name, {
  "since": currentClock,
  "fields": ["name", "exists", "type"],
  ...optionalLiteralExpression
}]
valid matching acknowledgement
recheck logical target identity
atomically install current generation; arrange readiness/invalidation
release attachment leases; then accept subsequent data
```

`version` requires command/field capabilities actually used. Add `term-not/term-anyof/term-name/term-dirname` only for literal pruning, and `term-false` only for a whole-root exclusion. No cookie wildcard capabilities. Missing explicit capability becomes slow compatibility retry; no version-string synthesis or unsupported-daemon-family blacklist. Plain-watch response must equal captured `C`; contradictory `relative_path` is not routed.

**Snapshot-first installation:** discard all data batches while attaching, including Watchwoman merged acknowledgement rows and any pre-ack push rows. Parse/validate their envelope and row shape, but retain no row list for later publication. A matching cancellation, transport loss or malformed frame still defeats installation. Every first logical subscriber invokes its own readiness after its queue attaches. Every replacement installation enqueues invalidation before opening the post-install data gate. This deliberately trades event-detail replay for a smaller, truthful snapshot contract.

Data that arrives after ack but before the final async path check is also pre-install data. The later readiness scan covers that interval. First-generation publication before any logical subscriber can be lost; every owner readiness must repair it. Stock's optional separate initial PDU arriving after installation is ordinary data and can cause a redundant rescan; no unreliable “first push must be the snapshot” heuristic suppresses it.

### Finite state/transition model

```ts
type Phase =
  | { readonly type: "resolving" }
  | { readonly type: "waiting"; readonly reason: "path" | "admission" | "retry" }
  | { readonly type: "attaching";
      readonly stage: "connect" | "version" | "watch" | "clock" | "subscribe" | "check" }
  | { readonly type: "installed" }
  | { readonly type: "retiring"; readonly next: "resolve" | "retry" | "root-replaced" }
  | { readonly type: "root-replaced" }
  | { readonly type: "released" }
```

| Phase / input | Atomic action and next state |
| --- | --- |
| Resolving; existing directory observation | Capture current `L/C/dev/ino`; enter admission wait. |
| Resolving; absent/dangling/non-directory | Wait on path observation, with no socket construction per poll. |
| Waiting; admitted current candidate | Recheck all tokens after leases; start one attach worker. Stale candidate gives back leases without connecting. |
| Attaching; stage reply | Advance one stage. Failure follows classified retirement; current worker retains cleanup ownership. |
| Attaching; data/freshness before install | Validate, discard data, fold uncertainty into mandatory readiness. Never publish early. |
| Attaching; ack plus stable final path check | Install state first; first Deferred or replacement invalidation; open data gate; release admission. |
| Attaching; ack/result stale or release intervened | Never install. Close/join produced session and worker before releasing admission. |
| Installed; current ordinary batch | Validate routing, map/filter and enqueue/publish under current fence. |
| Installed; `fresh:true` | Invalidate before its rows; keep the live subscription. `false` proves no continuity. |
| Installed; same-root heartbeat clock | Remain installed. No readiness merely for a tick change. |
| Installed; heartbeat root identity differs / heartbeat rejection | Retire and attach anew. No string-error taxonomy is required; a reachable rejection stays root-local. |
| Live; matching cancellation, EOF/error, deadline, malformed input | Fence data and retire once; then cause-specific retry. Cancellation wins over a later ack. |
| Live; `C` retargets | Target epoch advances before retirement; drop stale data; resolve destination. Replacement readiness repairs old/new state. |
| Live; target becomes absent | Advance epoch; invalidate once if previously installed; retire and wait for path. Repeated absence is inert. |
| Live; same `C`, `(dev,ino)` replaced | Record old daemon-root identity, fence affected local controllers, invalidate once, retire into root-replaced. |
| Root-replaced; admitted probe sees same daemon-root identity | Do not subscribe. Close/join, retain replacement record, retry at 30 s. |
| Root-replaced; probe sees new daemon-root identity and stable current path | Allow full attachment. Clear replacement record only on accepted installation; owners rescan. |
| Retiring; owned session/worker joined | Release leases, enter selected successor state. Duplicate terminal inputs have no effect. |
| Waiting retry; current timer | Resolve/admit again. Timer expiry alone never constructs a client without demand. |
| Any; final demand release/backend stop | Synchronous absorbing release fence; stop all work and join; released. |
| Released; any input or repeated stop | Drop/no new work; return cached stop completion. |

All stale-token inputs are inert after disposing any newly produced resource through its owning worker. Duplicate wakes, unchanged path observations and repeated terminal notifications do not cause additional transitions. A current command completion in a stage that did not submit it is an internal/protocol association failure, not an implicit success path.

At most one attach worker and one owned session exist per controller; no successor connects until its predecessor has locally closed and joined. Root-replacement probes use the same admit sequence through `watch→clock`, but skip subscribe until the old-root identity test passes. `watch` is allowed to register an absent root, never to delete an existing one. Retargeting to a different canonical directory uses normal attachment; the old canonical root's replacement record remains until repair or backend shutdown.

## 9. Admission, circuit, and bounded recovery work

**[P]** One backend runtime owns the acquisition budget, not the entire operating-system process regardless of embedded runtime count. One session per physical key avoids head-of-line blocking across roots and makes interrupted request cancellation independent. Different ignore plans/logical aliases do not consolidate simply because `C` matches; existing RcMap remains the only desired-interest registry.

Default **four permits** cover the complete `connect→version→watch→clock→subscribe→final path check` attempt, including failed-attempt physical cleanup. Waiting on the permit is interruptible and has no command-response deadline. An already-installed heartbeat is not a new acquisition. A pathological daemon whose clock or subscribe never replies cannot accumulate arbitrarily many attaching sockets outside the bound, unlike a prefix-only budget.

Take a backend-local same-`C` lease before occupying a global expensive-work permit. This serializes cold registrations from this runtime, including different logical keys; it neither owns daemon roots nor prevents another process racing. A small record stores current local root witnesses/refcounts and waiters. Healthy records disappear when their last active local controller releases; unresolved replacement records alone persist until repaired or backend shutdown. Cardinality is **O(active canonical roots + unresolved replaced roots)**, not all historically visited healthy roots.

### Availability state machine

```text
Closed(epoch)
Open(epoch, attempt, eligibleAt)
HalfOpen(epoch, attempt, owningCandidate)
Stopped
```

| Input | Circuit transition [P] |
| --- | --- |
| Current ordinary admitted attachment has an availability failure | New epoch Open, attempt 0; wake waiters only after state mutation. |
| Open deadline | Admission becomes eligible; timer never constructs work itself. One demanded candidate claims HalfOpen. |
| Current owning probe installs a subscription, or ends in a decoded reachable root rejection | New epoch Closed. An intermediate version/watch success is not full-attach success. Root rejection is retried locally. |
| Current probe availability failure | New epoch Open, attempt incremented with capped delay. |
| Probe released, retargeted, interrupted, or ends in compatibility failure | Release its claim after joined cleanup; reopen at same attempt. Do not count cancellation as outage. |
| Any stale candidate outcome, positive or negative | Cannot mutate a newer circuit. A still-current controller may keep its successful local attachment; circuit freshness is separate. |
| Backend shutdown | Stopped; fence before waking/canceling all claims, waiters and timer. |

Candidate claim and permit acquisition have finalizers covering interruption even in the gap between them. Validate both tokens after taking the final permit; do not send a new command based on stale admission. Circuit/transition critical sections never span asynchronous I/O; same-`C` and admission leases deliberately cover the attempt and its cleanup. One attempt completion reports its classified outcome to the circuit; duplicate socket-loss and command-failure messages cannot report it twice.

Availability failures include submitted command timeouts **at every attach stage**, not only errors tagged `operation:"connect"`. A decoded error response is reachable-daemon evidence, not a transport outage. Installed-session loss retires locally; its next failed full attachment supplies shared admission evidence, rather than every transient live EOF immediately tripping all roots.

The shared delay is `min(2_000, 100 * 2^attempt)` ms with capped counter, no jitter. Ordinary root rejection uses the same base with 30 s cap; compatibility problems use 60 s between attempts. A root waits until its local eligibility and the shared circuit both permit work. Fixed delays are selected because one runtime has bounded admission and one probe, **not because deterministic tests prohibit injected jitter**. Multi-process randomized coordination is a future measurement-driven extension, not implied by this circuit.

The two draft0s correctly reject the donor's stale positive closing a newer Open state ([E11 races](/.design/watchman/v2-readd/v2-readd4-e11-circuit-races0.glm53max.md)). This invariant applies to state mutation, not a demand to destroy useful locally current work merely because some other root opened the circuit.

## 10. Event mapping, ignores, and target observation

### Logical/canonical mapping

Only two path namespaces exist: `L = path.resolve(input.target)` is the physical key's logical spelling; `C = realpath(L)` belongs to the target epoch. The successful plain-watch response must equal `C` ([E02](/.design/watchman/v2-readd/v2-readd4-e02-watch-roots0.glm53max.md)). Do not retain a third `D` field just to assert `D === C` at every call.

Require a nonempty relative POSIX entry name, valid string fields, no NUL, no absolute form, and no escaping `..`. Resolve/check component containment under `C`, map the accepted suffix under `L`, and never realpath an event path that may already be deleted. Backslash is a Linux filename character, not a path separator to silently rewrite. Root-self/empty-name rows outside the admitted dialect cause a protocol error, not a fake root update.

| Row/control/path case | Output or action [P] |
| --- | --- |
| `exists:true`, file/directory/symlink | `update` at `L/suffix`; kind does not filter visibility. |
| `exists:false`, including directory tombstone | `delete` at `L/suffix`. |
| Directory-only subtree move | Deliver both visible old/new directory paths; owners rescan. Never synthesize missing children. |
| `new`/inode/cclock fields | Not requested; no create/update branch or identity cache. |
| Cookie-prefixed basename at any depth | Drop client-side. Do not request daemon cookie wildcard filtering. |
| Literal/glob ignore matches logical path | Drop regardless of row kind/existence. |
| `fresh:true` on installed subscription | Invalidate before rows, retain subscription. False/omitted freshness never establishes continuity. |
| Ack or data before installation | Decode then discard data; mandatory installation readiness replaces uncertain detail. |
| Pending-data overflow | Replace pending data with private ordered invalidation; do not reconnect. |
| Root/path disappears or detected old generation is replaced | Private invalidation at the specified transition; no fake public path update. |
| Wrong active root, escaping path, malformed required field | Retire as protocol failure. Valid unknown/old subscription name is simply ignored. |

### Exact caller ignore semantics

**[F]** Parcel 2.5.1 classifies with `is-glob@4.0.3` and compiles each glob using `micromatch@4.0.8` with `{ dot:true, lookbehinds:false }`. Reuse those behaviors and compare against the actual Parcel wrapper; do not replace independent regex predicates with ordered include/exclude list semantics.

**[P]** Compile one immutable filter per physical key. Non-glob `v` becomes `I = path.resolve(L,v)`; ignore a logical event equal to `I` or component-below `I`, without stat/realpath/existence checks. A sibling literal outside `L` is inert; an ancestor literal containing `L` excludes all events. Absolute canonical spellings need not match when `L != C`. Globs match the entire POSIX `L`-relative suffix. Config's literal plus `**/{node_modules,.git}/**` combination must pass the exact parity fixture.

For traffic reduction only, proper contained literal suffix `s` becomes `anyof(name(s,"wholename"), dirname(s))` under `not`; whole-root exclusion is `false`; unrelated outside-root literals contribute nothing. Never use empty `dirname`. Omit the expression entirely when there is no safe literal reduction. General globs remain client-side. Probe only the terms actually sent; exact pinned registration is evidence, not a reason to assume arbitrary installed binaries support every future term.

Client cookie filtering is a substantive GX simplification: deployed Watchwoman already removes all cookie-prefixed basenames before expression evaluation; stock may expose foreign cookies. Correct local filtering provides the selected semantic contract without another wildcard dialect. Daemon `ignore_dirs` or tip global policy can prune data upstream; this adapter cannot reconstruct data excluded by external daemon configuration.

### Stable-target observation [P]

Every demanded directory observes its logical root and immediate parent. Use async `realpath`/metadata with bigint `(dev,ino)` only for root/parent identities—not file classification. One in-flight observation plus a dirty bit coalesces callbacks. A periodic **one-second** identity check runs while demanded; it is neither a recursive scan nor content polling.

An immediate-parent `fs.watch` accelerates matching-basename, absent-filename, self-event and error rechecks. If the parent identity changes or disappears, close the obsolete handle **before** arming its replacement. A missing parent retains no zombie watcher; periodic resolution continues. Scope owns the handle before it can emit. Joining an uncancelable filesystem call may delay release; fence its result and await physical completion rather than pretending cancellation ended the operation.

The periodic probe is what supplies bounded-rate eventual detection of ancestor retarget and silent parent death. E10 does not prove that new observer; **[V]** exact Bun 1.4.2 tests must. Detection latency is a poll interval plus filesystem/event-loop scheduling, not a hard deadline. A native sentinel deafened by another stale watcher cannot defeat the independent periodic path checks, but coexistence tests with inherited Node file/entries watches are mandatory.

| Topology | Selected coverage / limit |
| --- | --- |
| Final-component logical symlink → another stable target | Supported; epoch fence, fresh attachment, readiness rescan. Improves on Parcel Linux's final-component rejection. |
| Ancestor symlink with logical `L` retained | Supported eventual stable-target detection via full realpath sampling. Event-only immediate-parent watch cannot supply this. |
| Dangling root or missing/recreated parent | Wait/probe without socket churn; close-before-rearm. New target at another `C` attaches normally. |
| Same `C`, different root `(dev,ino)` after this runtime observed it | Do not claim same-path rewatch fixes a stale daemon root. Block install until daemon clock identity changes. |
| Same-root daemon record silently removed | A **30-second clock heartbeat** detects rejection/new daemon-root identity; retire and reattach. Tick changes alone do not mean loss. |
| Rapid A→B→A between observations | Intermediate states may be coalesced. No every-transition or instantaneous no-old-path publication guarantee. |
| Child symlink target contents outside root | Owner must discover an explicit watch; not generically followed. |
| Stale daemon root predating this runtime; inode reuse; arbitrary silent push/kernel failure | Not proven detectable. Clock proves root registration, not completeness or push-loop liveness. |

### Replacement records and recovery without hidden pruning

When an active observation sees same-`C` root inode replacement, retain the previously accepted `(dev,ino,daemonRootID)` in a backend replacement record and fence all local controllers of that `C`. The new-root probe must see **a different daemonRootID** and then revalidate the current path identity before it can subscribe/install. A daemon restart, deliberate operator root rebuild, or daemon-owned root retirement may supply that condition. This avoids draft0's restart-only recovery lockout while refusing GX's implicit successful same-root repair.

The record survives physical-key release/recreation, so an owner cannot accidentally clear known uncertainty by dropping a reference. Only successful verified installation or backend shutdown clears it. OpenCode sends no root-deletion command and writes no probe file. When no active controller references a healthy root, discard its ordinary witness; inability to prove old daemon state after a later fresh demand is an explicit pre-existing-stale-root limitation.

Every installed session sends `clock C` at most once per 30-second interval, with one pending heartbeat and normal command deadline. Do not postpone it forever merely because data arrives; it tests continued root identity, not traffic rate. A changed identity causes a new generation and readiness, even if a prior positive-freshness frame already caused a scan. That occasional redundant recovery is preferable to assuming an old route still names the current root.

### Owner topology remains visible

Config and configured Plugin Source pass logical roots and benefit from this observer. At the canonical pin `ConfigWatch.plan` already keeps parent-entry watches for roots (`file !== directory` in its exclusion predicate); do not change the planner to fix an erroneous claim that those watches do not exist.

Skill canonicalizes recursive roots and watches the logical spelling separately as a Node file. The backend cannot recover an alias it was never given. **Hidden ancestor-symlink retarget for Skill remains unsupported in this release**; direct logical-entry changes retain the existing auxiliary file-watch behavior. The retained Skill algorithm changes lifetimes/readiness, not this domain topology. Supporting that hidden alias later requires a deliberate owner topology change, not undocumented Watchman placement metadata.

## 11. Convergent Config, Agent, Command, Plugin, and Skill owners

### Generic W1 and reusable W2

Keep W1 unchanged: logical queue attaches before initial readiness, invalidation replays readiness sequentially, and invalidation is filtered out of the public update stream. Retain useful W2 production hunks:

```ts
type Change = Watcher.Update | { readonly type: "invalidation"; readonly path: string }
```

Config readiness publishes this invalidation at the logical target then requests its existing debounced reload. Agent/Command/auto Plugin Source branch on invalidation before source-path predicates; otherwise root uncertainty can be discarded for not being an `agents/` or `commands/` child. Keep existing directory-inclusive exact predicates. Configured Plugin Source readiness emits its existing configured-change signal. Preserve its append-only watched-target set in this feature and document the lifetime-distinct-target resource cost; changing that registry is unrelated to backend installation.

**[F]** [O5](/.design/watchman/v2-readd/v2-readd4-owner-directory-signal0.gpt56solxh.md) proves directory-only operations are real owner signals; LocationWatcher/VCS/app file-tree consumers do not depend on these recursive subscriptions at the pin. Do not add create identity to satisfy those unrelated consumers.

### Skill: keep subscriptions, make first readiness useful

**[P]** Replace the unconditional initial `FiberMap.clear(watches)` in `refresh` with owner-local desired-key reconciliation. Keep source resolution, URL pulling, canonical roots, auxiliary logical file watches, external SkillFile target adoption, scan/parsing behavior, activation scope, and existing refresh semaphore. No Watchman imports in Skill.

One serialized refresh performs:

1. Create a refresh-local desired-key set. Pass its collector through `load`/`watchDirectory` rather than store mutable “current refresh” state in watcher callbacks.
2. Existing `watch(target,type)` calls record their normalized key. Retain a live FiberMap fiber for an existing key; create only missing ones. Every new watch supplies `onReady = notify(target)` with **no first-call suppression**. The Skill changes consumer is attached before any initial scan or watch start.
3. Run the normal source scan. External resolved directories discovered during scanning add desired keys too. If the existing `firstMissing` recursion removes a temporary file watch, remove its key from this refresh's desired set as well.
4. Reconcile obsolete keys only after complete discovery. Because current `pull`/scan helpers catch failures as empty results, explicitly track discovery completeness for this purpose: a failed pull/scan is not an authoritative empty watch plan. On incomplete discovery, keep old watches in addition to newly discovered ones; do not prune from an incomplete set. Preserve current user-facing load/error behavior.
5. Await removed FiberMap fibers' release, commit the normal skill list, then use the existing reload path. Readiness/updates during the scan remain queued for the next serialized refresh.

First attachment may finish after initial content loading; its readiness then requests a repairing scan. If it finished earlier, one extra coalesced scan is harmless. Unchanged watches survive that scan and cannot generate new first-readiness events merely because the owner refreshed. Under stable source discovery and no self-generated daemon mutation signals, this reaches a fixed point.

This is more than a latch patch but less than a new watcher registry: it reuses the existing FiberMap at the domain owner that already decides desired watches. It also avoids every sole-owner rescan manufacturing another retained Watchwoman session. The accepted first-call gate remains a valid narrower design if the human explicitly accepts the demonstrated slow-attach gap; this draft does not.

**[V]** Prove actual Skill fixed-point behavior with delayed initial attach, event during scan, replacement while scanning, shared/sole physical ownership, obsolete/external targets, failed discovery, source removal, and activation disposal. E14's 15 scripted tests certify a different algorithm, not these changes. Independently prove real read/quietness on the daemon; retained subscriptions remove the readiness loop, not the source-predicted read/upsert feedback.

## 12. Joined local release and external daemon retention

### Release procedure [P]

On final demand removal, atomically fence the controller and data route. Stop retry/path/heartbeat admission. If subscribe was acknowledged, the socket is still healthy and no request is active, allow **one unsubscribe attempt with a 500 ms absolute cleanup budget**. This request is cleanup-only: its response cannot publish or schedule recovery. It is never queued behind an incumbent command. Otherwise skip it and close immediately.

At reply/rejection/budget expiry, terminally close the Session with `socket.destroy()` and await its local `close`. Cancel/join the path observer, timer/worker scopes, command waiters and attach work, release leases, and resolve the cached stop Promise. Finalizer interruption cannot abandon this join. If a filesystem operation cannot be canceled, fence its completion and await it; no hard deadline pretends the operation vanished.

Do not issue a graceful unsubscribe after a socket/protocol failure, timeout, or submitted-request interruption on an ambiguous stream. Use it on ordinary healthy final release and healthy retarget retirement only. When retirement precedes successor attachment, the same owner joins it first. Backend shutdown starts all controller stops before joining, so optional grace periods overlap rather than serialize across RcMap entries.

The explicit latency contract is **at most 500 ms of voluntary daemon waiting plus actual local close/join/filesystem/scheduler completion**. Incumbent 60-second command deadlines are not on the release path. A broken runtime may still fail to finish close; a test watchdog can record/terminate its private test process but cannot count that as a successful finalizer.

### Ownership/release ledger

| Resource | Owner / acquired when | Release and join | Proven completion would mean |
| --- | --- | --- | --- |
| Logical queue and RcMap reference | Existing logical subscription Scope | Stream finalizer releases one reference | That logical subscriber is detached, not that other consumers should stop. |
| Physical signal PubSub/key | Existing RcMap entry Scope | Final reference/shutdown; awaits Native unsubscribe | W1/key lifetime ends after owned Native cleanup. |
| Controller child Scope and installation Deferred | Backend, before first path/socket work | Same `stopAndJoin` before Native return and after it | No controller/attach/retry worker owned by this demand survives. |
| Same-`C` lease / global permit | Active attempt | Interrupt waits or finish joined attempt cleanup, then release | No stale candidate retains admission or launches work afterward. |
| Circuit timer/claims | Backend Scope | Stop/fence, cancel and join | No backend probe after shutdown; root release need not stop a timer useful to others. |
| Heartbeat/retry timer | Controller Scope | Cancel and join on retire/stop | A stale wake cannot reattach. |
| Parent FSWatcher | Path observer | Fence, close-before-rearm, join observer/handle termination | No backend-owned sentinel remains live; unrelated Node watches are separate. |
| Async identity read | Path observer | Fence result, await operation/worker completion | No late observation mutates state; slow filesystem may delay join. |
| Unix socket/decoder | Session bracket, before connect | Terminal flag, destroy, await local close; clear handlers/retention | Local FD and callback/decoder ownership gone, not external daemon completion. |
| Request slot/queued waiter/deadline | Session | Exactly-once settlement and timer cancellation | No stranded Promise/Effect or FIFO misassociation. |
| Name route/pending data | Controller | Fence/remove before cleanup I/O | Delayed push cannot publish. |
| Optional unsubscribe | Stop operation | One joined attempt, absolute 500 ms budget | Acknowledged registry removal only where the daemon implements it; no invented push-loop cancellation. |
| Locator or spawned daemon | None | Not applicable | No child exists to outlive the controller. |
| Active root witness | Backend with local refs | Remove after final healthy reference | O(active roots); no healthy historical-root retention. |
| Unresolved replacement record | Backend | Clear on verified changed-root install or backend stop | Known uncertainty cannot disappear through a reference cycle. |
| External subscription/push task/accepted FD | Daemon | Its own disconnect/write/root-retirement behavior | Not joined or guaranteed freed by local close. |
| Daemon root/index/kernel watch | Daemon policy/operator | GC, explicit operator action or process exit | Never automatically pruned by OpenCode. |

**[F]** E12's x5/x6 show unsubscribe is registry-only and delivery continues; x7 shows it can enable stale-root GC by reducing subscription count to zero. This is why I reject GX's “never unsubscribe” even though it simplifies one branch. Its benefit is limited, not nonexistent. Without unsubscribe, quiescent retained registry entries can block stale GC; with unsubscribe, accepted FDs/push loops can still remain until a write failure and later tick or root drop.

Unique names prevent collisions with retained work but do not free it. The shared circuit limits live local attachment concurrency/rate, not total daemon residue accumulated over repeated outages. Retained Skill watches reduce avoidable churn; they do not fix the daemon lifecycle. A zero-retained-daemon-session product promise requires a separate Watchwoman fix, not a more elaborate local finalizer. Never generate user-root writes or send `watch-del` to make release metrics look green.

## 13. Static options, defaults, and the generation seam

### Selected host shape

```ts
// Core-owned schema expands/validates defaults at layer construction.
type WatcherOptions = {
  readonly enabled?: boolean
  readonly directory?: DirectoryOptions
}

// Extension to exported ServerOptions.fs, not Protocol/config.json.
type FsOptions = {
  readonly filewatcher?: boolean
  readonly fff?: boolean
  readonly watcher?: DirectoryOptions
}

Watcher.configured({
  enabled: options.fs?.filewatcher,
  directory: options.fs?.watcher,
})
```

| Option | CLI environment adapter | Default / exact validation [P] |
| --- | --- | --- |
| Existing enabled flag | Existing disable-variable behavior | Preserve existing precedence; false skips backend imports/host checks/I/O after new-option syntax decode. |
| `fs.watcher.backend` | `OPENCODE_WATCHER_BACKEND` | Absent → Parcel; exact `parcel`/`watchman`, unknown string fails. |
| Watchman `socket` | `OPENCODE_WATCHMAN_SOCKET`, else `WATCHMAN_SOCK` | Required when selected; nonempty absolute Unix pathname, no NUL; no existence check. Explicit OpenCode value wins, even if invalid. |
| Watchman `commandTimeoutMs` | `OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS` | 60,000; complete decimal integer, 1–600,000. Not permissive `parseInt` of a prefix. Applies per submitted command and initial connect, not permit waiting. |
| Watchman `maxConcurrentAcquisitions` | `OPENCODE_WATCHMAN_MAX_CONCURRENT_ACQUISITIONS` | 4; integer 1–64. Covers full attachments. GX's alternative env spelling is not additionally supported. |
| Binary/discovery | None | Reject an explicitly supplied obsolete binary setting on selected Watchman with guidance to use socket. No silently ignored apparent override. |
| Retry, heartbeat, identity poll, cleanup grace, frame/inbox limits | None | Internal constants in this design; tests inject Clock/peers, not public user tunables. |

Unknown fields in the new discriminated options object are rejected. Do not broaden validation of unrelated historical Server fields. Default/explicit Parcel ignores unrelated ambient `WATCHMAN_SOCK`; its existence does not select the backend. SDK/direct Core do not read CLI environment. Selected disabled Watchman still needs syntactically valid supplied options, but never connects or rejects the disabled platform.

**[F]** [E18](/.design/watchman/v2-readd/v2-readd4-e18-server-options0.gpt56solxh.md) shows Server currently accepts a typed options object without runtime decoding. **[P]** CLI owns string conversion, Core configured-layer construction owns one semantic decode for every caller, Server references the Core schema and maps once. A type annotation is not validation and there is no second competing Server decoder.

Core/Server exported option types and inherited SDK `CreateOptions` change. This is **off wire, not private**. No Protocol `HttpApi`, concrete Server `Api`, `/api/server`, `/api/config`, OpenAPI or generated Client changes are selected. Therefore no client generation is expected. If implementation deliberately widens that wire surface, it changes scope and must run `bun run generate` from `packages/client`; never edit generated outputs directly.

The CLI's managed server captures its configured service environment at startup; an already elected background server does not change backend because a new client has different environment. Desktop's direct ensure path does not automatically gain the CLI's persisted environment overlay. SDK callers use explicit options. Workerd remains `filewatcher:false` and never loads host sockets. Document these existing distinctions without unrelated platform behavior changes.

## 14. Carrier disposition and implementation sequence

### Preserve, then carry logically

| Existing material | Disposition [P] |
| --- | --- |
| W1 `620fc620` watcher signal/readiness/test | Keep as an independently useful generic change; reverify on selected base. |
| W2 Config/Agent/Command/Plugin Source production hunks and test controls | Reuse audited mechanics, add missing actual Config fan-out/coalescing coverage. No claim the whole dirty slice is green. |
| New supervisor reacquisition test in W2 | Rewrite explicit timing/barriers and stale-command disappearance assertion. Preserve intended actual-supervisor behavior. |
| Skill | Add retained-watch reconciliation and every-readiness notification; first-call gate is historical alternative, not adopted code. |
| Old scripted actor and three self-tests | Preserve historical file; extract useful fault barriers into a new Session peer fixture. It does not prove raw framing, child ownership, release or daemon retention. |
| Donor root/circuit/filter/controller implementation | Source precedent only; do not bulk carry behavior contradicted by the new choices. |
| v3/v4/dirty-v4, journals, prompt0, both draft0s | Historical inputs. No overwrite, deletion, prompt1, or implicit implementation authority. |

E19's historical 64/64 W1 run, 55 pass plus one timeout for W2, and actor 3/3 remain those observations, not this draft's test results. Existing README/link changes in the old research workspace are untouched.

### Logical commits after human acceptance

No work below is executed by this writing assignment. Commits are scoped logical changes, without time estimates or pushes.

1. **`refactor(core): retain ordered watcher readiness`** — carry W1 when needed, exact logical-subscription ordering tests.
2. **`refactor(core): propagate config observation invalidations`** — selected W2 mechanics plus real Config fan-out/coalescing test.
3. **`test(core): correct plugin source recovery assertions`** — repair the existing supervisor TestClock/barrier/old-generation test independently.
4. **`refactor(core): retain skill watches across refreshes`** — desired-key reconciliation, incomplete-discovery retention, first-readiness repair and fixed-point tests; no backend coupling.
5. **`feat(core): own terminal watchman JSON sessions`** — private-socket protocol fixtures, strict framing, callback-before-fence tests, interrupted submission and joined close.
6. **`feat(core): map logical watchman path hints`** — directory rows, literal/glob parity, client cookie suppression and safe literal expressions.
7. **`feat(core): supervise watchman directory lifetimes`** — Scope ownership, finite states, snapshot-first install, freshness, heartbeat, release from every barrier.
8. **`feat(core): bound complete watchman attachment work`** — full permits, same-`C` serialization and strict circuit epochs, root/compatibility retry tiers.
9. **`feat(core): observe stable recursive root identity`** — periodic root/parent checks, sentinel rearm, detected replacement blocking/recovery, mixed Node watcher tests.
10. **`feat(core): validate static directory watcher options`** — lazy backend selection, schema/defaults/host classification, disabled/default parity.
11. **`feat(server): forward static directory watcher options`** — exported host schema and one route-layer mapping; direct fetch/process/SDK forwarding tests, no wire changes.
12. **`feat(cli): configure watchman with an explicit socket`** — environment validation/precedence and managed-service/SDK documentation.
13. **`test(core): verify watchman owners and release resources`** — private exact-target live gates, quietness, relay loss, root replacement and pressure/throughput evidence. A failing daemon prerequisite is a valid finding, not permission to weaken assertions.
14. **`docs: record experimental watchman support limits`** — exact proven compositions, external retention, unsupported hidden Skill ancestors and daemon root repair. Release only after mandatory gates pass or the human explicitly revises scope.

Daemon changes demanded by a failing quietness gate or a desired zero-residue promise require separate authorization, their own pin and verification. They are not hidden in an OpenCode commit.

## 15. Deterministic, live, resource, and release acceptance

### Deterministic implementation tests [V]

Main controller tests instantiate the **actual Watcher and actual directory adapter**, replacing only internal Session/path observation inputs. Session tests use actual private Unix sockets. Pure mapping tests execute the same implementation as production. Do not translate this state table into a second test-only controller and call agreement proof. Use Effect rc.112 TestClock and explicit barriers; avoid global mocks.

| Area | Required assertions |
| --- | --- |
| Sharing and W1 | Equal keys share once; logical queue before first readiness; readiness before later updates per subscriber; final ref release exactly once. |
| Before-return lifecycle | Interrupt at child-scope registration, path lookup, each permit wait, connect, every command, ack, final identity read, and return transfer through actual RcMap. No orphan session or worker. |
| Protocol association | Stock/Watchwoman merged/separate ack; empty initial omitted; data-before-ack; tip cancellation without files/root/version/unilateral; correct unsubscribe replies; no command theft. |
| Snapshot-first | All pre-install rows discarded, initial/replacement scan repairs their state, cancellation defeats late ack, post-install rows survive, slow first attach repairs Skill. |
| Freshness/heartbeat | Positive in-band freshness invalidates without immediate reconnect; false does not suppress replacement invalidation; root-clock identity change/rejection triggers attachment; tick alone does not. |
| Terminal socket | EOF/error/deadline coalesce; submitted interruption closes stream; queued request cannot consume late old reply; closed Session never reconnects; local close settles every waiter once. |
| Bytes and pressure | Split/combined/invalid UTF-8/JSON frames; exact 16 MiB limits; pending row/byte overflow produces ordered invalidation; controls/release cannot be starved. |
| Circuit | Limit 1/4/64, held clock/subscribe still occupy admission, one probe, stale positive/negative inert, probe cancellation at claim/permit gap, no double-report from error plus EOF, shutdown no new work. |
| Failure recovery | Root rejection never inferred from prose; EACCES repair retries; explicit missing cap and malformed input use 60 s tier and recover after changed peer response; no `undefined` or fallback. |
| Paths | `L != C`, canonical literal inert, logical literal active, containing ancestor excludes root, unrelated sibling inert, whole-root expression, exact `wholename`, Config full glob parity, directory/cookie negatives. |
| Topology | Direct/ancestor retarget, initially normal root becoming symlink, dangling materialization, parent deletion/rearm, unchanged rechecks inert, same-C inode replacement blocks until changed daemon-root ID, reference cycling cannot erase fault. |
| Owners | Actual Config invalidation reaches all domains before predicates; directory-only moves converge; retained Skill fixed point under delayed attach, partial discovery, external-target changes and scope disposal. |
| Options | Absent/explicit Parcel equality, Node delegation, disabled no import/I/O, host gate, numeric/socket/unknown-field rejection, JS runtime decode, env precedence, SDK forwarding/workerd disabled. |

Mutation sensitivity should show targeted failure when release/publication fencing is removed, pre-ack ack is treated as installed, subscription-key classification steals an unsubscribe reply, directory rows are dropped, Skill clears its map every refresh, or a stale positive closes a newer circuit. Fixture self-tests validate fixture controls only.

### Exact-target live gates [V]

Run the **new JSON implementation**, not the old client, on private socket/state/log/HOME/XDG paths. Record daemon Git/build/hash and actual runtime version. Use held private process handles; never build over the deployed daemon's linked target binary or implicitly contact the ambient shared service.

1. **Protocol and path matrix:** file create/modify/delete gives update/update/delete hints; directory-only rename/delete/ignored-boundary operations reach actual owners; full glob/cookie tests under `L != C`; every attach uses a fresh clock and unique name.
2. **Readiness loss window:** hold setup, mutate after the initial owner scan, then allow install; verify actual Config/Skill/Plugin state repairs. Capture merged/separate frame transcripts. A scripted daemon gap plus real owner test proves the adapter obligation; it is not a timed reproduction of Watchwoman's internal query race.
3. **Read/open quietness:** perform one external mutation, let real Config/Agent/Command/Skill/Plugin rescans finish, then perform no writes. Require scan/reload counts and unsolicited data traffic to stabilize; expected 30-second clock exchanges and one-second metadata probes are not update feedback. Record whether plain reads/scans produce continuing updates. If they do, block the Watchwoman release and request a separately authorized daemon fix.
4. **Isolated client loss:** close only the test client's private relay, retaining direct same-root and unrelated-root controls. Both controls must continue; replacement session obtains a fresh clock and readiness repairs state. Follow [E16](/.design/watchman/v2-readd/v2-readd4-e16-safe-loss0.gpt56solxh.md), not shared-daemon kill.
5. **Private incarnation loss:** separately stop/restart a wholly private daemon. All test-global state loss is expected; neither false Watchwoman freshness nor an old cursor may suppress owner recovery.
6. **Root lifetime:** use explicitly test-owned daemon controls to produce quiet root retirement/replacement; heartbeat notices it. Same-path filesystem inode replacement must block false healthy installation and unblock only after a new daemon-root identity, without production prune commands.
7. **Bun topology:** exact Bun 1.4.2 close-before-rearm sensitivity and direct/ancestor/missing-parent matrix, including inherited Node file/entries watchers on the same parent. Independently demonstrate polling repairs stable target resolution even when sentinel delivery is absent.

Watchwoman `a1e16cbf` is mandatory characterization and enabled-release gating. Stock installed-binary cells are secondary live evidence: report failures as conformance limitations and do not claim formal support. Its protocol variants remain mandatory deterministic regressions. Local-tip source is not evidence the intended deployed binary has fixed queue/lifecycle behavior.

### Resource/release and performance gates [V]

- Release every state while commands/path reads/timers are held. Advance virtual time less than the incumbent command deadline and verify shutdown does not wait for that deadline. Grace is one absolute 500 ms optional unsubscribe budget, not another queued command timeout.
- Assert no owned client FDs, FSWatchers, controller/attempt fibers, timers, request waiters or queued routes after actual completion. Use Linux `/proc` ownership and natural process exit; Bun active-handle APIs alone are insufficient.
- Count local and daemon resources separately. An unsubscribe acknowledgement and `status.subscriptions=0` cannot prove the daemon loop/socket vanished. Capture quiescent retention, matching-write release, later-tick release and private-daemon final cleanup distinctly.
- Reproduce 1, 4, 13 and 34 same/distinct key cohorts with repeated recovery, real owner scan load, full-attach latency percentiles, JSON bytes/CPU, memory high-water, active/retained FDs and daemon root/subscription counts. The old pressure run establishes neither a universal threshold nor new JSON performance.
- Verify cold same-`C` work from one backend does not overlap; do not claim cross-process exclusion. Test multiple embedded backends explicitly as separate budgets.
- Verify bounded encoded frame/inbox retention and document transient decoding, OS buffers and W1's unbounded downstream queue. Do not claim total O(1) memory from absence of a file baseline.
- Shared-safe relay tests, if later run, use unique test-owned root/name identities. The first Watchwoman cleanup tick must generate a matching failed write; a later tick need only be a root tick. Such test-only writes are not part of production finalization. Never prune shared roots to hide residue.

### Package, generated surface, and platform checks [V]

Run tests from package directories, never repo root; always `bun typecheck` rather than direct `tsc`:

```text
packages/core:
  bun test test/filesystem/watcher.test.ts test/config/watch.test.ts test/config/reload.test.ts test/config/skill.test.ts test/location-layer.test.ts
  bun test test/config/agent.test.ts test/config/command.test.ts test/plugin/supervisor-reload.test.ts
  bun test test/filesystem/watchman
  bun typecheck

packages/server:
  bun test test/options.test.ts test/fetch.test.ts test/process.test.ts
  bun typecheck

packages/cli:
  bun typecheck
  targeted environment/startup tests with the existing runner

packages/sdk:
  bun test
  bun typecheck
  bun run verify:package
```

The new Watchman tests are proposed files, not already created. Follow focused suites with full affected package suites and existing repository formatting/linting. Verify distribution artifacts and lazy-loading paths; development commands/docs continue to use `.ts` sources. Confirm Protocol/Server `HttpApi` and generated Client remain unchanged. If they intentionally change, regenerate from `packages/client` and review the generated diff.

Default/disabled off-host builds must remain healthy. Enabled new-host support requires that host's live daemon/protocol/owner/topology/resource suite before widening the gate; adjacent Watchwoman release archives, codec round trips or OpenCode cross-builds do not suffice.

## 16. Assurance summary and rejected expansions

| Dimension | What this architecture promises [P], subject to tests |
| --- | --- |
| Local active sockets | One per physical key/controller generation; at most the configured full attachments in flight. No locator or dedicated heartbeat connection. |
| Pending data | None before install; bounded after install with explicit invalidation on overflow; no per-file baseline. |
| Path checking | O(demanded keys) async root/parent checks per second, not recursive scans. |
| Mapping | O(rows × compiled predicates), no per-row filesystem calls. |
| Stored root metadata | Active roots plus unresolved replacements, not healthy lifetime history. |
| Owner work | Authoritative scans remain domain-sized and coalesced; unchanged Skill keys do not physically reattach per scan. |
| Release | Joined local completion with limited voluntary daemon wait; external daemon residue is separately measured and accepted only as an experimental limitation. |
| Convergence | Stable current state after readiness and delivered hints under supported daemon semantics; not every transient event, instantaneous retarget fencing, or a lossless filesystem mirror. |

Rejected expansions include a general raw-client fork, BSER plus automatic discovery without a measured requirement, a process-wide multiplexed socket, another desired-interest registry, exact create identity, daemon root pruning, probe-file writes, a public retry-tuning matrix, and a public HTTP status surface. Also reject “permanent retry is always bad”: a mutable external daemon can recover without a host restart, provided retries are classified and rate-bounded. Conversely, reject “every two seconds forever” as the only possible recovery policy.

The two serious daemon caveats remain visible: read-generated update feedback can block release, and local close cannot guarantee zero daemon survivors. These are not resolved by a longer TypeScript interface or an actor fixture that never models them.

## 17. Evidence and cross-references

The complete accepted v4 corpus and both historical v4 candidates were read for the independent first draft. This round directly compared both draft0s and rechecked the material disagreements against the following records and exact source objects. These links explain what each source contributes; no existing document/index is modified by this pass.

| Reference | Relationship |
| --- | --- |
| [Astra draft0](/.design/watchman/v2-readd/v2-readd5-draft0.gpt6astra.md), [GX draft0](/.design/watchman/v2-readd/v2-readd5-draft0.glm53max.md) | Direct alternatives compared in §§1–2. GX is stronger in initial-data minimization and target distinction; Astra is stronger in local ownership, explicit uncertainty and owner attachment repair. Neither's prose is treated as evidence. |
| [Validation0](/.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md), [validation1](/.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md), [validation2](/.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md), [validation3](/.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md) | Controlling accepted corrections, complete decision list, authority for independent then cross-informed rounds. |
| [E01 identity](/.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md), [daemon delta](/.design/watchman/v2-readd/v2-readd4-watchwoman-delta0.glm53max.md), [E17 platform](/.design/watchman/v2-readd/v2-readd4-e17-platform0.gpt56solxh.md) | Exact deployed versus local-tip/adjacent-release/runtime identities; prevents whole-Linux or implicit-tip certification. |
| [E03 ordering](/.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md), [stock live](/.design/watchman/v2-readd/v2-readd4-e03-stock-live0.glm53max.md), [E07/E15 transport](/.design/watchman/v2-readd/v2-readd4-e07-transport-conformance0.glm53max.md) | Ack/push/control differences, array requests, classifier failures and why owned framing must be tested independently. |
| [E04 interleavings](/.design/watchman/v2-readd/v2-readd4-e04-interleavings0.gpt56solmax.md), [E05 failure](/.design/watchman/v2-readd/v2-readd4-e05-native-failure0.glm53max.md), [E12 lifecycle](/.design/watchman/v2-readd/v2-readd4-e12-lifecycle0.gpt56solmax.md) | Scope transfer, callback ordering, pending Native consequences and actual RcMap/finalizer semantics. |
| [E11 acquisition](/.design/watchman/v2-readd/v2-readd4-e11-acquisition0.gpt56solmax.md), [E11/E13 races](/.design/watchman/v2-readd/v2-readd4-e11-circuit-races0.glm53max.md), [E11/E20 pressure](/.design/watchman/v2-readd/v2-readd4-e11-pressure0.gpt56solxh.md) | Full-vs-prefix decision context, strict stale-result corrections, same-root construction and limits of measured scale. |
| [E12 raw lifecycle](/.design/watchman/v2-readd/v2-readd4-e12-transport-lifecycle0.glm53max.md), [daemon release](/.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md), [E16 safe loss](/.design/watchman/v2-readd/v2-readd4-e16-safe-loss0.gpt56solxh.md) | Separate local/daemon resource axes; unsubscribe GC effect; safe private/relay tests and two-stage cleanup qualification. |
| [E02 roots](/.design/watchman/v2-readd/v2-readd4-e02-watch-roots0.glm53max.md), [E06 expressions](/.design/watchman/v2-readd/v2-readd4-e06-expression0.glm53max.md), [E08 ignores](/.design/watchman/v2-readd/v2-readd4-e08-ignore-parity0.glm53max.md) | Two namespaces, exact expression semantics, client cookie sufficiency and Parcel predicate parity. |
| [E09 rows](/.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md), [E09 create](/.design/watchman/v2-readd/v2-readd4-e09-create-evidence0.glm53max.md), [O5 directory owners](/.design/watchman/v2-readd/v2-readd4-owner-directory-signal0.gpt56solxh.md) | Directory-inclusive contract, absent intrinsic identity, owner rereads versus unrepaired daemon/client baselines. |
| [E10 sentinel](/.design/watchman/v2-readd/v2-readd4-e10-symlink-sentinel0.glm53max.md), [E14 Skill](/.design/watchman/v2-readd/v2-readd4-e14-skill-lifecycle0.glm53max.md) | Precisely bounded primitive and latch evidence; motivates selected path sampling and retained-owner algorithm, neither falsely called already proven. |
| [E18 options](/.design/watchman/v2-readd/v2-readd4-e18-server-options0.gpt56solxh.md), [E19 carrier](/.design/watchman/v2-readd/v2-readd4-e19-carrier-audit0.gpt56solxh.md) | Public programmatic/off-wire separation, owning decode, generation trigger and per-hunk preservation. |

**Primary checks in this round:** exact deployed Watchwoman `subscribe.rs`, `cli.rs` call chain, `watcher.rs`, `root.rs`, Cargo.lock and notify 8.2.0 Linux source; local-tip collector; stock `subscribe.cpp` and `PDU.cpp`; canonical Skill owner. Effect/RcMap/Config/Server/CLI/SDK source checks from draft0 remain explicitly pinned and acceptance tests must rerun after any base upgrade.

**Comparison and preservation confirmation:** GX draft0 was read and compared directly; no GX draft1 was read. This new complete document is the only file written in this round. Existing research, first drafts, production/carrier source, prompts and generated files were not changed. No commit or push was made. All implementation and release claims marked [V] remain future proof obligations.
