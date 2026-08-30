---
type: Validation
title: watchwoman daemon claims — source and live-daemon validation
description: Verifies the six daemon assumptions behind draft2's root-scoped Watchman backend against the watchwoman 0.7.0 source and the live socket-activated daemon on this host.
resource: /.design/watchman/watchwoman0.unknown.md
tags: [opencode, watchman, watchwoman, daemon, validation]
status: stable
generated: { by: llm:unknown-model, at: 2026-08-30T15:20-04:00 }
verified: { by: model:gpt-5.6-terra, at: 2026-08-30T21:10:00Z }
stale_after: 2026-10-30
sources:
  - id: design-under-validation
    resource: /.design/watchman/draft2.gpt56t.md
  - id: maintenance-log
    resource: /.design/watchman/README.md
  - id: watchwoman-source
    resource: file:///home/rektide/src/watchwoman-systemd
  - id: live-daemon
    resource: unix:/home/rektide/.local/state/watchman/rektide-state/sock
---

# watchwoman daemon claims — validation

> **Model suffix note:** this agent could not determine its underlying model
> from the environment (an OpenAI provider key is present, but no model ID is
> exposed anywhere the agent can read). The `unknown` suffix reflects that;
> rename the file with the real model name if it is known.

## Situation

The host recently replaced facebook watchman-main with
**watchwoman 0.7.0** (radiosilence/watchwoman), running as a socket-activated
systemd user service. `draft2.gpt56t.md` designs a root-scoped Watchman
backend on top of watchman-family daemon semantics. This wave validates six
daemon claims against the actual watchwoman source and, where safe, the live
daemon.

### Environment under test

| What | Value |
| --- | --- |
| Source checkout | `~/src/watchwoman-systemd` (jj workdir; tree identical to `~/archive/radiosilence/watchwoman` at `a1e16cb` "feat: install-unit — systemd user units for socket activation") |
| Daemon binary | `/usr/local/bin/watchwoman` (systemd unit), CLI also at `~/.cargo/bin/{watchwoman,watchman}` |
| Daemon version | reports `version: "2026.03.30.00"`, `buildinfo: "watchwoman 0.7.0"` (`WATCHMAN_COMPAT_VERSION`, `crates/watchwoman/src/lib.rs:28`) |
| Socket | `/home/rektide/.local/state/watchman/rektide-state/sock` (owned by `watchwoman.socket`, `ListenStream=%h/.local/state/watchman/%u-state/sock`) |
| Service | `watchwoman.service`: `Type=notify`, `Restart=on-failure`, `ExecStart=/usr/local/bin/watchwoman --sockname …/rektide-state/sock --foreground-daemon`, `LimitNOFILE=524288`, no custom environment |
| Old watchman-main | healthcheck units still reference `~/.local/var/lib/watchman-main/sock` but are inactive/dead |

All source references below are relative to `~/src/watchwoman-systemd/crates/`.

## Verdicts at a glance

| # | Claim | Verdict |
| --- | --- | --- |
| 1 | In-memory tree cache; re-watch does not recrawl; `idle_reap_age` equivalent | **Confirmed**, with different reaping defaults than watchman (1 h stale / 60–120 s dead vs 5 days) |
| 2 | `query` evaluates stored state, supports `since` + expressions | **Confirmed** by source and measurement (no disk walk, no stat, no cookie sync) |
| 3 | `enforce_root_files` absent; any dir watchable | **Confirmed** — but `watch-project` marker-climbing is a live hazard on this host (see incident) |
| 4 | Capabilities: `cmd-watch-project`, `relative_root`, `clock`, `subscribe`/`unsubscribe`, `is_fresh_instance`, `canceled`, cursor rejection | **Mostly confirmed**; `canceled` PDUs and cursor rejection **do not exist**; `unsubscribe` has a live-verified divergence |
| 5 | Cookie file pattern | **Refuted-as-moot**: watchwoman never writes cookie files at all |
| 6 | Language/LOC/storage/systemd | Rust, ~9.0 kLOC src, purely in-memory (+opt-in trigger JSON), jemalloc, socket-activated unit |

---

## Claim 1 — In-memory tree, no recrawl on re-watch, reaping policy

**Verdict: confirmed.**

### Stored state

- The whole view is an in-memory, per-root `Tree`: a `hashbrown::HashMap`
  keyed by relative path with entries inline in a per-root `bumpalo` arena —
  `daemon/tree.rs:182-191` (struct), `daemon/tree.rs:230-258` (construction).
  `FileEntry` carries stat data + `cclock`/`oclock` ticks + `symlink_target`
  (`daemon/tree.rs:32-51`). Deleted files become `exists:false` tombstones,
  pruned once no cursor needs them (`daemon/tree.rs:346-377`,
  `daemon/root.rs:186-193`).
- Zero on-disk state except opt-in trigger persistence
  (`<state_dir>/roots/<slug>/triggers.json`, `daemon/root.rs:237-296`), where
  `state_dir` is the socket's parent directory (`daemon/state.rs:138`).
  **Daemon restart loses all roots and re-crawls on the next watch.**

### Kept current from kernel events

- One `notify` recursive watcher per root (`daemon/watcher.rs:29-113`);
  events are batched with a 5 ms settle (`daemon/watcher.rs:18`), converted to
  upsert/remove `PathChange`s by stat-ing changed paths
  (`daemon/watcher.rs:115-158`), and applied to the tree under one clock tick
  (`daemon/root.rs:300-342`). A rendezvous barrier guarantees the kernel
  registration is live before `watch-project` acks
  (`daemon/watcher.rs:33-77`).
- Initial seed is a synchronous manual walk that prunes `ignore_dirs` and
  only recurses shallowly into `.git`/`.hg`/`.svn`
  (`daemon/watcher.rs:160-219`), run inside `register_root` before the root
  becomes visible (`daemon/state.rs:149-153`).

### Re-watch does not recrawl

- `register_root` is idempotent: an existing root is returned immediately
  after a `touch()` (`daemon/state.rs:121-127`). No second crawl, no tree
  replacement. **Measured live**: re-`watch-project` on the 338 k-file root
  answered in **2 ms** (`watch-list` stays stable).

### When roots are dropped

`daemon/gc.rs` sweeps every **60 s** (`gc.rs:38`):

- **Dead**: root dir `stat()` fails on 2 consecutive ticks → reaped
  (`gc.rs:43`, `gc.rs:101-116`; ~60–120 s grace).
- **Stale**: `subscription_count == 0 && trigger_count == 0 && idle_seconds >=
  STALE_IDLE_SECS` (`gc.rs:119-130`). **Default 3600 s = 1 hour**
  (`STALE_IDLE_SECS_DEFAULT`, `gc.rs:55`), overridable at runtime per sweep by
  `WATCHWOMAN_STALE_IDLE_SECS` (`0` disables; `gc.rs:62-67`). Every command
  that resolves a root resets the idle timer (`DaemonState::root` →
  `touch()`, `daemon/state.rs:107-113`; `daemon/root.rs:137-155`).
  Roots with any subscription or trigger are **never** stale-reaped
  (`gc.rs:17-20`, `123-127`).
- Explicit `watch-del` / `watch-del-all` (`commands/watch.rs:57-82`),
  followed by an allocator purge.

**Divergences from facebook watchman:** watchman's `idle_reap_age` default is
5 days and requires no subs/triggers; watchwoman's is **1 hour** and
additionally counts *command* activity. Consequences for the OpenCode design:

- If OpenCode keeps durable per-root subscriptions, roots are pinned forever —
  re-crawl only after daemon restart. Matches draft2's assumption.
- If OpenCode only issues one-shot `query`/`clock` traffic less than hourly,
  the root can be reaped between polls and the next poll pays a full re-crawl.
- **Leak interaction (live-verified, see claim 4):** a crashed subscriber's
  subscription entry survives until the root's *next file event*, pinning
  quiet roots (e.g. a skills dir) against stale reaping indefinitely.

Note: the repo README's comparison table says idle watches are reaped after
"14 d" (`README.md:22`) — that is stale; the source default is 1 hour
(`gc.rs:55`), and the README's own GC section says "an hour"
(`README.md:260-267`).

---

## Claim 2 — `query` speed and semantics

**Verdict: confirmed.**

### Semantics (source)

- `query` resolves the root, parses the spec, and runs it entirely against
  the in-memory tree under a read lock — `commands/query.rs:11-26`,
  `query/run.rs:96-177`. **No filesystem walk, no per-file stat, no cookie
  round-trip.** The only syscalls are path canonicalization and the socket.
- `since` is fully supported: `c:<start>:<pid>:<root>:<tick>` full clocks,
  bare integer ticks, `n:<name>` named cursors (atomically advanced after the
  query, `query/run.rs:166-170`, `daemon/root.rs:195-214`), and
  `scm:{git,hg}:<mergebase>` (resolved via a real VCS diff,
  `query/run.rs:188-198`, `daemon/scm.rs`). A full clock from a *different*
  daemon/root instance compares as tick 0 → returns every file
  (`daemon/clock.rs:127-154`).
- Expressions (`allof/anyof/not/name/iname/match/pcre/suffix/type/size/
  exists/empty/since/dirname/…`), generators (`glob/suffix/path/since/all`),
  `relative_root`, `fields`, `dedup_results`, `empty_on_fresh_instance`,
  `always_include_directories` (default **true** — dirs appear in results,
  `query/run.rs:88-94`), `case_sensitive` (`query/run.rs:36-86`).
  `sync_timeout`/`lock_timeout`/`settle_*` are accepted and ignored (README
  "Query language / Options").
- `is_fresh_instance` is `true` only when the query has **no** `since` at all
  (`query/run.rs:106`); a `since` clock that predates the daemon returns the
  full state flagged `is_fresh_instance:false` — a divergence from watchman,
  which flags that case fresh (see claim 4).

### Measurements (live daemon, read-only against existing roots)

Root: `/home/rektide/src/opencode-watchman` — **338,343 files**, 218 MB tree,
0 subs. CLI: `watchman -j <<< '["query","<root>",{…}]'` (array-form PDU;
object-form `{"command":…}` is rejected — "PDU must be an array",
`commands.rs:63-66`). Wall times via zsh `time`:

| Operation | Wall time | Result size |
| --- | --- | --- |
| Full-state query, `fields:["name"]` (338,343 files) | **0.708 – 0.763 s** | 36,195,299 B JSON |
| Same, repeat | 0.71 s | identical |
| Expression query `["suffix","md"]` (full 338 k scan) | **83 ms** | 5,098 files |
| `path` generator `["packages/core/src/filesystem"]` | **67 ms** | 18 files |
| Incremental `since:<clock-from-prior-query>` | **7 ms** | 0 files |
| `clock` command | 2 ms | — |
| Re-`watch-project` on watched root (no recrawl) | **2 ms** | — |

Interpretation: the 0.7 s full-state number is dominated by serializing and
moving 36 MB of JSON through the CLI (the tiny-output scans show the pure
in-memory iteration over 338 k entries is ≤ ~80 ms). The README's "27×
faster query" claim (3.7 ms vs ~100 ms, `README.md:38`) is for small trees
where watchman's fixed cookie-sync round-trip dominates and watchwoman's
output is tiny; directionally it holds here too.

### Cold vs warm (scratch roots under `~/tmp-opencode`, watch-del'd after)

| Operation | Wall time |
| --- | --- |
| Cold `watch-project` of a 5,022-file root (own `.git` marker, page cache warm) | **17 ms** |
| Warm full query of that root | 20 ms |
| Cold re-`watch` after `watch-del` (full re-crawl, 5 k files) | 16 ms |

Cold crawls are genuinely fast on this machine (btrfs, warm cache) *when the
root resolves sanely* — see the incident below for when it doesn't.

### Incident: `watch-project` marker-climb crawled `$HOME`

Two cold-crawl attempts against scratch dirs **without** their own VCS marker
timed out at the CLI's 30 s one-shot read timeout
(`cli.rs:919-925`) with `EAGAIN` ("Resource temporarily unavailable"), and
were *not registered*. Cause: `watch-project` walks up from the target to the
nearest dir containing any of `.watchmanconfig, .git, .hg, .svn, .jj,
package.json, Cargo.toml, mix.exs, pyproject.toml, go.mod`
(`commands/watch.rs:104-133`), and **`/home/rektide/package.json` exists** —
so the resolved root was `/home/rektide` and the daemon began crawling the
entire home directory (multi-minute, multi-GB). The daemon keeps crawling
even after the client dies (the work runs in `spawn_blocking` with no
cancellation — `daemon/server.rs:145-157`). Daemon RSS grew 1.0 GB →
**18+ GB** from the two abandoned home crawls while this validation ran
(`watchwoman status`: "unaccounted" grew; roots map still showed only the 3
real roots because `roots.insert` happens only *after* the crawl completes,
`daemon/state.rs:149-166`).

**Resolution:** the first crawl completed ~12 min in — `/home/rektide`
registered with **32,040,523 files / 29.2 GB estimated tree** (daemon RSS
26.9 GB). It was `watch-del`'d immediately as cleanup (this root was never a
legitimate interest; the three real roots were untouched). The second
abandoned crawl was still running and may re-insert `/home/rektide` when it
finishes — a follow-up `watch-del` may be needed. One accidental
`watch-project` of an unmarked directory under `$HOME` costs ~12 minutes of
crawling and ~29 GB of daemon memory on this machine.

This is a watchwoman **divergence** from watchman (whose `watch-project`
climbs only to `.watchmanconfig`/VCS roots) with a direct design
consequence: **never send `watch-project` for a target that is not inside a
VCS/config root on this host** — plain `watch` (which never climbs,
`commands/watch.rs:10-22`) is the safe exact-root command, exactly matching
draft2's exact-placement routing.

---

## Claim 3 — `enforce_root_files` absent

**Verdict: confirmed.**

- `watch` and `watch-project` canonicalize the path and register it; the only
  rejections are non-directory or un-stat-able paths
  (`commands/watch.rs:10-46`, `daemon/state.rs:129-133`). There is **no
  `root_files` / `enforce_root_files` code anywhere** in the repo (grep over
  `crates/` and `docs/` finds nothing).
- `.watchmanconfig` is read for exactly one thing: `ignore_dirs`
  (`daemon/watcher.rs:241-262`); `get-config` returns the file verbatim
  (`commands/info.rs:196-208`). No gating.
- So `~/.claude/skills` and friends are watchable — **via plain `watch`**.
  Via `watch-project` they would resolve up to `/home/rektide` on this host
  (see incident above), since neither `~/.claude` nor `~/.claude/skills`
  contains a marker.

---

## Claim 4 — Capabilities and subscription semantics

**Verdict: mostly confirmed, with real divergences.**

### Advertised capabilities (`commands/info.rs:9-110`)

Present: `cmd-watch-project` (:55), `relative_root` (:84), `cmd-clock`
(:12), `cmd-subscribe` (:45), `cmd-unsubscribe` (:49), `cmd-query`,
`cmd-watch-del`, `cmd-state-enter/leave`, `wildmatch`,
`field-oclock`/`field-cclock`, `scm-git`/`scm-hg`, `bser-v2`, plus the full
expression/generator/field sets. Linux additionally advertises
`watcher-inotify` (`info.rs:118-121`) — watchman itself never advertises an
inotify watcher capability; harmless but probeable.

### Live-verified PDU shapes

- `subscribe` initial response: `{version, subscribe, clock,
  is_fresh_instance, root, files}` with `is_fresh_instance:true` when the
  spec has no `since` (`commands/subscribe.rs:68-84`); observed live.
- Unilateral PDU on change: `{version, subscription, clock,
  is_fresh_instance:false, unilateral:true, root, files}` — matches
  `docs/PROTOCOL.md:117-120` and `subscribe.rs:136-149`; observed live
  (`files:["b.txt"]` ~immediately after a write).
- `clock` returns a fresh strictly-greater clock but does **not** wait for
  kernel event drain (`commands/clock.rs:18-22`) — no cookie
  synchronization exists.

### Divergences from facebook watchman

1. **No `canceled` PDU exists.** Nothing in the source ever emits
   `{"canceled": true}` (grep: no match). When a root is reaped or
   `watch-del`'d, the per-session push loop simply exits when its `Weak<Root>`
   upgrade fails (`subscribe.rs:106,155-159`) — the client is *not* told.
   Draft2's failure-table row "Subscription canceled PDU → publish
   conservative update and resubscribe" can never fire against watchwoman;
   a reaped root is indistinguishable from a silent connection until a
   command errors with `no such root`.
2. **No cursor rejection.** Clocks are never rejected; `since` clocks from a
   previous daemon instance compare as tick 0 and return *every file* with
   `is_fresh_instance:false` (`daemon/clock.rs:127-154`,
   `query/run.rs:104-117`). Watchman instead answers such queries with
   `is_fresh_instance:true`. Content-wise watchwoman is more conservative
   (full state), but clients that branch on the flag will misclassify the
   PDU as an incremental delta.
3. **`unsubscribe` does not stop delivery on a live connection**
   (live-verified): `unsubscribe` only removes the spec from the root's map
   (`subscribe.rs:161-180`); the spawned push loop never consults that map
   (`subscribe.rs:87-159`), so a still-open subscriber keeps receiving
   unilateral PDUs — in the test, the `b.txt` PDU arrived *after*
   `"unsubscribed": true` returned.
4. **Dead-client subscriptions linger.** The push loop notices a closed
   session only when the next tick event arrives (`subscribe.rs:98-112`);
   until then `debug-get-subscriptions` still lists the subscription
   (live-verified after killing both subscriber CLIs). Two consequences: a
   crashed subscriber keeps the root "active" (never stale-reaped) on a quiet
   tree, and `subscription_count` overstates live demand. Watchman
   subscriptions are strictly connection-scoped.
5. **`state-enter`/`state-leave` are bookkeeping stubs** (a per-root name
   set, `commands/state.rs:9-19`) — no cursor save/restore, no clock
   semantics. Tools using state-leave persistence (hg fsmonitor) get a no-op.
6. **PDU form:** the daemon accepts only **array**-form requests
   (`["query", root, spec]`, `commands.rs:63-72`); the `{"command": …}`
   object form some tools send is rejected with `bad args: PDU must be an
   array`. (fb-watchman's client sends array form, so the opencode adapter is
   unaffected.)
7. **Directories in results by default** (`always_include_directories`
   defaults true, `query/run.rs:88-94`) — including a spurious one-off
   `.git` PDU observed live. The adapter's local filtering must tolerate
   directory entries.

---

## Claim 5 — Cookie files

**Verdict: watchwoman writes no cookies at all; the filter is moot (and
harmless).**

- The only occurrence of "cookie" in the codebase is a *parity filter*:
  query results skip basenames starting with `.watchman-cookie-`
  (`query/run.rs:118-126`) so that cookies written into a shared root by some
  *other* watchman-compatible client don't leak into results. Because the
  subscription push loop reuses `query::run` (`subscribe.rs:114-129`),
  subscription file lists get the same filtering.
- There is no cookie-writing code, no sync round-trip, and no cookie mention
  in `docs/`. Synchronization is the 5 ms event batch
  (`daemon/watcher.rs:18`).
- The design's `.watchman-cookie-<host>-<pid>-<serial>` filter in
  `SkillSourceObserver` will simply never match under watchwoman. Keep it
  (it's correct if a real watchman ever serves the root again), but nothing
  needs to change.

---

## Claim 6 — Implementation, size, storage, deployment

- **Language/runtime:** Rust 2021 (MSRV 1.88), tokio multi-thread runtime,
    `notify` 8 for kernel events (inotify on Linux), `dashmap` +
    `parking_lot` for state, `bumpalo`+`hashbrown` for the per-root tree,
    **jemalloc global allocator** (`src/lib.rs:12-13`,
    `daemon/alloc.rs`), serde/indexmap for JSON, hand-rolled BSER v1/v2
    codecs in `watchwoman-protocol` (~771 LOC).
- **Size:** ~**9,032 LOC** of non-test Rust across the three crates
  (`watchwoman` daemon/CLI/companions, `watchwoman-protocol`,
  `watchwoman-tests` harness excluded). Single ~3 MB stripped binary ships 6
  companion binaries (`watchman` argv-alias, `watchman-wait/-make`,
  `watchman-diag`, `watchwomanctl`).
- **Storage:** purely in-memory trees; the socket is "the only artefact".
  Sole disk state: opt-in trigger persistence
  (`<sockdir>/roots/<slug>/triggers.json`, `daemon/root.rs:237-296`) and the
  GC reap log (in-memory ring of 64, `daemon/state.rs:44-47`).
- **systemd units** (`~/.config/systemd/user/`, installed by
  `watchwoman install-unit`, source `crates/watchwoman/src/units.rs`):
  - `watchwoman.socket`: `ListenStream=%h/.local/state/watchman/%u-state/sock`,
    `SocketMode=0600`, `DirectoryMode=0700`, `WantedBy=sockets.target`.
  - `watchwoman.service`: `Requires=`/`After=` the socket, `Type=notify`
    (sd_notify readiness/stopping, `daemon/notify.rs`), adopts the socket
    via `LISTEN_FDS` (`daemon/activation.rs`), `Restart=on-failure`,
    `RestartSec=1`, `LimitNOFILE=524288`, graceful SIGTERM/SIGINT shutdown.
    **No environment is set** — `WATCHWOMAN_STALE_IDLE_SECS` is *not*
    customized here, so the 1 h stale default applies.
  - Zeroconf socket resolution matches the unit:
    `$XDG_STATE_HOME/watchman/<user>-state/sock` →
    `~/.local/state/watchman/<user>-state/sock` (`sock.rs:14-37`).
  - Leftover `watchman-healthcheck.{service,timer}` still point at the dead
    watch-main socket (`/home/rektide/.local/var/lib/watchman-main/sock`);
    both inactive. Candidates for removal, unrelated to watchwoman.

---

## Open questions

1. **The abandoned `$HOME` crawls**: the first completed and its root was
   `watch-del`'d (see incident resolution); the second may still re-insert
   `/home/rektide` when it finishes — verify `watch-list` / RSS later and
   `watch-del` again if needed. Also consider reporting the marker-climb +
   uncancellable-crawl behavior upstream (radiosilence/watchwoman) — the
   30 s CLI timeout with the daemon continuing to burn tens of GB behind a
   dead client is the sharpest edge found.
2. **`unsubscribe`-doesn't-stop-delivery and dead-subscription lingering**
   (claim 4.3/4.4) look like upstream bugs rather than design; the opencode
   adapter must close the socket (end of session) to reliably stop PDUs —
   which it already does via generation lifecycle.
3. Whether watchwoman's `relative_root` subscription semantics differ from
   fb-watchman in edge cases (trailing-slash/join normalization) — draft2's
   `relative_root = relative_path + relative(project, target)` composition
   was source-confirmed supported but not live-exercised for nested joins.
4. `~/.claude/skills`-style global roots under `watch` (exact) were not
   live-tested end-to-end through the opencode adapter; only the daemon
   primitives were.
5. The upstream README's "14 d" idle-reap table entry vs the 1 h source
   default — trust the source; upstream doc bug.

## Commands used (read-only unless noted)

```sh
export WATCHMAN_SOCK=/home/rektide/.local/state/watchman/rektide-state/sock
watchman version; watchman watch-list; watchwoman status [--json]
time watchman -j <<< '["query","/home/rektide/src/opencode-watchman",{"fields":["name"]}]'
time watchman -j <<< '["query","/home/rektide/src/opencode-watchman",{"expression":["suffix","md"],"fields":["name"]}]'
time watchman -j <<< '["query","<root>",{"since":"<clock>","fields":["name"]}]'
time watchman -j <<< '["watch-project","<root>"]'      # 2 ms on watched root
watchman --no-pretty -p -j <<< '["subscribe","<scratch>","subA",{"fields":["name"]}]'  # scratch root only
watchman -j <<< '["unsubscribe","<scratch>","subA"]'
watchman -j <<< '["debug-get-subscriptions","<scratch>"]'
watchman -j <<< '["watch-del","<scratch>"]'             # scratch roots only
```

## Cross-references

- [`draft2.gpt56t.md`](/.design/watchman/draft2.gpt56t.md) - the design under
  validation; its governing amendment uses plain `watch` for project and exact
  intents to avoid the marker-climb hazard found here.
- [`README.md`](/.design/watchman/README.md) - maintenance and implementation
  record for the settled no-`watch-del` policy.
- [`timeout0.gpt56s.md`](/.design/watchman/timeout0.gpt56s.md) - cookie-attribution notes;
  claim 5 makes them moot under watchwoman (no cookies exist).
