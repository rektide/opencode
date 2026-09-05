---
type: Evidence
title: "E09 follow-up (P3): portable create-vs-update evidence — intrinsic daemon classification vs client prior-state inference, and which OpenCode consumers depend on the distinction"
description: Live transcripts from two isolated private daemons (installed stock 20260708.093114.0 and deployed Watchwoman a1e16cbf) plus pinned source analysis proving no portable intrinsic create/update signal exists when Watchwoman reports new:false — stat fields are byte-identical by construction, new/cclock/oclock semantics diverge (including a live-proven stock-only daemon-side create filter that silently degrades on Watchwoman) — and enumerating the two current OpenCode consumers that touch the distinction.
resource: /.design/watchman/v2-readd/v2-readd4-e09-create-evidence0.glm53max.md
tags: [opencode, watchman, watchwoman, e09, create-update, cclock, oclock, ino, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: stock-src
    resource: file:///home/rektide/a/facebook/watchman
    title: facebook/watchman source checkout (read-only)
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b (v2026.08.31.00-2-g923b09351, 2026-09-01)
  - id: stock-bin
    resource: file:///usr/local/bin/watchman-facebook
    title: installed stock fallback binary — the live-observed daemon
    revision: "20260708.093114.0, buildinfo 54602bcad27e0887fd26f77c6747a38f0d701fc7 (older than the stock source checkout)"
  - id: ww-src
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: radiosilence/watchwoman source checkout (read-only)
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b (v0.7.0-5-ga1e16cbf; hash-equal to the deployed binary per E01)
  - id: ww-bin
    resource: file:///usr/local/bin/watchwoman
    title: watchwoman binary used for the private daemon instance
    revision: 0.7.0 / a1e16cbf
  - id: opencode
    resource: file:///home/rektide/a/a/opencode
    title: canonical OpenCode checkout (consumer inventory, read at pin)
    revision: 4306c07b340b9a0504e65785f366d2793cd1b169 (2026-09-05)
  - id: transcripts
    resource: file:///home/rektide/tmp-opencode/v4-p3-create-evidence/
    title: isolated-daemon transcripts, drivers, and run logs
  - id: e09-rows
    resource: /.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md
    title: E09 row shapes (the new-flag divergence this follow-up starts from)
  - id: e03
    resource: /.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md
    title: E03 protocol ordering (barrier methodology, PDU shapes)
  - id: validation1
    resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md
    title: wave-two validation and the P3/E09 follow-up assignment
---

# E09 follow-up (P3) — create-vs-update: no portable intrinsic signal; baseline + inode is the only portable discriminator

## One-sentence answer

**No portable intrinsic signal exists**: when deployed Watchwoman reports an ordinary create as `exists:true,new:false`, no combination of daemon-provided row fields, clocks, single-row orderings, or command/query context distinguishes it from an update on both daemons — `new` means different things (stock: rebirth-since-cursor including recreates and coalesced replacements but *not* rename-overwrites; Watchwoman: last-upsert-was-first-ever-observation, false for nearly all creates), `cclock`/`oclock` are rendered under inverted-adjacent semantics (stock `cclock` = rebirth tick reset on deleted→existing; Watchwoman `cclock` = first-observation tick never reset), so the daemon-side create filter that works live on stock (`["since", clock, "cclock"]`) silently degrades into a change filter on Watchwoman, and stat fields are provably byte-identical between a create and an update (live-constructed pair); the only classification that works on both daemons is **client-maintained prior-state inference** — the complete initial-subscription baseline plus per-path `ino`/`exists` tracking — with enumerated failure bounds.

## Scope, safety, and method

- Research only. No OpenCode reaction is chosen, no code patched, no shared document edited, nothing committed.
- Two **isolated private daemons** with private sockets/state under `/home/rektide/tmp-opencode/v4-p3-create-evidence/`:
  - stock: `watchman-facebook --foreground --unix-listener-path=…/stock/sock --statefile=… --logfile=… --pidfile=… --no-save-state`
  - Watchwoman: `watchwoman --sockname …/ww/sock --logfile … --foreground-daemon`
- Every launch ran with `env -u WATCHMAN_SOCK`; the driver speaks only to the scratch sockets. The active service (PID 806505) was PID-verified alive before and after every run and was never contacted. Four additional short-lived isolated daemons (stock2, ww2–ww5) served the query-context probes, the cclock debug run, the race reproduction, and the 5× repeat; all were SIGTERM'd and verified gone (`pgrep` sweeps in `run*.log`).
- Commands used: `watch`, `subscribe`, `clock`, `query`, `flush-subscriptions` (stock only), plus filesystem ops. **No `watch-project`, no `watch-del`, no `watch-del-all`, no `shutdown-server`.**
- Barriers exactly as in E09: stock = `flush-subscriptions` ack + 250 ms idle drain; Watchwoman = trailing marker file row + 250 ms drain (no flush semantics exist, E03).
- Requested fields: `["name","exists","new","type","ino","size","mtime","cclock","oclock"]` — the candidate signal set beyond E09's four. Both daemons accepted and rendered all nine (field registries: stock `watchman/query/fieldlist.cpp` incl. `MAKE_CLOCK_FIELD(cclock, ctime)` / `(oclock, otime)` at lines 108–127; Watchwoman `crates/watchwoman/src/query/field.rs:42-101`).
- One operational note: launch stock via `bash` scripts — zsh's `BG_NICE` adds +5 nice to backgrounded children and the stock binary refuses to start at nice>0 (`watchman/main.cpp` `detect_low_process_priority`, `min_acceptable_n_value` default 0).

## What "create vs update" can even mean here

Three distinct ground truths get conflated; the evidence below separates them:

1. **fresh-path create** — path had no file, one appears (incl. rename destination);
2. **recreate / replacement** — path held a file, briefly didn't (observed or coalesced), then holds a (usually different-inode) file again;
3. **update** — path continuously holds the same file object (same inode), content changes.

A fourth case, **rename-overwrite**, is ground-truth "the path now holds a different file object" but never leaves the exists-true state on either daemon, so *no* daemon's `new` flags it (live, op 09 below).

## Consumer inventory at OpenCode 4306c07b

All `Watcher.Service` consumers were enumerated (`git grep Watcher.Service|watcher.subscribe` over `packages/`) and each read end-to-end at the pin. `Watcher.Update` is `ParcelWatcher.Event`, whose `type` vocabulary is `'create' | 'update' | 'delete'` (`@parcel/watcher@2.5.1 index.d.ts:11`).

| Consumer | file:line (at 4306c07b) | Depends on create vs update? |
| --- | --- | --- |
| Config invalidation | `packages/core/src/config.ts:89-95, 244-252` (plan from `packages/core/src/config/watch.ts:8-38`) | No — pure invalidation; reload rescans config, publishes `config.updated`. `changes()` consumers use only `update.path` (e.g. `packages/core/src/config/plugin/source.ts:83-88`) |
| Instruction source | `packages/core/src/config/plugin/instruction.ts:40-53` | No — `update.path` → debounced rescan |
| Skill source | `packages/core/src/config/plugin/skill.ts:36-45` | No — `update.path` → debounced full rescan + rewatch |
| Plugin source | `packages/core/src/config/plugin/source.ts:60-70` | No — discards the update entirely (`Stream.runForEach(() => PubSub.publish(...))`) |
| LocationWatcher (core) | `packages/core/src/filesystem/location-watcher.ts:28-32, 69-70` | **Typed mapping** — `update.type` maps `create→add`, `update→change`, else `unlink` onto bus `filesystem.changed` (`packages/schema/src/filesystem.ts:8-14`). But it subscribes `{type:"file"}`, which routes to the node `fs.watch` backend that hardcodes `type:"update"` (`packages/core/src/filesystem/watcher.ts:215`), so today it only ever emits `event:"change"` |
| Vcs | `packages/core/src/vcs.ts:147-160` | No — filters `HEAD`/`branch` paths, refreshes branch state |
| App files tree | `packages/app/src/workspaces/files/watcher.ts:16-35` (wired at `model.tsx:229-235`) | **Yes, semantically** — `event.data.event === "change"` reloads a loaded file and refreshes the directory at the path; any non-change (`add`/`unlink`) refreshes the **parent** listing instead. A create misread as `change` would leave a new file absent from the tree; an update misread as `add` skips nothing but refreshes the wrong listing |
| App review model | `packages/app/src/session/review/model.ts:131` | No — `refresh()` on any `filesystem.changed` |
| TUI plugin watcher | `packages/tui/src/plugin/watch.ts` | No — its own `fs.watch` layer with no event typing at all |
| Agent / Command / Catalog | `packages/core/src/agent.ts:26-51`, `command.ts:28-35` (State + `Event.Updated`) | No — downstream of config/plugin invalidation, never see file rows |
| (availability only) | `packages/core/src/plugin/internal.ts:138` | `Watcher.Service` in the requirements list; no event semantics |

Only the bus event `filesystem.changed` carries a create/update/delete-class vocabulary, its sole producer is the LocationWatcher, and its sole type-discriminating consumer is the app files tree. The v4 draft's own `map remaining row to create/update/delete` step ([`v2-readd4.gpt56solxh.md:470`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md)) is the future consumer this evidence must serve.

## Candidate-signal matrix

Per-operation row facts from the live matrix (stock = installed binary; ww = deployed binary). `cc`/`oc` are the tick numbers parsed from the rendered clock strings. "cc==oc" is the row-local predicate "this row's last change is the path's first observation/rebirth".

| # | Operation (ground truth) | stock `new` | stock cc / oc | ww `new` | ww cc / oc | Portable intrinsic verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | pre-existing files, initial subscription | forced `true` (fresh instance) | 2 / 2 (equal) | `false` | 2 / 2 (equal) | baseline rows read as first-observation on both — not a create signal (client knows the PDU is initial) |
| 1 | file create `a.txt` | **true** | 3 / 4 (**unequal**) | **false** | 3 / 3 (equal) | `new` diverges; cc==oc true on ww only; stock inequality is batching noise (create stamp and change stamp landed on different ticks) |
| 2 | file modify (append) | false | 3 / 7 (unequal) | false | 3 / 4 (unequal) | both read "not first"; `ino` unchanged both |
| 3 | file delete | false | 3 / 10 | false | 3 / 5 | tombstone; `cc` retained on both |
| 4 | recreate at same path (barrier-separated) | **true** (ctime reset) | 13 / 14 (**unequal**) | false | **3** / 6 (cc = original create tick) | starkest divergence: stock calls it new, ww's cclock proves nothing changed about first-observation; ordered `exists:false→exists:true` rows are the only portable marker, and that is prior-state inference |
| 5→6 | rename r1→r2 (dest fresh) | true (dest) | 21 / 21 (equal) | false | 8 / 8 (equal) | cc==oc on both for the destination — but only because single-tick observation; not distinguishable from op-1-shape on stock |
| 7→9 | rename over existing target oA→oB | **false** (target not "new") | 28 / 32 (unequal) | false | 10 / 11 (unequal) | replacement invisible to `new` on both; **`ino` changes to the source's inode on both** (stock 214766786→214766779; ww 214766931→214766924) — prior-state only |
| 10→11 | coalesced unlink+create (one window) | **true** (single net row) | 40 / 41 (unequal) | false (single net row) | **12** / 13 (cc = pre-replacement create tick) | collapse kills the exists-transition on both; stock still flags new, ww's cclock/oclock read exactly like an update — only `ino` (214766799→214766806 stock; 214766947→214766955 ww) reveals it |
| 12 | directory create | true | 44 / 44 (equal) | false | 14 / 14 (equal) | cc==oc survives ww's double-upsert fan-out (both upserts share the batch tick) |
| 13 | symlink create | true | 47 / 47 (equal) | **true** (single-event exception, E09) | 15 / 15 (equal) | the one case ww's `new` works — single inotify event |
| 14 | create+delete within one window | true | 50 / 52 | false | 16 / 16 (equal) | tombstone of a never-observed-alive path; stock's `new:true` is the only marker and it is stock-only |
| 15→16 | stat-equalized create (`eq-c`) vs update (`eq-u`) | false (post-touch row) | 55 / 61 | false | 17 / 18 | see indistinguishability construction below |

## The indistinguishability construction (live)

On ww, after equalizing size (10 bytes) and mtime (`touch -d 2001-02-03T04:05:06Z`), one tick-18 PDU carried both rows:

```json
{ "name": "eq-u.txt", "exists": true, "new": false, "type": "f", "ino": 214766884, "size": 10, "mtime": 981173106, "cclock": "c:…:2",  "oclock": "c:…:18" }
{ "name": "eq-c.txt", "exists": true, "new": false, "type": "f", "ino": 214766983, "size": 10, "mtime": 981173106, "cclock": "c:…:17", "oclock": "c:…:18" }
```

`eq-c.txt` was **created** at tick 17; `eq-u.txt` **updated** at tick 18 (pre-existing since seed tick 2). Every field is identical except `name`, `ino`, `cclock`, `oclock`. Therefore:

- **stat fields** (`exists`, `new`, `type`, `size`, `mtime`, and by construction `mode`) cannot classify: the rows are byte-identical. (`mode` was not requested; both files are 0644 regular files — residual, see Limits.)
- **`ino`** differs numerically but a bare inode value classifies nothing without knowing the previous row's inode — any value is consistent with both stories.
- **`cclock==oclock`** fails here too: the created file was touched after birth (17 ≠ 18), reading exactly like an update.

Mechanism (pinned): a Watchwoman row is a pure function of `FileEntry` (`crates/watchwoman/src/daemon/tree.rs:33-51`), which stores no creation fact other than `cclock` (first-observation tick, preserved across tombstones because `mark_gone` keeps the entry, `tree.rs:348-359`, and `apply_changes` preserves `e.cclock` whenever `tree.get` finds anything, `daemon/root.rs:300-329`) and `is_new` (set only when the *last* upsert in a batch was the first-ever observation, clobbered to false by any second upsert — E09's fan-out analysis). Since ∃ a create and an update producing identical rows, no row-local classifier exists on ww. The same construction applies on stock for any field except its `new`/`cclock` — and stock's classification is the one ww lacks.

## Intrinsic daemon classification vs client prior-state inference

**Intrinsic (row-local or single-command) signals, and why each fails portability:**

1. `new` — stock: `ctime.ticks > since.ticks` (`query/fieldlist.cpp:85-106`), where `ctime` is the node's creation stamp, assigned at node creation (`InMemoryView.cpp:355-375`) and **reset** on observed deleted→existing transitions ("we're effectively new again", `root/iothread.cpp:986-994`); fresh-instance queries force `true` (fieldlist.cpp:89-90, live-reconfirmed: stock fresh `query` returned `new:true` for every row including updated files). Watchwoman: stored `entry.is_new` (`query/field.rs:171`), false for nearly all creates (E09; reconfirmed ops 1/4/6/9/11/12/15). Not portable.
2. `cclock` — stock: rebirth tick (reset on recreate; **not** reset on rename-overwrite — the iothread never sees the target not-exist, op 09 live). Watchwoman: first-observation tick, **never** reset (op 4 live: cc=3 across delete+recreate; op 11: cc=12 across coalesced replacement). Same field name, different algebra.
3. `oclock` — stock: last-observed-change tick (`markFileChanged` sets `otime`, `InMemoryView.cpp:377-381`); Watchwoman: last upsert-or-tombstone tick (`tree.rs:357`, `root.rs:318-347`). These agree — but "changed" is exactly what the row's presence already says; it carries no create/update information. Both daemons' delta selection filters on it (stock default `since` term = oclock, `query/since.cpp:30-34, 102`; ww `entry.oclock <= t → skip`, `query/run.rs:104-110`, and its `since` expression term hardcodes oclock, `query/expr.rs:330`).
4. `cclock == oclock` — tempting row-local predicate ("last change was the birth"). Watch it break three ways: stock ordinary creates are frequently unequal (ops 1/4/5/11/15: the creation stamp and change stamp land on different ticks — batching noise); ww recreates and coalesced replacements are unequal (cclock preserved); any post-birth touch breaks it (the eq pair). Not a classifier on either daemon.
5. `["since", clock, "cclock"]` expression — **live-proven create filter on stock**: after one create + one modify in a since-window, stock returned only the created file (`out2-stock/query-probe.json` `qExpr` = `qc.txt` alone). On ww the third (field) argument is silently ignored (`expr.rs:209-215` reads only `rest.first()`), so the same expression returned **both** the created and the modified file (`out2-ww` and 5× repeat). A stock-correct daemon-side create query silently becomes a change query on ww — the sharpest portability trap found.
6. `query`/command context generally — stock since-queries compute `new` against the cursor (works like the subscription); stock fresh queries force `new:true` on everything (useless); ww queries render stored `is_new` (false for creates, useless). `clock` returns the batch tick, identical in shape for create and update batches. No rescue.
7. Ordered rows — an `exists:false` row followed by `exists:true` at the same name proves recreation, on both daemons, when both rows are delivered (ops 3+4 live). This is prior-state inference (comparing consecutive rows), and coalescing defeats it (ops 11/14: one net row, no transition).

**Client-maintained prior-state inference (portable, with bounds):** maintain the baseline from the initial subscription — stock's separate fresh-instance PDU (`is_fresh_instance:true`, complete set) or ww's merged ack (`is_fresh_instance:true`, complete set, all rows cc==oc) — then for each subsequent `exists:true` row at a known path compare `ino` with the remembered row:

- baseline absent → fresh-path create (incl. rename destination);
- baseline `exists:false` (tombstone seen) → recreate;
- baseline `exists:true`, `ino` equal → update;
- baseline `exists:true`, `ino` changed → replacement/rename-overwrite (invisible to every intrinsic signal, op 9).

Live support: `ino` was stable across modifies (stock op 2: 214766740→214766740; ww op 2: 214766885→214766885) and changed across every create/recreate/rename-destination/overwrite/coalesced-replacement on **both** daemons (ops 4, 6, 9, 11). Failure bounds, all factual:

- **coalesced delete+create** collapses to one net row on both (op 11): still classified as replacement via `ino` change, but the delete is unobservable — consumers that must know the old file ceased to exist cannot see it (stock's `new:true` is the only marker of the transition and is stock-only);
- **create+delete in one window** yields only a tombstone (op 14): indistinguishable from deleting a pre-existing file on ww (stock `new:true` hints);
- **ww omits child rows on directory rename/recursive delete** (E09 ops 10-11): children keep stale baselines under old paths; the first later row for a child at the new path reads as fresh-path create (arguably correct) but the old-path baselines are never invalidated by rows;
- **initial-scan race (observed once)**: a file created after `watch` but before ww's initial scan completes is seeded with `cclock=oclock=seed-tick`, and its create event then preserves that cclock — the fresh-path signal is silently swallowed (`out2-ww/query-probe.json`: `qc.txt cc=2` in the first run; 5/5 controlled reruns gave `cc=4=oc=4` with warm daemons, `run5.log`). Stock's crawl has the analogous snapshot-vs-event window (a file created mid-crawl simply appears as pre-existing);
- **baseline resets**: any re-subscribe/fresh-instance resets the baseline (both daemons deliver a new complete set — this is the recovery path, not a hazard); ww tombstone pruning (`tree.rs:368-377`) can eventually forget a deleted path, after which a recreate reads as fresh-path create — timing-dependent, not portable;
- **clock-string ticks** are comparable only within one daemon root (identical `c:<start>:<pid>:<root>:<ticks>` format on both, live); across daemon restarts the incarnation prefix changes.

## Live/source evidence index

- Main matrix: `out-stock/`, `out-ww/` — `transcript.json` (every PDU + arrival timestamps), `pdu-log.jsonl`, `rows-by-op.json`; daemons' own logs in `stock/log`, `ww/` (stock log confirms `20260708.093114.0 54602bc…`, inotify watcher, full-crawl).
- Query-context probes: `out2-stock/`, `out2-ww/` (`query-probe.json` — since-query `new`, cclock-expression filter, oclock-expression filter); 5× determinism repeat in `out5-ww/` + `run5.log`.
- Race reproduction: `out4-ww/probe2-repro.json` (per-step queries showing the create's cclock flip from seed-tick to create-tick when the scan wins); `out3-ww/cclock-debug.json` (minimal model check).
- Source pins: stock `fieldlist.cpp:85-127` (new/cclock/oclock renderers), `InMemoryView.cpp:355-381` (ctime at creation / markFileChanged sets otime), `iothread.cpp:986-994` (deleted→existing ctime reset), `since.cpp:30-34,102` (default oclock since-term, cclock field selectable); ww `field.rs:42-101,133-185` (registry + render), `root.rs:300-341` (apply_changes fresh/cclock preservation; seed), `tree.rs:312-359` (upsert rebuilds entry, oclock overwritten, cclock arg; mark_gone), `expr.rs:209-215,330` (since term ignores field arg), `run.rs:104-110` (oclock delta filter).

## Known / Unknown

| ID | Claim | Status |
| --- | --- | --- |
| K1 | No row-local or single-command signal portably distinguishes create from update when ww says `new:false` | Known (live construction + both field registries + mechanisms) |
| K2 | stock `new` = rebirth-since-cursor (create, recreate, coalesced replacement, create+delete; not rename-overwrite; forced true on fresh queries) | Known (live ops 1/4/9/11/14 + fresh query; mechanism fieldlist/iothread/InMemoryView) |
| K3 | ww `cclock` = first-observation tick, preserved across tombstones and coalesced replacement; ww `oclock` = last-change tick; both rendered as clock strings | Known (live ops 2/4/11 + source root.rs/tree.rs) |
| K4 | stock `["since", clock, "cclock"]` is a live daemon-side create filter; ww accepts the 3-arg form but ignores the field (acts as oclock/change filter) | Known (live both daemons + expr.rs:209-215) |
| K5 | stat-equalized create and update rows are identical except name/ino/cclock/oclock | Known (live eq pair, one PDU; `mode` unrequested — see U2) |
| K6 | `ino` is stable across updates and changes across every create/recreate/rename-dest/overwrite/replacement on both daemons — the portable prior-state discriminator | Known (live ops 2/4/6/9/11) |
| K7 | Both daemons deliver a complete initial baseline (stock separate PDU, ww merged ack) with all rows cc==oc, enabling the client-side model | Known (live initial captures, both daemons) |
| K8 | ww initial-scan race can seed a just-created file (cclock=seed tick), swallowing the fresh-path signal | Known (observed once live; 5/5 reruns show the normal path; mechanism: seed vs event ordering) |
| K9 | OpenCode consumers: only LocationWatcher's mapping and the app files tree discriminate create/update class; everything else is path-only invalidation | Known (full read at 4306c07b) |
| U1 | ww recreate after tombstone *pruning* reads as fresh-path create (cclock=tick) — pruning is GC-timing-dependent and was not forced live | Source-derived (`tree.rs:368-377`), not exercised |
| U2 | `mode` field equality in the eq-pair construction | Both files are 0644 by construction; `mode` not requested in the field set — residual, low-risk |
| U3 | stock hardlink-create `new`; EdenFS behaviors | Not tested (no op, no Eden host; consistent with E09 U1) |
| U4 | Whether the *newer* stock source (923b0935) changed any cited behavior vs the July binary | Live claims come from the binary; every mechanism cited from the Aug 31 source matched observed behavior (same stance as E09; no divergence detected) |

## Confidence

High for every K-row: each is either wire-observed on both daemons or pinned to exact source lines of the deployed/built revisions, and the central negative is a live byte-identical construction plus a mechanism argument (ww's `FileEntry` has no creation fact besides `is_new`/`cclock`, and both are shown non-creation-carrying). The consumer inventory is a complete enumeration of `Watcher.Service` and `filesystem.changed` consumers at the pinned commit.

## Factual constraints for any later design (no architecture chosen here)

1. Any portable create/update classification must be client-side prior-state (baseline + `ino`/`exists`), because no intrinsic signal survives both daemons — and stock's intrinsic `new` must not be trusted as ground truth either (rename-overwrite reads `new:false`).
2. A classifier that consumes `new` or `cclock` from both daemons under one interpretation is wrong by construction; the semantics tables above are the correction reference.
3. The daemon-side expression `["since", clock, "cclock"]` cannot be used portably (silently different meaning on ww).
4. Coalesced replacement (one net row) and create+delete (one tombstone) are unobservable transitions on at least one daemon; consumers needing "the file ceased to exist" semantics cannot get it portably from rows alone.
5. ww's directory-rename/delete child-row gaps (E09) mean per-path baselines can go stale without any row; the baseline model must tolerate baselines that are wrong until the next row for that path.
6. The initial baseline is available on both daemons (fresh-instance PDU / merged ack) and is the only complete-snapshot boundary a client gets without re-subscribing.

## Cross-references

- [`v2-readd4-e09-row-shapes0.glm53max.md`](v2-readd4-e09-row-shapes0.glm53max.md) — the `new`-flag divergence and row-shape matrix this follow-up starts from; this document adds the cclock/oclock/ino analysis, the indistinguishability construction, and the consumer inventory.
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — PDU shapes, `is_fresh_instance` semantics, and the flush/marker barrier methodology reused here; the fresh-instance baseline boundary cited in K7.
- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) — wave-two validation issuing P3/E09 follow-up (the row "Portable create/update evidence … remain").
- [`v2-readd4.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md) — the draft's `map remaining row to create/update/delete` step (line 470) and live-evidence expectations (line 760) that this evidence bounds.
- [`v2-readd4-e06-expression0.glm53max.md`](v2-readd4-e06-expression0.glm53max.md) — expression-term surface on both daemons; this document adds the cclock-field `since` term divergence.
- Transcript directory: `/home/rektide/tmp-opencode/v4-p3-create-evidence/` (README inside maps every artifact).
