---
type: Evidence
title: Watchman v2 re-add E10 symlinked logical roots and parent-entry sentinel primitive
description: Recursive-watcher owner inventory at upstream 4306c07b (who can receive a symlinked logical root, how roots are built, deletion/recreation/retarget consequences) plus a repeated experimental characterization of the proposed Node/Bun parent-entry sentinel primitive.
resource: /.design/watchman/v2-readd/v2-readd4-e10-symlink-sentinel0.glm53max.md
tags: [opencode, watchman, v2, symlink, sentinel, fs-watch, inotify, e10]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: pin
    resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169
    title: OpenCode v2 carrier base (inspected source)
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-p4-symlink-sentinel/
    title: E10 experimental apparatus and 2400 raw records
  - id: arch-brief
    resource: /.design/watchman/v2-readd/v2-readd4.gpt56solxh.md
    title: v4 architecture brief defining ask E10
  - id: sentinel-proposal
    resource: file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-research0.glm53max.md
    title: v2 research §C.4 symlink sentinel lifecycle proposal
  - id: validation1
    resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md
    title: wave-two validation issuing the P4/E10 assignment
  - id: libuv
    resource: https://github.com/libuv/libuv/blob/v1.x/src/unix/linux.c
    title: libuv linux inotify backend (fetched 2026-09-05)
  - id: bun-watch
    resource: https://github.com/oven-sh/bun/blob/main/src/js/internal/fs/watch.ts
    title: Bun node:fs watch shim (main branch, fetched 2026-09-05)
---

# Watchman v2 re-add E10 — symlinked logical roots and the parent-entry sentinel primitive

## Result

One sentence: at upstream `4306c07b` exactly three owners place recursive
`directory` watches — Config (raw-spelling global and project `.opencode`
roots), Skill (realpath-canonical roots guarded by an L-spelling file watch,
i.e. the sentinel shape already exists in-tree), and configured plugin
directories (raw spelling, never re-armed) — and on Linux the
`fs.watch(dirname(L))` + basename-filter primitive reliably observes every
symlink-entry delete/recreate/retarget as a `rename` event with the current
state readable at callback time, but it is blind to symlinked *ancestors*
(which retarget silently while the watch keeps serving the old target), it
dies silently when its watched parent is deleted, and Bun 1.4.1 has a
deterministic re-arm defect (a watch armed on a recreated directory while a
stale watch on the deleted directory is still open never receives events,
even after the stale watch is later closed).

This is primitive and inventory evidence only. It does not endorse the
sentinel architecture, and it does not select any design.

## Scope and method

- Source inspection: upstream `v2@origin` `4306c07b`, extracted read-only
  into the apparatus (`git archive`; the shared checkout at `~/a/a/opencode`
  was not modified and its `origin/v2` had already moved to `2960c61f`).
- Experiments: Linux `7.1.0-debplus.1`, btrfs, Node **26.6.0** and Bun
  **1.4.1** (pin declares `packageManager: bun@1.4.2`; 1.4.2 was not
  executed — consistent with the validation wave, which ran the artifact on
  1.4.1). 2,400 rep records across 17 matrix scenarios, 3 probe families,
  plus liveness and watch-start checks.
- The characterized primitive mirrors the upstream nativeLayer entries/file
  branch verbatim: `fs.watch(dirname(L), { recursive: false }, cb)` with a
  client-side `names` filter (`pin-src/packages/core/src/filesystem/watcher.ts:208-222`),
  i.e. exactly what Skill's auxiliary logical-spelling watch and the proposed
  Watchman backend sentinel reduce to.

## Caller / owner inventory at 4306c07b

### Every recursive `directory` watch caller

| # | Owner | Subscribe site | Watch input |
| --- | --- | --- | --- |
| 1 | Config | `packages/core/src/config.ts:249-256` (`reconcileWatches` → `Watcher.subscribe`) | `{ path, type: "directory", ignore: ["node_modules", ".git", "**/{node_modules,.git}/**"] }` from `ConfigWatch.plan` (`packages/core/src/config/watch.ts:27-31`) |
| 2 | Skill | `packages/core/src/config/plugin/skill.ts:36-45` (`watch`), rooted by `watchDirectory` `:53-75` and per-file adoption `:130` | `{ path: realpath(directory), type: "directory" }` plus `{ path: target, type: "file" }` when the spelling differs (`:59-60`) |
| 3 | Configured plugin sources | `packages/core/src/config/plugin/source.ts:60-63` (`watchConfiguredSources`) | `{ path: target, type: isDir(target) ? "directory" : "file" }`, raw spelling |

Non-recursive callers (for primitive context only): VCS HEAD file watch
`packages/core/src/filesystem/location-watcher.ts:69`, instruction file watch
`packages/core/src/config/plugin/instruction.ts:52`, and the shared
file/entries native branch itself. No other `watcher.subscribe` callers exist
at the pin (verified by sweep over `packages/`).

### How roots are built

- The Watcher service only `path.resolve`s: `watcher.ts:130-132`; the RcMap
  key is `{ type, target, ignore, names }` (`watcher.ts:140`); **no realpath
  exists anywhere in the service or nativeLayer**. The logical spelling `L`
  is preserved end-to-end for owners 1 and 3.
- Config global root: `global.config` = `process.env.OPENCODE_CONFIG_DIR ??
  Path.config` — raw spelling, unresolved
  (`packages/core/src/config/discovery.ts:27,64`, `packages/util/src/global.ts:79`).
- Config project roots: upward walk from the **raw** `location.directory`
  spelling. `Location.Service.directory` keeps `ref.directory` verbatim
  (`packages/core/src/location.ts:24-26`); the realpath produced by
  `Project.resolve` (`packages/core/src/project.ts:316-321`) is retained only
  in `location.project.*`, not in `directory`. `fs.up` walks with plain joins
  and no realpath (`packages/util/src/fs-util.ts:162-178`), so every project
  `.opencode` path inherits the spelling of the launch directory.
- Skill roots: `fs.realPath(directory)` at attach (`skill.ts:57`), so Skill's
  *recursive* watch always sits on a canonical target; the logical spelling
  is covered by the auxiliary `file`-type watch (`skill.ts:60`) when
  `resolved !== target`. Missing roots walk up to the nearest existing
  ancestor and watch *that* as a file (`firstMissing`, `skill.ts:47-51,63-64`).
- Plugin source targets: config-declared absolute paths (plus `file://` and
  dot-relative resolved against the document directory,
  `source.ts:139-146`), used verbatim; `isDir` follows symlinks (stat), so a
  symlinked plugin directory becomes a raw-spelling directory watch.

### Which owners can receive a symlinked logical root

| Owner | Symlinked L possible? | Where the watch actually sits |
| --- | --- | --- |
| Config — global root | Yes: `OPENCODE_CONFIG_DIR`/XDG path or any ancestor may be or contain a symlink; never resolved | L spelling (Parcel) |
| Config — project `.opencode` roots | Yes: launch directory spelling may traverse symlinks (`location.directory` raw, `fs.up` unresolved) | L spelling (Parcel) |
| Skill — directory sources | Yes, by construction (claude/agents `skills` at `skill.ts:87-89`, config directories' `skill`/`skills` at `:90-93`, document skills at `:94-106`) | canonical realpath (daemon-eligible C), plus L-spelling file watch |
| Skill — out-of-root skill-file dirs | No: adopted per file as `path.dirname(realpath(file))` (`skill.ts:129-130`) | canonical |
| Plugin sources | Yes: any configured plugin path that is a symlink | L spelling (Parcel) |

The donor watchman line (the `watcher/watchman/` tree in this carrier's
ancestor) contains **no** symlink handling at all — its input normalization
is `path.resolve` only (`normalize`, `watcher/internal.ts:29-34`), and
`root.ts`/`backend.ts` have no realpath or sentinel. The parent-entry
sentinel is a v4 proposal (`v2-research0` §C.4), not donor carry.

### Owner consequences when the symlink entry is deleted, recreated, or retargeted

Grounded at primitive level by the experiments below; Parcel-client behavior
was not re-tested in this assignment and is marked accordingly.

| Owner | Entry deleted | Recreated (same/other target) | Retargeted |
| --- | --- | --- | --- |
| Config (L-spelling Parcel watch) | inotify wd survives on the resolved inode's removal silently; plan key (JSON of spelling) unchanged; no reload trigger — Supported (mechanism: watch is inode-keyed, probe C silence; Parcel client untested here) | recreated directory is a new inode; old wd stays dead; no events, `onlyIfMissing` reconcile never re-arms (`config.ts:244-256`) — Supported | events keep arriving from the old target; new target never observed (probe B mechanism) — Supported |
| Skill | L-spelling file watch fires (`rename`) → debounced 100 ms refresh (`skill.ts:176-181`) → `FiberMap.clear` rebuild (`:156`) re-runs `watchDirectory`; roots vanish | same path; `watchDirectory` re-realpaths and re-arms canonical + L watches | same path; new canonical watch replaces old after refresh; the file-watch primitive delivered every retarget observed in the matrix (Known) |
| Plugin sources | watch dies silently; `watched` set keeps the target forever, never re-armed (`source.ts:43,56-59`) — Supported (probe C + source) | no events for the recreated directory; configured changes stop firing — Supported | old-target events continue, new target unobserved (probe B mechanism) — Supported |

Adjacent mechanism fact (same inode-vs-spelling class, outside symlink
scope): deleting a whole project `.opencode` directory kills its Config
directory watch silently; the plan's parent-entries watches cover only
config *files* not already inside a watched directory
(`config/watch.ts:20-24`), so recreation of the directory itself produces no
Config reload trigger.

### The three topology classes

1. **Direct symlink root (`L` is itself a symlink).** Fully observable by the
   parent-entry sentinel: every delete/create/rename-over of `basename(L)`
   arrives as a `rename` event (matrix below). This is the only class the
   proposed sentinel claims to cover.
2. **Ancestors containing symlinks.** Not observable from `dirname(L)`: the
   inotify watch resolves through the ancestor symlink at arm time and stays
   pinned to the old inode. Probe B (30/30, both runtimes): after retargeting
   the ancestor, writes under the **old** target kept being delivered
   (`rename`+`change` per write), writes under the **new** target never
   arrived, and no event reported the retarget. Arming through a dangling
   ancestor throws `ENOENT` (watch-start check). Config and plugin sources
   carry this exposure today on their raw spellings.
3. **Symlinks below a watched root.** The parent-entry watch is
   non-recursive: target-content changes below a child symlink produced zero
   events (`target-only` and `below-root`, 0 leaks in 60/60 and 40/40 reps,
   both runtimes); churn on the child link's own name is a parent event but
   is filtered out unless it is `basename(L)`. For a directory backend this
   class is the daemon's business, not the sentinel's.

## Exact apparatus

`/home/rektide/tmp-opencode/v4-p4-symlink-sentinel/` — see its `README.md`
for layout and reproduction. Summary:

- `exp/sentinel.ts` — 17 scenarios (delete; recreate-same; recreate-new;
  create-fresh; rename-over-new; rename-over-same; rapid-retarget K=20;
  rapid-recreate K=20; dangling-create; target-only; coalesce-regular K=50;
  parent-rename; parent-delete; parent-recreate-rearm; ancestor-symlink;
  below-root; close-final), each building a fresh sandbox
  (`parent/`, `dirA/`, `dirB/`, `parent/link -> ../dirA`), arming
  `fs.watch(parent, {recursive:false}, cb)` with the upstream names filter,
  performing sequenced synchronous mutations, settling on 250 ms quiet, and
  recording every event **with `realpathSync.native(L)`, `lstatSync(L)`, and
  `readlink(L)` sampled inside the callback** plus the mutation sequence
  number at delivery (`lagSeq`).
- `exp/probe.ts` — A1 control (two watchers, stable parent), A2 (stale
  watcher closed before re-arm on recreated parent), A3 (stale watcher left
  open), A4 (stale closed *after* re-arm); B unfiltered ancestor-symlink
  staleness.
- `exp/probe-c.ts` — unfiltered watcher on a parent that is `rm -rf`'d, then
  recreated ("zombie" write), recording the final synthesized events, error
  emission, and `close()` viability.
- `exp/run-matrix.sh` + `exp/summarize.ts` — matrix execution and
  `results/matrix.md`; `watch-missing` (ENOENT and `throwIfNoEntry:false`)
  and liveness (hold vs release) checks.
- 2,400 raw NDJSON rep records under `results/`.

## Repeated observation matrix

n per scenario: 100 (delete, recreate-*, create-fresh, rename-over-*), 60
(dangling, target-only), 40 (coalesce, below-root, close-final), 30 (rapid-*,
parent-*, ancestor). "ev" counts events surviving the `names` filter for the
primary arm. All percentages are exact over the stated n; both runtimes
unless noted.

| Scenario (mutations) | Node 26.6.0 | Bun 1.4.1 | Reading |
| --- | --- | --- | --- |
| delete (`unlink L`) | 1 ev `rename/L`, 100% | same, 100% | `realpath(L)=null` at callback |
| recreate-same | 2 ev (delete + create), 100% | **1 ev**, 100% | Bun coalesces same-name delete+create; both converge |
| recreate-new | 2 ev, 100% | 1 ev, 100% | same |
| create-fresh (absent → create) | 1 ev, 100% | 1 ev, 100% | initially-absent entries are visible |
| rename-over-new (`mv -T`) | 1 ev, 100% | 1 ev, 100% | `MOVED_FROM(tmp)` filtered; `MOVED_TO(L)` kept |
| rename-over-same | 1 ev, 100% | 1 ev, 100% | net-unchanged state still signals |
| rapid-retarget (K=20) | 20 ev, 30/30 | 20 ev, 30/30 | **no kernel coalescing** for symlink name-ops in a burst |
| rapid-recreate (K=20) | 40 ev, 30/30 | **1 ev 29/30, 2 ev 1/30** | Bun merges the whole burst; the 1/30 is the only nondeterminism observed in the entire matrix |
| dangling-create | 4 ev, 60/60 | 2 ev, 60/60 | `realpath=null` while dangling; target materialization outside the parent is **not** a parent event; retarget-to-file yields `realpath` = the file |
| target-only (writes under dirA) | 0 ev, 60/60 | 0 ev, 60/60 | non-recursive: target churn never leaks |
| coalesce-regular (50 writes) | 3 ev (1 create + 2 change), 40/40 | identical | kernel-level merge of identical unread `IN_MODIFY` events — runtime-independent |
| parent-rename | watch survives; 2 ev for later child churn, 30/30 | same | the wd follows the inode, not the path |
| parent-delete | 1 ev (child unlink) then silence, 30/30 | same | see probe C for the unfiltered tail |
| parent-recreate-rearm | re-armed watch sees post-arm retarget, 30/30 | **re-armed watch sees nothing, 30/30** | see probes A1–A4 |
| ancestor-symlink | filtered: 0 ancestor events, 30/30 | same | see probe B (unfiltered) |
| below-root | 0 ev, 40/40 | 0 ev, 40/40 | class 3 above |
| close-final | 0 ev after close, 40/40; second `close()` ok | same | close is final and idempotent |

Cross-cutting observations:

- **Event vocabulary:** every symlink-entry lifecycle op arrives as eventType
  `"rename"` with `filename` a bare basename string (no `Buffer`, no path
  separators, no `undefined` filenames in 2,400 records). `"change"` appeared
  only for content writes.
- **State-at-callback is always current:** in every rep of every scenario the
  `realpath(L)` sampled inside the callback equaled the ground-truth final
  state whenever that callback was the last one (100% of recreate-*, 30/30
  rapid-* in both runtimes) — event *counts* are untrustworthy (Bun
  coalescing), but a state-based re-check at callback time converges.
- **Batched delivery:** mutations issued synchronously are delivered only
  after the whole burst (median and max `lagSeq` = 20 in both rapid
  scenarios).
- **No `error` event ever fired** in any of the 2,400 records — including
  parent deletion.
- **Errors at arm time:** `fs.watch` on a missing directory throws `ENOENT`
  synchronously in both runtimes; `{ throwIfNoEntry: false }` suppresses it
  and yields an unstarted watcher (both runtimes).
- **Liveness:** an unclosed watcher holds the event loop alive in both
  runtimes (timeout kill); after `close()` the loop drains.

### Probe A — re-arm race (Bun-specific, deterministic)

Parent deleted and recreated, then a second watcher armed, then a retarget:

| Variant | Node | Bun |
| --- | --- | --- |
| A1 control: two watchers, stable parent | both deliver (30/30) | both deliver (30/30) |
| A2: stale watcher closed **before** re-arm | new watch delivers (30/30) | new watch delivers (30/30) |
| A3: stale watcher left open | new watch delivers (30/30) | **new watch receives nothing (0/30)** |
| A4: stale watcher closed **after** re-arm | new watch delivers both retargets (30/30) | **new watch never recovers (0/30)** |

Constraint: under Bun 1.4.1, arming `fs.watch` on a recreated directory while
a watcher armed on the deleted directory is still open permanently disables
the new watcher; closing the stale watcher beforehand avoids it, closing it
afterward does not restore it. Node 26.6.0 is unaffected in all variants.

### Probe B — ancestor symlink retarget (both runtimes, deterministic)

Unfiltered watch armed via `aperture -> real`; sequence: write
`real/before`; retarget `aperture -> real2` (rename-over); write
`real2/newtarget-entry`; write `real/oldtarget-entry`. Observed 30/30 in
**both** runtimes: `rename/before`, `change/before`, then
`rename/oldtarget-entry`, `change/oldtarget-entry` — and **nothing** for the
retarget itself or for `newtarget-entry`. The watch kept serving the old
target after the path to it was redirected.

### Probe C — parent deletion tail (both runtimes, deterministic)

Unfiltered watch on `parent`, then `rm -rf parent`, then recreate parent and
write a "zombie" entry. Observed 30/30 in both runtimes:
`rename/link` (child deletion), then **two synthesized `rename/parent`
events** (basename-of-watch-path synthesis for self events), then silence —
no `error`, `close()` still returns normally, and the recreated parent's
zombie write is never observed. The upstream names filter drops the
`rename/parent` self-events, so a filtered sentinel's last observable signal
for a deleted parent is the child-deletion event, not the parent's death.

## Source / runtime mechanism

Node 26.6.0 (`fs.watch` → libuv `v1.x` `src/unix/linux.c`, fetched 2026-09-05):

- One inotify fd per event loop; `uv_fs_event_start` calls `inotify_add_watch`
  with `IN_ATTRIB|IN_CREATE|IN_MODIFY|IN_DELETE|IN_DELETE_SELF|IN_MOVE_SELF|IN_MOVED_FROM|IN_MOVED_TO`.
- Mapping in `uv__inotify_read`: `IN_ATTRIB|IN_MODIFY → UV_CHANGE`; any other
  bit → `UV_RENAME`. Node surfaces these as the `change`/`rename` eventType
  strings. Symlink create/delete/move are `IN_CREATE`/`IN_DELETE`/`IN_MOVED_TO`
  → always `rename`, matching the observed vocabulary.
- Events with no filename (directory-self events) get
  `basename(watch path)` synthesized — the probe C `rename/parent` events.
- `inotify_add_watch` resolves symlinks during path lookup, so the watch
  descriptor is pinned to the resolved inode: watch survives directory rename
  (inode alive), dies silently on directory deletion (`IN_IGNORED`; per
  inotify(7) pending unread events for a removed watch remain readable),
  never sees a recreated directory (new inode), and an ancestor retarget
  neither notifies nor re-points the watch (probe B).
- Kernel coalescing (inotify(7)): consecutive *identical* unread events (same
  wd, mask, cookie, name) merge — observed for content writes
  (`coalesce-regular`); symlink name-op sequences alternate masks/cookies, so
  Node delivered them 1:1 (`rapid-retarget` 20/20, `rapid-recreate` 40/40).

Bun 1.4.1: `node:fs` `watch` is a Node-compatible shim
(`src/js/internal/fs/watch.ts` on main, fetched 2026-09-05; mirrors node
`lib/internal/fs/watchers.js`, including `throwIfNoEntry` handling and an
`EACCES→EPERM` rewrite) over a native watcher whose internals were not
inspected. Measured divergences from Node on 1.4.1:

1. same-name delete+create sequences coalesce into one callback
   (`recreate-*` 1 vs 2; `dangling` 2 vs 4; `rapid-recreate` 1–2 vs 40);
2. the A3/A4 re-arm suppression defect described above;
3. otherwise identical eventType vocabulary, filename strings, parent-rename
   survival, parent-delete silence, `ENOENT`/`throwIfNoEntry`, close
   idempotence, and loop-holding behavior.

## Known / Unknown / Confidence

**Known (measured, deterministic over the stated n, both runtimes unless
noted):** everything in the observation matrix and probes A–C; the
inventory and root construction (direct source reads at the pin); the donor
line's lack of any symlink handling; liveness and error surfaces.

**Supported (mechanism-grounded, not directly tested here):** the
Config/PluginSource consequence rows — they follow from inode-keyed watching
(probes B/C at primitive level) composed with the pin's reconcile logic
(`onlyIfMissing`, never-torn-down `watched` set), but the Parcel client
itself was not exercised in this assignment, and the donor corpus's Parcel
notes (`parcel0.glm53.md`) contain no symlink-root evidence either.

**Unknown / not established:**

- Bun's native watcher internals (why A3 suppression happens; where its
  coalescing is implemented) — behavior only; the cited shim is main-branch,
  not 1.4.1.
- Bun **1.4.2** (the pin's declared `packageManager`) — unexecuted here, as
  in the whole corpus so far.
- Non-Linux platforms (macOS FSEvents, Windows) — out of scope; nothing here
  applies to them.
- `IN_Q_OVERFLOW` behavior under queue saturation — not exercised.
- Whether Parcel's client adds any symlink-root handling *above* inotify —
  untested; flagged for any future owner-behavior confirmation.
- Daemon-side (Watchman/Watchwoman) behavior for symlinked canonical roots —
  deliberately out of E10 scope; covered by the transport/protocol waves.

Confidence: high for all Known rows (2,400 reps, only one nondeterministic
cell: `rapid-recreate` Bun 1-vs-2 events at 29/1); medium for Supported rows;
explicitly none for the Unknown list.

## Factual constraints (for any later design consumer)

1. A parent-entry sentinel sees symlink-entry delete/create/rename-over as
   `rename` events with the basename as `filename`; there is no finer
   distinction, and no `change` events for entry ops.
2. Event counts are not semantics: Node delivers delete+create separately;
   Bun 1.4.1 coalesces same-name sequences and bursts; the kernel coalesces
   identical unread modify events. Only state re-read at callback time is
   reliable, and it was reliable in every rep.
3. Delivery of a synchronous burst happens only after the burst completes.
4. The sentinel is structurally blind above `dirname(L)`: ancestor symlink
   retargets produce no event, old-target events continue, new-target events
   never arrive.
5. Parent deletion is silent: no `error` event; at most filtered basename
   self-events; `close()` remains usable; a recreated parent requires a new
   watch.
6. Under Bun 1.4.1 a watch armed on a recreated directory while a stale
   watch on the deleted directory is open is permanently deaf, even after
   the stale watch is later closed; close-before-re-arm avoids it. Any
   re-arm loop must account for this on the Bun runtime.
7. Arming on a missing (or dangling-ancestor) directory throws `ENOENT`
   synchronously unless `throwIfNoEntry: false` is set (both runtimes).
8. An open watcher holds the event loop; `close()` is final and idempotent;
   no events are delivered after close (both runtimes).
9. At the pin, Config and configured-plugin recursive watches sit on raw
   logical spellings with no realpath and no re-arm path; Skill sits on
   canonical roots plus an L-spelling file watch that is exactly this
   primitive, converged through a 100 ms debounced full rebuild.
10. The upstream names filter (`watcher.ts:213`) drops the parent-death
    self-events (their synthesized filename is the parent basename), so a
    filtered sentinel's last signal for a dying parent is the last child
    event.

## Cross-references

- [`v2-readd4.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md)
  (carrier copy; the promotion pass moved the build-era mainline docs out of
  this frozen directory) — architecture brief
  defining ask E10 and the L/C/D model this evidence feeds; its "Symlink
  topology" section proposes the parent-entry sentinel characterized here.
- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) —
  wave-two validation that issued P4/E10 and named this file.
- [`v2-research0.glm53max.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-research0.glm53max.md)
  §C.4 — the sentinel lifecycle proposal (attach realpath, entries-sentinel
  shape, ignore-when-unchanged, deletion keeps sentinel); this report
  supplies the missing primitive facts, including two behaviors that proposal
  did not anticipate (Bun re-arm defect; ancestor blindness boundary).
- [`v2-owners0.glm53max.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-owners0.glm53max.md)
  — Config/Plugin Source/Skill owner analysis; E10 confirms the Skill
  dual-watch reading at exact pin lines and adds the plugin-source
  never-re-armed consequence.
- [`v2-readd4-e09-row-shapes0.glm53max.md`](v2-readd4-e09-row-shapes0.glm53max.md)
  and [`v2-readd4-e03-stock-live0.glm53max.md`](v2-readd4-e03-stock-live0.glm53max.md)
  — daemon-side row/order semantics; class-3 (below-root) and daemon-root
  behavior remain the daemon waves' concern, not the sentinel's.
- [`maintenance.glm53.md`](../maintenance.glm53.md) — donor behavior record;
  confirms the donor line had no symlink machinery to mine (re-verified
  against the donor tree's `normalize`/`root.ts`).
- [`parcel0.glm53.md`](../parcel0.glm53.md) — Parcel notes; contains no
  symlink-root evidence, which is why the Supported-tier rows above stay
  mechanism-grounded rather than measured.
