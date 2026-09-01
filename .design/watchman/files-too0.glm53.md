---
type: Design
title: File watches through Watchman — assessment (files-too0)
description: Evaluates routing individual-file watches through the root-scoped Watchman backend instead of node:fs.watch; recommends keeping files on the Node adapter as a codified invariant.
resource: /.design/watchman/files-too0.glm53.md
tags: [opencode, watchman, watchwoman, filesystem, watcher, design]
status: draft
generated: { by: model:glm-5.3, at: 2026-09-01T04:40:27Z }
sources:
  - id: watcher-registry
    resource: /packages/core/src/filesystem/watcher.ts
    title: Watcher exact-interest registry and Node/Parcel native adapters
  - id: watchman-backend
    resource: /packages/core/src/filesystem/watcher/watchman/backend.ts
    title: Watchman NativeInterface adapter (file bypass at line 18)
  - id: watchman-root
    resource: /packages/core/src/filesystem/watcher/watchman/root.ts
    title: RootConnection generations, recovery, and publish mapping
  - id: watchman-route
    resource: /packages/core/src/filesystem/watcher/watchman/route.ts
    title: RootIntent resolution and subscription relative-root mapping
  - id: watchman-client
    resource: /packages/core/src/filesystem/watcher/watchman/client.ts
    title: Raw client, admitted dispatch, command deadline
  - id: watchman-schema
    resource: /packages/core/src/filesystem/watcher/watchman/schema.ts
    title: Watchman response and unilateral PDU schemas
  - id: interests
    resource: /packages/core/src/filesystem/watcher/interests.ts
    title: Owner-local WatchInterests with ready and placement attachment
  - id: internal
    resource: /packages/core/src/filesystem/watcher/internal.ts
    title: Placement type, metadata symbol, normalization
  - id: location-watcher
    resource: /packages/core/src/filesystem/location-watcher.ts
    title: .git/HEAD and .hg/branch file-watch consumer
  - id: config-source
    resource: /packages/core/src/config/plugin/source.ts
    title: Configured plugin entrypoint file-watch consumer
  - id: config-instruction
    resource: /packages/core/src/config/plugin/instruction.ts
    title: AGENTS.md ancestor file-watch consumer
  - id: config-skill
    resource: /packages/core/src/config/plugin/skill.ts
    title: Skill interests owner with cookie filter
  - id: config
    resource: /packages/core/src/config.ts
    title: Config interests owner (sentinel and alias file inputs)
  - id: accepted-design
    resource: /.design/watchman/draft2.gpt56t.md
  - id: retained-design
    resource: /.design/watch/draft1.gpt56t.md
  - id: maintenance-log
    resource: /.design/watchman/README.md
  - id: daemon-validation
    resource: /.design/watchman/watchwoman0.unknown.md
  - id: timeout-incident
    resource: /.design/watchman/timeout0.gpt56s.md
  - id: cookie-clash
    resource: /.design/watchman/cookie-clash0.gpt56s.md
---

# File watches through Watchman — assessment (`files-too0`)

## Situation

The root-scoped Watchman backend is opt-in for **directory** interests only. When
`OPENCODE_WATCHER_BACKEND=watchman` is selected,
[`backend.ts:18`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
short-circuits every `type: "file"` input back to the fallback Native layer:

```ts
if (input.type === "file") return fallback.subscribe(input)
```

So file watches never touch the daemon even on hosts that deliberately adopted
Watchman. This wave evaluates whether that should change: what the accepted
design's rationale was, whether it still holds, which routing shapes exist, and
what each would cost in complexity, daemon resources, semantics, and failure
blast radius. It is a design assessment only — no code changes.

The prompt for the underlying inquiry: *who consumes file watches today, what
contract do they rely on, and does daemon routing add value proportional to the
failure-domain and semantic surface it imports?*

## Current state

### How file watches work today

[`watcher.ts:237-253`](/packages/core/src/filesystem/watcher.ts) — the native
file path calls `node:fs.watch` on the **containing directory**
(non-recursive), filters events to the exact resolved target filename, and
publishes only `{ path: target, type: "update" }` — for every event kind,
including deletes. The subscription is acquired synchronously, so
`ready` acknowledgment is effectively immediate.

Registry semantics ([`watcher.ts:117-190`](/packages/core/src/filesystem/watcher.ts)):

- The `RcMap` key is `{ type, target, ignore, placement }` compared
  structurally, so identical file watches share one `fs.watch` entry.
- `ignore` is always `[]` for files (line 167).
- `placement` is forced to `{ type: "exact" }` for files (lines 169-170),
  regardless of any metadata the caller attached.
- `failure` is a `Deferred` that terminates all subscriber streams for the key
  when the native adapter calls `fail`.

### Who watches files

| Consumer | Input | Path | Route |
| --- | --- | --- | --- |
| `LocationWatcher` | `.git/HEAD` or `.hg/branch` | [`location-watcher.ts:72`](/packages/core/src/filesystem/location-watcher.ts) | direct `Watcher.subscribe`, no metadata |
| `ConfigPluginSource` | configured plugin entrypoints outside config roots | [`source.ts:59`](/packages/core/src/config/plugin/source.ts) | direct `Watcher.subscribe`, no metadata |
| `ConfigInstructionPlugin` | global + ancestor `AGENTS.md` files | [`instruction.ts:52`](/packages/core/src/config/plugin/instruction.ts) | direct `Watcher.subscribe`, no metadata |
| `Config` (interests owner) | direct config file targets, missing-root sentinels, symlink aliases | [`config.ts:296-308`](/packages/core/src/config.ts) | via `WatchInterests`, which attaches `ready` and exact placement |
| `ConfigSkillPlugin` (interests owner) | missing-ancestor sentinels, symlink alias targets | [`skill.ts:60-64`](/packages/core/src/config/plugin/skill.ts) | via `WatchInterests` |

Two structural facts follow. First, the direct subscribers — the ones watching
*real, high-value* files (VCS metadata, instructions, plugin entrypoints) — do
not use `WatchInterests` and attach no placement metadata, so a
placement-driven routing change would not reach them without migrating their
ownership. Second, the interests-owned file watches are almost entirely
*sentinels and aliases*: placeholders for paths that do not exist yet (so their
creation can be observed) and symlink-alias targets. These are the least
valuable candidates for daemon routing.

## Why the accepted design keeps files on the Node adapter

### The corpus rationale

The rationale is stated three times across the corpus, always briefly:

- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) (accepted
  architecture), placement section: *"Files are always exact and remain on the
  Node adapter."* The architecture diagram routes `Watcher -->|file| Node[Node
  file adapter]` separately from the directory backends.
- [`draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md) (retained design):
  lists *"Replacing exact file watches initially"* as a **non-goal**, routes
  *"exact files / missing sentinels / VCS metadata"* to the *"existing file
  path"*, and in its fallback section: *"Watchman unsupported for exact file
  class: keep `node:fs.watch`."*
- [`README.md`](/.design/watchman/README.md) runtime shape: *"Files continue to
  use `node:fs.watch`; Parcel remains the default directory adapter."*

The deeper reasoning is implicit in draft1's key observation — *"roots are
expensive, subscriptions are cheap"* — and draft2's decision statement: *"The
retained value is daemon-root sharing: many overlapping OpenCode interests,
processes, and tools can reuse one recursive crawl."* The architecture exists
to amortize expensive recursive crawls across interests, processes, and tools.
A single-file watch is the opposite case: one non-recursive inotify watch on an
already-existing directory — the cheapest watch primitive the OS offers, with
no crawl to share and no daemon dependency to inherit.

### Does the rationale still hold?

Yes, and the post-design validation strengthened it:

1. **The daemon API cannot watch a file.** `watch`/`watch-project` reject
   non-directory paths — watchwoman's only `watch` rejections are
   "non-directory or un-stat-able" ([`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md),
   claim 3). Every "file through Watchman" shape is actually a *directory
   subscription with an expression filter* in disguise. The daemon never gets
   more precise than the directory it already covers.
2. **The failure-domain thesis argues for the exclusion.** draft2 and
   [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) rebuilt the
   backend so failures stop at the root whose socket and FIFO produced them.
   Files on `node:fs.watch` have a **zero-sized daemon failure domain**: no
   generation retirement, no reconnect storm, no command deadline, no fatal
   decode can take away `.git/HEAD` awareness. Routing them through a
   `RootConnection` imports all of that into the system's most
   correctness-critical, lowest-volume watches.
3. **Nothing measured since suggests file watches are a bottleneck.** The
   follow-ups in the maintenance log name many-project cold-boot spread and
   OTEL export — not file-watch cost. File watches per location number ~1-6;
   the process-global registry dedupes identical ones across locations.

The one soft spot: the corpus rationale is *asserted* ("unsupported for exact
file class") rather than argued, and the `if` in `backend.ts` reads like an
incidental capability gap rather than a designed invariant. A reader could
reasonably ask, as this wave does, whether it was deliberate. It was — but the
code should say so.

## Requirements and constraints

Any option must account for these observable contracts:

| Contract | Where | Constraint |
| --- | --- | --- |
| RcMap structural sharing | [`watcher.ts:117-123`](/packages/core/src/filesystem/watcher.ts) | Identical file watches share one native entry. Note: today's forced-exact placement makes file keys **location-independent**, so two nested-project locations watching the same `AGENTS.md` share one `fs.watch`. Per-location placement would split that key — a sharing regression unique to files. |
| `ready` acknowledgment | [`interests.ts:37-42`](/packages/core/src/filesystem/watcher/interests.ts) | Fires one synthetic `{path, type: "update"}` when the native subscription acknowledges, driving the post-ack dirty replay. Attached for file inputs too. Under `fs.watch` it is immediate; under Watchman it waits for capability → `watch` → `clock` → `subscribe` round-trips. |
| `failure` Deferred | [`watcher.ts:128-136`](/packages/core/src/filesystem/watcher.ts) | Native `fail` ends all subscriber streams for the key. Interests owners recover (`skill.ts:207-214` resubscribes); **`instruction.ts` has no stream-failure recovery** and `location-watcher`/`source.ts` only log. Today file streams essentially never fail; daemon routing makes fatal `decode`/`route` errors possible failure modes for them. |
| Event-type mapping | [`watcher.ts:243`](/packages/core/src/filesystem/watcher.ts) | The fs.watch path publishes **only `"update"`**, even for deletes. [`publishFiles`](/packages/core/src/filesystem/watcher/watchman/root.ts) maps watchman states to `create`/`update`/`delete`. `location-watcher.ts:29-33` translates these into bus `add`/`change`/`unlink` — so richer types would change observable `FileSystem.Event.Changed` payloads. Other consumers are type-agnostic. The `"update"`-only contract is load-bearing for bus stability, or at minimum unverified; preserving it is the zero-risk default. |
| Placement | [`watcher.ts:169-170`](/packages/core/src/filesystem/watcher.ts) | Always `{type: "exact"}` for files today, whatever the metadata says. `interests.ts:43-46` only computes project placement for directories. |
| `ignore` | [`watcher.ts:167`](/packages/core/src/filesystem/watcher/watcher.ts) | Always `[]` for files; the watchman [`expression()`](/packages/core/src/filesystem/watcher/watchman/root.ts) would only ever contribute a name term for files. |
| File targets may not exist | [`internal.ts:31`](/packages/core/src/filesystem/watcher/internal.ts), sentinels | Missing-path sentinels rely on the parent directory being watched. Sentinels produced by `firstMissing` guarantee an existing parent; a daemon route must tolerate a name-filtered subscription for a path absent from the daemon tree. |

## Options

### (a) Status quo, codified

Files stay on `node:fs.watch` unconditionally, and the exclusion is promoted
from an incidental `if` to a documented invariant: a comment on
[`backend.ts:18`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
naming the rationale, plus a line in the maintenance log's runtime shape.
Optionally, a small unit test asserting the backend routes file inputs to the
fallback, so the behavior is protected rather than accidental.

- **Complexity:** near zero (comment + one test).
- **Daemon cost:** none — files contribute no subscriptions, no roots, no sockets.
- **Semantics:** all contracts unchanged by construction.
- **Blast radius:** none. Generation retirement, reconnect, cursor recovery, and
  fatal decode errors remain directory-only concerns.

### (b) Hybrid — files ride an existing root intent

Files whose target is contained by an explicit project root ride that root's
`RootConnection` as one more daemon subscription: `relative_root` set to the
target's *directory* (a file path is not a valid `relative_root` — see
[`route.ts:26-40`](/packages/core/src/filesystem/watcher/watchman/route.ts),
which today would emit the file path itself) and an expression term
`["name", "<relative file path>", "wholename"]` added in
[`expression()`](/packages/core/src/filesystem/watcher/watchman/root.ts).
Files outside every root keep `fs.watch`.

Two sub-shapes:

- **b1 — persistent subscription (the natural fit).** Identical to directory
  interests: `clock` + `subscribe` with the name expression; PDUs flow through
  the existing loop, cursor resume, and conservative update.
- **b2 — query-on-ack snapshot.** No persistent subscription; on acknowledgment
  run a one-shot `query` for the file's state. Rejected: nothing in the
  architecture polls, push consumers would still need a subscription for
  changes, and it duplicates the owner-level post-ack dirty replay that already
  closes the scan-to-subscribe window. (A watcher-level snapshot capability is
  already parked in draft2's crawl-economics section as a *separate* future
  seam.)

Assessment:

- **Complexity:** moderate and spread out — `interests.ts` (compute placement
  for files), `watcher.ts` (stop forcing exact placement for files),
  `backend.ts` (stop bypassing file inputs), `route.ts` (file subscription
  shape), `root.ts` (normalize published types to `"update"` for file inputs).
  Critically, **this only routes interests-owned files** — the sentinels and
  aliases. The three direct consumers named in this wave's brief
  (`location-watcher`, `source.ts`, `instruction.ts`) attach no metadata and
  would keep `fs.watch` unless separately migrated to `WatchInterests`, which
  is a real ownership refactor, not plumbing.
- **Daemon cost:** small per file (one subscription on an already-pinned root),
  but the *first* file interest for a location with no directory interests
  would cold-establish the project root connection (capability + `watch`,
  possibly a cold crawl) just to observe one file.
- **Semantics:** preservable with care (type normalization, `ready` unchanged
  in meaning but slower, failure propagation now possible), **except** the
  RcMap sharing regression: per-location placement splits identical file keys
  that today collapse to one shared entry.
- **Blast radius:** file subscriptions join the root's failure domain —
  generation retirement pauses them, reconnect resumes them from cursor with
  one conservative `{path, type: "update"}` (already file-safe:
  [`root.ts:215`](/packages/core/src/filesystem/watcher/watchman/root.ts) and
  the `is_fresh_instance` path publish exactly that shape). A fatal
  `decode`/`route` error on the shared root now fails file streams whose
  consumers (`instruction.ts`) have no recovery path.

### (c) Every file gets its own exact-target connection

`watch <dirname(file)>` as an exact root per distinct containing directory, one
`RootConnection` each, name-expression subscription inside.

- **Complexity:** lower than (b) in placement terms (no interests change — file
  inputs keep exact placement and the backend maps target → dirname intent),
  but adds root-intent synthesis logic in the backend.
- **Daemon cost:** the worst option. Each distinct dirname becomes a daemon
  root and a socket. `.git` under every project becomes a **nested root inside
  the project root** — overlapping recursive kernel watches, duplicate event
  processing, extra daemon memory, and every dirname root re-crawls on daemon
  restart (the daemon is in-memory only). Global-file dirnames
  (`~/.config/opencode`) may coincide with existing exact roots, but `.git`
  and `.hg` never coincide with the project root.
- **Semantics:** as (b), plus the same sharing questions.
- **Blast radius:** per-file isolation is *better* than (b) (one dirname's
  socket dies without touching the project root), but there are simply more
  sockets and generations to churn — on a 30-60 project host this multiplies
  steady-state connections by roughly the number of distinct file-watch
  directories.

### (d) Other shapes observed or considered

- **Migrate the direct consumers to `WatchInterests` and route everything
  (b-style).** The only shape that actually moves `location-watcher`,
  `source.ts`, and `instruction.ts` onto the daemon. It subordinates three
  simple, independent subscribe loops to the interests owner and changes their
  lifecycle semantics (reconcile-driven retention vs. watch-forever — note
  `source.ts:46-48` deliberately never tears watches down). Large blast radius
  for negligible gain.
- **One multiplexed "file channel" connection.** All file watches over a single
  daemon root. Requires a common ancestor for all files — in practice `$HOME`.
  A plain `watch $HOME` (never mind `watch-project`'s marker climb, the
  validated 12-minute, 29 GB incident in
  [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md)) crawls
  32M files. Categorically rejected.
- **Keep-as-fallback-always (today's literal code) promoted to policy** — that
  is option (a).

### Comparison

| | (a) status quo | (b) hybrid root-riding | (c) exact connection per file | (d) full migration |
| --- | --- | --- | --- | --- |
| Complexity | ~0 | Moderate, 5 modules + consumer decision | Moderate, backend synthesis | High, ownership refactor |
| Daemon cost | None | +1 subscription per project-contained file; possibly one root establishment | +1 root + socket per distinct dirname; nested roots; restart re-crawls | (b) plus migration churn |
| Semantics preserved | All, trivially | All, with deliberate type normalization; **sharing regression** on nested-project file keys | All, with normalization | Lifecycle changes for three owners |
| Blast radius (retire/reconnect/cursor) | None | File streams join the project root's failure domain; fatal root errors reach unrecovered consumers | Isolated per dirname, but many more failure domains | (b)'s, everywhere |
| Reaches the named consumers | No (by design) | No — only interests-owned sentinels/aliases | Yes (all file inputs) | Yes |
| Value delivered | — | Uniformity; metrics visibility; daemon coalescing | Uniformity | Uniformity |

The value column is the tell: every option's payoff is *uniformity* — one
event source, file subscriptions visible in channel metrics, daemon-side
coalescing. But owner-level coalescing already exists where bursts matter
(capacity-one sliding queues in skill and instruction, debounced config
reload), and the daemon's ~5 ms settle batching is irrelevant at file-watch
frequencies. No option reduces kernel watches (the daemon holds strictly more),
none reduces sockets except incidentally, and none can make the daemon watch
anything narrower than the directory `fs.watch` already watches.

## Recommendation

**Option (a): keep files on `node:fs.watch`, and codify the exclusion.**

One-line rationale: file watches are the cheapest primitive in the system and
gain nothing from the daemon's only retained value — shared recursive root
crawls — while importing its entire failure domain into correctness-critical,
near-silent watches; the daemon API cannot even target a file, so every
alternative is a heavier directory subscription wearing a file's name.

Codification slice (if accepted):

1. Comment [`backend.ts:18`](/packages/core/src/filesystem/watcher/watchman/backend.ts)
   with the invariant: file inputs are *deliberately* Node-only — no root to
   share, no crawl to amortize, zero daemon failure domain; cite draft2's
   placement rule.
2. One unit test in `watchman-root.test.ts`'s orbit (or a small backend test)
   asserting `make(fallback).subscribe` routes a file input to the fallback and
   a directory input to the registry.
3. One sentence in [`README.md`](/.design/watchman/README.md) runtime shape
   upgrading "Files continue to use `node:fs.watch`" from a status note to a
   design rule, with this document as the reference.

### If (b) is ever taken anyway: implementation sketch

Recorded so the narrowest viable slice is on paper, not folklore. Modules that
change:

- [`interests.ts:43-46`](/packages/core/src/filesystem/watcher/interests.ts):
  compute project/exact placement for **all** inputs, not just directories.
- [`watcher.ts:169-170`](/packages/core/src/filesystem/watcher.ts): stop
  forcing `{type:"exact"}` for files; trust metadata like directories do.
- [`backend.ts:18`](/packages/core/src/filesystem/watcher/watchman/backend.ts):
  remove the bypass; files route through the registry by placement like
  directories. The existing acquisition-failure catch already falls back to
  Parcel per-interest.
- [`route.ts`](/packages/core/src/filesystem/watcher/watchman/route.ts): for
  file targets, `relativeRoot` = the *dirname* of
  `relative(project, target)` (or empty), never the file path itself; reject
  targets outside the intent as today.
- [`root.ts`](/packages/core/src/filesystem/watcher/watchman/root.ts):
  `expression()` accepts a name term for file inputs;
  `publishFiles` normalizes every mapped type to `"update"` when
  `input.type === "file"` to preserve the bus contract; `subTarget` already
  produces sensible relative names for files.
- Decide explicitly whether the three direct consumers migrate to
  `WatchInterests` (they must, to benefit) — and if they do, `instruction.ts`
  needs a stream-failure recovery path first, because daemon-fatal errors
  become reachable for it.
- Accept the nested-project sharing regression (identical file watches with
  different placement roots split) or special-case files to keep exact keys
  (which forfeits root-riding and collapses back toward (a)).

## Failure-domain and watchwoman analysis

**Generation retirement and reconnect (b/c only).** File subscriptions ride the
same `loop` as directory ones: on generation close they detach, the shared
reconnect sequence runs once per root, each subscription resumes from its
cursor, and route changes / fresh instances publish one conservative
`{path, type: "update"}` — already the exact shape file consumers expect. This
is well-tested machinery; the change is *who joins it*, not how it works.

**Post-ack dirty replay.** `interests.ts` attaches `ready` for file inputs
today, so coverage exists unchanged under (a). Under (b/c) the
scan-to-subscribe window widens from ~zero (synchronous `fs.watch`) to the
daemon round-trip chain, making the post-ack replay genuinely load-bearing for
files — it works, but files move from "no window" to "window closed by replay."

**Cookie churn.** The concern inverts under daemon routing: a name-filtered
file subscription is *structurally immune* to sibling cookie files — a cookie
is never named `HEAD` or `AGENTS.md` — and so is today's filename-filtered
`fs.watch`. The known cookie amplification path
([`cookie-clash0.gpt56s.md`](/.design/watchman/cookie-clash0.gpt56s.md),
[`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md)) is *directory*
interests on Parcel fallback seeing a classic-watchman daemon's sanity cookies;
the skill-domain filter at [`skill.ts:205`](/packages/core/src/config/plugin/skill.ts)
remains the containment and needs no change. Watchwoman itself writes no
cookies and filters `.watchman-cookie-*` from results (validated, claim 5).
One (c)-specific note: classic watchman writes its cookies *into* the roots it
watches, so exact `.git`/`.hg` roots would receive physical cookie churn that
today's design never creates; watchwoman makes this moot locally but the
classic-daemon hazard is why (c)'s new roots are worse than they look.

**Watchwoman divergences that bite (or would), per
[`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md):**

| Divergence | Consequence for files-too |
| --- | --- |
| `watch` rejects non-directory paths (claim 3) | Files can never be exact roots; (c) must synthesize dirname intents, (b) must ride directory roots — no shape watches "the file". |
| No `canceled` PDU (claim 4.1) | The `SubscriptionCanceled` recovery branch in `root.ts` never fires on this daemon; harmless for files, already handled client-side. |
| Stale cursors return full results with `is_fresh_instance: false` (claim 4.2 / amendment 3) | After a daemon restart a file subscription's resume returns the full tree — the name expression prunes it to 0-1 files, so the conservative-update burst is a single event. Expression pushdown is what makes this graceful; a `relative_root`-only file scope would be wrong. |
| `unsubscribe` does not stop PDUs; dead-client subscriptions linger (claim 4.3-4.4) | More file subscriptions means more zombie subscriptions pinning quiet roots against the 1 h stale reap. Correctness stays client-side (generation-scoped names, no-op map lookups); cost is daemon-side only. |
| 5 ms event settle batching (claim 1) | File events gain up to ~5 ms latency vs direct inotify. Irrelevant at file-watch frequencies. |
| In-memory daemon; restart re-crawls every root (claim 1) | (a)/(b): no new roots. (c): every dirname root re-crawls on daemon restart. |
| `always_include_directories` defaults true (claim 4.7) | Directory entries in PDUs; the name expression excludes them for file subscriptions; `publishFiles` type-mapping already tolerates them. |
| Marker-climb incident (`watch-project` → `$HOME`) | Not reachable — the design sends only plain `watch`, and files-too must not introduce `watch-project`. Ruled out the "one file channel" shape outright. |

## Test plan

Run from `packages/core`, never the repository root. For option (a), the
additions are minimal; for (b/c) they are the gate.

- [`watchman-root.test.ts`](/packages/core/test/filesystem/watchman-root.test.ts)
  (injected `TestClient`):
  - *(a)* a backend-level test: `make(fallback, …)` with a recording fallback
    sends file inputs to the fallback and directory inputs to the registry.
  - *(b/c)* subscribe a file input under a project intent; assert the
    `subscribe` args carry `expression: ["allof", ["name", "<rel>", "wholename"]]`
    (or equivalent) and a directory-valued `relative_root`; assert a sibling
    change outside the name filter publishes nothing and a change to the file
    publishes `{type: "update"}` — *only* `"update"`, covering the
    create/delete normalization.
  - *(b/c)* extend "runs one reconnect attempt sequence for all subscriptions
    on a root" and "a submitted timeout closes only its root generation" with a
    file subscription present, asserting it resumes and receives one
    conservative update.
- [`watcher-interests.test.ts`](/packages/core/test/filesystem/watcher-interests.test.ts):
  *(b)* placement attachment for file inputs (contained → project, external →
  exact); `ready` post-ack ordering for a file sentinel; failure propagation
  for a file interest reaching the owner's recovery path.
- [`watcher.test.ts`](/packages/core/test/filesystem/watcher.test.ts):
  the existing `limits file watches to the exact target` case pins the
  `fs.watch` path and stays green under (a); *(b)* add registry-key cases —
  identical file inputs with equal placement share an entry, and nested-project
  placements split (documenting the accepted regression).
- [`watchman-live.test.ts`](/packages/core/test/filesystem/watchman-live.test.ts)
  (opt-in, `OPENCODE_WATCHMAN_LIVE=1`): *(b/c)* touch a watched file and
  receive one update; touch a sibling (including a `.watchman-cookie-` shaped
  name) and receive none; restart the daemon and observe the file subscription
  resume with a single conservative update rather than a burst.

## Risks and open questions

- **Is `"update"`-only load-bearing?** `location-watcher` maps
  `create/update/delete` → `add/change/unlink` bus events; today file watches
  always produce `change`. Whether any `FileSystem.Event.Changed` consumer
  branches on the event kind is unverified — the audit is a precondition for
  *any* option that lets richer types through, and normalization avoids it.
- **`instruction.ts` has no failure recovery.** Under any daemon-routing shape,
  a fatal root error silently ends `AGENTS.md` watching for the process
  lifetime. Fix before, not after, any (b) adoption.
- **Nested-project file-key sharing regression** under (b) is real but
  unmeasured; it only matters for nested locations sharing ancestor
  `AGENTS.md` files.
- **Watchwoman `.git` crawl depth**: the daemon seed walk recurses *shallowly*
  into `.git`/`.hg`, so (c)'s dirname roots are cheaper than feared but not
  free; exact cost unmeasured. Classic-watchman behavior for `.git`-at-root
  cookie placement is the sharper (c) hazard.
- **Revisit triggers for (a):** adopt (b) only if channel metrics later show
  file-interest events are a measurable fraction of owner rescans, or a host
  hits inotify-watch exhaustion where daemon consolidation would genuinely
  reduce kernel watches (it does not today — the daemon adds watches).

## Cross-references

- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) — accepted
  architecture; its placement rule ("Files are always exact and remain on the
  Node adapter") is the decision this wave evaluates and affirms; its
  daemon-root-sharing rationale is the core argument for the exclusion.
- [`draft1.gpt56t.md`](/.design/watch/draft1.gpt56t.md) — retained design;
  supplies the "roots are expensive, subscriptions are cheap" economics and the
  original non-goal and fallback lines keeping files on `node:fs.watch`.
- [`README.md`](/.design/watchman/README.md) — maintenance log and runtime
  shape; its "Files continue to use `node:fs.watch`" line is what option (a)
  promotes from status note to invariant.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) — daemon
  validation; source of the non-directory `watch` rejection, stale-cursor
  full-results, unsubscribe lingering, reaping, and cookie findings cited
  above, and the `$HOME` crawl incident that rules out any common-ancestor
  file channel.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) — FIFO timeout
  incident; its deadline/failure-boundary separation is why importing
  generation-level failure into file streams is a cost, not a neutral change.
- [`cookie-clash0.gpt56s.md`](/.design/watchman/cookie-clash0.gpt56s.md) —
  cookie lifecycle and amplification; establishes that file subscriptions are
  structurally cookie-immune and that the containment boundary stays at
  `skill.ts`.
