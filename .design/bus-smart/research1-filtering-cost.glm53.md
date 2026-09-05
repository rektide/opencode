---
type: Research
title: Filtering-cost and routing-performance analysis
description: Where the implemented controlled/legacy feeds filter, residual per-event and per-client costs, traffic decomposition by location/session/global scope, alternative filtering policies, and a reproducible benchmark matrix with no-suppression acceptance criteria.
resource: /design/bus-smart/research1-filtering-cost
tags: [server, core, events, bus, performance, sse, benchmark]
status: draft
generated: { by: "agent:glm-5.3-max", at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-12-05
sources:
  - id: directional-design
    resource: /design/bus-smart/draft0
    title: Controlled event feed directional draft
  - id: verification
    resource: /design/bus-smart/verification0
    title: Controlled event feed verification
  - id: bus-audience-research
    resource: /design/bus-smart/research-bus-audience0
    title: Bus publication-time audience seam
  - id: bus
    resource: /packages/core/src/bus.ts
    title: Bus routing and notify
  - id: controlled-feed
    resource: /packages/server/src/controlled-event-feed.ts
    title: ControlledEventFeed
  - id: legacy-feed
    resource: /packages/server/src/event-feed.ts
    title: Legacy EventFeed
  - id: event-handler
    resource: /packages/server/src/handlers/event.ts
    title: SSE endpoints and response framing
---

# Filtering-cost and routing-performance analysis

## Situation

The controlled event feed is implemented and ported to `v2@origin`
([verification0](/.design/bus-smart/verification0.gpt56s.md)); the stated goal
is to materially cut CPU under many clients and many active sessions. What is
missing is deployed or tested performance proof. This note owns the
server/core side: it maps where filtering actually happens in the current
code, quantifies residual per-event and per-client costs (marking every
unmeasured number as an estimate), decomposes traffic into same-location,
cross-location, and global classes to find real leverage, compares practical
filtering policies, and proposes a reproducible benchmark matrix with
no-suppression acceptance criteria. Client reconnect behavior and move
execution details are owned by other notes; client CPU appears here only as
the receiving end of server routing decisions.

All line anchors were verified in this worktree. The whole controlled stack is
downstream-only: upstream
`~/archive/anomalyco/opencode/packages/core/src/bus.ts` has no `observeRouted`
and upstream `packages/server/src` has no `controlled-event-feed.ts`.

## 1. Where events are filtered today

An event traverses these stages per publication:

| Stage | Location | What is dropped |
| --- | --- | --- |
| Route snapshot install | [`bus.ts:242-291`](/packages/core/src/bus.ts#L242-L291) | nothing (computes audience inputs) |
| Audience computation | [`bus.ts:230-240`](/packages/core/src/bus.ts#L230-L240) | nothing; classifies `locations{refs,sessionID}` vs `global`, guard-gated `sessionID` via `isSessionEvent` |
| `notify()` choke point | [`bus.ts:537-550`](/packages/core/src/bus.ts#L537-L550) | nothing; fans to routed observers → legacy listeners → typed PubSub → live PubSub |
| Controlled observer | [`controlled-event-feed.ts:126-160`](/packages/server/src/controlled-event-feed.ts#L126-L160) | internal events (`isOpenCodeEvent`, L128); everything when `activeCount === 0` (L129); per-subscriber non-matching audiences in the admission loop (L143-158) |
| Legacy listener | [`event-feed.ts:49-51`](/packages/server/src/event-feed.ts#L49-L51) | internal events; everything when no subscribers |
| Client adapter/projection | [`data.ts:605+`](/packages/client/src/solid/data.ts#L605) | nothing systematic: every received event runs its Solid case; unknown-target streaming events no-op inside `editAssistant`/`editText` but still enter `message.update` |

The controlled admission predicate
([`controlled-event-feed.ts:269-273`](/packages/server/src/controlled-event-feed.ts#L269-L273))
admits an audience when it is global, when any audience ref is covered by
requested or derived locations, or when the audience `sessionID` is in
requested sessions. Internal-only events (`session.usage.recorded`, `rpc.*`)
never reach either feed.

## 2. Per-event cost model

For one public event with `N` active controlled subscribers, `N_l` legacy
subscribers, `M ≤ N` matching controlled subscribers:

| Cost | Count per event | Anchor | Estimate |
| --- | --- | --- | --- |
| Audience allocation + `WeakMap.get` | 1 | [`bus.ts:230-240`](/packages/core/src/bus.ts#L230-L240) | ~0.1 µs (est.) |
| Routed-observer Effect dispatch | 1 per feed (`Effect.suspend` per observer) | [`bus.ts:524-540`](/packages/core/src/bus.ts#L524-L540) | fiber-allocation-free but ~µs each (est.) |
| JSON payload stringify | 1 per populated feed, so **2 when legacy and controlled coexist** | [`controlled-event-feed.ts:130-142`](/packages/server/src/controlled-event-feed.ts#L130-L142), [`event-feed.ts:52-64`](/packages/server/src/event-feed.ts#L52-L64) | ~1-5 µs for small payloads, grows with tool-input sizes (est.) |
| Admission loop iterations | `N` (skips inactive) | [`controlled-event-feed.ts:145-155`](/packages/server/src/controlled-event-feed.ts#L145-L155) | see §3 |
| `covers()` ref-key stringify | up to `N × refs × (1 + D)` `JSON.stringify` calls for the **same key values** | [`controlled-event-feed.ts:275-286`](/packages/server/src/controlled-event-feed.ts#L275-L286) | ~0.1-0.3 µs each (est.) |
| `Queue.offerUnsafe` | `M` | [`controlled-event-feed.ts:95-101`](/packages/server/src/controlled-event-feed.ts#L95-L101) | sub-µs each (est.) |
| SSE text→bytes encode + socket write | `M` (+ `N_l`) | [`handlers/event.ts:45-55`](/packages/server/src/handlers/event.ts#L45-L55) `Stream.encodeText` runs per response stream | ~1 µs + syscall each (est.) |
| Typed/live PubSub publishes | 1 each when subscribed (in-process consumers exist, e.g. [`session/projector.ts:758`](/packages/core/src/session/projector.ts#L758)) | [`bus.ts:546-548`](/packages/core/src/bus.ts#L546-L548) | small, pre-existing |

**Serialize count**: one `JSON.stringify` per populated feed (never per
subscriber — encode-once fan-out holds in both feeds), then one
`TextEncoder.encode` per *receiving* response stream, then one socket write
per receiving client. The redundant work is the wire encoding, not the JSON.

**Buffers**: per-subscriber dropping queue of capacity 4096 strings
([`controlled-event-feed.ts:19,165-166`](/packages/server/src/controlled-event-feed.ts#L165-L166),
[`event-feed.ts:8,92`](/packages/server/src/event-feed.ts#L92)); strings are
shared references to the once-encoded frame, so per-client memory is pointers,
not copies. `pubsub.live` and typed PubSubs are unbounded but carry only
in-process references. Each client response carries a 15 s heartbeat tick
stream ([`handlers/event.ts:46-47`](/packages/server/src/handlers/event.ts#L46-L47)).

**Serialization of admission**: one `Semaphore.makeUnsafe(1)`
([`controlled-event-feed.ts:83,87`](/packages/server/src/controlled-event-feed.ts#L83-L87))
guards registration, activation, replacement, removal, and every event
admission. The critical section is non-yielding
(`Effect.sync`), so the ceiling is `(per-event admission cost)⁻¹` events/sec,
shared with interest PUTs. With the current linear scan that ceiling degrades
linearly in `N`.

## 3. Residual O(events × clients) costs

1. **Admission scan is O(N) per event** —
   [`controlled-event-feed.ts:145`](/packages/server/src/controlled-event-feed.ts#L145)
   iterates every subscriber for every public event even when none match.
2. **`covers()` recomputes identical keys N times** — the audience ref key
   `JSON.stringify([directory, workspaceID])`
   ([`controlled-event-feed.ts:284-286`](/packages/server/src/controlled-event-feed.ts#L284-L286))
   is recomputed per subscriber per ref, and each `covers` scans
   `derivedLocations.values()` stringify-ing every derived entry
   ([L278-280](/packages/server/src/controlled-event-feed.ts#L278-L280)).
   For an event routed to one location with `D` derived entries, that is
   roughly `N × (1 + D)` redundant stringifications of the *same* values per
   event. The requested set is already stored key-addressed by `normalize()`
   ([`controlled-event-feed.ts:256`](/packages/server/src/controlled-event-feed.ts#L256));
   only the hot path re-stringifies.
3. **Encode-before-match** — the frame is built whenever *any* subscriber is
   active, even if none matches ([L129-142](/packages/server/src/controlled-event-feed.ts#L129-L142)).
   Same in legacy. With one active TUI anywhere, the server pays full
   stringify for every event on the machine.
4. **Coexistence double-encode** — legacy and controlled feeds both observe
   every event ([`handlers.ts:61`](/packages/server/src/handlers.ts#L61)
   merges both layers), so a mixed client population costs 2× stringify per
   event. Bounded and known; only material if it measures so.
5. **Wire-side per-client work is proportional to matched clients** — this is
   the intended residual; there is no per-client JSON cost.

None of 1-3 changes semantics; they are pure hot-path waste. Removing 2 is
trivial (hoist ref keys out of the subscriber loop; keep a derived key `Set`
next to `derivedLocations`). Removing 1 needs a reverse index
(`locationKey → Set<subscriber>`, `sessionID → Set<subscriber>`) maintained
inside the existing critical sections.

## 4. Traffic decomposition and where the leverage is

The [TUI interest policy](/.design/bus-smart/draft0.gpt56s.md) always holds
the launch location plus route/tab locations, and adds exact sessions for the
visible route, open tabs, and their families. Combined with Bus routing
(session events route to the owning location,
[`bus.ts:242-291`](/packages/core/src/bus.ts#L242-L291)), the traffic a client
receives decomposes into:

| Class | Delivered today | Dominant rate | Cut by current controlled feed? |
| --- | --- | --- | --- |
| Same-location, other sessions' streaming (`session.text.delta`, `reasoning.delta`, `tool.input.delta`, `tool.progress`, published per chunk at [`publish-llm-event.ts:211,234`](/packages/core/src/session/runner/publish-llm-event.ts#L211)) | yes, to every client holding that location | highest: est. tens of events/sec per active session | **No** — location match admits them by design |
| Cross-location traffic | only via tabs/routes there | high if tabs span locations | Yes — this is the implemented win |
| Global events (credential `global:true` [`credential.ts:127`](/packages/core/src/credential.ts#L127); persistent-pty add/remove published without location [`persistent-pty/index.ts`](/packages/core/src/persistent-pty/index.ts)) | yes, to everyone | low (per terminal create/remove, per credential change) | No (deliberate; reclassify at producers if it ever matters) |
| Followed-session events at foreign locations (moved sessions, cross-location tabs) | yes via `requested.sessions` / derived | low-moderate | Yes (exact-session dimension) |

This exposes the central leverage fact for the stated goal: **when many
sessions are active in one location — the common single-machine case — the
current predicate filters nothing for clients in that location.** Each client
still receives every delta of every co-located session and still pays client
CPU for them:

- every delta enters `message.update` →
  `setStore(..., produce(...))` with `draft[sessionID] ??= []` materializing
  an empty array plus a persistent index `Map` for each foreign session
  ([`data.ts:393-399`](/packages/client/src/solid/data.ts#L393-L399),
  [`data.ts:462-468`](/packages/client/src/solid/data.ts#L462-L468);
  delta dispatch at [`data.ts:888-891`](/packages/client/src/solid/data.ts#L888-L891));
- foreign `session.created` still triggers an unconditional HTTP session read
  ([`data.ts:605-623`](/packages/client/src/solid/data.ts#L605-L623)).

So the implemented feed's proven-but-unmeasured win is cross-location
isolation and server fan-out reduction for spread workloads; it is *not* a
win for the many-sessions-one-project case, on either the server wire or the
client projection. That matches [review0](/.design/bus-smart/review0.gpt56s.md)'s
finding 5, which remains unimplemented: no tracked-session projection guard
exists in `data.ts` (verified: `session.usage.updated` guards on
`store.session.info`, delta handlers do not).

## 5. Alternatives

| | A. Minimal location-only filter | B. Current controlled feed (implemented) | C. Session-aware high-rate policy + indexed admission | D. Proxy / fan-out process |
| --- | --- | --- | --- | --- |
| Cuts same-location foreign deltas | no | no | **yes** (opt-in per subscription) | no (same predicate, different process) |
| Cuts cross-location traffic | yes | yes | yes | yes |
| Server admission cost | O(N) naive or indexed | O(N) + key re-stringify | O(matching) via reverse indexes | same as source predicate |
| New semantics | none beyond B | — | policy decision: which families are session-gated (suppression risk surface) | transport/lifecycle, clustering story |
| Carry cost vs today | — (already superseded by B) | — | small: interest flag + admission change + tests | large: new process, auth, reconnection topology |
| Verdict | superseded | keep as baseline | **the actual CPU lever for the stated goal** | reject until measurement demands it |

**A** (header-scoped or location-set-only filtering) is strictly weaker than
what is already implemented and does not touch the dominant traffic class.
Rejected.

**B** is the status quo: correct, move-safe, tested. Its residuals are §3's
waste plus the §4 same-location gap.

**C** has two independent parts:

- **C1 (mechanical):** index admission by location key and session ID,
  hoist audience key computation. No behavior change; existing tests
  ([`controlled-event-feed.test.ts`](/packages/server/test/controlled-event-feed.test.ts),
  13+ cases) pin semantics. Cuts per-event admission from O(N·stringify) to
  O(interested).
- **C2 (policy):** for subscriptions that opt in, gate *high-rate ephemeral
  streaming families* (`session.text.delta`, `session.reasoning.delta`,
  `session.tool.input.delta`, `session.tool.progress`,
  `session.compaction.delta`) on exact session interest instead of location
  coverage. Durable lifecycle, permission/form (location-routed today), and
  global events keep the current predicate, so move-following, family tabs,
  and notification semantics are untouched by the delta gate. The TUI already
  declares visible-route, open-tab, and family sessions in
  `requested.sessions`, so tracked sessions keep full fidelity; the client
  projection only ever *drops* deltas it previously no-op'd on. The residual
  risk is a consumer that renders live deltas for a session it did not
  declare — that is exactly what the no-suppression acceptance below must
  test, and why the gate should be an explicit per-subscription interest mode
  rather than a silent global change. This also keeps the
  [notification-scope product decision](/.design/bus-smart/draft0.gpt56s.md)
  orthogonal: notifications key off lifecycle/permission events, which stay
  location-scoped.

**D** (proxy) moves encode/write CPU off the core process but solves neither
the predicate gap nor admission cost, adds a service to run and authenticate,
and presumes clustering that does not exist ("keep local Session drains
process-local", [AGENTS.md](/AGENTS.md)). Reject for now; hold in reserve
only if benchmarks show the server process itself saturated by SSE write work
at target client counts.

## 6. Staged recommendation

Grounded in likely leverage, cheapest first, each stage independently
measurable:

1. **Measure first (§7)** — no code. Establish per-class event rates and CPU
   attribution between server encode/admission, wire, and client projection.
   Every number in §2-4 is currently an estimate.
2. **C1: mechanical admission fixes** — hoist ref keys, derived-key set,
   reverse indexes. Zero semantic change; removes the only superlinear-in-N
   server cost. Justified even at modest client counts because it is cheap
   and risk-free.
3. **C2: opt-in session-gated streaming families** — behind an interest-mode
   flag the TUI sets once. This is the only option on the table that cuts
   client CPU for the many-active-sessions-one-location case, which §4
   identifies as the goal's dominant scenario. Gate rollout on the
   no-suppression acceptance criteria.
4. **Client projection guard** (review0's first patch) only if residuals
   remain for *tracked* sessions or non-TUI clients must be protected too.
5. **Encode unification / legacy retirement** only if coexistence
   double-encode measures materially. **Proxy** only on measured server-side
   saturation.

## 7. Benchmark matrix (reproducible, no live service)

Harness: a standalone scratch runner under `.test-agent/bus-smart/bench/`
(own subdirectory + README; the directory already holds other agents' notes,
which must not be touched). Two tiers:

- **T1 in-process**: import `ControlledEventFeed.make` / `EventFeed.make`
  directly (both expose `make(observe, {capacity, encode, createID})`,
  [`controlled-event-feed.ts:71-77`](/packages/server/src/controlled-event-feed.ts#L71-L77)),
  drive a real `Bus` layer with a synthetic publisher emitting real schema
  payloads, drain subscriber queues without HTTP. Isolates admission/encode
  CPU precisely.
- **T2 end-to-end**: boot the real server on a random port with test auth
  (reuse [`packages/server/test/fixture`](/packages/server/test/fixture)
  patterns), connect real client `connection.ts` + Solid projection, drive
  synthetic sessions through the public API. Measures wire + client CPU.
  `bun run dev:live`/termctrl stays for manual confirmation only, not the
  recorded benchmark.

Dimensions:

| Dimension | Values |
| --- | --- |
| Active sessions `S` | 1, 8, 32 |
| Locations `L` | 1 (co-located), 4 (spread) |
| Clients `C` | 1, 8, 32, each holding launch location + one followed session |
| Feed mode | legacy, controlled (B), controlled+indexes (C1), +session-gated deltas (C2) |
| Stream rate `R` | 10, 50 delta-events/sec/session (calibrate against a real LLM trace; assumption until then) |
| Mid-run move | 1 followed session moves to a foreign location during measurement |

Metrics: server process CPU (Δ`os.cpuUsage`/time) and events admitted;
admission-section iterations and µs/event (temporary counters behind a debug
flag, removed after calibration); encode invocations; overflow warnings
(structured, already emitted by both feeds); client process CPU, RSS,
received domain events and reconnects (existing diagnostics at
[`connection.ts:214`](/packages/client/src/solid/connection.ts#L214));
event-loop p99 both sides; per-class received-event counts (own-session /
same-location-foreign / cross-location / global) — the last distinguishes
"filtered on the wire" from "arrived but cheap".

### Acceptance criteria

- **AC1 (no suppression, all modes):** for every client, concatenating
  received streaming events per *declared* session reproduces the source
  transcript hash exactly; all durable lifecycle events for followed sessions
  arrive; the mid-run move delivers `session.moved` plus the full destination
  suffix. Zero loss is pass/fail, not a ratio.
- **AC2 (global/classification):** every client receives global events
  exactly once; no client receives an event whose sole audience is a
  foreign, unretained location (pins the already-designed behavior).
- **AC3 (server admission scaling, C1):** at `L=1`, `C=32`, µs/event
  admission stays within a small constant of the `C=1` value and
  admission-loop iterations per event ≈ interested subscribers, not `C`.
- **AC4 (same-location win, C2):** at `L=1`, `S=32`, `C=8`, session-gated
  mode cuts client received-domain-events and client CPU by ≥ 90% versus
  controlled mode (estimate of the achievable ceiling: foreign deltas are the
  overwhelming majority at these ratios; the measured number replaces this
  estimate). AC1 must hold simultaneously.
- **AC5 (capacity):** zero subscriber-overflow warnings at `S=32, R=50, C=32`
  with default capacity 4096 in every mode; any overflow is a finding, not
  noise.
- **AC6 (coexistence):** with mixed legacy+controlled clients, legacy clients
  observe byte-identical streams to the legacy-only baseline.

Run book: fixed seeds, fixed durations (≥ 60 s steady state after 10 s ramp),
three repetitions, report median and spread; pin Bun version; record
`R` calibration source. Commit results as tables in this directory, not
prose claims.

## 8. Open questions

- Is `R ≈ 10-50` streaming events/sec/session realistic for the trace that
  motivated this work? The benchmark must calibrate against one real session
  capture before any AC4 percentage is trusted.
- Should C2's family list include `session.tool.input.delta`-adjacent
  progress events only, or all ephemeral deltas? Start with the five listed;
  revisit if the projection needs any of them for untracked sessions (it
  should not — untracked targets no-op in `editAssistant`/`editText`).
- Does any non-TUI consumer (desktop, app) rely on same-location foreign
  deltas for live UI? C2 is opt-in per subscription, so this is a rollout
  question, not a protocol question.

## Cross-references

- [Directional draft](/.design/bus-smart/draft0.gpt56s.md) defines the
  predicate, overdelivery policy (§ "Known residual overdelivery"), and the
  notification-scope open item that C2 deliberately leaves orthogonal.
- [Bus audience research](/.design/bus-smart/research-bus-audience0.glm53.md)
  grounds the audience semantics this note measures; its interface choice
  (inline routed observer) is what puts admission on the publish hot path,
  making §3's waste worth fixing.
- [Verification report](/.design/bus-smart/verification0.gpt56s.md) records
  the missing live before/after record; §7 is the reproducible replacement
  for that gate.
- [Review0](/.design/bus-smart/review0.gpt56s.md) findings 5-6 predicted the
  same-location client cost and the missing causality proof; §4-7 answer both
  with a measurement plan.
