---
type: Review
title: Carrier1 continuity architecture review at 2afb097d
description: Source-grounded review of the carrier1 Watchman remake, identifying correctness blockers, required architectural amendments, evidence gaps, scope decisions, and minimum normative corrections.
resource: /.design/watchman/carrier1-review0.gpt56sol.md
tags: [opencode, watchman, watcher, continuity, invalidation, supervision, vcs, watchwoman, architecture-review]
status: stable
generated: { by: model:gpt-5.6-sol, at: 2026-09-03T16:00:08-04:00 }
verified: { by: model:gpt-5.6-sol, at: 2026-09-03T16:00:08-04:00 }
stale_after: 2026-10-03
sources:
  - id: carrier-under-review
    resource: /.design/watchman/carrier1.gpt56s.md
    title: Watchman remade as continuity-aware filesystem observation at 2afb097d6b03550a1d25b7a88180889baef843c9
    author: model:gpt-5.6-sol
    last_modified: 2026-09-03
    revision: 2afb097d6b03550a1d25b7a88180889baef843c9
    sha256: b8aff46204fc0393b2058483ee702ff0c29d6e332cc4ec042450cab02403b1f3
  - id: upstream-baseline
    resource: https://github.com/anomalyco/opencode/commit/4772b6a3e8c2eaeb7594503c4584fb225c75bb15
    title: OpenCode v2 baseline reviewed for Watcher, Config, VCS, client, server, and CLI shapes
    author: anomalyco/opencode contributors
    last_modified: 2026-09-03
  - id: post-review-upstream-delta
    resource: /.design/watchman/upstream-delta0.glm53h.md
    title: Upstream delta check for the carrier1 rebuild baseline
    author: model:glm-5.3-high
    last_modified: 2026-09-03
  - id: prior-carrier
    resource: /.design/watchman/carrier0.gpt56s.md
    title: Watchman clean-slate replacement carrier
    author: model:gpt-5.6-sol
    last_modified: 2026-09-03
  - id: typed-watcher
    resource: /.design/watchman/typed-watcher0.glm53.md
    title: Typed watcher updates - the watcher-level invalidation contract
    author: model:glm-5.3
    last_modified: 2026-09-03
  - id: architecture-review
    resource: /.design/watchman/review-architecture0.gpt56s.md
    title: Watchman architecture consolidation review
    author: model:gpt-5.6-sol
    last_modified: 2026-09-01
  - id: failure-review
    resource: /.design/watchman/review-failure-paths0.gpt56s.md
    title: Watchman failure-path and test audit
    author: model:gpt-5.6-sol
    last_modified: 2026-09-01
  - id: vcs-targets
    resource: /.design/watchman/watches.glm53.md
    title: VCS-internal watch targets for the Watchman backend
    author: model:glm-5.3
    last_modified: 2026-09-02
  - id: watchwoman-filter-source
    resource: file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs
    title: Current Watchwoman native watcher and root-relative filtering source
    author: radiosilence/watchwoman contributors
    last_modified: 2026-09-03
  - id: watchwoman-command-source
    resource: file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands.rs
    title: Current Watchwoman command error envelope
    author: radiosilence/watchwoman contributors
    last_modified: 2026-09-03
  - id: watchwoman-filter-design
    resource: file:///home/rektide/src/watchwoman-systemd/.design/opencode/vcs-config2.glm53h.md
    title: Resolved generic filter rules engine for Watchwoman
    author: model:glm-5.3-high + human:rektide
    last_modified: 2026-09-03
  - id: jj-vcs-design
    resource: file:///home/rektide/src/opencode-jj-vcs/design/jj-vcs/jj-vcs2.glm53.md
    title: Jujutsu VCS support comparison and filesystem resolver
    author: model:glm-5.3
    last_modified: 2026-09-02
---

# Carrier1 continuity architecture review at 2afb097d

## Review identity

This is a durable review of
[`carrier1.gpt56s.md`](/.design/watchman/carrier1.gpt56s.md) exactly as committed
at `2afb097d6b03550a1d25b7a88180889baef843c9`. The reviewed file has 1,357
lines and SHA-256
`b8aff46204fc0393b2058483ee702ff0c29d6e332cc4ec042450cab02403b1f3`.
The exact artifact can be recovered with:

```sh
jj file show -r 2afb097d .design/watchman/carrier1.gpt56s.md
```

The review checked the carrier against:

- the prior execution carrier and typed-invalidation proposal;
- the architecture and failure-path reviews from which carrier1 draws;
- the VCS target analysis and jj-vcs resolver design;
- review-time OpenCode `v2@origin` at
  [`4772b6a3`](https://github.com/anomalyco/opencode/commit/4772b6a3e8c2eaeb7594503c4584fb225c75bb15),
  particularly Watcher, Config, direct watcher consumers, VCS provider scope,
  `VcsEvent`, the Solid client reducer, and server/CLI options;
- current Watchwoman 0.7.0 native watcher, command-error, root policy,
  subscription, and exact-root filter behavior; and
- the installed `@superbfowle/fb-watchman-esm` 3.0.0 transport boundary.

No implementation or runtime test was changed or run for this review. Findings
label source-verified behavior separately from proposed architecture.

After this review's evidence freeze, `v2@origin` moved beyond `4772b6a3` and
landed source-derived Config plans, parent-entry sentinels, and a public
readiness callback. That later movement is assessed separately in
[`upstream-delta0.glm53h.md`](/.design/watchman/upstream-delta0.glm53h.md). It
does not alter what carrier1 said at `2afb097d`, but construction must reconcile
the corrections here with that newer upstream shape.

## Overall assessment

Carrier1 has the right architectural center: source truth, typed invalidation,
one recovery owner at each scope, static directory-backend selection, exact
live delivery, cursorless establishment, and provider-owned VCS observation.
It also repairs important weaknesses in carrier0, particularly late logical
attachment, linked-worktree HEAD placement, branch-only VCS publication, and
the split between logical subscriptions, physical watches, root registrations,
and generations.

The document is not yet a complete executable contract. Seven issues can still
permit silent staleness, an unsafe command stream, or retry of a known terminal
root. The largest gap is below the proposed client: current Watchwoman can
silently acknowledge failed native observation and silently discard native
watch errors. No client-side invalidation design can compensate for a loss the
daemon does not report.

The remaining findings are grouped by what must happen to the carrier rather
than by the order in which they were discovered.

## Correctness blockers

### CB1. The continuity guarantee exceeds adapter-visible evidence

**Carrier claim.** The enduring statement says the substrate emits an explicit
invalidation whenever continuity is uncertain
([`carrier1:113-116`](/.design/watchman/carrier1.gpt56s.md#L113-L116)). The big
picture includes process suspension and kernel queue loss
([`carrier1:151-165`](/.design/watchman/carrier1.gpt56s.md#L151-L165)), and the
system promises make uncertainty explicit
([`carrier1:328-345`](/.design/watchman/carrier1.gpt56s.md#L328-L345)).

**Verified contradiction.** Current Watchwoman can make observation unusable
without exposing a transition to the OpenCode adapter:

- Failure to construct the recommended native watcher drops the ready sender;
  the receiver result is ignored and root registration continues
  ([`watcher.rs:48-77`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L48-L77)).
- Failure of `watcher.watch(root, Recursive)` is logged, after which readiness
  is still signaled and `watch` can acknowledge successfully at the protocol
  layer (the same source range).
- A later `notify::Error` is logged and discarded without recrawl, cancellation,
  generation closure, or another client-visible continuity signal
  ([`watcher.rs:115-121`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L115-L121)).

The client cannot invalidate on an event that never crosses the adapter seam.
The absolute promise also outruns what Node or Parcel can necessarily detect
about every platform-level queue loss.

**Required correction.** Scope the promise to every continuity loss detected
by or reported to the adapter. Add a supported-daemon contract requiring native
registration failure to fail `watch`, and runtime source errors or overflow to
produce a fresh-instance/recrawl signal, a canceled PDU, or connection closure.
Fixing current Watchwoman or explicitly excluding it from the supported contract
is a promotion prerequisite. Add injected daemon setup-failure and runtime
source-error gates, not only ordinary restart tests.

### CB2. Structurally explicit root rejection does not exist on the wire

**Carrier claim.** The failure table distinguishes a structurally explicit
root rejection, which is root-terminal, from an ambiguous daemon callback,
which is root-retryable
([`carrier1:840-851`](/.design/watchman/carrier1.gpt56s.md#L840-L851)). It also
correctly forbids permanent policy inferred from error prose
([`carrier1:868-870`](/.design/watchman/carrier1.gpt56s.md#L868-L870)).

**Verified contradiction.** Watchwoman turns every `CommandError`, including
root-policy and file-count-cap refusals, into an object containing only a
human-readable `error` string plus the compatibility version
([`commands.rs:40-62`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands.rs#L40-L62)).
The fb-watchman client retains the raw response on `error.watchmanResponse`, but
the response has no stable code to classify. Under carrier1's own no-message-
matching rule, a root blocked by policy or `max_files_per_root` is ambiguous and
therefore retried. Repeated file-cap crawls recreate the furnace the root policy
was introduced to prevent.

**Required correction.** The supported-daemon protocol needs a stable field
such as `error_code: "root_blocked" | "root_too_large" | ...`. The raw-client
adapter must preserve and decode response metadata rather than only `message`.
Only a structural discriminator may select root-terminal policy. Verification
must prove that blocked and capped roots are attempted once, while transport
unavailability and truly ambiguous command failures back off and retry.

### CB3. Backend-terminal failure has no lifecycle owner

**Carrier claim.** Root failures are isolated
([`carrier1:328-345`](/.design/watchman/carrier1.gpt56s.md#L328-L345)), while a
capability or protocol incompatibility is backend-terminal and must not be
retried by every root
([`carrier1:840-851`](/.design/watchman/carrier1.gpt56s.md#L840-L851)). The
terminal-lifetime paragraph says backend-terminal construction belongs above
root state but does not identify that owner
([`carrier1:861-866`](/.design/watchman/carrier1.gpt56s.md#L861-L866)).

**Architectural contradiction.** Capability checks occur while a root creates
a generation. If the first incompatible response is to prevent all other roots
from retrying the same adapter, the result must leave that root and fan out.
No owner, latch, lifetime, or fan-out path is specified. Conversely, the broad
promise that one malformed response never affects another root is false for a
malformed response that proves backend incompatibility.

**Required correction.** The selected Watchman adapter needs an explicit
backend lifecycle with an adapter-lifetime terminal latch. A structurally proven
incompatibility fails current and future roots and clears only when the
configured Watcher layer is reconstructed. Root isolation must be stated as
isolation of root-scoped failures, with backend-terminal incompatibility as the
intentional exception. Verification needs both directions: root A's root-local
failure leaves B live, while backend incompatibility discovered through A
terminates B and prevents a new C acquisition.

### CB4. Generic Node and Parcel recovery lacks a concrete Native contract

**Carrier claim.** The process-global Watcher solely owns generic Node/Parcel
reacquisition
([`carrier1:385-433`](/.design/watchman/carrier1.gpt56s.md#L385-L433)), and the
failure table names retryable acquisition/callback failure and terminal
unsupported binding
([`carrier1:840-851`](/.design/watchman/carrier1.gpt56s.md#L840-L851)).

**Verified integration gap.** At `v2@origin`, the native seam exposes only a
`publish` callback and returns `Subscription | undefined`
([`watcher.ts:45-53`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/filesystem/watcher.ts#L45-L53)).
Node runtime errors and Parcel callback errors are logged rather than reported
to the physical watch. Unsupported binding, subscription rejection, and timeout
collapse to `undefined`, and the logical stream ends successfully
([`watcher.ts:207-275`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/filesystem/watcher.ts#L207-L275)).
The carrier assigns recovery policy without defining the information by which
the generic supervisor can implement it.

**Required correction.** Sketch the internal Native contract even if exact
names remain free. It needs distinct exact-output and continuity-loss paths,
typed acquisition failure, explicit acknowledgement, and scoped release.
Node/Parcel retryable loss is absorbed by the generic physical supervisor with
bounded backoff. Watchman root-retryable loss stays inside the root supervisor
and never reaches generic retry. Only terminal failure reaches `WatchSet`.
Generic operations also need diagnostic vocabulary such as `acquire` and
`observe`; the Watchman command list alone is insufficient.

### CB5. Terminal loss can end observation without first invalidating state

**Carrier claim.** `Watcher.changes` can fail with `WatchFailure`, while
`WatchSet.changes` carries `Change | InterestFailure`
([`carrier1:396-417`](/.design/watchman/carrier1.gpt56s.md#L396-L417)). A
terminal physical stream becomes an attributed watch-set failure rather than
ending the aggregate
([`carrier1:420-433`](/.design/watchman/carrier1.gpt56s.md#L420-L433)). The
owner loop, however, handles only exact change and invalidation
([`carrier1:447-466`](/.design/watchman/carrier1.gpt56s.md#L447-L466)).

**Architectural contradiction.** Malformed named PDUs and root-terminal loss
fail a subscription or root without an invalidation row
([`carrier1:847-850`](/.design/watchman/carrier1.gpt56s.md#L847-L850)). A
malformed PDU can itself be the only evidence that one or more changes were not
decoded. Reporting only terminal failure violates the stronger promise that
unknown source state is represented by the invalidation tag.

`InterestFailure` also remains undefined. The text does not say whether retryable
failure can escape, whether the aggregate is nonterminating, how long the
suppression record lasts, or whether a failed physical/root lease remains held.
Those choices determine whether the stated root-terminal lifetime can actually
outlive stream failure.

**Required correction.** Define `InterestFailure` as an attributed terminal
value containing the normalized intent and failure. Retryable failures never
escape their sole supervisor. Any terminal transition that may hide changes
enqueues invalidation before the failure value. The watch-set aggregate stays
live for siblings, retains the owner's desired-plan entry and terminal
suppression record, and retains the last-good domain snapshot. The document
must either define retention of a terminal physical/root lease or stop claiming
later same-root callers observe retained terminal state after every stream has
unwound.

### CB6. Unsubscribe failure and timeout have incompatible generation policy

**Carrier claim.** Every daemon unsubscribe failure after local removal is
diagnostic and cannot retire a healthy generation
([`carrier1:696-711`](/.design/watchman/carrier1.gpt56s.md#L696-L711)), while
every admitted timeout retires its generation
([`carrier1:723-727`](/.design/watchman/carrier1.gpt56s.md#L723-L727)).

**Correctness distinction.** A completed unsubscribe rejection or malformed
unsubscribe response is safe to treat as diagnostic: the raw transport has
correlated and removed the current command. A timeout is different. The
transport has no request IDs or command cancellation, and its timed-out command
can remain the FIFO head. Continuing that generation can stall later commands
or let a late response satisfy the wrong logical operation. This is the same
protocol fact established by
[`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md).

**Required correction.** Limit diagnostic-only behavior to a completed,
correlated unsubscribe rejection or decode failure. Unsubscribe timeout,
connection ambiguity, or framing loss retires the generation under the same
admitted-command rule as every other operation. Local removal remains
authoritative and no result may recreate the registration.

### CB7. A full output queue cannot accept its repair invalidation

**Carrier claim.** Saturation becomes one invalidation rather than silent loss,
while queue capacity and coalescing are implementation choices
([`carrier1:558-567`](/.design/watchman/carrier1.gpt56s.md#L558-L567),
[`carrier1:790-803`](/.design/watchman/carrier1.gpt56s.md#L790-L803), and
[`carrier1:1266-1276`](/.design/watchman/carrier1.gpt56s.md#L1266-L1276)).

**Architectural gap.** An ordinary full queue cannot accept the invalidation
that is meant to repair it. Physical sharing also means saturation must be
tracked per logical subscriber: one slow owner must not invalidate or block a
fast sibling that shares the same physical watch.

**Required correction.** Choose one of two honest policies. The minimal policy
keeps delivery unbounded and removes saturation as a carrier promise. A bounded
policy requires a per-logical-subscriber mailbox with a reserved invalidation
state that supersedes buffered exact rows, preserves invalidation-before-later-
exact ordering, and does not affect sibling mailboxes. Deterministic saturation
tests are required either way the public architecture is stated.

## Required architectural amendments

### AA1. Define explicit watcher-disable semantics and preserve the real surface

Carrier1 acknowledges explicit disable but does not specify its runtime shape
([`carrier1:583-595`](/.design/watchman/carrier1.gpt56s.md#L583-L595)). Its
configuration table and environment scrub omit the existing V2 surface
([`carrier1:1012-1028`](/.design/watchman/carrier1.gpt56s.md#L1012-L1028)).

Current V2 has `Watcher.Options.enabled`, `ServerOptions.fs.filewatcher`,
`OPENCODE_FILEWATCHER_DISABLE`, and `OPENCODE_DISABLE_FILEWATCHER`; the CLI's
isolated environment intentionally sets the latter. Neither environment name
matches `OPENCODE_WATCHER_*`
([`watcher.ts:62-88`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/filesystem/watcher.ts#L62-L88),
[`options.ts:40-44`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/server/src/options.ts#L40-L44),
[`routes.ts:113-120`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/server/src/routes.ts#L113-L120),
[`server-process.ts:112-129`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/cli/src/server-process.ts#L112-L129), and
[`environment.ts:3-18`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/cli/test/fixture/environment.ts#L3-L18)).

The discriminated configuration needs a disabled arm. Disabled observation is
deliberately never-producing and scoped; it is not successful EOF, terminal
failure, acknowledgement, or retry demand. Preserve or explicitly remove both
environment aliases, scrub them in tests, and verify that disabled mode cannot
enter generic recovery.

### AA2. Make Config's absent-root topology finite and explicit

Carrier1 names configuration-root topology as source state
([`carrier1:136-145`](/.design/watchman/carrier1.gpt56s.md#L136-L145)) and says
known sentinels preserve topology transitions
([`carrier1:447-476`](/.design/watchman/carrier1.gpt56s.md#L447-L476)). It does
not define which absent candidates are known.

At `v2@origin`, Config discovers existing `opencode.json`, `opencode.jsonc`,
`.opencode`, `.claude`, and `.agents` entries along its ancestor walk, then
watches discovered roots and direct paths
([`config.ts:187-299`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/config.ts#L187-L299),
[`config.ts:301-333`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/config.ts#L301-L333)).
A previously absent ancestor root has no event source.

The carrier must choose and state one scope:

- Watch every candidate entry on the finite discovery path, preferably through
  grouped parent sentinels rather than several duplicate Node handles per
  directory; or
- Promise live deletion/recreation only for previously discovered roots and
  state that creation of an entirely new ancestor root requires restart or
  another discovery trigger.

The verification matrix needs a corresponding case for a previously absent
ancestor config file or directory.

### AA3. Add an atomic VCS observation resolver, not only a watch-plan callback

Carrier1 says a provider derives metadata interests from resolved scope and
that changing store pointers reconcile
([`carrier1:882-932`](/.design/watchman/carrier1.gpt56s.md#L882-L932)). The
current V2 scope has only `directory`, `worktree`, `canonical`, and optional
common `store`
([`effect/vcs.ts:7-34`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/plugin/src/effect/vcs.ts#L7-L34)).
`Location` is immutable after `Project.resolve`, and Git stores only the common
directory in `location.vcs.store`; a linked worktree's `gitDirectory` is not
retained there.

Once `.git`, `.jj/repo`, or a backing-store pointer changes, that resolved scope
is the stale value from which a new plan cannot safely be derived. The provider
seam must atomically return a freshly resolved metadata scope and its complete
observation plan. Stable topology sentinels must live outside the replaceable
store, including the worktree `.git` entry, workspace `.jj/repo`, applicable
`store/git_target`, and a parent sentinel while an exact tree target is absent.
Any sentinel signal or VCS provider/default `State` change reruns resolution;
the new plan is acquired before the old one is released.

### AA4. Match VCS observation coverage to every cached input

Carrier1 requires complete metadata freshness but its Git matrix contains only
worktree HEAD, common `packed-refs`, and common `refs/heads`
([`carrier1:907-926`](/.design/watchman/carrier1.gpt56s.md#L907-L926)). Current
Git `info()` also computes default branch from the remote symbolic HEAD,
`init.defaultBranch`, and local refs. A loose `refs/remotes/<remote>/HEAD` or
relevant config change is outside the stated plan.

A full-info event repairs client transport semantics, but it does not make an
incomplete source plan complete. Add the provider invariant: every mutable
input read by cached `provider.info()` is covered by the provider's observation
plan or explicitly documented as non-live. Expand Git targets accordingly or
weaken "complete metadata freshness" to "a complete snapshot whenever a covered
metadata input changes."

### AA5. Scope and test the last-good-state rule

Carrier1 says failed domain scans retain the last-good snapshot and plan
([`carrier1:478-482`](/.design/watchman/carrier1.gpt56s.md#L478-L482)). Current
V2 VCS converts provider `info()` failure to `{ branch: {} }` and stores it over
the cached value
([`vcs.ts:91-140`](https://github.com/anomalyco/opencode/blob/4772b6a3e8c2eaeb7594503c4584fb225c75bb15/packages/core/src/vcs.ts#L91-L140)).
Agent and Command convert some scan failures to empty results. These may be
deliberate per-file policies, but they do not implement an unqualified
last-good rule.

Distinguish whole-scan operational failure from intentional omission of a
malformed or unreadable individual source. At minimum, a watcher-triggered VCS
`info()` failure retains current `Vcs.Info` and the previous working plan and
emits health information rather than a false full-metadata update. Add tests for
every owner to which the stronger rule is intended to apply; otherwise narrow
the statement.

## Evidence gaps

### EG1. The exact-root result is plausible but its claimed probe is absent

The root-relative filter reasoning is correct. When `refs/heads` or
`op_heads/heads` is itself the registered root, `.git` and `.jj` are not
components of descendants passed to `walk` or `should_ignore`
([`carrier1:964-981`](/.design/watchman/carrier1.gpt56s.md#L964-L981),
[`watcher.rs:190-214`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L190-L214),
and [`watcher.rs:282-294`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/daemon/watcher.rs#L282-L294)).

No persisted exact-root probe or exact-root integration test was found in the
sibling checkout. Existing Watchwoman tests prove broad-root VCS pruning, not
an exact-root subscription's create/delete delivery. The carrier's
"review-time query probe" therefore cannot currently be reproduced from a
cited artifact.

Retain the live subscribe acceptance gate, but either link its command/output
artifact or change the existing sentence to "source inspection predicts
exact-root indexing." Qualify the conclusion: exact placement bypasses the VCS
component filter, not independent root policy, file-count caps, missing target
directories, or the native watcher health failures in CB1.

### EG2. The daemon validation document is partially historical

[`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) remains
useful for plain-watch routing, root persistence, query behavior, and the live
environment. It says canceled PDUs do not exist, while current Watchwoman source
now emits cancellation when a root is retired
([`watchwoman0:287-307`](/.design/watchman/watchwoman0.unknown.md#L287-L307) and
[`subscribe.rs:137-148`](file:///home/rektide/src/watchwoman-systemd/crates/watchwoman/src/commands/subscribe.rs#L137-L148)).
It should not be cited as an undifferentiated description of current
cancellation or unsubscribe behavior.

Carrier1 should identify it as historical validation and cite current source or
a new live record for behaviors changed since 2026-08-30.

### EG3. Several new promises have no proof obligation

The verification matrix is strong on initial ordering, late attachment,
response discard, root sharing, cancellation fencing, exact VCS roots, and
cross-workspace jj delivery
([`carrier1:1069-1088`](/.design/watchman/carrier1.gpt56s.md#L1069-L1088)). It
does not yet prove:

- native daemon registration failure or runtime source-error signaling;
- structured blocked/capped-root terminal classification;
- backend-terminal fan-out versus root-local isolation;
- terminal invalidation-before-failure;
- unsubscribe rejection versus unsubscribe timeout;
- bounded-mailbox slow-subscriber isolation;
- explicit disabled-mode quiescence;
- creation of a previously absent Config ancestor root;
- provider/default changes causing VCS plan reconciliation; or
- complete Git input coverage and last-good VCS state on refresh failure.

These are behavioral contracts, not documentation-only details. Each accepted
promise needs a deterministic or isolated live gate.

## Scope decisions

### SD1. B3 is a new proposal, not an already accepted consequence

Carrier1 says the B3 deferral expires because all revisit triggers are present
([`carrier1:284-290`](/.design/watchman/carrier1.gpt56s.md#L284-L290)) and later
describes the earlier vision as recording the promotion
([`carrier1:1306-1313`](/.design/watchman/carrier1.gpt56s.md#L1306-L1313)).

The actual human decision in
[`vision0:883-905`](/.design/watchman/vision0.gpt56s.md#L883-L905) selects B2
and says B3 is deferred, not rejected. The dedicated proposal says it is a
future design and "nothing here is scheduled"
([`typed-watcher0:34-42`](/.design/watchman/typed-watcher0.glm53.md#L34-L42)).
Revisit triggers require reconsideration; they do not themselves record human
acceptance.

Carrier1 may and, architecturally, should recommend B3. It must label that as
the new carrier's proposal pending explicit acceptance, or cite the later human
decision that accepted it. The cross-reference should say the prior documents
provide the trigger and design, not that they already promote it.

### SD2. Construction cannot expose B3 before Config's indirect consumers

The construction outline introduces the watcher union and migrates direct
consumers in step 2, then migrates Config with Agent, Command, and Plugin Source
in step 3
([`carrier1:1208-1222`](/.design/watchman/carrier1.gpt56s.md#L1208-L1222)).
Once Config passes watcher invalidations through, the existing Agent, Command,
and Plugin Source exact-path predicates silently reject a root invalidation.
Config also lacks the watch-set terminal aggregation that step 2 says every
owner can handle.

Combine these slices, or move Config's union pass-through and all indirect
consumer switches into the same revision as B3. Keep only broader source-plan
reconciliation for a later slice. Every intermediate revision must be
behaviorally safe, not merely type-correct.

### SD3. Transport-construction failure versus file isolation needs one sentence

Carrier1 says exact files avoid daemon failure domains and also says selected
transport-load failure fails backend construction
([`carrier1:328-345`](/.design/watchman/carrier1.gpt56s.md#L328-L345) and
[`carrier1:583-595`](/.design/watchman/carrier1.gpt56s.md#L583-L595)). If that
failure aborts construction of the process-global Watcher layer, Node file
observation never starts either.

Clarify whether a broken explicitly selected transport fails server startup or
creates a composite in which Node files remain available while directory
streams fail terminally. If startup fails, scope the file-isolation promise to
a successfully constructed composite and distinguish package/configuration
failure from runtime daemon-root failure.

## Editorial cleanup

### EC1. Registration terminology slips in the resource model

The glossary distinguishes logical subscription from physical/root
registration
([`carrier1:352-378`](/.design/watchman/carrier1.gpt56s.md#L352-L378)), but the
resource section says "one logical registration per distinct target and ignore
expression"
([`carrier1:1030-1042`](/.design/watchman/carrier1.gpt56s.md#L1030-L1042)).

Use "one root registration per distinct normalized physical directory intent,
plus one logical subscription per owner lease."

### EC2. Four summary sections now repeat the same decisions

The design-axis table
([`carrier1:292-326`](/.design/watchman/carrier1.gpt56s.md#L292-L326)), system
promises ([`carrier1:328-350`](/.design/watchman/carrier1.gpt56s.md#L328-L350)),
exclusion inventory
([`carrier1:1105-1128`](/.design/watchman/carrier1.gpt56s.md#L1105-L1128)), and
completion picture
([`carrier1:1171-1193`](/.design/watchman/carrier1.gpt56s.md#L1171-L1193)) all
repeat static selection, typed invalidation, cursorlessness, root supervision,
and VCS ownership.

Keep Design Axes as the executive map and the detailed sections as the
normative explanation. Delete Completion Picture. Trim the exclusion inventory
to genuinely historical implementation artifacts not already represented as a
rejected axis, such as `watch-del`, the metrics renderer, the proof line, and
the historical documentation corpus.

### EC3. The B3 cross-reference attributes a decision to the wrong source

The carrier's cross-reference says the vision's addendum records triggers that
"now promote B3"
([`carrier1:1306-1313`](/.design/watchman/carrier1.gpt56s.md#L1306-L1313)). The
source records triggers and a B2 decision, not promotion. Reword it to preserve
the distinction established in SD1.

## Checked claims

The following important carrier claims survived source review:

- At the review freeze, `v2@origin` resolved to the recorded full commit, and
  that revision contains no Watchman backend, owned-watch module, watcher-level
  invalidation, or VCS-interest owner.
- The generic Watcher attaches `Stream.fromPubSub` only after native acquisition
  returns, so a publication during initial acquisition can be lost. Carrier1's
  ordered attachment and per-logical-subscriber initial invalidation address a
  real race.
- A new logical subscriber joining an already active shared physical watch
  needs its own initial invalidation. Carrier1 now states and tests that case.
- The Node exact-file versus selected recursive-directory partition matches
  current V2 and the file-watch analysis. Node's coarse `update` for its one
  exact target remains exact-path evidence.
- The root supervisor, acknowledgement symmetry, cancellation-before-retry,
  fresh-clock replay cohort, and exact live PDU recommendations are consistent
  with the architecture and failure-path reviews.
- Ignoring subscribe-response rows is coherent only because typed post-ack
  invalidation requires a current-state read. Carrier1 preserves that pairing.
- Directory create/delete rows, including empty directories, require retaining
  `name`, `exists`, `new`, and `type`; carrier1 correctly rejects
  `always_include_directories: false` as a general optimization.
- The Git linked-worktree correction is necessary: `location.vcs.store` is the
  common directory, while active HEAD lives under the worktree-specific
  `gitDirectory`.
- Current `vcs.branch.updated` is branch-only, and the Solid client reducer
  reconstructs `vcs` from only `branch`, discarding richer fields. A distinct
  full-metadata event or invalidation is justified.
- Direct VCS plans should bypass broad source-tree ignores and project
  `watcher.ignore`; retaining LocationWatcher's external bus publication while
  removing VCS's dependence on it is a coherent compatibility split.
- An exact `refs/heads` or `op_heads/heads` root bypasses Watchwoman's
  component-based `.git`/`.jj` filter because those components are ancestors,
  not root-relative descendants.
- Plain `watch <known root>` is the correct route for typed project and exact
  placement. `watch-project` would reintroduce daemon-side root selection.
- Root-local command admission and one raw client per root provide the claimed
  cross-root FIFO and timeout isolation.

## Residual risks

Even after the required corrections, several risks remain intentionally outside
the core event-history contract:

- A platform or daemon can still lose events without a detectable signal. The
  architecture can require honest supported adapters but cannot infer hidden
  kernel or implementation failure.
- A fresh clock shared by a large replay cohort reduces command count but makes
  later subscriptions carry a longer ignored response window. Loaded-host
  verification should record response size and cohort duration, not only
  command count.
- One raw client per exact root improves isolation but can create connection and
  cold-start bursts. The carrier already calls for measurement; it should retain
  this as a recorded capacity result.
- Exact roots can disappear and be recreated. Correct convergence depends on
  stable parent/topology sentinels and on the daemon reporting root retirement;
  a watch on the disappearing root alone is insufficient.
- Provider-owned target declarations become part of the plugin-facing VCS API.
  Effect and Promise provider definitions, host adaptation, and third-party
  target validation expand the carry surface beyond `core/src/vcs.ts`.
- Full-metadata invalidation followed by asynchronous client refetch is
  current-state convergent but can issue redundant requests. Carrying complete
  `Vcs.Info` avoids that cost but enlarges the event schema and generated-client
  surface. Carrier1 correctly leaves the choice open.
- The architecture deliberately does not provide historical completeness,
  exactly-once delivery, or restoration of intermediate states. State owners
  that cannot cheaply and authoritatively rescan do not fit this substrate.

## Cross-references

- [`carrier0.gpt56s.md`](/.design/watchman/carrier0.gpt56s.md) is prior art for
  the detailed implementation collision map, current V2 option surface, and
  deterministic failure matrices. This review preserves its evidence while
  accepting carrier1's deeper B3 and generic-recovery direction.
- [`typed-watcher0.glm53.md`](/.design/watchman/typed-watcher0.glm53.md) defines
  the exact/invalidation union and late migration blast radius. It also provides
  the source evidence that B3 was designed but deferred, which is the basis of
  SD1.
- [`review-architecture0.gpt56s.md`](/.design/watchman/review-architecture0.gpt56s.md)
  supplies the single-root-supervisor model, exact-versus-invalidation
  distinction, one-clock replay cohort, and current Config consumer constraint.
- [`review-failure-paths0.gpt56s.md`](/.design/watchman/review-failure-paths0.gpt56s.md)
  supplies the pre-ack publication proof, silent native EOF finding, terminal
  lifetime questions, cancellation ordering, and M1-M6 test vocabulary.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) explains why an
  admitted timeout, including unsubscribe timeout, makes a FIFO generation
  untrustworthy even when local ownership has already been released.
- [`watches.glm53.md`](/.design/watchman/watches.glm53.md) establishes the
  low-noise Git, Mercurial, and jj targets and the rule that watcher output is a
  reason to reread rather than VCS data. AA3 and AA4 tighten its topology and
  source-coverage assumptions.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) records
  useful earlier live evidence and the plain-watch incident. EG2 marks the
  portions superseded by current daemon source.
- [Watchwoman's VCS filter design](file:///home/rektide/src/watchwoman-systemd/.design/opencode/vcs-config2.glm53h.md)
  remains relevant to broad-root consumers. Exact placement avoids depending on
  its release but does not avoid the daemon health contract in CB1-CB2.
- [The VCS filter assessment](file:///home/rektide/src/watchwoman-systemd/.design/opencode/vcs-config2-assessment0.gpt56s.md)
  independently notes that directly watching a `.git` directory removes that
  component from the relative path and that out-of-root workspace metadata
  still requires client-side resolution.
- [The jj-vcs design](file:///home/rektide/src/opencode-jj-vcs/design/jj-vcs/jj-vcs2.glm53.md)
  supplies filesystem-only main-repository and backing-store resolution plus
  side-effect-safe metadata reads. AA3 turns that resolver into an explicit
  observation-plan prerequisite.
- [`README.md`](/.design/watchman/README.md) is the historical implementation
  record. It confirms the existing watcher-disable aliases and remains useful
  for operational comparison, but its fallback/cursor/metrics runtime is not
  the remade architecture reviewed here.
- [`upstream-delta0.glm53h.md`](/.design/watchman/upstream-delta0.glm53h.md)
  postdates this review's `4772b6a3` evidence freeze. It records upstream's new
  `entries` watch kind, attached-before-ready callback, source-derived Config
  plan, absent-entry sentinels, and additional direct consumer; those changes
  qualify AA2's current implementation status and must be reconciled during
  construction without erasing the finding about carrier1 at `2afb097d`.

# Addendum proposed for carrier1

This addendum packages the minimum normative corrections required before the
carrier can serve as an implementation contract. It does not change the
carrier's central direction: source-owned current state, typed invalidation,
static adapter selection, cursorless establishment, exact live directory
events, and one recovery owner at each scope remain normative.

## Continuity boundary

The substrate guarantees invalidation for every continuity loss detected by or
reported to its adapter. It cannot guarantee a signal for daemon-internal,
kernel, or platform loss that the selected adapter hides. Documentation and
verification must distinguish this observable contract from end-to-end claims
about an arbitrary daemon implementation.

A supported native adapter or daemon must satisfy all of the following:

- Successful acquisition means the underlying OS or daemon observation has
  actually been registered.
- Acquisition failure is returned as typed failure rather than successful EOF
  or a successful acknowledgement with no observation.
- Runtime source errors, queue overflow, recrawl, root retirement, or equivalent
  discontinuity produce an adapter loss signal, fresh-instance indication,
  canceled PDU, or connection closure.
- A stable machine-readable error discriminator identifies terminal root policy
  and size-cap rejection. Human-readable text is diagnostic only.

Current Watchwoman does not satisfy the first three requirements on every
native-watcher failure path and does not expose a machine-readable root-rejection
code. The carrier is not live-verified against Watchwoman until those paths are
corrected and exercised.

## Selected-backend lifecycle

The configured Watchman adapter owns one backend lifecycle above all root
supervisors. Missing or structurally invalid transport fails construction.
A capability or protocol result that structurally proves backend incompatibility
completes an adapter-lifetime terminal latch, fails every current root, and
causes future root acquisitions to fail without retry. The latch clears only
when the configured Watcher layer is reconstructed.

Root isolation applies only to root-scoped failures. Backend-terminal
incompatibility intentionally fans out. Subscription-terminal failure remains
local to one normalized physical registration.

## Native acquisition and observation contract

The internal Native seam has the following conceptual obligations:

```ts
type NativeFailure = {
  readonly scope: "subscription" | "backend"
  readonly recovery: "retry" | "terminal"
  readonly operation: "acquire" | "observe" | "release"
  readonly cause: unknown
}

type NativeLease = {
  readonly release: Effect<void>
}

interface Native {
  readonly acquire: (input: {
    readonly intent: WatchIntent
    readonly emit: (change: ExactChange) => void
    readonly lose: (failure: NativeFailure) => void
  }) => Effect<NativeLease, NativeFailure>
}
```

The generic Watcher allocates and attaches logical output before calling
`acquire`. It buffers or subsumes pre-ack exact output, emits acquisition
invalidation first, and only then exposes later exact output. A logical
subscriber joining an active physical watch receives its own initial
invalidation after atomic attachment.

The generic physical supervisor absorbs retryable Node and Parcel acquisition
or observation failure, applies bounded backoff, reacquires once per physical
entry, and invalidates all attached subscribers before later exact output.
Watchman root-retryable failures remain internal to the root supervisor and
must not trigger generic physical retry. Only terminal failure escapes to the
watch set.

Unexpected physical stream completion while demand remains is continuity loss,
not healthy EOF. Caller interruption and final lease release are the only
ordinary completion paths.

## Terminal failure and WatchSet retention

`InterestFailure` is an attributed terminal value:

```ts
type InterestFailure = {
  readonly type: "failure"
  readonly intent: WatchIntent
  readonly failure: WatchFailure & { readonly recovery: "terminal" }
}
```

Retryable failure never appears in `WatchSet.changes`; its sole supervisor
absorbs it. A terminal transition that may hide source changes enqueues an
invalidation for the interest target before its `InterestFailure`. The aggregate
watch-set stream remains live for unaffected interests.

The watch set retains the desired-plan entry, last-good domain snapshot, and a
terminal suppression record while the normalized intent remains unchanged. It
does not redemand that intent in a yield loop. Removing the intent clears the
record; a later newly added intent may acquire again. If implementation chooses
to retain process-global root-terminal state for later same-root callers, it
must retain an actual physical/root lease explicitly. Otherwise documentation
must limit terminal lifetime to existing physical leases and not imply a cache
survives their unwinding.

Owner handling of `InterestFailure` reports degraded observation without
discarding the last-good snapshot. It does not treat failure prose as a source
change or recovery policy.

## Unsubscribe completion and timeout

Local registration removal is authoritative and happens before daemon cleanup.
A completed and correlated unsubscribe rejection or response-decode failure is
diagnostic only and cannot recreate the registration or retire an otherwise
healthy generation.

An admitted unsubscribe timeout, socket ambiguity, or framing loss is different:
request-response synchronization is unknown, so the generation is retired once
under the universal admitted-command rule. Registrations that remain desired
follow root recovery; the released registration never reappears.

## Per-subscriber overload mailbox

Bounded delivery, if retained, is implemented per logical subscriber rather
than on one shared consumer queue. Each mailbox has an invalidation state that
cannot be excluded by exact-event capacity. When an exact event cannot be
retained, the mailbox discards or subsumes buffered exact rows for that interest,
sets invalidation pending, and guarantees that invalidation is observed before
any later exact row. Repeated overload while invalidation is pending coalesces
idempotently.

A slow subscriber cannot block, drop, or invalidate output for another logical
subscriber sharing the physical watch. If this reserved-state behavior is not
implemented, queues remain unbounded and the carrier makes no saturation-
recovery claim.

## Disabled configuration

Explicit disable is a first-class configuration arm separate from Parcel and
Watchman selection. It creates deliberately quiescent scoped observation: no
native acquisition, no initial invalidation, no terminal failure, no successful
EOF signal, and no retry.

The server and CLI surface must preserve or explicitly remove
`fs.filewatcher`, `OPENCODE_FILEWATCHER_DISABLE`, and
`OPENCODE_DISABLE_FILEWATCHER`. Environment-isolation tests scrub both existing
variables in addition to `OPENCODE_WATCHER_*`, `OPENCODE_WATCHMAN_*`, and
`WATCHMAN_SOCK`.

## Config absent-root sentinels

Config must state the finite topology it can discover live. If creation of a
previously absent ancestor source is supported, the desired plan includes
sentinels for `opencode.json`, `opencode.jsonc`, `.opencode`, `.claude`, and
`.agents` at each directory in the configured ancestor walk. Parent-level
sentinel acquisition precedes release of obsolete root watches. Equivalent
parent sentinels should be grouped where possible to avoid one duplicate Node
handle per candidate name.

If that cost is not accepted, the promise is narrower: deletion, recreation,
and symlink retargeting are live only for previously discovered roots, and a
new absent ancestor root needs another explicit discovery trigger or restart.
Tests and user documentation must match the selected scope.

## Atomic VCS observation resolution and coverage

A provider does not derive a new plan from a stale immutable `Location` scope.
Its optional observation resolver atomically returns:

```ts
type VcsObservation = {
  readonly scope: ResolvedVcsScope
  readonly targets: readonly VcsMetadataTarget[]
}
```

The result includes stable topology sentinels and resolved metadata targets.
Git retains the worktree `.git` entry, worktree-specific `gitDirectory/HEAD`,
common refs, packed refs, and every additional mutable input used by cached
`info()`. Jujutsu retains the workspace `.jj/repo` entry, applicable backing-
store pointer, and resolved main-repository `op_heads/heads`. Missing exact tree
targets retain a parent sentinel until they can be acquired.

Sentinel signals and selected-provider/default changes rerun the resolver. The
VCS owner acquires the new complete plan before releasing the old one, reads
metadata from the same resolved scope, and publishes a semantic event only
after a successful decode. Whole-refresh failure retains the prior plan and
last-good `Vcs.Info`.

Every mutable input read by cached provider metadata is either represented in
the observation plan or documented as non-live. The current minimal Git matrix
does not by itself prove freshness for remote symbolic HEAD or configuration-
derived default-branch changes. "Complete metadata freshness" is used only when
this coverage invariant is satisfied; otherwise the event carries a complete
snapshot for the covered triggers only.

## B3 acceptance and construction ordering

Carrier1 proposes B3 because generic physical recovery, another
invalidation-native owner, and upstreamable watcher work satisfy the recorded
revisit conditions. The earlier B2 decision and deferred B3 design do not by
themselves constitute acceptance. B3 becomes normative only after an explicit
acceptance record is cited.

Once accepted, the watcher-level union, Config pass-through, Agent/Command/
Plugin Source invalidation handling, all direct watcher consumers, test doubles,
and watch-set terminal aggregation land in one behaviorally coherent foundation
or in revisions where producers cannot emit a new variant before every exposed
consumer handles it. No intermediate revision may publish root invalidation to
an exact-path-only Config consumer.

## Exact-root evidence qualification

Current Watchwoman source supports the narrow claim that an exact
`refs/heads` or `op_heads/heads` root bypasses component-based `.git` and `.jj`
pruning. This is a source-derived expectation until a cited probe artifact
shows an actual subscription receiving both create and delete under the exact
root.

That result does not bypass daemon root policy, file-count limits, target
existence, native watcher acquisition health, or runtime source-error handling.
The smart broad-root VCS filter remains unnecessary for this exact-placement
path only after those independent gates pass.
