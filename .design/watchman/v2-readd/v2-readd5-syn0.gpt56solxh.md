---
type: ArchitectureProposal
title: Watchman v2 re-add v5 synthesis — quiet target, owned sessions, convergent owners
description: Coordinator synthesis of the independent and cross-informed Astra/GX designs, amended by the E20 proof that deployed Watchwoman cannot safely drive authoritative owner rescans.
resource: /.design/watchman/v2-readd/v2-readd5-syn0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, architecture, synthesis, deep-modules]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: final-validation, resource: /.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md, title: Final research validation and design challenge brief }
  - { id: astra0, resource: /.design/watchman/v2-readd/v2-readd5-draft0.gpt6astra.md, title: Independent Astra first draft }
  - { id: gx0, resource: /.design/watchman/v2-readd/v2-readd5-draft0.glm53max.md, title: Independent GX first draft }
  - { id: astra1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.gpt6astra.md, title: Cross-informed Astra second draft }
  - { id: gx1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.glm53max.md, title: Cross-informed GX second draft }
  - { id: read-feedback, resource: /.design/watchman/v2-readd/v2-readd5-e20-read-feedback0.gpt56solxh.md, title: Five-run Watchwoman read-feedback proof }
---

# Watchman v2 re-add v5 synthesis — quiet target, owned sessions, convergent owners

## Status and recommendation

The two-model challenge converged on a coherent OpenCode architecture. This
synthesis accepts that common core, chooses between the residual alternatives,
and incorporates E20, which completed after both second drafts: deployed
Watchwoman `a1e16cbf` deterministically turns ordinary reads into subscription
updates and sustains a read-on-update loop.

**Recommended direction:** implement an opt-in, directory-only adapter behind
the existing `Watcher.Native` seam, using an owned terminal JSON Unix session,
bounded full-attachment admission, directory-inclusive logical-path hints,
snapshot-first owner readiness, retained Skill watches, and explicit topology
observation. Keep Parcel as the default and never fall back silently.

**Release prerequisite:** do not enable this adapter against deployed
Watchwoman `a1e16cbf`. A separately authorized Watchwoman correction must stop
ordinary Access/Open reads from becoming changed-path upserts, identify a new
source/binary pin, and pass E20 plus the real-owner quietness matrix. Stock
Watchman remains a required conformance surface, not an automatic substitute.

This document is ready for human policy acceptance but is not yet an execution
prompt or implementation authorization.

## What the design challenge established

### Independent convergence

Before either model read the other, both first drafts independently chose:

- an opt-in directory backend behind unchanged public watcher event shapes;
- replacement rather than wrapping the defective ESM transport;
- one physical session per watch key rather than a multiplexed global FIFO;
- strict epoch fencing for every stale circuit/attachment completion;
- no create/update reconstruction or inode baseline;
- directory rows as owner-visible invalidation hints;
- logical-path publication and Parcel-compatible ignores;
- W1's private invalidation/readiness work as reusable foundation;
- off-wire startup options with no Protocol/`HttpApi` change; and
- explicit local-versus-daemon release accounting.

The first drafts differed mainly on JSON versus BSER, locator ownership,
platform/daemon scope, acquisition extent, permanent failures, topology polling,
Skill readiness, and unsubscribe. After exchanging drafts and independently
checking source claims, both second drafts converged on JSON over an explicit
socket, no locator, full-attachment limits, positive-freshness invalidation,
periodic identity observation, retained Skill watches, bounded unsubscribe plus
destructive local close, and a hard read-quietness gate.

### E20 changes the release target, not the module design

The designers had only a source-supported hypothesis that Watchwoman reads
could feed owner rescans. E20 then proved the exact loop on five fresh deployed
instances: one unchanged read produced one PDU, and each callback read produced
the next PDU until the harness cap. Stock produced none. Watchwoman does not
expose the originating notify kind, and real stat-equalized mutations can have
the same row, so a client-side “unchanged” filter would be lossy.

The adapter architecture remains valid because both second drafts had already
made quietness a daemon acceptance gate. The formal target changes from
“deployed Watchwoman” to “a corrected and newly pinned Watchwoman successor.”

## Selected product contract

1. Parcel remains the default recursive directory backend. Watchman selection
   is static and explicit; it affects only recursive `directory` watches.
2. Node continues to own `file` and `entries`. Existing
   `Watcher.Update = { path, type }` and `subscribe(input, onReady?)` shapes do
   not change.
3. A selected Watchman watch never silently falls back to Parcel, returns
   `undefined` because the daemon is down, or ends its stream as if healthy.
   It remains pending before first attachment and stale-but-live during
   recovery, with classified diagnostics.
4. Events are owner hints, not a journal: `exists:true` publishes `update` and
   `exists:false` publishes `delete`. File, directory, and symlink rows are all
   visible. No `create` output, retained inode map, descendant synthesis, or
   exact operation chronology is promised.
5. Every initial or replacement installation causes an authoritative owner
   scan through readiness/invalidation ordering. Pre-install rows are decoded
   for safety and discarded, not treated as a complete baseline.
6. Final local release is absorbing and joined. It promises no surviving local
   socket, timer, waiter, callback, controller, or observer. It does not claim
   that Watchwoman has synchronously freed its push loop, accepted socket, or
   root.
7. No `watch-project`, `relative_root`, persistent cursor, root deletion,
   automatic daemon spawn/restart, synthetic filesystem event, or VCS behavior
   enters the feature.

## Compatibility and platform policy

### Recommended first release

| Surface | Policy |
| --- | --- |
| Formal daemon | Corrected Watchwoman successor with a new exact source/binary pin; `a1e16cbf` is rejected by E20 evidence. |
| Formal host | Linux x86-64/glibc under the pinned OpenCode Bun runtime. |
| Stock Watchman | Required deterministic and private-daemon conformance surface; not advertised as formally supported without its full exact-pin acceptance matrix. |
| Watchwoman tip | Fixture for cancellation/queue behavior only until an exact successor is selected and rerun through the corpus gates. |
| macOS, Windows, arm64, musl | Watchman selection fails startup clearly; Parcel remains available. Widen only after host-specific live suites. |
| Node embedding | Public Server/SDK option types may carry selection, but formal runtime support requires running the new session and owner suites under the claimed Node distribution. |

The daemon correction should expose an unambiguous capability or bumped
compatibility identity so current `a1e16cbf` cannot accidentally satisfy the
supported profile. The precise Watchwoman patch belongs to a separate
authorized change, but its acceptance contract is fixed here:

1. ordinary reads do not advance changed-path clocks or emit result rows;
2. writes, metadata changes, replacements, directory operations, and deletions
   remain visible;
3. E20 stock/Watchwoman controls pass;
4. real Config, Agent, Command, Skill, and Plugin rescans reach a fixed point;
5. source, binary, capability/version, platform, and release hashes are pinned.

No client-side scan window, timestamp fingerprint, duplicate-path suppression,
directory filtering, or debounce policy may substitute for this daemon fix.

## Deep-module shape

The external seam remains `Watcher.Native`. Callers learn no Watchman lifecycle
interface. Two modules have meaningful runtime interfaces; other files keep
pure or closely related implementation local.

```text
packages/core/src/filesystem/
  watcher.ts                         existing seam, RcMap, W1, static selection
  watcher/watchman/
    options.ts                       Core schema, defaults, startup errors
    directory.ts                     deep adapter and controller ownership
    session.ts                       terminal JSON Unix session
    protocol.ts                      typed command/reply/push decoding
    mapping.ts                       pure L/C validation and ignore mapping
    topology.ts                      demanded path-identity observation

packages/core/src/config/plugin/skill.ts       retained-watch reconciliation
packages/server/src/options.ts                 exported startup type
packages/server/src/routes.ts                  Server-to-Core mapping
packages/cli/src/server-process.ts             environment decoding
```

### Interfaces

```ts
type DirectoryBackendOptions =
  | { readonly backend: "parcel" }
  | {
      readonly backend: "watchman"
      readonly socket: string
      readonly commandTimeoutMs?: number
      readonly maxConcurrentAttachments?: number
    }

interface Session {
  readonly request: (command: Command) => Effect.Effect<Reply, SessionFailure>
  readonly close: () => Effect.Effect<void>
}

declare const openSession: (
  options: { readonly socket: string; readonly commandTimeoutMs: number },
  receive: (delivery: Delivery) => void,
  lost: (failure: SessionFailure) => void,
) => Effect.Effect<Session, SessionFailure, Scope.Scope>

declare const makeDirectoryNative: (
  inherited: Watcher.NativeInterface,
  options: ValidatedWatchmanOptions,
) => Effect.Effect<Watcher.NativeInterface, WatcherStartupError, Scope.Scope>
```

`Session` hides framing, response association, FIFO ownership, timeout,
terminal settlement, and socket joining. `makeDirectoryNative` hides physical
keys, controllers, topology, admission, circuit state, mapping, owner
invalidation, and shutdown. Acquisition and controller reducers remain private
implementation seams with controlled test adapters rather than exported shallow
services.

## Owned JSON session

### Wire and discovery

- Use compact newline-delimited UTF-8 JSON and array-form requests. Both target
  dialects support it; the older stock binary's object-form abort makes array
  form mandatory.
- Accept one explicit absolute Unix socket path. CLI resolves
  `OPENCODE_WATCHMAN_SOCKET`, then `WATCHMAN_SOCK`; Core never reads environment.
- Do not accept a binary path, invoke `get-sockname`, unlink sockets, spawn a
  daemon, or retain a locator process. The deployed Watchwoman locator mutates a
  refused socket before honoring no-spawn, so cancellable child ownership alone
  would not make discovery safe.
- Keep BSER out of the initial implementation. JSON throughput and package
  artifact tests replace assumptions derived from the old BSER transport.

### Lifecycle and association

1. Register connect/data/error/end/close handlers and cleanup before connecting.
2. Serialize one typed request FIFO. Its deadline begins only after bytes are
   submitted; interruption after submission destroys the whole single-owner
   session so no response can be orphaned into a successor request.
3. Classify typed shapes, not top-level key presence. Unilateral data/state and
   tip-style cancellation never consume the current command. Stock and
   Watchwoman unsubscribe acknowledgements are correlated to the pending
   unsubscribe command.
4. EOF, error, timeout, malformed/oversize frame, or explicit close set one
   synchronous terminal latch before settling waiters or notifying the
   controller.
5. Termination uses `socket.destroy()` and awaits local `close`; `end()` alone
   is never treated as terminal. Repeated close joins the same completion.
6. A session object never reconnects. A new controller generation owns a new
   session and unique subscription name.

### Bounds

- Maximum encoded frame: 16 MiB, enforced incrementally before unbounded string
  growth.
- Controller data inbox: at most 4 MiB encoded payload or 4,096 rows. Overflow
  collapses queued data into one ordered private invalidation marker; it does
  not pause socket reads against an unbounded daemon writer.
- Terminal, freshness, topology, wake, and command controls have reserved
  coalesced slots and cannot queue behind data.
- Existing W1 downstream PubSub remains an acknowledged external unbounded
  boundary; these limits are not described as a whole-process memory proof.

## Attachment, recovery, and release

### Identity

Each physical key is `(directory, resolved logical L, normalized ignore list)`.
It owns a lifetime ID, target epoch, connection generation, random backend-run
nonce, child scope, installation barrier, mailbox, observer, and at most one
session/attach worker. The backend owns circuit epochs, full-attach permits, and
same-canonical-root leases. Daemon clock identity is distinct from all of these.

### Full attachment

```text
sample L -> C/(dev,ino)
take per-C lease, then full-attachment permit; recheck demand and epochs
connect explicit socket
version(required capabilities, including corrected-target identity)
watch C             -> response.watch must equal C
clock C             -> fresh clock and daemon/root identity
register unique expected subscription name
subscribe C/name since fresh clock, fields [name, exists, type]
decode/discard pre-install rows
recheck L/C/(dev,ino)
atomically install generation
initial: complete readiness barrier
replacement: enqueue invalidate before opening later-row gate
release lease and permit
```

The default of four permits covers the entire sequence and failed-attempt local
cleanup. The per-`C` lease is acquired before a global permit so same-root
waiters do not occupy the full budget. Every async result carries target,
generation, and circuit epochs. A stale result mutates no current state and
must still close any resource it produced.

### Finite controller phases

```ts
type Phase =
  | { readonly type: "resolving" }
  | { readonly type: "waiting"; readonly reason: "path" | "admission" | "retry" | "compatibility" }
  | { readonly type: "attaching"; readonly stage: "connect" | "version" | "watch" | "clock" | "subscribe" | "check" }
  | { readonly type: "installed" }
  | { readonly type: "retiring"; readonly next: "resolve" | "retry" | "quarantine" }
  | { readonly type: "quarantined"; readonly reason: "protocol" | "root-replaced" }
  | { readonly type: "released" }
```

| Current/input | Selected transition |
| --- | --- |
| Resolving + existing directory | Capture `L/C/dev/ino`; wait for admission. |
| Resolving + absent/dangling/non-directory | Keep topology observer, create no socket, and wait. |
| Attaching + valid staged response | Advance only the current generation. |
| Attaching + row before final installation | Validate envelope and discard data; cancellation/loss still defeats installation. |
| Initial install | Set state first, complete readiness, then admit later data. |
| Replacement install | Set state, enqueue invalidation, then admit later data. |
| Installed + ordinary batch | Recheck fence, map/filter, publish. |
| Installed + `is_fresh_instance:true` | Invalidate before rows; retain subscription. False/omitted freshness proves nothing. |
| Installed + heartbeat identity change/unknown root | Retire and attach from a fresh clock. |
| Socket/protocol/cancellation failure | Fence once, join old session, then enter classified recovery. |
| `L` retarget/absence | Advance target epoch before retirement; invalidate once when prior installed state becomes uncertain. |
| Same `C`, changed `(dev,ino)` | Invalidate, retire, and quarantine rather than publish from Watchwoman's retained stale root. |
| Any + release | Fence synchronously, stop all producers, close/join once, enter absorbing Released. |

Pre-return Native interruption is owned: controller scope and `stopAndJoin` are
registered under a short interruption mask before path/socket work begins. A
successful return transfers the same release operation to RcMap. Backend
shutdown fences all controllers, starts their stops concurrently, and only then
joins them.

### Heartbeat and topology

- While installed, issue `clock C` every 30 seconds even during data traffic.
  A changed daemon/root clock prefix or unknown-root rejection retires the
  generation. Heartbeat is not readiness and never reuses its clock as a
  reconnect cursor.
- Every demanded logical path has one observer. It combines an immediate-parent
  `fs.watch` hint with a coalesced one-second `realpath` + `stat` identity
  sample. Counts are not semantic; only changed stable identity emits.
- Close an obsolete parent watcher before rearming its replacement. Bun 1.4.2
  otherwise creates a deterministically deaf watcher.
- Periodic identity sampling covers ancestor retarget and silent parent loss
  that the direct sentinel misses. It does not follow child symlink targets.
- Skill currently canonicalizes its recursive root before this seam; hidden
  ancestors of that canonical input remain explicitly outside backend coverage.
- Same-path inode replacement cannot be repaired by same-root `watch` or
  resubscribe. Quarantine requires an external daemon/root rebuild; do not poll
  `watch` frequently and thereby keep the stale root alive. No automatic
  `watch-del` is introduced.

## Availability and compatibility policy

Static invalid configuration, an unsupported enabled host, or failure to load
the selected implementation fails configured-layer/server construction with a
typed startup error. Disabled selection performs no host check, socket I/O, or
dynamic import.

Demand-time failure never falls back or pretends readiness:

| Class | Scope and disposition |
| --- | --- |
| Socket unavailable/reset/EOF or submitted attach timeout | Shared epoch-fenced circuit; `100,200,400,800,1600,2000…` ms; one half-open demanded probe. |
| Decoded root rejection or permission/policy failure | Per-key retry with exponential 100 ms base and 30 s cap; text is not treated as proof of permanence. |
| Missing corrected-target/required capability or undecodable version | Backend-wide compatibility wait; one demanded probe at 60 s intervals. This replaces per-root churn and permits in-place daemon upgrade recovery. |
| Repeated row/protocol failure after capability success | Per-key slow quarantine probe at 60 s; warn after three consecutive failures, but do not require process restart merely because external data/daemon may change. |
| Same-`C` inode replacement with retained daemon root | Quarantine with an operator diagnostic; recover on observed daemon/root retirement or backend restart, never by destructive client reconciliation. |
| Release/interruption | Joined cleanup; no failure count, circuit mutation, or retry. |

Only availability failures mutate the shared circuit. Full successful attachment
or a decoded reachable root rejection closes its current half-open epoch.
Compatibility and release outcomes relinquish the claim without changing the
availability attempt. Every stale positive and negative completion is fenced.

This hybrid resolves the final draft disagreement: restart-only parking is too
strong for mutable permissions/daemon upgrades, while every root retrying a
known capability failure creates needless load. Slow scoped probes preserve
recovery without hot cycling.

## Event and ignore mapping

Successful plain `watch C` must return exactly `C`; `relative_path` and an
ancestor root are protocol failures. For each valid relative row name:

```text
validate nonempty relative name; reject NUL, absolute, or escaping form
canonical = path.resolve(C, name); require component containment under C
drop basename prefixed ".watchman-cookie-"
logical = path.join(L, relative(C, canonical))
apply literals in logical absolute namespace
apply each compiled glob to L-relative POSIX suffix
publish { path: logical, type: exists ? "update" : "delete" }
```

Literals use Parcel's exact algebra: `I = path.resolve(L, value)` and match when
the logical path equals `I` or lies component-below it. A literal equal to or
containing `L` excludes the whole watch; unrelated escapes are inert; canonical
spellings do not magically match when `L != C`. Compile each glob independently
with the pinned Parcel `is-glob`/micromatch behavior. Directory rows pass the
same pipeline.

Daemon expressions are traffic reductions only. Safely translate contained
literal suffixes with explicit `wholename`/`dirname` terms and a whole-root
false expression; never translate general globs or rely on daemon cookie
wildcards. Client mapping remains authoritative.

## Owner convergence

### Generic watcher foundation

Carry W1's private Native invalidation signal and per-subscriber ordered
readiness replay. Carry the independently reusable W2 Config/Agent/Command/
Plugin Source/test-layer hunks, add the missing Config end-to-end coalescing
coverage, and rewrite the broken Plugin Supervisor test rather than preserving
its timeout-prone clock/assertion structure.

Directory-level invalidations remain visible because current owners deliberately
use them for subtree rename/delete. LocationWatcher, VCS, review, and the app
file tree remain outside recursive Watchman routing.

### Skill

Select retained-watch reconciliation rather than clearing and recreating every
watch on refresh:

1. Scan authoritative Skill state and build the desired watch-key set.
2. Keep existing matching watch fibers alive.
3. Add only missing watches.
4. Remove obsolete watches only after the successful scan.
5. Every readiness and data update enqueues a debounced refresh.

This removes the cause of the readiness self-loop while preserving late first
attachment as recovery for E14's detached window. It also avoids repeated
Watchwoman unsubscribe/session retention. E14's proven per-watch first-call
gate remains the fallback if retained reconciliation fails its new fixed-point
tests; it is not silently assumed to prove the new algorithm.

E20 makes the corrected-daemon prerequisite non-negotiable here: even retained
watch fibers cannot converge if reading a Skill file emits another update.

## Options and API perimeter

Recommended Core option:

```ts
type DirectoryBackendOptions =
  | { readonly backend: "parcel" }
  | {
      readonly backend: "watchman"
      readonly socket: string
      readonly commandTimeoutMs?: number // default 60_000; 1..600_000
      readonly maxConcurrentAttachments?: number // default 4; 1..64
    }
```

CLI environment:

- `OPENCODE_WATCHER_BACKEND=parcel|watchman`
- `OPENCODE_WATCHMAN_SOCKET`, falling back to `WATCHMAN_SOCK`
- `OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS`
- `OPENCODE_WATCHMAN_ACQUISITION_LIMIT`

Supplying `OPENCODE_WATCHMAN_BINARY` while selected fails with guidance because
there is no locator/spawn path. Unknown selectors and malformed integers fail;
they do not silently choose Parcel. CLI owns string conversion; Core decodes
the semantic options once at configured-layer construction so direct Server/SDK
callers receive the same validation.

Server mirrors the startup shape and maps it into Core. This is off-wire but
widens exported Server and inherited SDK TypeScript option types. It does not
change Protocol, Server `HttpApi`, OpenAPI, or generated clients. If later work
exposes watcher selection through `/api/server`, `/api/config`, or another
public endpoint, run `bun run generate` from `packages/client` and review the
generated diff; never hand-edit it.

## Resource ownership

| Resource | Owner | Stop rule |
| --- | --- | --- |
| Socket, decoder, FIFO, deadlines | Session | Terminal latch; settle once; destroy; await local close. |
| Controller worker and child scope | Backend registry | Registered before async work; idempotent `stopAndJoin`. |
| Attach session/worker | Current generation | Produced resource stays owned until accepted; stale result closes it. |
| Circuit timer, claim, waiters, permits | Backend acquisition state | Fence to stopped, wake/cancel, join; finalizers cover every transfer gap. |
| Same-`C` lease | Current full attempt | Release only after accepted install or failed-attempt local cleanup. |
| Parent watcher and identity sample | Topology observer | Fence callbacks; close old before rearm; join in-flight sample. |
| Heartbeat/retry timers | Controller scope | Stop before session close; no post-release wake. |
| Best-effort unsubscribe | Controller cleanup | Only on a healthy idle session; at most 500 ms; then destroy regardless. |
| Daemon push loop/root/accepted socket | External daemon | Never claimed or automatically pruned; retention remains operationally visible. |

Final release order is: absorbing fence; stop timers/observer; optionally await
one correctly associated unsubscribe for at most 500 ms; destroy and join the
session; join worker/scope; unregister controller; resolve cached completion.
Backend shutdown starts this sequence for all controllers before awaiting any,
so 500 ms graces do not serialize across roots.

## Carrier disposition and implementation sequence

Preserve the dirty carrier as evidence. Implement on a clean `v2` base and carry
only reviewed logical changes:

1. carry W1 unchanged with its named 64-test proof;
2. carry reusable W2 owner/test-layer hunks and repair their missing/broken
   tests as a separate commit;
3. add Core option schema and pure mapping parity fixtures;
4. implement and test terminal JSON Session against real private sockets;
5. implement controller generation, pre-return ownership, full admission,
   circuit, bounds, and release with a new fixture matching the Session seam;
6. add topology identity observation and same-root quarantine;
7. add directory-inclusive mapping, initial/replacement readiness, heartbeat,
   and overflow invalidation;
8. implement retained Skill reconciliation and fixed-point tests;
9. add Server/CLI/SDK option plumbing without `HttpApi` changes;
10. run private-daemon stock conformance and corrected-Watchwoman acceptance;
11. verify distributed artifacts, resource cleanup, and unsupported-host refusal;
12. only after all blocking gates pass, document opt-in operation and promote
    the exact supported daemon pin.

Do not carry the old actor verbatim. Its useful scenarios become fixtures for
the owned Session/controller seams. Historical v4, dirty-v4, and prompt0 remain
source maps, not execution authority.

## Blocking acceptance gates

### Before OpenCode implementation begins

- Human accepts the daemon/platform and failure policies in this synthesis.
- Separate authorization exists for the Watchwoman correction, or the formal
  target is deliberately changed to stock Watchman with a new exact-pin matrix.

### Corrected Watchwoman target

- E20 single-read and capped feedback cells are quiet in at least five fresh
  private instances while mutation controls remain visible.
- Real Config, Agent, Command, Skill, and Plugin Source scans settle after one
  external mutation with no continuing update traffic.
- The complete existing protocol, row, pressure, release, directory, safe-loss,
  and platform matrix is rerun against the exact successor binary/source pin.

### Deterministic OpenCode

- Every controller transition, stale completion, cancellation-before-ack,
  timeout at each attach stage, overflow, freshness, target change, release
  race, and backend shutdown is covered under Effect rc.112.
- Native interruption before return leaves no controller/socket/timer/permit;
  RcMap transfer and last-reference release use the same cleanup.
- Session tests cover split UTF-8/frame boundaries, multiple frames, malformed
  and oversize input, response dialects, post-submit interruption, repeated
  close, and physical handle accounting.
- Mapping tests compare exact Parcel literal/glob behavior, cookies, `L != C`,
  directories, invalid names, and whole-root ignores.
- Skill retained-watch tests prove fixed-point, late first readiness, recovery
  during scan, add/remove/retarget, shared ownership, and disposal; mutation
  tests still detect the old looping variants.

### Live and operational

- E16 relay loss preserves same-root and unrelated controls; replacement
  readiness repairs owner state.
- Private daemon restart proves fresh-clock attachment despite Watchwoman's
  false freshness bit.
- Directory-only subtree operations reach real owners.
- Same-`C` inode replacement quarantines with no stale publication.
- Final release leaves no local handles; daemon-side survivors are measured and
  reported separately.
- JSON throughput and memory stay within declared limits under burst and stalled
  consumer cells.
- Exact Bun 1.4.2 close-before-rearm regression remains covered.
- Affected package tests and `bun typecheck` run from package directories;
  disabled/default platform builds remain green; generated client files stay
  unchanged unless a deliberate public `HttpApi` edit triggers generation.

## Remaining human decisions

The evidence and cross-review support one recommendation, but two policy choices
must be explicit before this draft becomes accepted:

1. **Daemon path:** authorize a corrected Watchwoman successor as the formal
   target (recommended), pivot the initial formal target to stock Watchman, or
   defer implementation while retaining this design.
2. **Unavailable/incompatible daemon:** accept pending/stale streams with scoped
   slow probes and no fallback (recommended), choose startup-fatal daemon
   availability, or widen the Watcher failure interface.

Once those choices are accepted, promote this synthesis, create the accepted
symlink/index entry if desired, and revise the deferred execution prompt. No
production implementation should start before that point.

## Cross-comparison of source drafts

### Astra

[`Astra draft0`](v2-readd5-draft0.gpt6astra.md) contributed the decisive small
interface, explicit JSON socket, full-attachment bound, periodic path identity,
retained Skill watches, honest memory/release limits, and the three source
concerns that exposed E20. Its strongest quality is refusing to hide
uncertainty behind event reconstruction or local-close claims. Its first draft
was broader than necessary in module coupling and initially parked too many
mutable failures; [`draft1`](v2-readd5-draft1.gpt6astra.md) corrected the latter
and sharpened framing, owner, and acceptance contracts.

### GX

[`GX draft0`](v2-readd5-draft0.glm53max.md) supplied a crisp mailbox reducer,
strict circuit fencing, pure mapper separation, capability discipline, and
explicit carrier/test sequencing. Its initial BSER locator, final-component-only
topology, retry-forever cap, and first-call Skill gate were weaker after the
cross-review. [`GX draft1`](v2-readd5-draft1.glm53max.md) independently verified
Astra's source claims and adopted the stronger transport, topology, acquisition,
freshness, Skill, and buffer decisions. Its main remaining weakness is
restart-only parking for conditions that a daemon upgrade or data change can
repair; its separate mapping/topology files and root witness remain useful.

### Synthesis

The documents are complementary rather than competing after round two. Astra
provides the deeper external contract and failure honesty; GX provides the more
explicit reducer, protocol factoring, and pure mapping locality. This synthesis
uses Astra's two-interface depth, GX's internal file separation and strict
epochs, a scoped slow-probe policy between their parking extremes, and E20's
newly proven daemon prerequisite.

## Cross-references

- [`v2-readd4-validation3.gpt56solxh.md`](v2-readd4-validation3.gpt56solxh.md) — final research sufficiency and twelve required design decisions.
- [`v2-readd5-e20-read-feedback0.gpt56solxh.md`](v2-readd5-e20-read-feedback0.gpt56solxh.md) — target-blocking evidence added after cross-review.
- [`v2-readd5-draft1.gpt6astra.md`](v2-readd5-draft1.gpt6astra.md) and [`v2-readd5-draft1.glm53max.md`](v2-readd5-draft1.glm53max.md) — cross-informed complete architectures synthesized here.
- [`v2-readd4-e18-server-options0.gpt56solxh.md`](v2-readd4-e18-server-options0.gpt56solxh.md) — startup/public-type/generated-client perimeter.
- [`v2-readd4-e19-carrier-audit0.gpt56solxh.md`](v2-readd4-e19-carrier-audit0.gpt56solxh.md) — exact carrier hunk and test disposition.
