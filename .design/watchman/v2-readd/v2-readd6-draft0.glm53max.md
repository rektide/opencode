---
type: Design
title: Watchman v2 re-add round 6 — the lean upstreamable cut
description: A deliberately small, humanly understandable Watchman adapter for upstream OpenCode — one JSON-line session per watch key, one generation-fenced controller loop, fresh-clock recovery with invalidate-on-install, heartbeat, per-root attach serialization, and a pure ignore mapper; fortress defenses documented as non-goals with re-entry triggers.
resource: /.design/watchman/v2-readd/v2-readd6-draft0.glm53max.md
tags: [opencode, watchman, v2, upstream, architecture, lean]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - { id: syn0, resource: /.design/watchman/v2-readd/v2-readd5-syn0.gpt56solxh.md, title: Round-5 synthesis whose common core this draft accepts and shrinks }
  - { id: gx1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.glm53max.md, title: GX second draft (cross-informed) }
  - { id: astra1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.gpt6astra.md, title: Astra second draft (cross-informed) }
  - { id: e20, resource: /.design/watchman/v2-readd/v2-readd5-e20-read-feedback0.gpt56solxh.md, title: Read-feedback proof — now a Watchwoman-repo concern }
  - { id: parity, resource: file:///home/rektide/src/watchwoman-systemd/.design/watchman-parity/watchman-parity0.glm53max.md, title: Watchwoman daemon-side gap list (forked out of this effort) }
  - { id: readd3, resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md, title: Carry-first build plan (W0-W10) whose W1 is already carried }
---

# Watchman v2 re-add round 6 — the lean upstreamable cut

## Status and decision record

Round 5 produced two large cross-informed drafts and a synthesis. Human
review on 2026-09-05 accepted their **common core** and rejected their
weight: the corpus-built designs over-secure against corner cases the
feature will not see in practice. This draft is the deliberate re-cut:

1. **Upstreamable first.** The design targets stock Watchman semantics and
   must read like a normal, reviewable upstream feature: small surface, no
   new runtime dependencies, Effect-idiomatic, well-tested.
2. **One implementation, two postures.** The carryable view is the same
   code atop upstream with our deployment pin; it is not a second
   architecture. Its draft follows separately once this cut is built.
3. **Watchwoman concerns are forked out.** Daemon-side gaps live in the
   Watchwoman repo ([`watchman-parity0`](file:///home/rektide/src/watchwoman-systemd/.design/watchman-parity/watchman-parity0.glm53max.md)).
   Nothing in the OpenCode client exists to defend against a daemon we are
   fixing daemon-side.
4. **Build first, sequence commits later.** Commit sequencing is deferred
   to a post-build documentation pass, per direction.
5. Build continues in the carrier worktree on top of the already-carried
   W1 (`refactor(core): make watcher readiness generation-aware`).

## Product contract

What a user sees:

1. Recursive `directory` watches can select Watchman. `file` and `entries`
   stay on Node; Parcel remains the default everywhere else.
2. Selection is explicit and static: a socket path in Core options,
   mirrored through Server options and CLI environment
   (`OPENCODE_WATCHMAN_SOCKET`, falling back to `WATCHMAN_SOCK`). Core
   never reads the environment and never spawns anything.
3. A selected Watchman watch never silently falls back to Parcel, never
   ends its stream, never resolves `undefined` on demand. Before first
   attachment it is pending; during daemon loss it is stale-but-live with
   loud classified logs and bounded backoff.
4. Events are hints shaped exactly like Parcel's:
   `{ path, type: "update" | "delete" }`, including directory rows. No
   create/update distinction, no inode baseline, no operation chronology.
5. Recovery is authoritative: every (re)installation of a subscription
   emits one invalidation through the W1 seam, which re-runs each
   subscriber's `onReady` rescan. The daemon's rows are never treated as
   a journal.

The external seam is unchanged: `Watcher.Native` behind the existing
`Watcher.Service` RcMap, `subscribe(input, onReady?) -> Stream<Update>`.

## What this design keeps from the corpus (and why)

These are the load-bearing findings; nearly all of them are
simplifications, and each is cheap:

| # | Finding (evidence) | Design response |
| --- | --- | --- |
| K1 | Locator unlinks refused sockets and can spawn daemons (GX1 Claim B) | Explicit socket only; no binary, no spawn, no unlink, no `get-sockname` |
| K2 | Subscribe's initial rows are provably not a snapshot (GX1 Claim A: initial query precedes tick registration) | Discard all pre-install rows; owners' `onReady` is the authoritative initial scan |
| K3 | No portable create/update distinction; real mutations can be stat-equalized (E09) | Publish `update`/`delete` only; never filter rows by metadata |
| K4 | Events are lost across disconnections; cursors cannot repair (E16) | Fresh-clock resubscribe plus one W1 invalidation per install — owners rescan |
| K5 | Stock `is_fresh_instance:true` is a full set that omits recrawl deletions (E03) | If fresh: emit one invalidation before that batch's rows |
| K6 | Directory rows are owner-visible signals for subtree rename/delete (owner-directory-signal) | Publish directory rows through the same pipeline |
| K7 | Config depends on exact ignore semantics (E08 parity: literal algebra incl. whole-watch literals; per-pattern glob compile) | Pure mapper with Parcel-parity fixtures |
| K8 | Array-form JSON works on both daemons; object-form kills an old stock binary; BSER buys nothing here (E02/E03/E06) | Newline-delimited compact JSON, array envelopes; no BSER dependency |
| K9 | Unbounded frames can grow a decoder without limit | 16 MiB incremental frame cap |
| K10 | `version` capability mechanics verified (E06) | One `version` call with the required list for exactly the commands we send |
| K11 | Watchwoman silently drops roots / registers deaf watches (E12, Gap 5) | 30-second heartbeat `clock`; identity change or error → reconnect |
| K12 | Same-root concurrent construction races exist (E11) | Serialize attach sequences per canonical root |
| K13 | Silent death is the worst owner outcome (E05) | Pending/stale-but-live posture; loud logs; never fall back |
| K14 | Upstream `onReady` already rescans after subscription registration | Return the Subscription immediately; attachment is background; **invalidate on every install** re-runs readiness when the backend is truly live |
| K15 | Skill recreates all watches every refresh (`FiberMap.clear`) while Config already reconciles | Port Config's reconcile pattern to Skill |

K14 is the pivotal simplification of this round: because W1 invalidation
exists and fires at install time, the native `subscribe` call does not
need to block until first attachment. The upstream RcMap acquires the
subscription synchronously, subscribers attach and run their (pre-attach)
`onReady`, and the single invalidation-on-install re-runs it once the
Watchman subscription is real. One rule covers both first attach and every
reconnect.

## Architecture

One sentence: **an opt-in, directory-only adapter behind `Watcher.Native`
— one terminal JSON-line Unix session per watch key, one generation-fenced
controller loop per key (connect → version → watch → clock → subscribe →
live), fresh-clock resubscription with one invalidation on every install,
a 30-second heartbeat, per-canonical-root attach serialization, and a pure
logical-path/ignore mapper converging owners through the existing
readiness seam.**

```text
packages/core/src/filesystem/
  watcher.ts                     selection in configured(); W1 already carried
  watcher/watchman/
    options.ts                   option schema, defaults, validation
    session.ts                   terminal JSON-line socket session
    protocol.ts                  Command/Reply/Push schemas and decode
    mapping.ts                   pure row → update mapping + ignore compile
    directory.ts                 per-key controller (generation loop)

packages/core/src/config/plugin/skill.ts       retained-watch reconciliation
packages/server/src/options.ts                 fs group mirror (off-wire)
packages/cli/src/server-process.ts             environment decoding
```

Five small modules, one owner touch, two plumbing touches. No facades, no
service-per-module; only `Session` and the adapter's construction are
interface-shaped.

### Session (`session.ts`)

Owns one Unix socket for its whole life. Single-use: any terminal event
closes it forever; the controller opens a new one.

```ts
interface Session {
  readonly request: (command: Command) => Effect.Effect<Reply, SessionFailure>
  readonly close: () => Effect.Effect<void>
}
declare const open: (options: {
  readonly socket: string
  readonly commandTimeoutMs: number
}, push: (frame: Push) => void, lost: (failure: SessionFailure) => void) =>
  Effect.Effect<Session, SessionFailure, Scope.Scope>
```

- Register all handlers before connecting. One FIFO of typed commands;
  the per-command deadline starts when bytes are written.
- Framing: newline-delimited compact JSON, decoded strictly as UTF-8,
  accumulated with a 16 MiB cap enforced while bytes arrive.
- Association by decoded shape, not key presence: `unilateral` push frames
  never consume a command slot; the current command's expected reply (and
  the two unsubscribe ack dialects) settle it; `{error}` settles as a
  typed rejection; unknown subscription names are dropped; anything else
  is a protocol failure that terminates the session.
- Terminal latch is set synchronously before settling waiters; close is
  `socket.destroy()` plus awaiting local `close`, idempotent, joined on
  repeat. Interruption of a submitted request destroys the session — a
  successor request must never consume an orphaned reply.

### Controller (`directory.ts`)

One per watch key (`(target, type, ignore)` — the RcMap already dedupes
structurally). An imperative loop with a generation counter, not a phase
algebra:

```text
demand:
  generation = ++key.generation
  C = realpath(L)                    # re-resolved every (re)attach
  | no C |  → schedule recheck (1s), continue when it exists
  serialized per C:
    session  = open(socket)
    version  = request(version, required capabilities)
    watch    = request(watch, C)          # reply must equal C exactly
    clock    = request(clock, C)          # record identity prefix
    name     = `opencode-<run nonce>-<generation>`
    subscribe(C, name, { since: clock, fields: [name, exists, type] })
  install:
    key.live = { session, name, generation }
    invalidate()                          # the one rule (K14): every install
  live:
    rows → mapping.map(row, { L, C, ignores }) → publish
    every 30s: heartbeat clock(C)
      same identity → nothing; changed identity or error → teardown
  any failure:
    classify (transport/timeout = availability; error PDU = rejection)
    backoff 100ms doubling to a 30s cap (rejections) / 10s (availability)
    generation = ++key.generation, close held resources, loop
release (idempotent, absorbing):
  stop timers; fire unsubscribe without awaiting its ack; destroy session;
  await worker exit; resolve
```

Fencing is the generation counter: every `await` result checks
`generation === key.generation && !released` before mutating anything; a
stale result closes whatever resources it produced and stops. Nothing
else. There is no circuit state machine, no phase table, no leases: at
single-digit key counts, per-key backoff is the whole availability story,
and per-root serialization (a `Map<C, Effect.Semaphore>` or equivalent
one-at-a-time gate) is the whole same-root race story (K12).

Subscription names embed a random per-process nonce so a restarted client
can never collide with a daemon-retained predecessor name.

### Mapping (`mapping.ts`)

Pure, fully unit-tested without sockets:

```text
validate relative name (nonempty, no NUL, not absolute, no escaping "..")
canonical = resolve(C, name); require containment under C
drop basenames starting ".watchman-cookie-"
logical  = join(L, relative(C, canonical))
apply literals:  I = resolve(L, v); drop if logical == I or lies component-below I
                 (a literal equal to or above L excludes the whole watch)
apply globs:     per-pattern compile (Parcel wrapper behavior), matched
                 against the L-relative POSIX suffix, dot:true
publish { path: logical, type: exists ? "update" : "delete" }
```

Ignore evaluation is client-side only. Daemon-side expression pushdown is
a non-goal (see below). The literal algebra and glob compilation follow
the E08-verified @parcel/watcher wrapper semantics; build-time task:
pin the fixture expectations against the installed wrapper version.

### Options and plumbing

Core (`Watcher.Options`, additive):

```ts
watchman: Schema.optional(Schema.Struct({
  socket: Schema.String                       // absolute Unix socket path
  commandTimeoutMs: Schema.optional(Schema.Number)   // default 10_000
}))
```

Presence of `watchman` selects the backend for `directory` inputs;
absence is today's Parcel behavior, byte-for-byte. Server mirrors the
shape inside the existing `fs` group; CLI maps
`OPENCODE_WATCHMAN_SOCKET` (else `WATCHMAN_SOCK`) plus
`OPENCODE_WATCHER_BACKEND=parcel|watchman` as the explicit selector.
No Protocol, `HttpApi`, OpenAPI, or generated-client changes. workerd
stays on the disabled path as today.

## Skill retained-watch reconciliation

Today `refresh` begins with `FiberMap.clear(watches)` and recreates every
watch (churn on every debounce, and the known self-trigger shape). Config
already does the right thing (`config.ts` reconcile: remove stale keys,
add missing with `onlyIfMissing: true`). Port that pattern:

```text
refresh:
  scan sources → desired key set (`${type}:${target}`)
  remove watched keys not in desired
  add desired keys not yet watched (onlyIfMissing: true)
```

Roughly a 20-line diff against `skill.ts`, one behavior decision, and
Skill stops churning watches regardless of backend.

## Non-goals, with re-entry triggers

Each cut defense is intentionally unsupported. The trigger states when to
revisit — until then, absence is a feature.

| Cut | Why it is safe to cut | Re-enter when |
| --- | --- | --- |
| Topology observers (parent sentinels, 1s identity sampling, inode/root-number witnesses, quarantine states) | Owners handle topology today: Skill resolves symlinks and watches the spelling as a `file` watch; Config roots are plain directories. Re-resolution happens at every (re)attach; heartbeat covers daemon-side identity. | A real missed-event incident traced to live symlink retarget or root inode replacement |
| Shared circuit breaker | Per-key backoff bounds load at single-digit keys; the daemon sees one probe per key per 10s worst case | Multi-tenant/many-key deployments with daemon flapping storms |
| Global admission permits | Per-root serialization already prevents same-root construction races; startup attach storms are bounded by key count | Measured slow-daemon startup contention |
| Controller inbox bounds / overflow collapse | Upstream's per-watch PubSub is already the unbounded boundary the drafts declined to fix; the frame cap bounds the decoder | A memory incident attributable to queued rows |
| Platform allowlist | The feature is opt-in with an explicit socket; protocol conformance is the contract. Tested platforms documented (Linux; stock Watchman on other platforms expected to work) | Confirmed protocol divergence on a specific platform |
| Parking/quarantine taxonomy | One backoff-with-logging policy is observable and honest; "parked vs retrying" is invisible to operators | A failure class proven permanent in practice |
| Daemon-side ignore pushdown | Traffic optimization only; correctness is client-side | Measured event-storm cost on huge trees |
| Bounded unsubscribe-ack await | Daemons retain sessions regardless (E12); clients cannot clean the daemon | A daemon ships honest unsubscribe semantics worth honoring |
| BSER transport | JSON covers the used surface on both daemons with zero dependencies | A measured throughput need JSON cannot meet |

## Verification

Deterministic, in-package (run from `packages/core`):

- `session.test.ts` — real Unix socket pairs with a scripted peer:
  framing edge cases (split UTF-8, split newline, multiple frames,
  oversize, malformed), reply association, unilateral pushes not
  consuming commands, both unsubscribe ack dialects, terminal close
  joining, interruption-after-submit.
- `mapping.test.ts` — the literal-algebra table (including the
  whole-watch literal and `L != C` cases), glob parity fixtures, cookie
  filter, containment violations, directory rows.
- `directory.test.ts` — controller against a scripted Session adapter
  with TestClock: immediate subscription return; invalidation on first
  install and on reconnect; pre-install rows dropped; fresh-instance
  invalidate-before-rows; heartbeat identity change → reconnect;
  backoff progression; stale generation discards (and closes what it
  held); per-root serialization; release idempotence; fire-and-destroy
  unsubscribe.
- Existing `watcher.test.ts` already covers the W1 seam this relies on.

Live smoke (env-gated, skipped in CI): against a real daemon when
`OPENCODE_TEST_WATCHMAN_SOCK` is set — attach, mutate, observe update;
delete, observe delete; daemon restart, observe reconnect plus
invalidation. This is the only live surface; the round-5 gate matrices
are not carried.

Type gates: `bun typecheck` and package tests from the touched package
directories; no client regeneration because no public `HttpApi` changes.

## Deferred to after the build

- **Commit sequencing.** The build lands first; a follow-up documentation
  pass slices the work into upstreamable and carryable commit series
  (including how W1, Skill reconciliation, and the adapter stack).
- **Carryable draft** (`v2-readd6` round or successor): our deployment
  posture — socket defaults, daemon pin (stock or corrected Watchwoman
  per the parity doc), bookmark/patch-stack composition. Same code,
  different defaults and gates.

## What was explicitly rejected this round

- Carrying the round-5 phase algebras, epoch vocabularies, circuits,
  leases, witnesses, and parking states into an upstreamable design —
  over-secured against proven-but-rare daemon behaviors at a scale of a
  handful of watch keys.
- Client-side workarounds for Watchwoman's read-feedback (E20): filtering
  by metadata is provably lossy; the fix is daemon-side and tracked in
  the Watchwoman repo.
- Blocking the client behind a corrected-daemon release gate: stock
  Watchman is a quiet, conformant target today; our daemon pin is a
  carryable-view concern.
- `watch-project`, `relative_root`, cursors, `watch-del`, spawn/unlink
  paths of any kind — rejected by every round since readd2, unchanged.

## Cross-references

- [`v2-readd5-syn0.gpt56solxh.md`](v2-readd5-syn0.gpt56solxh.md) — the
  synthesized architecture this draft shrinks; its evidence chain still
  grounds every K-row above.
- [`v2-readd3.gpt56solxh.md`](v2-readd3.gpt56solxh.md) — the W0-W10 plan;
  W1 is carried, W2's owner hunks reduce to the Skill reconciliation.
- [`v2-readd5-e20-read-feedback0.gpt56solxh.md`](v2-readd5-e20-read-feedback0.gpt56solxh.md)
  — the proof that moved daemon concerns out of the client.
- [`watchman-parity0.glm53max.md`](file:///home/rektide/src/watchwoman-systemd/.design/watchman-parity/watchman-parity0.glm53max.md)
  — the forked Watchwoman fix list.
