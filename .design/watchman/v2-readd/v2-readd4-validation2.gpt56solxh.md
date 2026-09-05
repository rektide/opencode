---
type: EvidenceValidation
title: Watchman v2 re-add v4 path, owner, and release evidence validation
description: Cross-validation of the third research wave, corrections between independently produced reports, and the final operational research assignments required before design challenge.
resource: /.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, validation, paths, owners, lifecycle]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: roots, resource: /.design/watchman/v2-readd/v2-readd4-e02-watch-roots0.glm53max.md, title: Plain watch root semantics }
  - { id: ignores, resource: /.design/watchman/v2-readd/v2-readd4-e08-ignore-parity0.glm53max.md, title: Parcel ignore parity }
  - { id: creates, resource: /.design/watchman/v2-readd/v2-readd4-e09-create-evidence0.glm53max.md, title: Portable create evidence }
  - { id: symlinks, resource: /.design/watchman/v2-readd/v2-readd4-e10-symlink-sentinel0.glm53max.md, title: Symlink owner and sentinel behavior }
  - { id: daemon-release, resource: /.design/watchman/v2-readd/v2-readd4-e12-daemon-session-release0.glm53max.md, title: Watchwoman session release }
  - { id: skill, resource: /.design/watchman/v2-readd/v2-readd4-e14-skill-lifecycle0.glm53max.md, title: Skill readiness lifecycle }
---

# Watchman v2 re-add v4 path, owner, and release evidence validation

## Result

Wave three supplies a strong source-pinned and executable basis for plain-watch
roots, Parcel ignore semantics, create/update evidence, symlink topology, Skill
readiness, and Watchwoman's daemon-side release chain. It invalidates four v4
assumptions: successful plain `watch C` cannot return an ancestor `D`; literal
ignores must be evaluated in the logical event namespace rather than the
canonical namespace; neither daemon's `new` field is portable creation truth;
and a Skill flag set before stream consumption self-loops under W1.

The corpus is not yet ready for design challenge. E16–E19 remain open, exact Bun
1.4.2 has not been executed, and the combination of Watchwoman's missing child
rows with v4's directory-row suppression has not yet been traced through the
real recursive-watch owners. Those are bounded final-wave questions, not an
invitation to reopen the completed daemon/path research.

## Cross-validated findings

### Root and path namespaces

1. On a successful plain `watch C`, stock Watchman and Watchwoman both return
   exactly `realpath(C)` as `watch`; neither consults pre-existing ancestor or
   descendant watches, and neither emits `relative_path`. Nested exact roots
   coexist independently. Ancestor selection and `relative_path` belong to
   `watch-project`, which this architecture excludes.
2. The installed stock binary rejects several non-canonical raw-socket
   spellings even though its CLI canonicalizes them first. Watchwoman
   canonicalizes server-side. A caller that computes canonical `C` before
   issuing plain `watch` avoids that observed stock asymmetry.
3. Parcel 2.5.1 publishes and filters in the caller's logical root namespace
   `L`. Literal ignores are `path.resolve(L, value)` followed by byte-exact
   equal-or-component-below matching; globs are full micromatch matches against
   L-relative POSIX paths. No existence or entry-type check participates.
4. Therefore a Watchman implementation that publishes logical paths cannot
   enforce a literal solely against canonical `C` paths without changing Parcel
   behavior. P2's canonical-namespace ignore was inert in the exact `L != C`
   experiment.
5. Only Config currently passes recursive ignores, specifically the hardcoded
   `node_modules`/`.git` literal-and-glob plan. Skill realpaths its recursive
   root and passes no ignores; configured plugin sources pass none. User
   `watcher.ignore` does not feed recursive directory watches at this pin.

### Event classification and coverage

1. There is no portable intrinsic create/update signal. Watchwoman can produce
   an ordinary create row byte-indistinguishable from an update row after stat
   values are equalized; its `new` and `cclock` algebra differs from stock, and
   it silently ignores the field selector in stock's three-argument `since`
   expression.
2. Initial baseline plus remembered `exists` and `ino` is the only observed
   cross-daemon discriminator: same inode means update; absent/tombstoned path
   or changed inode means create/recreate/replacement. This is client-maintained
   prior-state inference, not daemon classification.
3. That inference is bounded rather than globally complete. Both daemons can
   coalesce transitions; Watchwoman omits descendants on directory rename and
   recursive delete; Parcel can lose rapid creates before child-watch
   registration and can emit descendants under stale prefixes after directory
   rename. A baseline cannot repair an event that never arrives.
4. At `4306c07b`, Config, Instruction, Skill, configured Plugin Source, VCS,
   review, and TUI consumers use path changes as invalidations rather than
   requiring create/update identity. Only LocationWatcher's typed mapping and
   the app file tree inspect that distinction, and today's Node file backend
   feeds LocationWatcher only `update`.

### Symlink topology

1. Exactly three owners create recursive watches: Config, Skill, and configured
   plugin directories. Config and configured plugin paths retain caller
   spellings; Skill realpaths its recursive directory and adds a non-recursive
   logical-spelling file watch when `L != C`.
2. `fs.watch(dirname(L))` filtered to `basename(L)` observes direct symlink-entry
   delete, recreate, and retarget on this Linux host. Event counts are not
   semantic—Bun 1.4.1 heavily coalesces same-name bursts—but rereading link
   state at the callback converged in every measured repetition.
3. That primitive is blind to symlinked ancestors above `dirname(L)`: after an
   ancestor retarget, both Node and Bun kept reporting the old target and never
   reported the new one. It also dies silently if its watched parent is deleted.
4. Bun 1.4.1 has a deterministic re-arm hazard: arming a watch on a recreated
   directory while the stale watch remains open produces a permanently deaf new
   watch; closing the stale watch before re-arm avoids the failure. Bun 1.4.2
   remains untested.

### Skill owner lifecycle

1. Under exact W1 order—logical `PubSub.subscribe`, initial `onReady`, then
   sequential invalidation replay—the per-watch gate must flip inside the first
   `onReady` invocation. The v4 brief's flag set before stream consumption is
   already true during initial readiness and loops forever.
2. Fifteen deterministic Effect rc.112 tests distinguish the variants: the
   first-call gate suppresses initial readiness, preserves invalidations queued
   after logical attachment, drives one authoritative refresh per external
   cycle, and settles. A mutation check proves the loop tests are sensitive to
   the exact flag timing.
3. No owner-local latch can recover an invalidation published while no logical
   subscriber exists. Slow initial attach, clear-to-resubscribe, and unsupported
   backend stream death create subscription gaps. The owner's authoritative scan
   bounds some gaps; closing them completely would require ordering beyond a
   latch and is design work.

### Watchwoman release lifecycle

1. A no-subscription client releases in tens of microseconds. A disconnected
   subscribed client is different: the push loop retains a session clone while
   parked on the root tick channel, so FIN or client death alone does not free
   the accepted socket, loop, or registry entry on a quiescent root.
2. The first file-yielding tick attempts a write and exposes EPIPE, freeing the
   writer/connection/socket. The push loop notices the closed session only on a
   later tick, then removes the registry entry. A non-matching tick that yields
   no PDU does not trigger the first stage.
3. `unsubscribe` removes only the registry entry on deployed `a1e16cbf` and
   local tip `603f3b5`; its detached push loop continues delivering to a live
   client and follows the same post-disconnect release chain.
4. Root GC/drop closes the tick channel and releases subscription-held work at
   both revisions. Tip-only SIGHUP retirement adds a non-stock-shaped
   `{subscription,canceled,clock}` PDU and a 250 ms root-removal grace. A
   separate still-live command connection remains until its own FIN; root drop
   is not a blanket close of every live client connection.
5. Tip queue caps fix a different problem: a live non-reading client poisons
   and tears down when its bounded queue overruns. They do not change empty-queue
   quiescent disconnect or unsubscribe retention. The deployed pin buffered the
   measured stalled stream linearly and without a bound.

## Reconciliation and corrections

| Independent report statement | Validated reading |
| --- | --- |
| P1 says plain `watch C` “always” returns `realpath(C)`. | Qualify this as every **successful** response. Nonexistent paths fail on both daemons, and the installed stock socket rejects several non-canonical spellings. The ancestor/`relative_path` conclusion is unaffected. |
| P4's Config/Plugin consequence table describes an L-spelling watch remaining pinned to an old target after symlink churn. | P2 proves a **final-component symlink root** is rejected by Parcel's Linux backend before a watch exists. P4's old-target behavior applies to an intermediate/ancestor symlink or an ordinary watched directory inode, not the rejected direct-link case. |
| P3 identifies baseline + inode as the portable discriminator. | It is portable only when the relevant baseline and later row are delivered. P2's registration loss and stale rename paths plus Watchwoman's missing descendant rows prevent treating it as an exact durable model. |
| P4 calls the first-call sentinel reliable. | It is reliable for direct basename churn under the measured parent. It does not cover ancestor symlinks, parent disappearance, or Bun's stale-watch-before-rearm ordering. |
| P5 says only the dirty design's gate is sound. | This is proven among the tested owner-local latch variants under exact W1/Effect rc.112 semantics. It does not preclude a different owner/backend ordering that removes detached gaps. |
| P6 says root drop releases “everything.” | Root drop releases the root, subscriber, push loop, and subscription-held session references. A connected client can retain its ordinary command session until FIN, as the SIGHUP-retire cell demonstrates. |

## Evidence-gate status after wave three

| Gate | Status | Remaining boundary |
| --- | --- | --- |
| E02 | Closed | Plain watch uses exact canonical root; no daemon-selected ancestor or `relative_path`. |
| E08 | Factual parity closed | Logical/canonical mapping choice belongs to design; exact owner consequences join O5. |
| E09 | Intrinsic-signal question closed negatively | Directory-only signal loss through owners remains O5; create policy remains design. |
| E10 | Owner inventory and primitive behavior strong | Generic coverage of ancestor symlinks and parent recreation is a design choice; exact Bun 1.4.2 evidence joins E17. |
| E12 | Raw client and daemon lifecycle strong as negative evidence | Final release proof still requires executable production composition after a design exists. |
| E14 | Closed for exact W1 latch timing | Detached-gap policy is design, not more latch research. |
| E16 | Open | Safe, reversible connection-loss apparatus and unrelated-root proof. |
| E17 | Open | Daemon, transport, Bun, OS, and architecture support matrix. |
| E18 | Open | Server option and public/generated API ownership trace. |
| E19 | Open | Read-only disposition of W1/W2/actor carrier changes against validated evidence. |

## Final research wave: operational and owner closure

All assignments remain research-only GX work. They produce new model-suffixed
reports in this directory, make no production or design edits, and do not
commit. O5 is added because independent wave-three evidence exposes a genuine
owner-convergence question not answered by the original E09 row-shape ask.

| ID | Output | Bounded question |
| --- | --- | --- |
| O1 / E16 | `v2-readd4-e16-safe-loss0.<model>.md` | Which private-daemon or per-client proxy procedure can force end/error/reconnect on each daemon without `watch-del`, daemon-global mutation, or damage to an unrelated root, and what cleanup proof is sufficient? |
| O2 / E17 | `v2-readd4-e17-platform0.<model>.md` | What do source, package metadata/artifacts, CI, and executable probes establish for Watchwoman, stock Watchman, the JS transport, Bun 1.4.2, Node, Linux, macOS, Windows, libc, and CPU architectures? |
| O3 / E18 | `v2-readd4-e18-server-options0.<model>.md` | Where do backend options enter CLI/server/Core construction, and would the smallest static option path alter Protocol `HttpApi`, generated clients, SDK/runtime dependency direction, or only internal startup types? |
| O4 / E19 | `v2-readd4-e19-carrier-audit0.<model>.md` | What exact committed W1 and uncommitted W2/actor hunks exist in the dirty carrier, which named tests still pass, and which artifacts are evidence-compatible, superseded, or independently reusable? |
| O5 / owner-directory signal | `v2-readd4-owner-directory-signal0.<model>.md` | What do Parcel and both daemons emit for directory subtree rename/delete, what would v4's pre-mapping directory suppression erase, and which Config, Skill, Plugin Source, LocationWatcher, or app states fail to refresh or later self-heal? |

## Design challenge gate

After O1–O5 are validated and committed, Astra xhigh and GX receive the complete
accepted corpus, both existing v4 candidate documents, and primary-source
access. They write independent first design drafts in parallel without reading
one another. Only after both complete are the drafts exchanged; each agent then
writes a separate second draft that compares the alternatives, adopts stronger
ideas where warranted, explains remaining disagreements, and converges on its
best evidence-grounded design. All four drafts remain separate model-suffixed
records.

Prompt revision remains deferred until the coordinator reconciles those second
drafts and the user accepts the resulting availability and permanent-failure
policies. No production implementation is authorized by this validation.

## Cross-references

- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) — wave-two findings and the assignments validated here.
- [`v2-readd4-e02-watch-roots0.glm53max.md`](v2-readd4-e02-watch-roots0.glm53max.md) and [`v2-readd4-e08-ignore-parity0.glm53max.md`](v2-readd4-e08-ignore-parity0.glm53max.md) — exact-root and logical-namespace path evidence.
- [`v2-readd4-e09-create-evidence0.glm53max.md`](v2-readd4-e09-create-evidence0.glm53max.md) and [`v2-readd4-e10-symlink-sentinel0.glm53max.md`](v2-readd4-e10-symlink-sentinel0.glm53max.md) — event identity and topology limits.
- [`v2-readd4-e14-skill-lifecycle0.glm53max.md`](v2-readd4-e14-skill-lifecycle0.glm53max.md) — executable owner convergence evidence.
- [`v2-readd4-e12-daemon-session-release0.glm53max.md`](v2-readd4-e12-daemon-session-release0.glm53max.md) — daemon-side complement to the raw transport lifecycle reports.
