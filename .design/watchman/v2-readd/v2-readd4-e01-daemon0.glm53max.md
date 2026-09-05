---
type: Evidence
title: E01 daemon target identity — intended Watchwoman build and stock Watchman baseline
description: Locally proven identity, provenance, launch mode, socket discovery, platforms, and running-process facts for the Watchman v2 re-add compatibility target.
resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md
tags: [opencode, watchman, watchwoman, e01, daemon, deployment, identity]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: watchwoman-src
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: Watchwoman source checkout (git/jj colocated)
    author: radiosilence + rektide
    last_modified: 2026-08-30
  - id: watchwoman-deploy
    resource: file:///usr/local/src/watchwoman-git
    title: Compfuzor-managed watchwoman deployment (env, links.json, README, bin/)
    author: rektide
    last_modified: 2026-09-01
  - id: watchman-src
    resource: file:///home/rektide/a/facebook/watchman
    title: Stock Watchman source checkout (comparison baseline)
    author: facebook/watchman contributors
    last_modified: 2026-09-01
  - id: v4-brief
    resource: /.design/watchman/v2-readd/v2-readd4.gpt56solxh.md
    title: Watchman v2 re-add architecture and evidence brief (E01 ask)
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
---

# E01 — daemon target identity

## One-sentence answer

The compatibility target on this host is **watchwoman 0.7.0 (crate version) built at git `a1e16cbf35b6bb1e4b429af53d65e738f955c32b`, described `v0.7.0-5-ga1e16cb` and equal to the tip of remote branch `rektide/systemd`**, installed from the local source checkout at `~/a/radiosilence/watchwoman` through the compfuzor deployment `/usr/local/src/watchwoman-git` into `/usr/local/bin`, running right now as systemd-socket-activated user service `watchman.service` (alias of `watchwoman.service`) on `/home/rektide/.local/state/watchman/rektide-state/sock`, with stock Facebook Watchman present only as a deliberately-stopped fallback whose installed binary (`20260708.093114.0`) does not match its own source checkout.

## Source checkout identity (intended target)

All paths below are in `/home/rektide/a/radiosilence/watchwoman` (`/home/rektide/a` is a symlink to `~/archive`):

| Property | Value |
| --- | --- |
| VCS | git + jj colocated; `git status` empty; jj working-copy commit `@` (`aafb56e1ff90`) is empty on top of the same-described parent — **clean** |
| HEAD | detached at `a1e16cbf35b6bb1e4b429af53d65e738f955c32b` |
| Commit | `feat: install-unit — systemd user units for socket activation`, author rektide, 2026-08-30 00:55:19 -0400 |
| `git describe` | `v0.7.0-5-ga1e16cb` (5 commits past tag `v0.7.0`) |
| Branch placement | tip of `rektide/systemd` (remote-tracking) and of local branch `install-unit`; local branch `systemd` has **26 newer commits** (tip `603f3b5` "docs: design gentle service restarts") that are *not* deployed |
| Remotes | `origin` = github.com/radiosilence/watchwoman; `rektide` = github.com/rektide/watchwoman; `tngl` (atproto transport) |
| Workspace version | `0.7.0` ([`Cargo.toml`](file:///home/rektide/a/radiosilence/watchwoman/Cargo.toml) `workspace.package`) |
| Unreleased contents | CHANGELOG `[Unreleased]`: SIGTERM/SIGINT graceful drain, systemd socket activation via `LISTEN_FDS`, `sd_notify` READY/STOPPING, `install-unit`/`uninstall-unit` — i.e. the deployed tree is *past* the 0.7.0 release |

The deployment's own README states the build source: *"built from rektide/watchwoman's `systemd` branch"* (`/usr/local/src/watchwoman-git/README.md`). At deploy time that branch tip was `a1e16cb`, which is exactly what is installed and running.

## Installed binary identity and provenance

Six binaries ship as hardlinks from the checkout's `target/release/` (all mtime 2026-09-01 23:33:20 -0400, built with rust 1.97.0 per `.tool-versions`):

| Command | Resolution chain | Size |
| --- | --- | --- |
| `/usr/local/bin/watchwoman` | → `/usr/local/src/watchwoman-git/repo/target/release/watchwoman` → `/home/rektide/archive/radiosilence/watchwoman/target/release/watchwoman` | 4,877,056 B |
| `/usr/local/bin/watchman` | same chain, `watchman` (argv[0]-dispatch alias; **this deploy owns the classic name**) | 4,877,056 B |
| `watchmanctl`, `watchman-wait`, `watchman-make`, `watchman-diag` | same chain | 1.6–2 MB each |

- `/usr/local/src/watchwoman-git/repo` is a symlink into the archive checkout, so **source checkout and installed binary are the same tree** — no divergence, unlike the stock baseline below.
- sha256 of `target/release/watchwoman` = `78aaceb0012f245a452027117cfc97c1ec0038d2d3d0c5a09bde6f425a9e9d53`, byte-identical to `/proc/806505/exe` (the running daemon) — **running process ≡ installed binary ≡ checkout build**.
- No package manager owns these (`dpkg -S`: no path found; host is Debian forky/sid). Provenance is the compfuzor deployment `/usr/local/src/watchwoman-git` (`env`, `links.json`, `bin/install*.sh`, `bin/links.ts`), which links the six bins into `/usr/local/bin` and the units into `~/.config/systemd/user/`.
- Version outputs: `watchwoman --version` → `watchwoman 0.7.0`; `watchman --version` → `watchwoman 0.7.0`; live daemon `version` command → `{"version":"2026.03.30.00","buildinfo":"watchwoman 0.7.0"}` (wire-impersonated watchman version string plus true buildinfo).

## Launch mode and socket discovery

**Launch mode: systemd user socket-activation** — *not* the binary's auto-spawn, and *not* the units `watchwoman install-unit` would generate (deployment README explicitly warns not to run `install-unit` over compfuzor's managed symlinks).

| Fact | Evidence |
| --- | --- |
| Socket unit | `/etc/opt/watchwoman-git/watchman.socket`, symlinked at `~/.config/systemd/user/watchman.socket`; `ListenStream=%S/watchman/%u-state/sock`, `SocketMode=0600`, `WantedBy=sockets.target`, `Conflicts=watchman-facebook.service`; active; resolved listener = `/home/rektide/.local/state/watchman/rektide-state/sock` (`systemctl --user show watchman.socket -p Listen`) |
| Service unit | `/etc/opt/watchwoman-git/watchwoman.service`, aliased as `watchman.service`; `Type=notify`, `ExecStart=/usr/local/bin/watchwoman --sockname %S/watchman/%u-state/sock --foreground-daemon`, `Restart=on-failure`, `RestartSec=1`, `TimeoutStopSec=15s`, `LimitNOFILE=524288`, `EnvironmentFile=-/usr/local/src/watchwoman-git/env`, logs to journal with `SyslogIdentifier=watchwoman` |
| Running daemon | PID 806505, PPid 1324 (systemd --user), started 2026-09-01 23:33:41 EDT (21 s after the binary was rebuilt), cgroup `user@1000.service/app.slice/watchman.service`, exe hash matches installed binary |
| Client socket precedence | [`crates/watchwoman/src/sock.rs`](file:///home/rektide/a/radiosilence/watchwoman/crates/watchwoman/src/sock.rs) `resolve()`: 1) `--sockname`/`-U`/`-u`/`$WATCHMAN_SOCK`; 2) `$XDG_STATE_HOME/watchman/<user>-state/sock`; 3) `~/.local/state/watchman/<user>-state/sock`; 4) `$TMPDIR/<user>-state/sock`. `XDG_STATE_HOME` is unset in the systemd user environment, so effective default is **#3**, identical to the socket unit's expanded `%S` path |
| Exported env | deployment `env` sets `WATCHMAN_SOCK` to the same canonical path, plus `WATCHWOMAN_CONFIG_FILE=/opt/watchwoman-git/etc/watchwoman.json` and `WATCHWOMAN_STALE_IDLE_SECS=172800` |
| Alias farm | `links.json` maps legacy socket paths to the canonical one: `~/.local/var/lib/watchman-main/sock`, `/usr/local/var/run/watchman/rektide-state/sock`, and the C++ compiled state dir `…/watchman/var/run/watchman/rektide-state` |
| Auto-spawn (fallback design) | `cli.rs::spawn_daemon` spawns `current_exe() --sockname <sock> --foreground-daemon` detached via `setsid()`, logs to `sock.log`, waits ≤5 s for the socket; inert while systemd owns the listener. `sock.log` (mtime 2026-09-01 18:47) predates the current unit-managed start, confirming the earlier auto-spawn era |
| Root-admission policy | `/opt/watchwoman-git/etc/watchwoman.json` (identical copy at `/etc/opt/watchwoman-git/watchwoman.json`): **denies `~`, `~/src`, `~/archive` as exact roots** and `~/.cache` as a subtree; per-root cap 2,000,000 files, warn at 100,000; global `ignore_dirs` floor (includes `.test-agent`); SIGHUP reload keeps last-good on error. Children of denied roots remain watchable, so `~/src/<project>` roots are admitted |

## Source-stated platform support

- **Watchwoman** ([`README.md` §Platforms](file:///home/rektide/a/radiosilence/watchwoman/README.md), lines 102–109): *"Linux and macOS, amd64 and arm64 (glibc and musl on Linux). Windows is intentionally out of scope — the daemon is built on unix sockets and `setsid`… A Windows port would need named pipes and ReadDirectoryChangesW."* Watcher backends: FSEvents (macOS), inotify (Linux, 5 ms coalescing), kqueue (BSD; BSD is in the watcher parity list, not the supported-platform statement).
- **Stock Watchman** ([`README.markdown`](file:///home/rektide/a/facebook/watchman/README.markdown), lines 24–27): maintained by Meta's source control team; *"Windows and macOS builds; Linux builds on recent Ubuntu and Fedora releases."*

## Stock Watchman baseline (comparison only)

| Property | Value |
| --- | --- |
| Source checkout | `/home/rektide/a/facebook/watchman`, HEAD `923b0935155590be54c0fc052fdca0201f8ebc4b` ("Updating hashes", Meta OS Bot, 2026-09-01), `git describe` `v2026.08.31.00-2-g923b09351`, **clean** |
| Installed binary | `/usr/local/bin/watchman-facebook` → `/usr/local/src/watchman-git/watchman/bin/watchman`, client version **`20260708.093114.0`** |
| Source ≠ binary | checkout is Aug 31 material; installed binary is a July 8 build — the stock baseline's checkout and binary **do not match**, unlike the watchwoman target |
| Unit | `watchman-facebook.service` (in `/etc/opt/watchman-main/`): `Conflicts=watchman.socket`, enabled but **inactive/dead** — the deployment README calls it "the C++ fallback (link-only, deliberately started)"; switching daemons is a manual `systemctl --user start watchman-facebook.service` / `start watchman.socket` |

## Known / Unknown / Requires owner confirmation

| Item | Status | Detail |
| --- | --- | --- |
| Watchwoman repository + revision + cleanliness | **Known** | `a1e16cbf` / `v0.7.0-5-ga1e16cb`, clean tree, tip of `rektide/systemd` |
| Installed binary path, chain, hash, version | **Known** | `/usr/local/bin/watchwoman` → archive checkout `target/release/watchwoman`, sha256 `78aaceb0…`, `watchwoman 0.7.0` |
| Running service identity | **Known** | PID 806505 under `watchman.service` (alias `watchwoman.service`), socket-activated, exe ≡ installed binary |
| Launch mode | **Known** | systemd user socket activation via hand-managed compfuzor units in `/etc/opt/watchwoman-git/`; auto-spawn inert |
| Socket discovery/defaults | **Known** | `sock.rs` precedence 1–4; effective path `~/.local/state/watchman/rektide-state/sock`; `$WATCHMAN_SOCK` exported to same |
| Platforms | **Known** | Linux + macOS (amd64/arm64, glibc + musl); Windows out of scope |
| Build-tree purity at build time | High confidence, not provable | binary lacks git embed; built 2026-09-01 from a tree clean at `a1e16cb` whose last commit predates the build; cannot cryptographically prove no dirty files existed at build time |
| Which pin the target should track | **Requires owner confirmation** | local `systemd` branch is 26 commits ahead of the deployed `a1e16cb`; owner must say whether the compat target is the deployed pin, branch tips, or releases |
| Stock Watchman also a compatibility target? | **Requires owner confirmation** | v4 §Live evidence gates this on product scope; local deployment treats stock as deliberate manual fallback (running daemon is watchwoman; `/usr/local/bin/watchman` *is* watchwoman). Formal scope confirmation belongs to the owner |
| Deployment-owner intent (watchwoman = intended daemon) | Strongly evidenced locally | owner-authored deployment README names rektide/watchwoman `systemd` as the build source and owns the classic `watchman` name with the C++ daemon as Conflicts-only fallback; no contradictory local evidence |

## Confidence and caveats

**High confidence** on everything marked Known: every claim above was read directly from git/jj state, source files, unit files, `/proc`, `systemctl --user show`, and hash comparison; no command that could mutate daemon state was run (`--version` and the `version` query only; no `watch-project`, no lifecycle commands).

Caveats:

1. **Impersonated version string**: the daemon answers wire `version` as `2026.03.30.00` (a stock-watchman version it impersonates for compatibility); `buildinfo` carries the true `watchwoman 0.7.0`. Client code keying behavior off `version` must not treat it as the watchwoman build identity.
2. **Moving branch**: the local `systemd` branch (26 commits ahead, design docs) means "tip of systemd branch" drifts; the *deployed* pin is `a1e16cb` until the owner redeploys.
3. **Build provenance is inferential**: mtime ordering + clean tree + matching hashes strongly imply built-from-`a1e16cb`, but no VCS stamp exists inside the binary.
4. **Root policy constrains live testing**: `~/src`, `~/archive`, `~` are denied as exact roots and stale roots are reaped after 2 days idle (`WATCHWOMAN_STALE_IDLE_SECS=172800`); live-test roots must be individual admitted directories, and long-idle test watches may be GC'd.
5. **Service restart semantics** (deployment README): restarting `watchwoman.service` keeps the socket unit bound and queues connections, but established streams close and the zero-state daemon re-crawls roots — relevant context for E03/E16 loss-injection work, recorded here as fact only.

## Pointers into v4 (no edits proposed)

- **E01 row** in *Outstanding questions and evidence asks → Focused implementation evidence* (repository, revision/version, binary path, launch mode, socket discovery, platforms): answered above; the "deployment-owner input" escape hatch remains open only for the two confirmation items in the table.
- **§Live evidence** — "The release gate is the named intended Watchwoman build. Stock Watchman is a compatibility target only if product scope confirms it in E01": the named intended build is now `watchwoman 0.7.0 @ a1e16cbf` (deployed pin); the stock inclusion question still needs owner scope confirmation. The record fields "daemon repository/version and binary" and "socket selection and version response" now have concrete values to populate.
- **§Promotion criteria §2** — "E01 identifies the mandatory daemon target": satisfied for the local target, pending the stock-scope confirmation noted above.
- **§Static backend selection** — default for `OPENCODE_WATCHMAN_BINARY` ("transport discovery / `WATCHMAN_SOCK`"): the transport's socket precedence and the host-wide `$WATCHMAN_SOCK` export documented here are the facts that options work must agree with.
- **v2-readd4-prompt0 Arc 5** — "Record exact daemon identity and command behavior … the named daemon revisions actually tested": the exact daemon identity is the table above; the wire-version/buildinfo split is a command behavior Arc 5 should record verbatim.
- Platform facts feed **E17** (platform acceptance for Watchman selection); recorded here only as source-stated support, no decision implied.
