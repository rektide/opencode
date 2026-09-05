---
type: EvidenceExperiment
title: E20 Watchwoman read-triggered subscription feedback
description: Five-run private-daemon proof that deployed Watchwoman emits an update for an ordinary read and sustains a read-on-update feedback loop, while installed stock Watchman remains quiet.
resource: /.design/watchman/v2-readd/v2-readd5-e20-read-feedback0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, e20, inotify, access, feedback, quietness]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: apparatus, resource: file:///home/rektide/tmp-opencode/v5-read-feedback/README.md, title: Private-daemon harness, five-run matrix, raw PDUs, and cleanup }
  - { id: watchwoman, resource: https://github.com/rektide/watchwoman/commit/a1e16cbf35b6bb1e4b429af53d65e738f955c32b, title: Exact deployed Watchwoman source }
  - { id: notify, resource: https://github.com/notify-rs/notify/tree/8.2.0, title: Watchwoman's locked notify implementation }
  - { id: stock, resource: https://github.com/facebook/watchman/commit/923b0935155590be54c0fc052fdca0201f8ebc4b, title: Inspected stock source, distinct from installed fallback }
  - { id: astra1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.gpt6astra.md, title: Astra second draft that made quietness a release gate }
  - { id: gx1, resource: /.design/watchman/v2-readd/v2-readd5-draft1.glm53max.md, title: GX second draft that independently verified the source chain }
---

# E20 Watchwoman read-triggered subscription feedback

## One-sentence answer

Against five fresh private instances, every ordinary read of an unchanged
subscribed file produced exactly one deployed-Watchwoman PDU, and reading the
file in response sustained one PDU per read until the 21-PDU harness cap, while
installed stock Watchman produced zero read PDUs; the quietness gate in both v5
second drafts therefore fails for deployed `a1e16cbf`, and no evidence-supported
client filter can distinguish these rows from real same-state mutations.

## Why this follow-up was required

The research corpus had already established Watchwoman's broad event-to-upsert
path, but the two independent first drafts were the first records to connect it
to owner convergence: Config, Skill, and Plugin owners answer watcher hints by
reading authoritative filesystem state. Both cross-informed second drafts made
real-owner quietness a release-blocking test and required a separately pinned
daemon correction if it failed.

This focused experiment tests the irreducible feedback mechanism directly:

```text
read matching file -> daemon subscription PDU -> read matching file -> ...
```

It does not implement the proposed backend or claim that an existing OpenCode
Watchman owner integration exists. It proves the exact lower-level cycle that
such an owner would exercise.

## Pins and isolation

| Item | Exact evidence |
| --- | --- |
| Watchwoman binary | `/usr/local/bin/watchwoman`, SHA-256 `78aaceb0012f245a452027117cfc97c1ec0038d2d3d0c5a09bde6f425a9e9d53`, source checkout exactly `a1e16cbf35b6bb1e4b429af53d65e738f955c32b` |
| Installed stock fallback | `/usr/local/bin/watchman-facebook`, SHA-256 `044c9625e80a943b3741507afdc6486aeb4cc47a86badaf3cdaa86cc7ebbb6e4`, wire version `20260708.093114.0` / build `54602bcad27e0887fd26f77c6747a38f0d701fc7` |
| Runtime | Node `v26.6.0` on Linux x86-64/glibc, kernel `7.1.0-debplus.1` |
| Protocol | Raw JSON lines over an explicit private Unix socket; commands were only `watch` and `subscribe` |
| Query | Exact root; subscription expression `['name','watched.txt','wholename']`; fields `name,exists,type` |
| Scratch | `/home/rektide/tmp-opencode/v5-read-feedback/` |

Every cell used a fresh private daemon, root, socket, state, log, and pidfile.
The wrapper removed `WATCHMAN_SOCK`, connected only to the explicit scratch
socket, and terminated the owned process after the probe. It never sent
`watch-project`, `watch-del`, or `watch-del-all` and never contacted or signaled
the ambient service. All ten private daemon processes are dead, all private
sockets are absent, and ambient PID `806505` plus socket inode `211986690`
remained present after the matrix.

## Method

For each daemon and repetition:

1. Create `watched.txt`, set its atime one day into the future, and leave its
   mtime at creation time.
2. Establish a plain exact-root watch and matching subscription.
3. Let initial subscription traffic settle for 500 ms.
4. Read the file once, wait 400 ms, and count matching unilateral PDUs.
5. Enable the feedback callback, seed it with one read, and read the file again
   after each matching PDU until 20 in-phase PDUs or three seconds.
6. Disable feedback, wait 500 ms for the last queued result, destroy the client,
   terminate the private daemon, and assert process/socket cleanup.

The future atime makes a read leave atime unchanged under this host's filesystem
policy. The harness also checks mtime. This prevents an ordinary timestamp
mutation from explaining the result.

## Results

All five repetitions were identical.

| Daemon | Initial row | Single read | Seeded feedback phase | Final queued PDU | atime/mtime changed |
| --- | ---: | ---: | ---: | ---: | --- |
| Installed stock Watchman | 1 file row | 0 matching PDUs | 0 PDUs from 1 seed read | 0 | no / no |
| Deployed Watchwoman | 1 file row in subscribe response | 1 matching PDU | 21 PDUs from 22 cumulative feedback reads | 1 | no / no |

The feedback count is intentionally capped. For Watchwoman, the first feedback
PDU arrived after the seed read, each callback read caused the next PDU, and the
last callback's already queued PDU arrived just after the harness changed to its
settle phase. In run 01, clocks advanced consecutively from tick 4 through tick
25 and PDUs arrived at approximately six-millisecond intervals. The same counts
repeated in runs 02–05. Stock emitted only its initial unilateral snapshot and
stayed quiet through both read phases.

Raw evidence:

- [`five-run-summary.txt`](file:///home/rektide/tmp-opencode/v5-read-feedback/five-run-summary.txt) — compact counts for all five repetitions.
- [`runs/01/watchwoman.json`](file:///home/rektide/tmp-opencode/v5-read-feedback/runs/01/watchwoman.json) — representative complete PDU timeline.
- [`runs/01/stock.json`](file:///home/rektide/tmp-opencode/v5-read-feedback/runs/01/stock.json) — representative stock timeline.
- [`five-run-cleanup.txt`](file:///home/rektide/tmp-opencode/v5-read-feedback/five-run-cleanup.txt) — per-run process/socket cleanup.
- [`provenance.txt`](file:///home/rektide/tmp-opencode/v5-read-feedback/provenance.txt) — binaries, source pin, source excerpts, runtime, and ambient-service evidence.

## Exact source chain

The live result matches the deployed source without an inferential gap:

1. Watchwoman locks `notify 8.2.0`.
2. Notify's Linux adapter includes `WatchMask::OPEN` for every watch and maps
   that mask to `EventKind::Access(AccessKind::Open(...))`.
3. Watchwoman's `collect_event` special-cases only `EventKind::Remove`; every
   other kind, including Access/Open, stats the path and produces
   `PathChange::Upsert` ([`watcher.rs` lines 115–155](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/watcher.rs#L115-L155)).
4. `Root::apply_changes` advances the root clock, upserts the existing entry,
   appends its relative path to `changed_paths`, and broadcasts a tick without
   checking whether stored metadata actually changed
   ([`root.rs` lines 298–341](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/root.rs#L298-L341)).
5. The matching subscription therefore queries and emits the unchanged current
   row. The live clock sequence proves one applied tick per read.

Stock's Linux mask includes mutation, attribute, create/delete, and move signals
but excludes `IN_OPEN` and `IN_ACCESS`
([`inotify.cpp` lines 37–40](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/watchman/watcher/inotify.cpp#L37-L40)), matching its quiet live behavior.

## Consequences for the v5 designs

### What is now fact

- Deployed Watchwoman emits a normal `exists:true,type:'f'` subscription row for
  an ordinary read that changes neither atime nor mtime.
- A consumer that rereads that path for authoritative reconciliation sustains a
  positive-feedback loop. Debouncing can reduce frequency but cannot reach a
  fixed point while every eventual read creates another invalidation.
- This behavior is Watchwoman-specific in the measured stock comparison.

### What cannot safely repair it in the client

E09 already constructs real create/update rows that become indistinguishable
after filesystem state is equalized. Watchwoman does not expose the originating
notify event kind in its query rows. Filtering an `exists:true` row because its
metadata appears unchanged would therefore also discard real writes,
replacements, or owner-relevant directory signals in admitted coalescing cases.
Suppressing repeated paths, delaying them, or retaining an inode baseline makes
the loop slower or lossy; it does not create a portable causal distinction.

### Design gate disposition

Both [`Astra draft1`](v2-readd5-draft1.gpt6astra.md) and
[`GX draft1`](v2-readd5-draft1.glm53max.md) already state the correct fallback:
if quietness fails, deployed Watchwoman is not an acceptable product target for
this owner-rescan architecture. A separately authorized daemon correction must
stop Access/Open from becoming changed-path upserts, gain a new source/binary
pin, and pass the same matrix plus real Config/Skill/Plugin quietness tests.

The current `a1e16cbf` target has now failed the lower-level mandatory gate. The
stock fallback passed this gate but remains a conformance surface rather than an
automatically selected replacement; changing formal target scope is a product
decision, not a conclusion this experiment silently makes.

## Limits and confidence

- **High confidence** in the read-to-PDU and sustained feedback facts: five
  fresh instances, exact installed binary/source match, complete clocked PDU
  transcripts, unchanged metadata, deterministic stock control, and direct
  source correspondence.
- The harness is line-faithful to a read-on-invalidation owner but is not a
  production OpenCode owner test because no production Watchman backend exists.
  A corrected daemon still requires the full real-owner quietness matrix named
  by both second drafts.
- Only Linux x86-64/glibc was executed. Notify's other platform backends were not
  tested, and this report makes no off-host claim.
- This experiment does not test daemon correction candidates and does not
  authorize modifying Watchwoman, changing the compatibility target, or
  implementing the OpenCode backend.

## Cross-references

- [`v2-readd4-e09-create-evidence0.glm53max.md`](v2-readd4-e09-create-evidence0.glm53max.md) — proves there is no portable row-level create/update or unchanged-state discriminator.
- [`v2-readd4-owner-directory-signal0.gpt56solxh.md`](v2-readd4-owner-directory-signal0.gpt56solxh.md) — establishes why broad owner invalidations and directory rows cannot simply be dropped.
- [`v2-readd4-e14-skill-lifecycle0.glm53max.md`](v2-readd4-e14-skill-lifecycle0.glm53max.md) — owner reloads must converge to a fixed point rather than self-trigger.
- [`v2-readd5-draft1.gpt6astra.md`](v2-readd5-draft1.gpt6astra.md) and [`v2-readd5-draft1.glm53max.md`](v2-readd5-draft1.glm53max.md) — independently made this behavior a blocking release gate before the live proof existed.
