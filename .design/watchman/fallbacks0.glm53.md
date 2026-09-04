---
type: Design
title: Watchman fallback semantics
description: Discovery map of every code path that degrades a Watchman-selected server to Parcel, and the timing asymmetries around them.
resource: /.design/watchman/fallbacks0.glm53.md
tags: [opencode, watchman, watcher, fallback, parcel, discovery]
status: draft
generated: { by: model:glm-5.3, at: 2026-09-02T00:40:00Z }
stale_after: 2026-11-01
sources:
  - id: watcher-core
    resource: /packages/core/src/filesystem/watcher.ts
    title: Watcher service and backend selection
  - id: watchman-backend
    resource: /packages/core/src/filesystem/watcher/watchman/backend.ts
    title: Watchman Native adapter with Parcel fallback
  - id: watchman-root
    resource: /packages/core/src/filesystem/watcher/watchman/root.ts
    title: Root connection registry, acquisition, recovery
  - id: watchman-client
    resource: /packages/core/src/filesystem/watcher/watchman/client.ts
    title: Transport loading, generations, admitted commands
  - id: maintenance-log
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
---

# Watchman fallback semantics (discovery)

## What this doc is, and is not

A claim circulated that "once started with watchman, opencode will never fall
back." A live server was then observed serving directory watches from Parcel
while configured for Watchman. This doc maps what the code on this line
actually does at every point where a Watchman-selected process can end up on
Parcel — by static reading only.

It is a **discovery document, not a verdict**. Line references are from the
current workspace tree and are the evidence; the *interpretations* (especially
anything about runtime timing or daemon behavior) are working hypotheses
marked as such. Every section ends with what would falsify it. Challenge
freely.

The claim's provenance is a misquote of
[`README.md`](/.design/watchman/README.md) lines 76–78, which say:

> Initial Watchman acquisition failures fall back to Parcel. **After Watchman
> acknowledges**, recovery is unbounded with capped, approximately 30 percent
> jittered backoff and cursor resume.

The qualifier got dropped in retelling. The design *does* promise fallback
before acknowledgment; what the design does not spell out is how wide the
acquisition window is, that failing it is permanent per interest, and that a
couple of adjacent mechanisms make the window easier to hit than it sounds.
Those gaps are the subject here.

## The one-paragraph answer

There are exactly two code sites that route a Watchman-configured process to
Parcel: one at layer construction that is nearly dead code, and one at
per-interest subscription that is very much alive
([`watcher.ts:104-115`](/packages/core/src/filesystem/watcher.ts),
[`backend.ts:23-32`](/packages/core/src/filesystem/watcher/watchman/backend.ts)).
The second site fires on *any* error escaping initial acquisition, and initial
acquisition is single-shot with no retry — while the *same* error classes,
once a subscription is acknowledged, are retried forever by the recovery loop
and never fall back
([`root.ts:290-297`](/packages/core/src/filesystem/watcher/watchman/root.ts),
`root.ts:347-351`). So "never falls back" is true only of subscriptions that
survived their first breath; everything else is one transient failure away
from permanent Parcel, and nothing ever moves it back.

## Site A: whole-backend fallback at layer construction

[`watcher.ts:104-115`](/packages/core/src/filesystem/watcher.ts):

```ts
const fallback = yield* Native
const native =
  options?.backend === "watchman"
    ? yield* Effect.promise(() => import("./watcher/watchman/backend.js")).pipe(
        Effect.flatMap(({ make }) => make(fallback, options?.watchman)),
        Effect.catch((error) =>
          Effect.logWarning("watchman backend unavailable; using parcel watcher", { error }).pipe(
            Effect.as(fallback),
          ),
        ),
      )
    : fallback
```

What can actually fail inside `make`?
[`backend.ts:7-15`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
is `loadFactory` (module import + structural check) plus `makeRegistry`
(scoped bookkeeping). `loadFactory`
([`client.ts:38-55`](/packages/core/src/filesystem/watcher/watchman/client.ts))
only does `import("@superbfowle/fb-watchman-esm")` and checks it exports a
`Client` function — **it never opens a socket and never contacts the daemon**.
The transport is a pinned dependency
([`packages/core/package.json:130`](/packages/core/package.json)), so import
failure requires a broken install.

Working hypothesis: Site A is close to unreachable in practice. If the daemon
is dead at server start, Site A does *not* fire — the failure surfaces later,
per interest, at Site B. This is the first way the folk claim breaks:
"started with watchman" is a *config* statement, not a *connectivity* fact.
The daemon's state at the **first subscription per root**, not at boot, is
what's being bet on.

Falsify by: producing a daemon-down scenario that triggers the Site A log line
("watchman backend unavailable"), or showing `makeRegistry` can fail under
runtime conditions short of a broken module install.

## Site B: per-interest fallback at subscription time

[`backend.ts:16-34`](/packages/core/src/filesystem/watcher/watchman/backend.ts):

```ts
return Watcher.Native.of({
  subscribe: (input) => {
    if (input.type === "file") return fallback.subscribe(input)
    const intent = /* project root or exact target from placement metadata */
    return registry.subscribe(intent, input).pipe(
      Effect.catch((error) => {
        registry.metrics.fallback()
        return Effect.logWarning("watchman acquisition failed; using parcel watcher", {
          path: input.target, intent, error,
        }).pipe(Effect.andThen(fallback.subscribe(input)))
      }),
    )
  },
})
```

Two facts to fix in mind:

1. `Effect.catch` is **catch-all**. There is no error-class filtering here.
   Whatever escapes `registry.subscribe` — connect, timeout, decode, route,
   `GenerationClosed`, anything — becomes a Parcel watch for this interest.
   Any discrimination must happen inside the registry; see the next section
   for where it does and does not.
2. `backend.ts:18`: file watches (`input.type === "file"`) never touch
   Watchman at all — they go straight to Parcel/`node:fs.watch`. "Started
   with watchman" only ever described directory interests. (The `files-too`
   wave, [`files-too0.glm53.md`](/.design/watchman/files-too0.glm53.md), is
   the home of that topic.)

The observable tell for which backend served a watch is the `backend=` field
on the "watcher started" log
([`watcher.ts:154-159`](/packages/core/src/filesystem/watcher.ts)): `"watchman"`
comes from `root.ts:423`; `"inotify"`/`"fs-events"`/`"windows"` come from the
Parcel platform table (`watcher.ts:26-30`), `"node"` from file watches
(`watcher.ts:252`).

## What "never falls back" is actually true of

The no-fallback guarantee is real, and it lives entirely *after* the first
successful `subscribe` acknowledgment. The machinery:

- `recoverable()` classifies `GenerationClosed`, `connect`, `command`,
  `reconnect`, and dead-generation `subscribe` errors as retry-forever —
  [`root.ts:290-297`](/packages/core/src/filesystem/watcher/watchman/root.ts).
- `recoverRoot()` retries creation indefinitely with backoff: base `100ms`
  doubling to a `2000ms` cap, jitter factor `0.7 + rand * 0.6` —
  `root.ts:62-63`, `root.ts:299-317`.
- `reconnect()` loops `recoverable` errors through `replacement()` +
  `establish()` with cursor reuse — `root.ts:347-351`.
- The per-subscription `loop()` reaches `reconnect` only from the
  `"closed"`-generation and canceled-PDU branches — `root.ts:363-371` and
  `root.ts:377-385`.

Once established, a Watchman interest never degrades to Parcel. Truly
non-recoverable errors after acknowledgment fail the watch outright
(`root.ts:412-413` → `input.fail` → the subscriber stream ends via
`watcher.ts:136`) — a *different* failure mode, still not fallback. So the
claim is not fiction; it is a statement about the wrong time interval.

## The acquisition cliff

Initial subscription, [`root.ts:410-411`](/packages/core/src/filesystem/watcher/watchman/root.ts):

```ts
const initial = yield* current().pipe(Effect.flatMap((root) => establish(item, root)))
```

No retry. No `recoverable()` guard. One shot. `current()`
(`root.ts:178-195`) is likewise a single `create()` — no retry loop of its
own. And the window this single shot must survive is **five daemon round
trips**:

| Step | Code | Error stage |
| --- | --- | --- |
| transport client construction | `root.ts:141-145` wrapping `client.ts:49-54` | `connect` |
| `capabilityCheck` (`relative_root`) | `root.ts:162` → `client.ts:85-94` | `connect` |
| `watch <root>` | `root.ts:165` → `route.ts:19-24` | `route` |
| `clock <root>` | `root.ts:208-214` | `subscribe` |
| `subscribe` | `root.ts:218-235` | `subscribe` |

Any failure at any step escapes to `backend.ts:24` → Parcel. Contrast the
**same** `establish()` call in the canceled-PDU path, which *is* guarded —
`root.ts:382-384` applies `recoverable(...) ? reconnect(...) : fail`. Same
function, same error classes, one guard apart, opposite outcomes:

| Same error, different moment | Path | Outcome |
| --- | --- | --- |
| during initial acquisition | `root.ts:411` → `backend.ts:24` | **permanent Parcel** for that interest |
| after subscribe ack | `root.ts:350` `recoverable` → `reconnect` | retry forever, never Parcel |
| during canceled-PDU reestablish | `root.ts:383` `recoverable` → `reconnect` | retry forever, never Parcel |

A one-second shift in when a daemon flap lands decides irreversibly. That is
the cliff. Notably `GenerationClosed` — "the daemon connection dropped
mid-command" (`schema.ts:72-76`, produced by the race in
`client.ts:106-107` and `client.ts:134`) — is squarely `recoverable`
everywhere except where it is most likely to be met: the first breath.

Timeouts widen the cliff in a second way: an admitted command that exceeds
`commandTimeoutMs` (default 60s, `client.ts:9`) does not just fail itself —
`client.ts:121-127` **closes the whole generation** via `options.close`.
During acquisition that closes the shared root connection out from under any
established siblings too (they will churn through `reconnect`; see the blast
radius edge below).

## Sharp edges

Each edge: the claim, the code, the consequence, and confidence.

### 1. Fallback is terminal per interest — nothing ever migrates back

Watcher subscriptions are cached in an `RcMap` keyed by
`{type, target, ignore, placement}` —
[`watcher.ts:117-162`](/packages/core/src/filesystem/watcher.ts). The
`lookup` calls `native.subscribe` once; whatever backend answers (or falls
back) serves that key until it is unsubscribed and re-demanded. There is no
reconciliation, no upgrade pass, no "Parcel was a bridge" mechanism anywhere
on this line. A Watchman-healthy daemon that comes back one second after the
flap changes nothing for the interests that already fell.

Confidence: high (pure static reading; no code path touches an existing
RcMap entry other than refcount acquire/release).

### 2. Fatal errors poison a root for the process lifetime

`create()` failures with stage `decode` or `route` set `state.fatal`
(`root.ts:186-191`, mirrored in `recoverRoot` at `root.ts:308-312`). Every
later entry point checks it first — `root.ts:181` in `current()`,
`root.ts:323` in `replacement()` — and fails immediately. **No code path
clears `state.fatal`**, and the connection object lives in the `roots` RcMap
(`root.ts:68-70`) for the scope of the registry, i.e. the process. One
malformed daemon response at acquisition condemns every future interest on
that root to instant Parcel until restart.

Confidence: high on stickiness (no clearing site exists); medium on
real-world frequency of `decode`/`route` errors — that depends on daemon
response shapes, unverified here (see open questions).

### 3. First contact is lazy, so the daemon bet is placed at the worst time

As covered under Site A: `loadFactory` imports a module
(`client.ts:38-55`), the first socket connection happens inside `create()`
at the first subscription for each root. Server start may coincide with a
daemon outage — or the outage may arrive minutes later exactly when the
first interest for some root appears. Either way the failure mode is the
same burst of Site B fallbacks, and the server has no way to distinguish
"daemon absent" from "daemon flapping" at that moment.

Confidence: high.

### 4. Concurrent acquisitions fail as a herd

All subscriptions for one root serialize on a per-connection semaphore
(`root.ts:106`, used by `current()` at `root.ts:179`). If `create()` fails
while N interests are queued (exactly the server-restart shape: config,
skills, projects, all at once), every waiter takes the same failure. Site B
then converts the whole herd to Parcel in one instant — one flap, N
permanent downgrades. The metrics shape for this is `acquires` vs
`fallbacks` (`metrics.ts:361-371`, `metrics.ts:401-402`).

Confidence: high on the serialization reading; medium on the herd claim's
exact mechanics (effect interruption semantics of queued `withPermit`
waiters not traced in detail).

### 5. Acquisition command timeouts have cross-interest blast radius

`client.ts:121-127`: a timed-out command closes its generation
(`options.close` → `root.ts:116-134`), which is shared by every established
subscription on that root. So a slow `clock` during interest N+1's
acquisition knocks interests 1..N into `reconnect` churn, while interest N+1
itself falls to Parcel — the acquiring interest is *removed* from the
population that would retry, precisely when retry is most needed. The
generation-wide close is deliberate (see
[`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) for the FIFO
timeout history that motivated admitted dispatch); the asymmetry of who
absorbs it is emergent, not chosen.

Confidence: medium-high; the close path is clear, the sibling-churn
consequence is inference from `loop()`'s `"closed"` branch (`root.ts:363-371`).

### 6. Roots can end up mixed-backend, and nothing distinguishes them

Because fallback is per interest and permanent (edges 1 and 4), one root can
simultaneously serve early interests from Parcel and later interests from
Watchman once the daemon recovers — new acquisitions after recovery go to
Watchman (`state.fatal` is only set by `decode`/`route`, so a `connect`
failure does not poison). Per-watch truth is only visible by correlating
"watchman acquisition failed" warnings with `backend=` on "watcher started"
lines. Working hypothesis: this mixed state is the most likely explanation
shape for "supposedly fell back" reports that look contradictory — both
sides are simultaneously true.

Confidence: medium; the mixed state follows from edges 1+4, but no attempt
was made to enumerate which interests share keys across owners.

### 7. Both backends failing ends the stream quietly

If Watchman acquisition fails and Parcel *also* cannot subscribe —
unsupported platform (`watcher.ts:292-296`) or the 10s Parcel acquisition
deadline (`watcher.ts:15`, `watcher.ts:313-319`) — `native.subscribe`
resolves `undefined`, the entry is marked inactive, and the subscriber
stream simply ends (`watcher.ts:149-153`). No watch at all, one log line,
no fallback beyond this. Worth keeping in mind when counting fallbacks: some
failure mass may be disappearing here instead.

Confidence: high.

### 8. "Watchman selected" has three config doors and one validation point

Selection arrives via `OPENCODE_WATCHER_BACKEND` /
`fs.watcherBackend` (`server-process.ts:122-139`, `server/src/options.ts:43-45`,
`server/src/routes.ts:117`), validated at CLI startup (bad values fail
startup, `server-process.ts:124-126`). `fs.filewatcher: false`
(`watcher.ts:101-103`) disables watching entirely — a separate, quieter
degradation that can masquerade as "the watcher isn't working." Fine — but
any operational checklist for "is watchman live?" needs to rule out all
three doors, and currently the only runtime evidence is the log fields of
edge 1's tell plus the metrics counters.

Confidence: high.

## Decision map

```mermaid
flowchart TD
    start[Watcher layer constructed] --> siteA{backend = watchman?}
    siteA -->|no| parcel_default[Parcel native]
    siteA -->|yes| loadFactory[loadFactory: import transport module only]
    loadFactory -->|import fails| siteA_fallback["Site A: whole process on Parcel<br/>(nearly dead code)"]
    loadFactory -->|ok| registry[Root registry]
    registry --> interest[Interest arrives for a root]
    interest --> file{file watch?}
    file -->|yes| node[Parcel node:fs.watch - never Watchman]
    file -->|no| current["current(): fatal? active? recovering? create()"]
    current --> create["connect, capabilityCheck, watch<br/>(single shot, no retry)"]
    create --> establish["clock, subscribe<br/>(single shot, no retry)"]
    establish -->|any error| siteB["Site B: this interest -> Parcel permanently<br/>siblings racing it also fail"]
    establish -->|ack| loop[loop(): established]
    loop --> flap[daemon drop / timeout / cancel] --> guard{recoverable?}
    guard -->|yes| reconnect["reconnect: forever, backoff + cursor<br/>never Parcel"]
    guard -->|no| dead[input.fail: watch stream ends]
```

## Open questions (unverified — treat as prompts, not facts)

- **Transport behavior on a dead/stale socket.** Does `Reflect.construct`
  throw synchronously, or does the client surface an `error` event mid-
  `capabilityCheck` (yielding `GenerationClosed` vs `connect` stage)? This
  decides *which* log text a daemon outage produces at Site B and is pure
  runtime behavior of `@superbfowle/fb-watchman-esm`. Not traced here.
- **Does the forked transport retry internally?** If it re-spawns the CLI or
  reconnects under the hood, some flaps never surface; the observable
  fallback rate would undercount flaps.
- **Real-world `decode`/`route` failure rate** (edge 2's trigger): which
  daemons (watchwoman vs upstream watchman) produce response shapes the
  schemas reject. Relevant schemas: `route.ts:19-24` (`watch` response),
  `schema.ts` `ClockResponse`/`SubscribeResponse`/`SubscriptionPdu`.
- **Interest churn as accidental recovery.** Nothing *scheduled* re-attempts
  a fell-back interest, but if config/skill watchers re-subscribe on their
  own lifecycle events, some interests could migrate back by accident. Not
  traced; would change how permanent edge 1 is in practice.
- **RcMap placement-key staleness** (`watcher.ts:169-170`): whether a stale
  `placement` can route an interest to the wrong root intent (project vs
  exact) and thereby change its fallback blast radius. Not examined.

## Suggestions (brainstorming — none authoritative, none endorsed)

Separated deliberately from the findings above. These are directions that
the code map makes visible, with their principal tradeoff attached; each
would need its own design pass (and probably its own wave) before any is
real.

1. **Bound the cliff with acquisition retries.** Wrap `root.ts:411` (and/or
   filter `backend.ts:24`) so `recoverable()`-class errors get N attempts of
   the existing backoff family before surfacing to Site B. Tradeoff:
   subscribe latency grows during genuine outages, and the watcher layer has
   no deadline around Watchman acquisition (Parcel's 10s lives only in
   `subscribeDirectory`), so a bound must be chosen or borrowed.
2. **Make fallback non-terminal.** Record fell-back interests and re-attempt
   Watchman on interest churn or a slow reconciliation tick, swapping the
   subscription if it acquires. Tradeoff: stream swap under an RcMap entry
   is the most invasive option here and duplicates delivery guarantees
   during the swap.
3. **De-poison `state.fatal`.** TTL it, or clear it on the next acquisition
   attempt instead of caching forever (`root.ts:181`). At minimum, a fatal
   transition deserves a loud, distinctive log/metric line — it is currently
   visible only as repeated generic acquisition failures.
4. **Make "started with watchman" a connectivity fact.** A cheap startup
   probe (`get-sockname`/`clock`) at layer construction would turn Site A
   from near-dead code into a meaningful signal: fail fast, warn with the
   socket path, or feed the metrics baseline. Tradeoff: adds a startup
   dependency on daemon availability that the lazy design deliberately
   avoids.
5. **Shrink the acquisition blast radius.** An acquiring interest's command
   timeout currently closes the generation shared with established siblings
   (`client.ts:121-127`). Consider a short-lived generation for initial
   establish, or exempt first-command timeouts from the shared close.
   Tradeoff: must not reintroduce the FIFO head-of-line blocking that
   [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) records as
   the original motivation for the current design.
6. **Surface the fallback in real time.** `fallbacks` exists
   (`metrics.ts:370-371`) but only rides the 15-minute dump. A one-line
   event per fallback (root + error stage) plus a per-dump gauge of
   Parcel-vs-Watchman interest counts would make edges 1, 4, and 6
   operationally visible. Cheapest item on this list; see
   [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) for the dump
   reading guide.

## Cross-references

- [`README.md`](/.design/watchman/README.md) — maintenance log; lines 76–78
  are the correctly-qualified version of the claim this doc dissected, and
  the metrics/configuration tables list the env knobs (`retryBaseMs`,
  `commandTimeoutMs`, `metricsIntervalMs`) relevant to several edges.
- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) — the implemented
  architecture; the acquisition/recovery split as *designed* (this doc is
  about the residual gap between that split and the folk summary of it).
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) — the FIFO
  timeout incident behind the admitted-dispatch and generation-close design
  that edge 5 inherits; any blast-radius change must be checked against it.
- [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) — how to read
  `acquires`, `fallbacks`, per-channel gauges; the instrument for verifying
  edges 1, 4, and 6 empirically.
- [`files-too0.glm53.md`](/.design/watchman/files-too0.glm53.md) — the
  file-watches-never-on-Watchman topic (`backend.ts:18`) from its own wave.
- [`cookie-clash0.gpt56s.md`](/.design/watchman/cookie-clash0.gpt56s.md) —
  cross-daemon and nested-root environment; relevant to open question three
  and to any environment where "the daemon" is ambiguous (two sockets,
  two daemons).
- [`parcel0.glm53.md`](/.design/watchman/parcel0.glm53.md) — the Parcel
  side of the fallback pair, including its acquisition deadline behavior
  that edge 7 leans on.
