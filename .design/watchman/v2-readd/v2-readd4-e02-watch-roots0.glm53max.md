---
type: Evidence
title: "E02: plain `watch C` root-return and `relative_path` behavior — stock Watchman vs Watchwoman"
description: Source-pinned and live-observed answer to whether plain watch can return an ancestor root D or a relative_path key, across fresh state, pre-existing ancestor/descendant watches, repeats, lexical aliases, and nested paths, on both daemons.
resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd4-e02-watch-roots0.glm53max.md
tags: [watchman, watchwoman, e02, watch, roots, canonicalization, evidence]
status: draft
generated: { by: model:zai-coding-plan/glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-12-05
sources:
  - id: stock-watchman-source
    resource: file:///home/rektide/a/facebook/watchman
    title: facebook/watchman checkout (read-only source inspection; clean tree)
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b (v2026.08.31.00-2-g923b09351, 2026-09-01)
  - id: stock-watchman-binary
    resource: file:///usr/local/bin/watchman-facebook
    title: installed stock fallback binary (live-observation target)
    revision: build 54602bcad27e0887fd26f77c6747a38f0d701fc7 (v2026.07.06.00-4-g54602bcad, 2026-07-08); reports version 20260708.093114.0
  - id: watchwoman
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: radiosilence/watchwoman checkout (read-only source inspection; clean tree, identical to deployed tree)
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b (v0.7.0-5-ga1e16cb, 2026-08-30); binary reports `watchwoman 0.7.0`, wire version 2026.03.30.00
  - id: watchwoman-binary
    resource: file:///usr/local/bin/watchwoman
    title: deployed Watchwoman binary (live-observation target)
    revision: symlink → /usr/local/src/watchwoman-git/repo/target/release/watchwoman; source tree verified at a1e16cbf with empty diff (live-observed pin per E03)
  - id: e02-scratch
    resource: file:///home/rektide/tmp-opencode/v4-p1-watch-roots
    title: isolated private daemons, sockets, roots, and full transcripts
---

# E02 — plain `watch C`: ancestor-root return and `relative_path`

Scope guard: research only. This document answers assignment P1/E02
(`v2-readd4.gpt56solxh.md` line 701; `v2-readd4-validation1.gpt56solxh.md`
line 165): for the plain `watch` command — never `watch-project` — can either
daemon return an ancestor root `D` instead of `C`, and does either ever return
`relative_path`? No controller policy or architecture is chosen here.

## One-sentence answer

No and no: on both daemons plain `watch C` always resolves to exactly
`realpath(C)` and returns `{version, watch: realpath(C), watcher}` — never an
ancestor root and never a `relative_path` key — with pre-existing ancestor or
descendant watches never influencing the returned root (they simply coexist as
separate nested roots on both), the sole observed divergences being that the
installed stock binary rejects non-canonical path spellings (`..`, `.`, `//`,
trailing `/`, symlinked intermediate components) over a raw socket with a
strict-case `RootResolveError` while its CLI canonicalizes client-side, and
Watchwoman canonicalizes every spelling server-side.

## Source/revision matrix

| Source | Path | Revision | Role |
| --- | --- | --- | --- |
| stock Watchman source | `/home/rektide/a/facebook/watchman` | `923b0935` (`v2026.08.31.00-2-g923b09351`) | newer source pin; all stock line references below |
| installed stock binary | `/usr/local/bin/watchman-facebook` | build `54602bcad` (`v2026.07.06.00-4-g`), reports `20260708.093114.0` | live-observation target; **older than the inspected source** |
| Watchwoman source | `/home/rektide/a/radiosilence/watchwoman` | `a1e16cbf` (`v0.7.0-5-ga1e16cb`) | source pin; all watchwoman line references |
| deployed Watchwoman binary | `/usr/local/bin/watchwoman` | tree verified `a1e16cbf`, empty diff | live-observation target |
| private daemons + transcripts | `/home/rektide/tmp-opencode/v4-p1-watch-roots/` | see scratch `README.md` | isolated evidence; active service never contacted |

Installed-binary vs newer-source separation: `git log 54602bcad..923b0935 --
watchman/cmds/watch.cpp watchman/root/resolve.cpp watchman/root/watchlist.cpp
watchman/listener-user.cpp watchman/fs/` is empty — no commit between the
installed binary's build pin and the newer source pin touches any file on the
plain-`watch` resolution path (the archive is a shallow clone whose boundary
commit `b20a6ff8d`, 2026-02-17, precedes both pins, so this range query is
complete). The single behavioral divergence that could not be reconciled with
the newer source is quarantined in Unknown U2 below.

## Source mechanism

### Stock Watchman (`923b0935`)

The plain `watch` command handler is `cmd_watch`
(`watchman/cmds/watch.cpp:281-304`). It takes the path exactly as delivered on
the wire and calls `resolveOrCreateRoot` → `doResolveOrCreateRoot`
(`watchman/listener-user.cpp:60-76`) → `resolveRootByName` (`:78-113`) →
`w_root_resolve` → `root_resolve` (`watchman/root/resolve.cpp:132-276`):

1. `root_str = realPath(filename)` (`resolve.cpp:156`) — canonicalizes
   symlinks and lexical components (`realPath` = O_PATH open +
   `readlink("/proc/self/fd/N")`, `watchman/fs/FileSystem.cpp:320-339`).
2. Existing-watch lookup is an **exact-key** map find:
   `map->find(root_str)` over `watched_roots` (`resolve.cpp:181-187`). There is
   no ancestor search on this path.
3. Miss + `auto_watch` → a brand-new `Root` is constructed **at `root_str`
   itself** (`resolve.cpp:237-261`); the only race handling is exact-key
   "someone beat us" (`:249-261`).
4. The response is exactly `{{"watch", root->root_path}, {"watcher",
   view()->getName()}}` (`watch.cpp:298-300`), with `version` injected by the
   `UntypedResponse` default constructor (`watchman/CommandRegistry.cpp:38-40`)
   and optional root `warning`s via `add_root_warnings_to_response`
   (`watch.cpp:302`). On root failure/cancellation the handler returns
   `{"error": ...}` instead, never both (`watch.cpp:292-297`).

Ancestor resolution machinery exists but is unreachable from plain `watch`:
`findEnclosingRoot` (`watchman/root/watchlist.cpp:39-65`) does prefix matching
over watched roots and computes a relative path, but its only caller is
`resolve_projpath` (`watch.cpp:217-278`, call at `:245`), which serves only
`cmd_watch_project` (`watch.cpp:311-341`). The `relative_path` response key is
set in exactly one place in the codebase — `watch.cpp:337-339`, inside
`cmd_watch_project`, and only when non-empty. `cmd_watch` contains no
`relative_path` construction at all.

CLI-vs-socket asymmetry: the `w_cmd_realpath_root` validator
(`watch.cpp:21-45`), registered as `watch`'s validator (`watch.cpp:305-309`),
runs only through `Command::validateOrExit` in the CLI entrypoint
(`watchman/main.cpp:899`; `watchman/Command.cpp:53-67`). Socket-delivered
commands are dispatched raw (`watchman/Client.cpp:373`) and never run
validators, so a programmatic client's path string reaches `root_resolve`
unmodified.

Transport: the stock server auto-detects newline-terminated compact JSON on
its socket (`watchman/PDU.cpp:80-87` `detectPdu` → `is_json_compact`) and
"returns the data in the same format that was used to ask for it"
(`watchman/Client.cpp:371`, `:474-479`), so JSON-in/JSON-out probing is
faithful wire evidence, not a CLI rendering.

### Watchwoman (`a1e16cbf`)

`commands/watch.rs:10-22`: `watch` canonicalizes with
`std::fs::canonicalize(&path)`, calls `state.register_root(canonical)`, and
returns `{"watch": canonical, "watcher": <platform name>}`.
`register_root` (`daemon/state.rs:121-127`) is an exact-key lookup that
returns the existing `Root` on hit (resetting its staleness timer) and spawns
a new root on miss — no ancestor logic anywhere on this path.

`relative_path` is constructed only in `watch_project`
(`watch.rs:24-46`, push at `:38-40`) from `resolve_project_root`
(`watch.rs:117-133`), an upward walk for `ROOT_MARKERS`
(`.watchmanconfig`, `.git`, `.hg`, `.svn`, `.jj`, `package.json`,
`Cargo.toml`, `mix.exs`, `pyproject.toml`, `go.mod`; `watch.rs:104-115`).
Source-observed contrast, stated as fact without live probing: Watchwoman's
`watch_project` consults only filesystem markers — it has no
`findEnclosingRoot` equivalent and never considers pre-existing watched roots,
where stock `watch-project` checks `findEnclosingRoot` first
(`watch.cpp:241-250`).

Every response — success or error — gets `version` injected at the front by
`dispatch` (`commands.rs:42-62`; `WATCHMAN_COMPAT_VERSION = "2026.03.30.00"`
pinned at `src/lib.rs:28`, which also closes E03's open question U6).

## Live evidence

### Apparatus

Two private daemons under `/home/rektide/tmp-opencode/v4-p1-watch-roots/`,
explicit sockets only, fresh state at start; JSON-line transport via
`bin/probe.py` (one command per connection, exact request/response recorded).
Stock additionally probed through its CLI (`--no-spawn -u <private sock>`).
Commands sent: `watch` and `watch-list` only. No `watch-project`, `watch-del`,
`watch-del-all`, or `shutdown-server` was sent to any daemon. The active
socket-activated service (`~/.local/state/watchman/rektide-state/sock`,
watchwoman `a1e16cbf`, pid 806505) was never contacted; its socket mtime was
identical before and after the session, and the process uptime was continuous.

### Exact response shapes (raw socket)

Stock success (key order as sent on the wire):

```json
{"watch":"/…/roots/first","watcher":"inotify","version":"20260708.093114.0"}
```

Watchwoman success:

```json
{"version":"2026.03.30.00","watch":"/…/roots/first","watcher":"inotify"}
```

Neither shape ever contained `relative_path`, `root`, `error`, or any other
key across every observed plain-`watch` response: stock 17 successes (14
socket + 3 CLI) and 7 error responses; Watchwoman 18 successes and 1 error
response; 43 plain-`watch` outcomes total, zero ancestor returns, zero
`relative_path` occurrences.

Stock error, nonexistent path:

```json
{"error":"watchman::RootResolveError: failed to resolve root: unable to resolve root /…/does-not-exist: failed to resolve root: realpath(/…/does-not-exist) -> No such file or directory","version":"20260708.093114.0"}
```

Stock error, non-canonical spelling (`..`, `.`, `//`, trailing `/`, or
symlinked intermediate component) over the raw socket:

```json
{"error":"watchman::RootResolveError: failed to resolve root: unable to resolve root /…/norm/q/../r: failed to resolve root: \"/…/norm/q/../r\" resolved to \"/…/norm/r\" but we were unable to examine \"/…/norm/q/../r\" using strict case sensitive rules.  Please check each component of the path and make sure that that path exactly matches the correct case of the files on your filesystem.","version":"20260708.093114.0"}
```

(The error discloses the correct canonical target the daemon itself computed.)

Watchwoman error, nonexistent path:

```json
{"version":"2026.03.30.00","error":"internal: canonicalize: No such file or directory (os error 2)"}
```

### Observation matrix

| # | Scenario (C = requested root) | Stock binary `20260708.093114.0` | Watchwoman `a1e16cbf` |
| --- | --- | --- | --- |
| 1 | Fresh daemon, `watch C` | returns `realpath(C)`, keys `{watch, watcher, version}` | same, keys `{version, watch, watcher}` |
| 2 | Repeat `watch C` (same root, twice+) | byte-identical response | byte-identical response |
| 3 | Pre-existing **ancestor** watch `D` containing a `.git` marker, then `watch C = D/sub/deep/leaf` | returns **C**; `watch-list` gains both `D` and `C` as separate nested roots | identical outcome |
| 4 | Pre-existing ancestor watch without any marker, then `watch C` | returns **C**; both roots coexist | identical |
| 5 | Repeat of the nested `C` after (3) | returns **C** again | identical |
| 6 | Pre-existing **descendant** watch (`child-first/z` first), then parent `watch child-first` | returns the parent; both roots coexist | identical |
| 7 | Deep chain `nested/a/b/c` (4 levels) | returns exact C | identical |
| 8 | Leaf symlink `alias -> realdir` | returns canonical target `realdir` | identical |
| 9 | Symlink leaf naming a dir (`mid/ln -> mid/deep`) | returns canonical `mid/deep` | identical |
| 10 | Symlinked **intermediate** component (`mid/ln/leafdir`) | raw socket: strict-case **error** (scenario E below); CLI: returns canonical `mid/deep/leafdir` | returns canonical `mid/deep/leafdir` |
| 11 | `norm/q/../r` | raw socket: strict-case error; CLI: `norm/r` | returns `norm/r` |
| 12 | `norm//r` | raw socket: strict-case error; CLI: `norm/r` | returns `norm/r` |
| 13 | `norm/r/` (trailing slash) | raw socket: strict-case error; CLI: `norm/r` | returns `norm/r` |
| 14 | `first/.` | raw socket: strict-case error; CLI: `first` | returns `first` |
| 15 | Nonexistent path | `RootResolveError … realpath … No such file or directory` | `internal: canonicalize: No such file or directory (os error 2)` |
| 16 | `relative_path` in any plain-`watch` response | never (0 of 24 socket/CLI outcomes) | never (0 of 19 outcomes) |
| 17 | Ancestor returned instead of C | never observed in any outcome | never observed |

Transcripts (exact commands and responses):
`stock-01-fresh-repeat.txt`, `stock-02-ancestry.txt`,
`stock-03-aliases.txt`, `stock-04-lexical-boundary.txt`,
`stock-05-cli-canonicalization.txt`, `ww-01-fresh-ancestry.txt`,
`ww-02-aliases.txt` — all under
`/home/rektide/tmp-opencode/v4-p1-watch-roots/transcripts/`, with daemon
launch lines and runtime pins in the scratch `README.md`.

Key conclusion of row 3: the strongest ancestor temptation — an already
watched ancestor that carries a `.git` marker (exactly the situation where
`watch-project` would return `D` plus `relative_path`) — leaves plain `watch`
untouched: it answers `C` and installs `C` as a second, nested root.

## Installed stock binary vs newer stock source

All stock live evidence above is from the installed binary (build `54602bcad`,
reports `20260708.093114.0`), which is ~7 weeks older than the inspected
source pin `923b0935` (`v2026.08.31.00-2`). Because no commit in
`54602bcad..923b0935` touches any plain-`watch` resolution file (verified
above), every ancestor/`relative_path` finding and the exact-map lookup
mechanism hold for both pins. The one behavior I could not attribute to the
newer source is the strict-case rejection of non-canonical spellings over the
raw socket (rows 10–14): at `923b0935`, Linux `getFileInformation` is a plain
O_PATH `open`+`fstat` (`watchman/fs/FileSystem.cpp:262-272`), and equivalent
`open(2)` calls from a plain process succeed on every rejected spelling; the
`fstatat` fallback branch (`:273-294`) would fail with `ENOTDIR`, not the
observed ENOENT-family message. The binary's build stamp therefore does not
fully explain its behavior against the newer tree; this is recorded as U2 and
does not affect the E02 answer (rejections are errors, never ancestor
returns).

## Known / Unknown / Confidence

| ID | Claim | Status |
| --- | --- | --- |
| K1 | Plain `watch C` never returns an ancestor `D` on either daemon (exact-key resolution at `realpath(C)`) | Known — source on both + 43 live outcomes |
| K2 | Plain `watch C` never emits `relative_path` on either daemon | Known — source (`relative_path` exists only in `watch-project` handlers) + 43 live outcomes |
| K3 | Nested/overlapping roots coexist on both daemons; pre-existing ancestor or descendant watches do not redirect or fail plain `watch` | Known — live on both + source |
| K4 | Response shapes: stock `{watch, watcher, version}` / `{error, version}`; watchwoman `{version, watch, watcher}` / `{version, error}` | Known — live raw-socket capture |
| K5 | Stock CLI canonicalizes the path client-side (validator at `main.cpp:899`); socket commands bypass validators, so programmatic clients deliver raw spellings | Known — source + live CLI/socket contrast |
| K6 | Watchwoman canonicalizes every spelling server-side (`std::fs::canonicalize`), including `..`/`.`/`//`/trailing-`/`/symlinked middles | Known — live + source |
| K7 | Installed stock binary (build `54602bcad`, version `20260708.093114.0`) rejects non-canonical spellings over the raw socket with a strict-case `RootResolveError` that discloses the canonical target | Known — live, deterministic across 6 spellings |
| K8 | No plain-`watch` path file changed between the binary's build pin and source pin `923b0935` | Known — git range query (shallow-clone caveat noted above) |
| K9 | Watchwoman `WATCHMAN_COMPAT_VERSION` wire value is `2026.03.30.00`, defined `lib.rs:28` | Known — source + live (closes E03 U6) |
| U1 | Exact syscall-level site of the installed binary's strict-case rejection (source reading at the newer pin predicts acceptance) | Unknown — see U2 |
| U2 | Whether a binary built at `923b0935` would accept `..`/`.`/`//`/trailing-`/`/symlinked-middle spellings over the socket (source suggests yes; no such binary exists on this host) | Unknown — not live-testable here |
| U3 | Plain-`watch` behavior on macOS/Windows (symlink/case semantics differ) | Out of scope for this Linux host |
| U4 | Stock plain-`watch` response when `root->failure_reason` is set post-creation (watcher backend failure) | Known-by-source only (`watch.cpp:292-297` returns `error` without `watch`/`watcher`); not triggered live |

Confidence: **high** for K1–K7 and K9 (pinned source lines on both sides,
corroborated by deterministic live reproduction on private daemons whose
binaries/trees are pinned above). The ancestor/`relative_path` answer itself
(K1/K2) is source-proven for stock `923b0935` and Watchwoman `a1e16cbf`, and
live-proven on the installed binary `20260708.093114.0`; the only
binary/source tension (U1/U2) concerns error behavior on lexical spellings,
not the root identity or key set.

## Design-relevant constraints (facts only)

1. For any plain-`watch` caller, the returned `watch` value is
   `realpath(C)` — symlinks resolved, lexical components normalized — on both
   daemons; the response carries no `relative_path` and no other positional
   information, so `D == canonical(C)` always; an ancestor `D` cannot be
   introduced by the daemon through this command.
2. Overlapping watches are legal and independent on both daemons: watching a
   child under a watched ancestor (or a parent over a watched child) creates
   an additional root; both roots then appear in `watch-list`.
3. A programmatic stock client (JSON/BSER over the socket, e.g. an
   fb-watchman-style JS client) must send already-canonical absolute paths or
   handle the strict-case `RootResolveError`; the same spellings succeed via
   the stock CLI (client-side canonicalization) and on Watchwoman
   (server-side canonicalization) — at the pins tested here.
4. Error PDUs differ in shape and key order between the daemons: stock
   `{error, version}` with a `watchman::<ErrorType>`-prefixed message;
   Watchwoman `{version, error}` with an `internal:`-prefixed message for
   canonicalization failure.
5. The `version` values observed are `20260708.093114.0` (installed stock
   binary) and `2026.03.30.00` (Watchwoman wire compat constant).
6. Operational fact for future experiments: invoking the installed stock CLI
   without `--no-spawn` and an explicit listener path can spawn/consult a
   stock daemon at its build-time default sockname
   (`/usr/local/src/watchman-git/watchman/var/run/watchman/rektide-state/sock`);
   one such daemon was accidentally spawned by a version check in this
   session, then killed and cleaned.

## Cross-references

- [`v2-readd4.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md) — the E02 ask (line 701), the D/C/L namespace definitions (lines 83-88), and the `watch C` attachment sequence (lines 92-99) whose `D` this evidence pins; the ancestor-containment discussion (lines 474-476) can now rely on plain `watch` never producing an ancestor `D`.
- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) — assignment P1/E02 (line 165) and the path-semantics gap this closes (line 153).
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — transport/encoding context (JSON-line acceptance, version injection) and open question U6, closed here as K9.
- [`v2-readd4-e03-stock-live0.glm53max.md`](v2-readd4-e03-stock-live0.glm53max.md) — prior installed-stock live protocol evidence; this document adds the private-daemon apparatus and the plain-`watch` root matrix.
- [`v2-readd4-watchwoman-delta0.glm53max.md`](v2-readd4-watchwoman-delta0.glm53max.md) — deployed-to-tip facts; `watch.rs`/`state.rs` were inspected at the deployed pin `a1e16cbf`, so no delta applies to this evidence.
- Scratch apparatus and full transcripts: [`/home/rektide/tmp-opencode/v4-p1-watch-roots/README.md`](file:///home/rektide/tmp-opencode/v4-p1-watch-roots/README.md).
