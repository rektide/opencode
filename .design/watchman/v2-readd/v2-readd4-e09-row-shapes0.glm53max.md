---
type: Evidence
title: "E09: exact name/exists/new/type row shapes on stock Watchman and Watchwoman — ack/initial rows and unilateral rows for file, directory, symlink, rename, and replacement operations"
description: Controlled live transcripts from two isolated private daemons (installed stock binary 20260708.093114.0 and deployed Watchwoman a1e16cbf) plus pinned source analysis of the exact name/exists/new/type fields per operation; includes the deleted-directory type-retention answer and the new-flag divergence with its mechanism.
resource: /.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md
tags: [opencode, watchman, watchwoman, e09, row-shapes, evidence]
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
  - id: notify-src
    resource: file:///home/rektide/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/notify-8.2.0/src/inotify.rs
    title: notify 8.2.0 inotify backend (watchwoman's watcher dependency, from its Cargo.lock)
  - id: e01
    resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md
    title: E01 daemon target identity
  - id: e03
    resource: /.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md
    title: E03 protocol ordering
  - id: validation0
    resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
    title: v4 evidence validation and wave-two assignments (N8/E09 ask)
---

# E09 — exact `name`/`exists`/`new`/`type` row shapes on both daemons

## One-sentence answer

When the four fields are requested, **both daemons always emit all four keys in every ack-initial and unilateral row, deleted directories retain `type: "d"` on both daemons, and no delete row on either daemon ever omits `type`** — but the daemons disagree pervasively on `new` (stock: `true` for all fresh-instance initial rows, creates, recreates-at-same-path, and rename destinations; `false` for modifies, deletes, and rename-overwritten targets; Watchwoman: `false` for ack-initial rows, ordinary file creates, directory creates, rename destinations, and recreates — `true` only for single-inotify-event creations such as symlinks and hardlinks) and on the default field set (stock's default is `name, exists, new, size, mode` with **no `type`**; Watchwoman's default adds `type`).

## Scope, safety, and method

- Research only. No OpenCode event mapping is defined, no code patched, no shared v4 doc edited, nothing committed.
- Two **isolated private daemons** were run with private sockets and state under `/home/rektide/tmp-opencode/v4-n8-row-shapes/`:
  - stock: `watchman-facebook --foreground --unix-listener-path=…/stock/sock --statefile=… --logfile=… --pidfile=… --no-save-state`
  - Watchwoman: `watchwoman --sockname …/ww/sock --logfile … --foreground-daemon` (Watchwoman derives per-root state from the socket's parent directory, `daemon/state.rs:138`, so the scratch sockname fully isolates state).
- The **active service was never contacted**: the shell's exported `WATCHMAN_SOCK` (pointing at `~/.local/state/watchman/rektide-state/sock`) was stripped with `env -u WATCHMAN_SOCK` for every daemon launch, and the driver speaks only to the scratch sockets. Verified after every run: active PID 806505 still alive, its socket untouched. An early stray `watchman-facebook version` client (hung on auto-spawn) was killed; no stock daemon was left running.
- Commands used: `watch`, `subscribe`, `flush-subscriptions` (stock only), plus filesystem ops. **No `watch-project`, no `watch-del`, no `watch-del-all`, no `shutdown-server`**; private daemons were stopped with SIGTERM to their own PIDs.
- **Deterministic barriers**:
  - stock — `["flush-subscriptions", root, {"sync_timeout": 10000}]` ack, then a 250 ms idle-drain. Stock enqueues the ack and any forced result PDUs on the same FIFO response deque inside one dispatch (`cmds/subscribe.cpp:323-441` per E03), so receipt of the ack plus wire silence means the op's rows have arrived.
  - Watchwoman — **no flush semantics exist** (its `flush-subscriptions` is a registry-listing stub, E03), so the barrier is a trailing marker file `barrier-<op>` created after the op; because Watchwoman batches ordered inotify events into ≤5 ms ticks (`daemon/watcher.rs:16-19, 80-110`) and renders whole-tree-per-tick deltas, a row for the marker proves all earlier same-root ops were delivered in the same or an earlier PDU. Residual limitation: an op that produces *no row at all* is only detectable as verified absence after the marker row; each such case is stated explicitly below.
- One pre-existing-fixture trio was subscribed to (`f0.txt` file, `d0/d0-child.txt` child file, `l0 -> f0.txt` symlink). Phase A subscribes with default fields (default key set); phase B subscribes with `fields: ["name","exists","new","type"]` and runs the 21-op matrix.

## Daemon identity actually probed

| Daemon | Binary | Version observed on the wire | Relation to source checkout |
| --- | --- | --- | --- |
| stock (live) | `/usr/local/bin/watchman-facebook` | `20260708.093114.0`, buildinfo `54602bcad27e0887fd26f77c6747a38f0d701fc7` | **Older** than the `923b0935` (Aug 31) source checkout; all live claims below come from this binary |
| Watchwoman (live) | `/usr/local/bin/watchwoman` | `2026.03.30.00` compat version / buildinfo `watchwoman 0.7.0` | Hash-equal to `a1e16cbf` checkout per E01 |

Installed-binary observations and newer-source claims are separated throughout: the *Live* columns are wire facts from the July stock binary; source line references name the Aug 31 checkout and were used only to explain mechanisms. Every mechanism claim checked against the newer source was consistent with the older binary's observed behavior (one unobservable corner noted in Known/Unknown).

## Subscribe acknowledgement and initial rows

### Stock Watchman (installed binary, live)

- `subscribe` ack keys: `version, subscribe, clock, asserted-states` (no `files`, no `root`, no `is_fresh_instance`).
- A **separate initial-results unilateral PDU** follows immediately: keys `version, subscription, root, clock, is_fresh_instance: true, unilateral: true, files` (no `since` on the first PDU; every later PDU adds `since: <last-delivered clock>`).
- Initial rows with default fields (key set `name, exists, new, size, mode` — **`type` is not in the default set**): every pre-existing entry (file, symlink, **directory**) appears with `exists: true, new: true`.
- Initial rows with the four requested fields: `{"name":"d0","exists":true,"new":true,"type":"d"}`, `{"name":"d0/d0-child.txt","exists":true,"new":true,"type":"f"}`, `{"name":"l0","exists":true,"new":true,"type":"l"}`, `{"name":"f0.txt","exists":true,"new":true,"type":"f"}`.
- Mechanism (newer source): a fresh-instance since-clock forces `is_new = true` for every row (`query/fieldlist.cpp:85-106`), and fresh queries drop non-existent files (`query/eval.cpp:75-87`), so initial rows are the complete live set.

### Watchwoman (deployed binary, live)

- `subscribe` ack merges the initial results (E03): keys `version, subscribe, clock, is_fresh_instance: true, root, files` — there is **no separate initial PDU**.
- Ack rows with default fields (key set `name, exists, new, size, mode, type` — **`type` is in the default set**): `{"name":"d0","exists":true,"new":false,"size":24,"mode":16893,"type":"d"}`, `{"name":"d0/d0-child.txt","exists":true,"new":false,"size":9,"mode":33204,"type":"f"}`, `{"name":"l0","exists":true,"new":false,"size":6,"mode":41471,"type":"l"}`, `{"name":"f0.txt","exists":true,"new":false,"size":11,"mode":33204,"type":"f"}`.
- **All ack-initial rows carry `new: false`** even though the ack itself says `is_fresh_instance: true`. Mechanism: the initial tree is seeded with `is_new=false` explicitly, so "the first subscription payload doesn't spam the client with 'fresh' files" (`daemon/root.rs:344-368`).
- Later unilateral PDU keys: `version, subscription, clock, is_fresh_instance (hardcoded false), unilateral, root, files` — **never `since`** (E03; `commands/subscribe.rs:136-149`).
- Observed quirk: a few ms after the very first subscribe, an extra unilateral PDU arrived carrying one unchanged `d0` row (`exists:true, new:false`) — the watcher thread's own recursive-watch registration opens subdirectories (notify `WalkDir`), which emits `IN_OPEN|IN_ISDIR` on the parent watch and registers as a change (see the `new`-flag mechanism section).

## The four-field operation matrix

All rows below are wire-verbatim from the transcripts (stock: installed binary; ww: deployed binary); `new`/`type` values are the fields in question, `name`/`exists` always present. "—" separates the two rows of one op where both daemons emit two.

| # | Operation | stock rows (`name`→`{exists,new,type}`) | ww rows (`name`→`{exists,new,type}`) |
| --- | --- | --- | --- |
| 1 | file create (`writeFile`) | c.txt `{true, true, "f"}` | c.txt `{true, **false**, "f"}` |
| 2 | file modify (append) | c.txt `{true, false, "f"}` | c.txt `{true, false, "f"}` |
| 3 | file delete (unlink) | c.txt `{false, false, "f"}` | c.txt `{false, false, "f"}` |
| 4 | recreate at same path, barrier-separated | c.txt `{true, **true**, "f"}` | c.txt `{true, **false**, "f"}` |
| 5 | file create (prep for rename) | r1.txt `{true, true, "f"}` | r1.txt `{true, false, "f"}` |
| 6 | file rename r1→r2 | r1.txt `{false, false, "f"}` — r2.txt `{true, **true**, "f"}` | r1.txt `{false, false, "f"}` — r2.txt `{true, **false**, "f"}` |
| 7 | dir create | nd `{true, **true**, "d"}` | nd `{true, **false**, "d"}` |
| 8 | dir delete (rmdir, empty) | nd `{false, false, **"d" retained**}` | nd `{false, false, **"d" retained**}` |
| 9 | dir create + child file | nd2 `{true, true, "d"}`; nd2/x.txt `{true, true, "f"}` | nd2 `{true, false, "d"}`; nd2/x.txt `{true, false, "f"}` |
| 10 | dir rename nd2→nd3 | nd2 `{false, false, "d"}`; nd2/x.txt `{false, false, "f"}`; nd3 `{true, **true**, "d"}`; nd3/x.txt `{true, **true**, "f"}` | nd2 `{false, false, "d"}`; nd3 `{true, **false**, "d"}` — **no row for the moved child `nd3/x.txt`** |
| 11 | dir delete recursive (rm -r) | nd3 `{false, false, "d"}`; nd3/x.txt `{false, false, "f"}` | nd3 `{false, false, "d"}` — **no row for the deleted child** |
| 12 | symlink create | sl `{true, **true**, "l"}` | sl `{true, **true**, "l"}` |
| 13 | symlink retarget | sl `{true, false, "l"}` | sl `{true, false, "l"}` |
| 14 | symlink delete | sl `{false, false, "l"}` | sl `{false, false, "l"}` |
| 15 | fast replacement file→file (unlink+write, same tick) | p1.txt `{true, **true**, "f"}` (single net row) | p1.txt `{true, false, "f"}` (single net row) |
| 16 | fast replacement file→symlink | p2.txt `{true, **true**, "l"}` | p2.txt `{true, false, "l"}` |
| 17 | fast replacement symlink→file | p3.txt `{true, **true**, "f"}` | p3.txt `{true, false, "f"}` |
| 18 | fast replacement dir→file | p4 `{true, **true**, "f"}` | p4 `{true, false, "f"}` |
| 19 | fast replacement file→dir | p5 `{true, **true**, "d"}`; p5.txt `{false, false, "f"}` | p5 `{true, false, "d"}`; p5.txt `{false, false, "f"}` |
| 20 | rename over existing target (`rename ovA→ovB`, B existed) | ovA.txt `{false, false, "f"}`; ovB.txt `{true, **false**, "f"}` | ovA.txt `{false, false, "f"}`; ovB.txt `{true, false, "f"}` |
| 21 | create+delete within one batch | z1.txt `{false, **true**, "f"}` | z1.txt `{false, **false**, "f"}` |

Row-sets always accompany `size`/`mode` when default fields are used; with the four-field subscription the rows contain exactly the four keys and nothing else on both daemons.

### Explicit required answers

- **Do deleted directories retain `type: "d"`?** **Yes, on both daemons.** Live-proven by ops 8, 10, 11 (stock: `{"name":"nd3","exists":false,"new":false,"type":"d"}`; ww: `{"name":"nd3","exists":false,"new":false,"type":"d"}`). Mechanism: stock keeps the directory's `watchman_file` node with its last `memcpy`'d directory stat after setting `exists=false` (`root/iothread.cpp:908-949`, `InMemoryView.cpp:389-417`), and `type` renders from that retained stat (`query/fieldlist.cpp:204-269`); Watchwoman's tombstone flips `exists` and `is_new` but never touches `kind` (`daemon/tree.rs:348-359`), and `type` renders `entry.kind` unconditionally (`query/field.rs:170`). Deleted files keep `"f"` and deleted symlinks keep `"l"` the same way.
- **Does any delete row omit `type`?** **No.** With `type` requested, every delete row on both daemons carried it. On stock, `type` is omitted only when it is not requested — the *default* field set `name, exists, new, size, mode` has no `type` at all (`query/fieldlist.cpp:340-347`), so default-fields stock results (initial and unilateral, creates and deletes alike) simply never contain `type`; that is a field-selection fact, not a delete-row gap. The only code path that could omit `type` for a requested field is `make_type_field` returning nullopt when stat cannot load (`fieldlist.cpp:235-238`) — not reachable for InMemory-view rows, whose stat is always resident (`InMemoryView.cpp:157-159`), and not observed live.

### Watchwoman child-row gaps in directory rename/delete (ops 10, 11)

When a directory is renamed or recursively deleted, Watchwoman emits rows only for the directory itself, **not for the children** (`nd3/x.txt` never appeared; verified absence after the marker row). Mechanism: notify maps `IN_MOVED_FROM`/`IN_DELETE_SELF` of the dir to events that Watchwoman's `collect_event` turns into a single `Remove{dir}` (`daemon/watcher.rs:134-136`) — there is no recursive expansion of the tombstone to children, and the tree keeps the child entries live under the old path until they are pruned or the root dies. Stock, by contrast, walks the removed subtree and marks every child `exists=false` with its retained stat (`markDirDeleted` recursive, `InMemoryView.cpp:389-417`), producing one delete row per child. This is a row-coverage difference, not a field-shape difference.

## The `new` flag: same key, different semantics

Both daemons always emit `new`, but it means different things:

| Situation | stock `new` | ww `new` |
| --- | --- | --- |
| fresh-instance initial rows (ack-time) | `true` (all) | `false` (all) |
| file create | `true` | `false` |
| dir create | `true` | `false` |
| symlink create | `true` | `true` |
| hardlink create | — (not tested live) | `true` (probe) |
| modify | `false` | `false` |
| delete | `false` | `false` |
| rename destination | `true` | `false` |
| rename-overwritten target | `false` | `false` |
| recreate at same path (post-delete) | `true` | `false` |
| fast replacement at same path | `true` | `false` |
| create+delete before observation | `true` | `false` |

- **Stock** (live, binary; mechanism per newer source): `new` is a since-comparison on the node's creation ClockStamp — `ctime.ticks > since.ticks`, forced `true` under a fresh instance (`query/fieldlist.cpp:85-106`). The iothread resets `ctime` when a node transitions deleted→existing ("we're effectively new again", `root/iothread.cpp:986-994`), which is why both barrier-separated recreates and same-tick fast replacements end `new:true` — the unlink is observed as `exists=false` before the recreate restats. A rename-overwritten target never left the existing state, so its `ctime` is untouched and the target row is `new:false`.
- **Watchwoman** (live, deployed binary; mechanism source-pinned): `new` is `entry.is_new`, set to `true` only when the **last** `Upsert` in a tick batch was the first-ever observation of that path (`daemon/root.rs:306-329`: `tree.get(&rel)` is `None`), and forced `false` by seeding and by every tombstone (`root.rs:344-368`, `tree.rs:348-359`). Any second upsert in the same batch clobbers `is_new` to `false` — and second upserts are the norm:
  - a written file produces ≥3 inotify events (CREATE, MODIFY, CLOSE_WRITE — each upserts);
  - a **directory create** produces a second event because **notify's own watch bookkeeping opens the new directory** (`add_watch` → `WalkDir`, `notify-8.2.0/src/inotify.rs:279-291` then `:383-397` and `:400-414`), emitting `IN_OPEN|IN_ISDIR` (mask `0x40000020`) on the parent watch — kernel-proven by strace of the private daemon: `read(12, "\1\0\0\0 \0\0@\0\0\0\0\20\0\0\0pydir…" )`;
  - a **rename destination** is upserted twice because notify emits both `Modify(Name(To))` and `Modify(Name(Both))` for one `IN_MOVED_TO` when the cookie matches (`inotify.rs:244-267`), and the `Both` event re-lists both paths which `collect_event` upserts again;
  - a **recreate** hits the tombstone (`tree.get` → `Some`) → `fresh=false`.
  - Only single-event creations of never-seen paths — `symlink()` (one `IN_CREATE`), `link()` — keep `new:true` (probe: `slink {true}`, `hlink {true}`, while python `os.mkdir`, node `fs.mkdir`, `open(O_CREAT)`, `writeFile`, and python `touch` all yielded `new:false`).

## Fast replacement at same path (collapse behavior)

Both daemons collapse an unlink+create issued within one observation window into a **single net row** for the final state (`exists:true`, the new kind's `type`, the new stat's `size`/`mode`), never emitting the intermediate tombstone:

- stock ops 15–18: one row each, `new:true` (deleted→existing transition resets ctime, live).
- ww ops 15–18: one row each, `new:false` (path already known; last upsert wins).
- file→dir (op 19) yields two rows on both daemons because the two states live at *different* names (`p5.txt` tombstone + `p5` dir row).

A create+delete issued back-to-back (op 21) yields a single tombstone row on both (`exists:false`), differing only in `new` (stock `true` — creation observed before removal; ww `false` — tombstone rule) and in stat provenance: stock's row carried the real file's retained stat (`mode 33204`), meaning the July binary observed the live file between the two events; Watchwoman's row also retained the stat'd kind (`type:"f"`), because `collect_event` stats at event-collection time before the batch's later `Remove` lands (`daemon/watcher.rs:138-155`).

## Default-fields divergence (initial and unilateral rows)

| | stock (live + newer source `fieldlist.cpp:340-347`) | ww (live + `query/field.rs:104-113`) |
| --- | --- | --- |
| default fields | `name, exists, new, size, mode` — **no `type`** | `name, exists, new, size, mode, type` |
| `fields` override | supported (`field-*` capabilities registered) | supported (same parser vocabulary incl. `type`) |

A consumer reading default-field subscriptions therefore sees `type` on Watchwoman but not on stock Watchman — the only systematic way either daemon "omits" one of the four fields.

## Known / Unknown

| ID | Claim | Status |
| --- | --- | --- |
| K1 | All four fields always present when requested, on ack-initial and unilateral rows, both daemons | Known (live, every op) |
| K2 | Deleted dirs retain `type:"d"`; deleted files `"f"`; deleted symlinks `"l"`; no delete row omits `type` | Known (live ops 3/8/10/11/14/19 + source `tree.rs:348-359`, `iothread.cpp:908-949`, `fieldlist.cpp:204-269`) |
| K3 | Stock default fields omit `type`; ww default includes it | Known (live phase A + `fieldlist.cpp:340-347`, `field.rs:104-113`) |
| K4 | Stock fresh-instance rows and creates/recreates/rename-dests are `new:true`; modifies/deletes/overwritten targets `new:false` | Known (live; mechanism `fieldlist.cpp:85-106`, `iothread.cpp:986-994`) |
| K5 | ww `new:true` only for single-event first observations (symlink/hardlink creates); everything else `false`, incl. all ack-initial rows | Known (live matrix + new-probe; mechanism `root.rs:306-329` + notify event fan-out, strace-proven for dir `IN_OPEN`) |
| K6 | ww omits child rows on dir rename/recursive delete; stock emits per-child tombstones | Known (live ops 10/11; `watcher.rs:134-136` vs `InMemoryView.cpp:389-417`) |
| K7 | Both daemons collapse same-window replacement to one net row | Known (live ops 15–19) |
| U1 | stock `new` for a hardlink create | Not tested live (no op in matrix; ww probe only) |
| U2 | stock never-stat'd deleted node would render `mode 0` → `type "?"` (`watchman_file::make` calloc-zeroes stat, `root/file.cpp:35-54`); never observed because the binary always stat'd the live file first | Source-derived only |
| U3 | ww `new:true` for a dir create would require eliminating notify's watch-bookkeeping `IN_OPEN` double-upsert; untested on any other ww revision | Mechanism-level claim, pinned to deployed `a1e16cbf` + notify 8.2.0 |
| U4 | EdenFS row shapes | Out of scope (no Eden host) |

## Installed binary vs newer stock source

Live observations come from the **installed July 8 binary** (`20260708.093114.0` / buildinfo `54602bc…`). Every newer-source (Aug 31, `923b0935`) mechanism cited — default field list, fresh-instance `new` forcing, type-from-retained-stat, deleted→existing ctime reset, per-child recursive tombstones — matched the older binary's wire behavior exactly in this experiment. No stock row-shape divergence between the two revisions was detected or is claimed; the only stock behaviors not exercisable live (U2's zeroed-stat corner) are labeled source-derived.

## Transcripts and artifacts

All under `/home/rektide/tmp-opencode/v4-n8-row-shapes/`:

- `out-stock/transcript.json`, `out-stock/pdu-log.jsonl`, `out-stock/run.log` — stock full matrix (every PDU with arrival timestamps, per-op row tagging, flush acks).
- `out-ww/transcript.json`, `out-ww/pdu-log.jsonl`, `out-ww/run.log` — Watchwoman full matrix (marker-row barriers visible as `barrier-*` rows).
- `driver/e09-driver.mjs`, `driver/run-e09.sh`, `driver/new-probe.mjs` — driver and orchestration (explicit scratch socknames, `env -u WATCHMAN_SOCK`).
- `ww2/strace.txt` — strace of a private Watchwoman under a subscriber, proving the `IN_OPEN|IN_ISDIR` (`0x40000020`) parent-watch events for created directories (notify watch bookkeeping) behind the `new:false` dir-create behavior; `ww2/root` retains the probe fixtures.
- `stock/log`, `ww/state/watchwoman.log` — private daemons' own logs.

## Cross-references

- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — ack-vs-initial PDU structure, `since` echo, `is_fresh_instance` semantics, and the flush-subscriptions divergence this report's barrier strategy relies on; E09 adds the per-row field content inside those PDUs.
- [`v2-readd4-e01-daemon0.glm53max.md`](v2-readd4-e01-daemon0.glm53max.md) — daemon identities used here (deployed Watchwoman `a1e16cbf`; installed stock fallback `20260708.093114.0` older than the Aug 31 checkout).
- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — wave-two assignment N8/E09 this report answers; its E03 correction (stock fallback exists at `watchman-facebook`) is the binary this report finally exercises live.
