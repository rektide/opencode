---
type: Evidence
title: Watchman v2 re-add O5 owner-visible directory signal
description: Source-pinned and executable evidence for directory subtree rename, deletion, replacement, and ignored-boundary movement through Parcel, stock Watchman, deployed Watchwoman, current OpenCode owners, v4 directory suppression, and per-path prior-state baselines.
resource: /.design/watchman/v2-readd/v2-readd4-owner-directory-signal0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, parcel, v2, directories, owners, invalidation, evidence]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: opencode
    resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169
    title: Canonical OpenCode v2 source and owner predicates
    revision: 4306c07b340b9a0504e65785f366d2793cd1b169
  - id: parcel
    resource: file:///home/rektide/a/a/opencode/packages/core/node_modules/@parcel/watcher
    title: Parcel watcher source and Linux x64 glibc binding
    revision: 2.5.1
  - id: stock
    resource: file:///home/rektide/a/facebook/watchman
    title: Stock Watchman source checkout
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b
  - id: watchwoman
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: Deployed Watchwoman source checkout
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-o5-directory-signal
    title: Private-daemon transcripts, Parcel probe, predicate and baseline replay, pins, and cleanup record
    last_modified: 2026-09-05
  - id: accepted-e09
    resource: /.design/watchman/v2-readd/v2-readd4-e09-row-shapes0.glm53max.md
    title: Accepted daemon row-shape evidence independently provenance-verified here
---

# Watchman v2 re-add O5 — owner-visible directory signal

## One-sentence answer

**Parcel 2.5.1 publicly emits directory `create`, `update`, and `delete` events and current Config, Agent, Command, Skill, and Plugin Source logic uses directory paths as authoritative rescan triggers, while deployed Watchwoman has reachable subtree rename, rename-then-delete, empty-directory replacement, and ignored-boundary move cases with no child file rows; v4's proposed pre-mapping `type === "d"` drop erases the only signal in those cases, leaving owner registries and per-path child baselines stale until a separate matching file event, Config change, periodic plugin activation, owner/backend rebuild, or daemon-tree rebuild supplies a different recovery boundary.**

## Scope and terms

This is behavior and consequence research only. It selects no mapping or
recovery design, changes no production source, and makes no commit.

- **Parcel row** means the public `{path,type}` object delivered through
  `@parcel/watcher.subscribe` and forwarded unchanged by current
  `Watcher.Native`.
- **Daemon row** means requested
  `name,exists,new,type,ino`; here `type:"d"` is a directory and `type:"f"`
  is a regular file.
- **v4 output** applies the dirty draft's order: caller ignore filtering, then
  drop every `type === "d"` row, then map the remaining row
  (`v2-readd4-dirty.gpt56solxh.md:536-552`).
- **Owner convergence** is separate from **per-path baseline convergence**.
  Agent, Command, Skill, and Plugin Source perform broad authoritative rescans
  after one matching event; an inode baseline changes only when its own path
  receives a row.

The O5 run used Linux `7.1.0-debplus.1`, Node `v26.6.0`, Parcel 2.5.1's
inotify binding, installed stock Watchman `20260708.093114.0`, and deployed
Watchwoman 0.7.0 / source `a1e16cbf`. Stock's live binary is older than the
pinned `923b0935` source; live rows and newer-source mechanisms are kept
distinct below.

## Parcel's public contract includes directories

Yes—`Update` does not mean “files only.”

1. `Watcher.Update` is exactly `ParcelWatcher.Event`
   (`packages/core/src/filesystem/watcher.ts:33`). Parcel's declaration exposes
   only `path` and event `type`; it has no entry-kind field
   (`@parcel/watcher/index.d.ts:11,23-25`).
2. The Linux backend computes `isDir`, but calls the same
   `mEvents.create/update/remove(path)` for directory and non-directory events
   (`src/linux/InotifyBackend.cc:151-184,189-210`). `isDir` only additionally
   controls watch registration/removal.
3. `Event::toJS` renders only `{path,type}`
   (`src/Event.hh:14-27`), and OpenCode forwards every callback item without a
   kind check (`packages/core/src/filesystem/watcher.ts:249-252`).
4. The live public callback returned all three directory operations:

   ```json
   {"path":"<root>/empty","type":"create"}
   {"path":"<root>/empty","type":"update"}
   {"path":"<root>/empty","type":"delete"}
   ```

The operation provenance is how O5 knows these paths were directories; that
fact is intentionally absent from the public row. Therefore current consumers
cannot—and do not—filter directory entries from `Watcher.Update`.

## Operation matrix

Notation: `d+`, `d~`, `d-` are directory create/update/delete rows; `f+`,
`f~`, `f-` are file rows. “Zero” means no row survives Config ignores and
v4's directory drop. Paths are relative to the applicable watched root.

| Operation | Parcel 2.5.1 public rows | Stock raw → v4 | Watchwoman raw → v4 | Owner-visible consequence |
| --- | --- | --- | --- | --- |
| Empty directory create / timestamp update / delete | `empty d+`, then `d~`, then `d-` | corresponding `type:"d"` rows → **zero** | corresponding `type:"d"` rows → **zero** | Current Config receives three updates and requests reloads; v4 receives none on either daemon. |
| Populated `agent/rename-old → rename-new` | old `d-`, new `d+` | old child `f-`, new child `f+` (plus dirs) → both files survive | old/new dirs (and a nested dir), **no child file** → **zero** | Current Parcel and stock trigger Agent; Watchwoman+d-drop leaves old Agent state installed and new location absent. |
| Later append to renamed agent child | Parcel reported `agent/rename-old/sub/a.md f~` under its stale pre-rename prefix | new path `f~` | new path `f~` (`new:false`) | All are still under the broad Agent source root and trigger a full rescan; owner state repairs. Parcel's path remains stale even though its owner consequence converges. |
| Direct recursive delete of a populated command directory | child `f-` plus directory deletes | child `f-` survives | O5 also observed child `f-` plus dirs; child survives | This particular delete converges on all three. It does not establish that Watchwoman always emits child tombstones. |
| Recursive delete **after the directory was renamed** (accepted E09 sequence) | not rerun as a separate Parcel cell; prior rename already supplied its directory trigger | stock emitted child `f-` plus `d-`; file survives | **only top `d-`; no child** → **zero** | Exact reachable Watchwoman counterexample: deletion supplies no owner event after the drop. |
| Replace empty `plugins/empty-replace-me` with a populated external directory | old `d-`, new `d+`; no new child row | stock recursively discovered `new.md f+`; survives | one final directory upsert, **no `new.md`** → **zero** | Current auto Plugin Source requests a rescan; stock does too; Watchwoman requests none until another trigger. |
| Replace populated plugin directory with different populated external directory | old child `f-` rows plus directory update/delete rows; no new child creates | all old `f-` and new `f+` rows survive | old child `f-` rows, final dirs, **no new child rows** | Watchwoman still triggers a broad Plugin Source rescan because old-file tombstones survive; owner state converges although a per-path baseline lacks the new children. |
| Move populated `agent/to-ignore` into `node_modules` | visible old directory `d-`; ignored destination absent | old child `f-` survives; destination rows filtered | old `d-` + ignored destination `d+`, no child rows → **zero** | Current Parcel and stock remove the old Agent definition. Watchwoman leaves it stale. A later write at the ignored destination is filtered on all paths and does not repair it. |
| Move populated `node_modules/from-ignore` out to `commands/from-ignore` | visible `commands d+` and `commands/from-ignore d+`; no child creates | visible child `f+` rows survive; ignored-source rows filtered | visible destination dirs only, no child files → **zero** | Current Parcel and stock discover commands immediately. Watchwoman leaves them absent until a later delivered command-path event or another recovery boundary. |
| Later writes after move-out | direct child `f~`; nested child produced no Parcel row | stock emitted both file updates | in the final O5 run the immediate direct-child append produced no row, while the later nested-child append produced `f~` | A delivered matching file row repairs the whole Command owner, but the run demonstrates that “the next write” is not a guaranteed per-path repair bound for a moved subtree. |
| Rename populated subtree under direct Skill watch | old/new directory rows | old child `f-`, new child `f+` survive | directory rows only → **zero** | Skill remains stale under Watchwoman+d-drop; a later `SKILL.md` update emitted a file row and caused the full Skill refresh path. |
| Rename populated subtree under configured Plugin Source watch | old/new directory rows | old child `f-`, new child `f+` survive | directory rows only → **zero** | Configured plugin generation remains stale under Watchwoman+d-drop; a later plugin-file update emitted a file row and reactivated it. |

### Exact no-child provenance

The independent accepted E09 transcript was hash-checked and re-extracted into
the apparatus's `results/accepted-e09-provenance.txt`:

- stock transcript SHA-256
  `ffa5b2277f5ca718e1741535951fb949641c9c310df97653d2451d35fa53ea98`;
- Watchwoman transcript SHA-256
  `ecdb5bffcd232b83c8139805baa8db7e2202f54cc89180e4a004d4d010a0d12f`.

For `nd2/x.txt` followed by `nd2 → nd3` and recursive removal of `nd3`, its
typed rows were:

```text
stock rename: nd2 d-, nd2/x.txt f-, nd3 d+, nd3/x.txt f+
stock delete: nd3 d-, nd3/x.txt f-

Watchwoman rename: nd2 d-, nd3 d+
Watchwoman delete: nd3 d-
```

This reconciles O5's direct-delete cell with E09: deployed Watchwoman can emit
individual child removes when notify supplies them, but it does not recursively
synthesize missing child tombstones. A rename can first detach child paths from
the later removal signal, yielding the exact directory-only sequence above.

## Why these row sets occur

### Parcel

- Ignore matching runs before event recording or watch registration
  (`InotifyBackend.cc:151-168`). Thus a move destination in `node_modules` is
  silent while its visible source-side directory removal remains public.
- On `IN_MOVED_TO`, Parcel adds and watches only the moved directory itself
  (`InotifyBackend.cc:165-180`); `DirTree::add` is non-recursive
  (`src/DirTree.cc:57-63`). This explains directory-only move-in/create rows,
  no initial descendant rows, direct-child visibility, and failure to observe
  the O5 nested-child update after a move from ignored space.
- On rename-away, subscription removal matches only the exact directory path
  (`InotifyBackend.cc:196-205`), leaving nested watch descriptors with old path
  strings. O5's later renamed-child update consequently surfaced under the old
  prefix, matching accepted E08's stale-path result.
- Event coalescing is per path and can collapse delete/create into update
  (`Event.hh:30-68`); owner predicates use path containment and ignore this
  distinction.

### Stock Watchman

Stock recursively marks every known child deleted in `markDirDeleted`
(`watchman/InMemoryView.cpp:389-417`). When an entry reappears or its inode
changes, the iothread marks it new and schedules recursive examination
(`watchman/root/iothread.cpp:986-1014,1037-1050`). The live O5 stock rows
therefore retained child evidence across rename, delete, external replacement,
and ignored-boundary movement. After v4's directory drop, those child file rows
still triggered the applicable owners in every populated operation tested.

### Deployed Watchwoman

Watchwoman translates each notify path independently: a remove appends only
`PathChange::Remove { rel }`; other events stat and upsert only the event's own
path (`crates/watchwoman/src/daemon/watcher.rs:115-155`). Applying changes calls
`tree.mark_gone(&rel, tick)` only for that exact path
(`daemon/root.rs:298-340`), and `mark_gone` flips only the matching entry
(`daemon/tree.rs:346-359`). There is no recursive child tombstone operation.

Consequently:

- child rows appear only if notify independently supplies child events;
- rename and moved-in destination processing can contain only directory paths;
- old child entries can remain live under the old name in Watchwoman's tree;
  and
- filtering all directory rows removes the only portable indication that a
  subtree boundary changed.

## Exact current owner path

### Config is the fan-out boundary

Config's recursive watches are the only ones with the hardcoded
`node_modules`/`.git` ignore plan
(`packages/core/src/config/watch.ts:8-37`). For **every** current update,
regardless of event type or entry kind, Config first publishes the raw update
to `Config.changes()` and requests its debounced reload
(`packages/core/src/config.ts:238-254`).

The reload publishes `config.updated` only if Config's own loaded entries
changed (`config.ts:260-268`). Agent/Command/Plugin/Skill files under a stable
Directory entry are not Config documents, so merely running Config reload is
not equivalent to publishing the raw directory path. This makes the raw
directory signal materially owner-visible.

### Agent and Command intentionally consume directory paths

Agent filters Config changes to anything equal to or below
`{agent,agents,mode,modes}` and performs a full discovery/reload
(`config/plugin/agent.ts:54-85,134-141`). Command does the same for
`{command,commands}` (`config/plugin/command.ts:40-71,143-170`). Both source
comments explicitly say there is no suffix check because directory-level
renames may carry no per-file paths (`agent.ts:134-136`,
`command.ts:143-148`).

Their underlying `State.reload` invalidates and reconstructs state from the
registered transforms (`packages/core/src/state.ts:199-244`), so one matching
path removes old definitions and discovers new ones. If Watchwoman emits only
directory rows and v4 drops them:

- renamed definitions remain at old IDs/names and new relative IDs are absent;
- deleted definitions remain callable/selectable;
- definitions moved into ignored space remain installed; and
- definitions moved out of ignored space remain absent.

A later file row anywhere under the same source-directory family triggers a
full repair. A changed Config document can also cause `config.updated`, which
both plugins consume (`agent.ts:74-83`, `command.ts:60-69`). An unrelated raw
event outside their predicates does **not** repair them; if Config entries are
deep-equal, Config emits no `config.updated`.

### Skill

Skill's recursive directory roots use no ignores and publish every update path
to one debounced refresh (`config/plugin/skill.ts:36-45,174-180`). Refresh
clears all watches, rescans every source, replaces `loaded.skills`, and reloads
Skill state (`skill.ts:122-170`). The O5 direct Skill subscription confirmed:
Parcel directory rows and stock child rows trigger immediately; Watchwoman's
directory-only rename becomes zero after the drop. A later delivered
`SKILL.md` event repairs the entire Skill owner. `config.updated` also rebuilds
sources and state (`skill.ts:186-195`). Without either event or owner/backend
rebuild, the stale skill set has no independent periodic repair.

### Plugin Source: auto-discovered and explicitly configured

Auto-discovered `{plugin,plugins}` sources filter `Config.changes()` by broad
containment (`config/plugin/source.ts:81-90,191-196`), so current directory
rows trigger. Absolute configured directories outside Config roots are watched
directly, and **any** update publishes `configuredChanges`
(`source.ts:45-70`). Both feeds enter Plugin Supervisor activation
(`plugin/supervisor.ts:191-223`).

Thus a Watchwoman directory-only rename or empty-directory replacement can
leave the registry's current plugin generation running even though source
topology changed. A later delivered file row repairs it. Unlike Agent, Command,
or Skill, Plugin Supervisor also has an unconditional periodic activation from
`Effect.sleep("24 hours")` (`supervisor.ts:205-206`), so a live supervisor has
a source-defined eventual rescan even if no filesystem or Config event arrives.
Root replacement/re-arm behavior of the configured watch itself is the separate
E10 topology issue, not this subtree matrix.

### LocationWatcher, VCS, app files tree, and review

They are not downstream of recursive directory updates at this pin:

1. LocationWatcher subscribes only to the resolved Git `HEAD` or Mercurial
   `branch` as `type:"file"` (`filesystem/location-watcher.ts:33-44,65-70`).
2. The production Node file branch hardcodes every callback to
   `type:"update"` (`filesystem/watcher.ts:208-216`), and v4 preserves Node for
   `file`/`entries`.
3. LocationWatcher is the only producer of `filesystem.changed` found in
   production Core; it maps Watcher create/update/delete to add/change/unlink
   (`location-watcher.ts:28-32`). VCS then filters specifically to branch
   metadata (`vcs.ts:142-160`).
4. The app files tree discriminates the bus vocabulary: `change` reloads an
   open file and, for a loaded directory node, that directory; add/unlink
   refreshes the parent (`packages/app/src/workspaces/files/watcher.ts:16-35`).
   Review refreshes on any `filesystem.changed`
   (`packages/app/src/session/review/model.ts:123-133`).

No Config, Skill, or Plugin Source recursive update is published onto that bus.
Therefore v4's directory-row suppression creates no new LocationWatcher, VCS,
review, or app-file-tree consequence in the current graph. Conversely, the app
tree does not rescue stale Agent/Command/Skill/Plugin state. The app's dormant
add/unlink branches do not establish that recursive `Watcher.Update` means
files only.

Instruction observation is also unaffected: it uses only explicit
`AGENTS.md` `type:"file"` watches (`config/plugin/instruction.ts:40-53`).

## Per-path prior-state baselines

The dirty v4 draft does **not** implement the accepted baseline+inode
classifier: it requests only `name,exists,new,type`
(`v2-readd4-dirty.gpt56solxh.md:334-347`) and maps `exists/new` directly
(`:549-552`). O5 requested `ino` in its research subscriptions and replayed the
accepted E09 prior-state algorithm to establish the consequences if such a
baseline is later considered.

| Watchwoman operation | File baseline immediately afterward | Effect of a later delivered file row |
| --- | --- | --- |
| Rename old subtree to new | old child remains a live **ghost**; new child is **missing** | first new-path row is classified create and repairs that path; old ghost remains |
| Rename, then recursively delete destination with no child rows | old child remains a live ghost; no destination child was ever installed | no row from the deletion can repair either path |
| Empty-directory replacement with populated directory | new child missing | first row for that child installs it as create |
| Populated replacement | old children tombstoned when individual removes arrive; new children missing | rows repair new children one path at a time |
| Move visible subtree into ignored path | old visible child remains a live ghost; ignored destination is excluded | later destination rows are filtered, so they cannot repair the old baseline |
| Move ignored subtree into visible source | visible children missing | each delivered child row installs only that path; untouched/missed siblings remain missing |

The final executable baseline replay showed no stale stock file baseline in any
matrix cell. For Watchwoman it showed exactly the ghost/missing states above;
after a renamed child update, the new path repaired while the old-path ghost
persisted. Owner full rescans do not mutate this backend-private map, so owner
state may converge while the per-path classifier remains stale.

A plain re-`watch`/re-subscribe on deployed Watchwoman is not itself a
filesystem recrawl: `register_root` returns an existing root unchanged
(`daemon/state.rs:119-127`), while the initial scan/seed runs only when a new
root is registered (`:129-170`; command path at
`commands/watch.rs:10-21`). Therefore stale Watchwoman-tree children are
guaranteed to reset only when the root is actually rebuilt (root GC/drop,
daemon restart, or explicit recrawl), although a later exact child event or
same-path reuse can repair individual entries. The proposed v4 owner
invalidation on transport recovery can repair owner registries by authoritative
reread, but it does not by itself prove correction of Watchwoman's retained
tree or a client baseline seeded from that tree.

## Recovery bounds by stale owner

| Stale state | Events/actions that repair it | What does not repair it |
| --- | --- | --- |
| Agent/Command definitions after directory-only rename, delete, replacement, or ignored move | any later delivered path matching that owner's source-family predicate; a Config change that emits `config.updated`; owner/layer restart; a backend invalidation that actually invokes owner readiness | unrelated Config-root row outside predicate when Config entries remain equal; writes after movement into ignored space |
| Skill set after directory-only rename | any later delivered row under the watched Skill root; `config.updated`; Skill owner/layer rebuild | no periodic self-refresh exists; untouched renamed content stays stale |
| Auto/configured Plugin generation | matching Config-path row or any direct configured-watch row; `config.updated`; unconditional supervisor activation after its 24-hour sleep; supervisor restart | directory rows dropped before either source feed; no immediate repair is guaranteed |
| Watchwoman/client old-path baseline ghost | exact old-path reuse/event, or actual daemon-root rebuild followed by a new baseline | owner authoritative scan; fresh client generation against the same retained Watchwoman root |
| Watchwoman/client missing new-path baseline | a delivered row for each path, or actual daemon-root rebuild | one sibling's row; owner authoritative scan; untouched content |
| App files tree / VCS / review | unchanged LocationWatcher branch-metadata path | no recursive directory event reaches this graph, before or after v4 |

“Never self-heals” is conditional on no independent trigger: Agent, Command,
and Skill have no periodic scan, so an untouched directory-only change can
remain stale for the lifetime of that owner. Plugin Supervisor has the explicit
periodic activation. Per-path ghosts can outlive owner repair and same-root
client reconnection because the deployed Watchwoman root tree is retained.

## Executable evidence and cleanup

All new apparatus is under
`/home/rektide/tmp-opencode/v4-o5-directory-signal/`:

- `README.md` — pins, safety restrictions, layout, and reproduction command;
- `harness/parcel-directory.mjs` — actual Parcel 2.5.1 public callback through
  the canonical installed module;
- `harness/daemon-directory.mjs` — raw JSON-lines private-daemon driver with
  complete initial baselines, operation rows, and filesystem snapshots;
- `harness/fixtures.mjs` — exact operation sequence;
- `harness/summarize.mjs` — line-faithful v4 filter, owner predicates, and
  baseline replay;
- `harness/private-daemon.py` and `run.sh` — private process ownership and
  deterministic teardown;
- `results/parcel.json`, `stock.json`, `ww.json` — raw callback/PDU records;
- `results/summary.json` — operation, v4, owner-predicate, and stale-baseline
  results;
- `results/pins.txt` and `accepted-e09-provenance.txt` — identities and
  independent transcript hashes/extraction; and
- `results/cleanup.txt` — both captured daemon PIDs dead and both private
  sockets absent after the final successful `./run.sh`.

Every daemon launch removed `WATCHMAN_SOCK` and used a socket, state, roots,
and logs beneath the apparatus. Commands were limited to `watch`, `subscribe`,
stock `flush-subscriptions`, and filesystem operations. No active service was
contacted; no `watch-project`, `watch-del`, `watch-del-all`, or
`shutdown-server` was issued.

## Known, unknown, and confidence

| Claim | Status |
| --- | --- |
| Parcel's public stream contains directory create/update/delete and OpenCode forwards those rows | **Known, high**: source plus live callback |
| Agent/Command deliberately accept directory paths; Config, Skill, and both Plugin Source feeds trigger without kind checks | **Known, high**: complete consumer source trace plus predicate replay |
| Stock supplies descendant file evidence for the populated operations tested, so v4's directory drop did not erase those owner triggers | **Known for installed stock binary, high**; pinned newer source explains the recursive mechanism |
| Deployed Watchwoman has exact directory-only rename, rename-then-delete, empty replacement, move-in/out-ignore, Skill rename, and configured-source rename cases | **Known, high**: private live rows; rename/delete independently provenance-verified from accepted E09 |
| A direct Watchwoman recursive delete always lacks or always includes child rows | **False as a universal statement**: O5 direct deletes included children, while accepted rename-then-delete omitted them; child delivery depends on independent notify paths |
| The next write always repairs a moved subtree | **Not established and contradicted by the final O5 move-out sequence**: direct-child append was absent; later nested append arrived. A *delivered matching row* is the factual owner-repair boundary. |
| Non-Linux Parcel, Watchman, or Watchwoman behavior | **Unknown / out of scope** |
| Replacement of the watched root itself | **Out of scope**; E10 covers root/symlink topology and re-arm behavior |
| Owner action trace | **High confidence, line-faithful rather than a production Effect integration test**: the replay uses exact path-containment predicates and the source proves each matching path invokes a full owner refresh |

Directory row ordering/counts can coalesce, and Parcel paths below renamed
directories can be stale. Neither affects the central negative: one reachable
Watchwoman operation can expose only directory rows, and v4 explicitly removes
all of them before any current owner can observe the path.

## Factual constraints for later design work

1. Current `Watcher.Update` cannot be described as file-only; Parcel supplies
   type-agnostic path events that include directories.
2. Agent and Command's no-suffix predicates are expressly written to consume
   directory-level rename paths.
3. A directory drop is not parity-neutral even if stock often supplies child
   rows; deployed Watchwoman has exact no-child cases.
4. Ignore-boundary parity depends on the visible directory side: Parcel's old
   directory delete (move in) and new directory create (move out) are the only
   immediate public rows in the measured cases.
5. One surviving old-child tombstone is enough to converge a broad owner even
   if new-child rows are absent; an empty old subtree exposes the opposite case.
6. Broad owner rescans and per-path baseline repair are different boundaries.
7. Same-root Watchwoman reconnection does not imply a recrawl or removal of
   stale child entries.
8. LocationWatcher and the app files tree are not consumers of recursive
   `Watcher.Update` at `4306c07b`; they cannot supply or receive this signal.

## Cross-references

- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md) — assigns O5 and identifies the Watchwoman-child-row plus directory-drop composition as the final owner-convergence question.
- [`v2-readd4-e09-row-shapes0.glm53max.md`](v2-readd4-e09-row-shapes0.glm53max.md) — accepted exact row shapes and the rename/delete no-child sequence independently provenance-verified here.
- [`v2-readd4-e09-create-evidence0.glm53max.md`](v2-readd4-e09-create-evidence0.glm53max.md) — establishes baseline+inode as the only portable create/update inference; O5 shows how missing descendant rows leave that baseline stale.
- [`v2-readd4-e08-ignore-parity0.glm53max.md`](v2-readd4-e08-ignore-parity0.glm53max.md) — supplies the exact logical-namespace Config ignore semantics and Parcel stale-rename/moved-tree mechanisms reproduced in O5 owner scenarios.
- [`v2-readd4-e10-symlink-sentinel0.glm53max.md`](v2-readd4-e10-symlink-sentinel0.glm53max.md) — separates watched-root topology/re-arm failures from O5's within-root subtree signal loss.
- [`v2-readd4.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md) and [`v2-readd4-dirty.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4-dirty.gpt56solxh.md) — candidate documents whose pre-mapping directory suppression and owner claims are evaluated here as proposals, not accepted design.
- [`results/summary.json`](file:///home/rektide/tmp-opencode/v4-o5-directory-signal/results/summary.json) — executable row-to-v4-to-owner and prior-state replay underlying the matrices.
