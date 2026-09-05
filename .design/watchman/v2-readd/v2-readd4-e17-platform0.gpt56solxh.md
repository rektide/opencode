---
type: Evidence
title: Watchman v2 re-add E17 platform, packaging, and exact Bun 1.4.2 evidence
description: Layered source-target, CI, release-artifact, package-load, daemon-discovery, and live-probe facts for stock Watchman, deployed Watchwoman, the ESM transport and BSER codec, OpenCode, Node, and Bun.
resource: /.design/watchman/v2-readd/v2-readd4-e17-platform0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, platform, packaging, bun, node, linux, macos, windows, glibc, musl]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - id: watchwoman-deployed
    resource: https://github.com/rektide/watchwoman/commit/a1e16cbf35b6bb1e4b429af53d65e738f955c32b
    title: Deployed Watchwoman source pin
  - id: watchwoman-release
    resource: https://github.com/radiosilence/watchwoman/releases/tag/v0.7.0
    title: Watchwoman v0.7.0 release and six platform archives
  - id: stock-watchman
    resource: https://github.com/facebook/watchman/commit/923b0935155590be54c0fc052fdca0201f8ebc4b
    title: Stock Watchman source pin
  - id: transport
    resource: https://registry.npmjs.org/@superbfowle%2Ffb-watchman-esm/3.0.0
    title: Published ESM Watchman transport
  - id: bser
    resource: https://registry.npmjs.org/@superbfowle%2Fbser-esm/3.0.0
    title: Published ESM BSER codec
  - id: opencode
    resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169
    title: Canonical OpenCode carrier pin
  - id: bun
    resource: https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2
    title: Bun 1.4.2 release
  - id: node
    resource: https://github.com/nodejs/node/tree/v26.6.0
    title: Node.js 26.6.0 source and platform contract
  - id: apparatus
    resource: file:///home/rektide/tmp-opencode/v4-o2-platform/README.md
    title: E17 checksummed artifacts, source extracts, probes, transcripts, and cleanup proof
---

# Watchman v2 re-add E17 — platform and packaging evidence

## One-sentence answer

The only end-to-end combination live-verified here is Linux x86-64/glibc with
the deployed Watchwoman `a1e16cbf`, exact
`@superbfowle/fb-watchman-esm@3.0.0` plus
`@superbfowle/bser-esm@3.0.0`, and checksum-verified Bun 1.4.2 (with the
accepted Node 26.6.0 run as a second Linux executor); component evidence is
broader but not compositional—Watchwoman v0.7.0 CI and releases cover
macOS/Linux x86-64 and arm64 plus Linux glibc/musl but exclude Windows, stock
Watchman targets Linux/macOS/64-bit Windows but its exact pin is CI-red and its
five latest releases have no assets, the two ESM packages are architecture-free
pure JavaScript but unexecuted on unavailable hosts, and OpenCode `4306c07b`
builds twelve Bun CLI target variants without containing this transport—while
exact Bun 1.4.2 still reproduces the stale-watch-before-rearm defect, 0/30
deliveries versus 30/30 when the stale watcher is closed first.

This is a fact record. It selects no product support floor or backend policy.

## Evidence layers

The terms below are deliberately non-interchangeable:

| Layer | Meaning in this report |
| --- | --- |
| **Source-targeted** | Source and build configuration explicitly contain a platform/backend path. It does not imply that the target compiled. |
| **Source-compilable** | A source build for the named target actually succeeded at the named revision. A configured target or support statement alone is only source-targeted. |
| **CI-built / CI-tested** | A named CI check successfully built the target / actually executed tests or a smoke probe on that target. A cross-build alone is CI-built, not target-host-tested; a failed/skipped lane establishes neither. |
| **Release-distributed** | A public release/package registry actually exposes the artifact. A workflow that intends to upload it is insufficient. |
| **Package-loadable** | Package metadata admits the host and its published code imported/constructed under the named runtime. Metadata without execution is only package-manager-admissible. |
| **Daemon-discoverable** | The JS transport reached a daemon through `WATCHMAN_SOCK` or `watchmanBinaryPath` → `--no-pretty get-sockname`. |
| **Live-verified** | The executable behavior ran on a real host. Cross-compilation, archive inspection, and source claims are not live host verification. |

## Layered support matrix

`Exact` means the requested deployed/source pin. `Adjacent` means a separately
identified release or runtime version whose evidence cannot silently be
transferred to the exact pin.

| Component / target | Source compile evidence | CI build/test evidence | Release-distributed | Package-loadable / discoverable | Live-verified |
| --- | --- | --- | --- | --- | --- |
| **Watchwoman `a1e16cbf`: Linux x86-64 GNU** | **Source-compilable**: the deployed local build loads and runs | No public check at this exact pin | No; pin is five commits after v0.7.0 with version still `0.7.0` | Standard Unix socket and `get-sockname`; yes through exact Bun probe | **Yes**: deployed binary and private daemon on Linux x86-64/glibc |
| **Watchwoman `a1e16cbf`: Linux arm64 GNU; Linux x86-64/arm64 musl; macOS x86-64/arm64** | Exact pin is source-targeted; adjacent v0.7.0 is source-compilable for all six | Exact pin: no public check. Adjacent v0.7.0: all six CI builds succeeded, but tests executed only in a separate Ubuntu lane | Exact pin: no. Adjacent v0.7.0: **all six archives plus checksums exist** | Unix-socket discovery is present in source | Not on these unavailable hosts |
| **Watchwoman: Windows** | **No**; README/workflow exclude it and daemon/client code directly imports Unix-only socket and process APIs | No lane | No artifact | No daemon exists to discover | No |
| **Stock Watchman `923b0935`: Linux** | Source-targeted by a native Ubuntu 24.04 lane and CMake/getdeps; exact build did not succeed | **No at exact pin: Linux build failed before a green test result** | Latest release at the pin: none. Latest populated examined release, v2026.07.27.00: Linux x86-64 ZIP and Fedora 42 x86-64 RPM only | Transport source has the expected CLI discovery shape | Only older installed x86-64/glibc binary `20260708.093114.0` had `--version` executed here; no exact-pin daemon run |
| **Stock Watchman `923b0935`: macOS / Windows 64-bit** | Source-targeted by native CI lanes, FSEvents/Win32 watcher and Windows named-pipe code; CMake rejects 32-bit Windows. Exact builds did not succeed | **No at exact pin: both build checks failed** | None on the five latest releases; configured legacy ZIP upload is not an actual asset | JS transport source anticipates Windows spawn behavior, but no off-host run | No |
| **Stock Watchman: Linux musl / non-x86 CPU** | No explicit examined target or successful source build | None established | None established | N/A | No |
| **`fb-watchman-esm@3.0.0` + `bser-esm@3.0.0`** | Interpreted architecture-free ESM over Node built-ins; source compilation is not applicable | No package-specific CI found | **Yes**, exact registry-integrity-pinned npm artifacts | Metadata has no `os`/`cpu`; exact artifacts load on Linux Bun 1.4.2 and accepted Node 26.6.0. Discovery works against private Watchwoman | **Yes only on Linux x86-64/glibc** |
| **Bun 1.4.2 runtime** | Source build was not evaluated here; Bun's source/release contract targets Linux/macOS/Windows x86-64/arm64 and Linux glibc/musl | Release signing/publishing succeeded; no full per-platform target-test matrix is claimed here | **Yes**: exact GitHub assets and npm platform packages for all named cells | Exact Linux x86-64 artifact loads both ESM packages and discovers Watchwoman | **Yes**, Linux x86-64/glibc only |
| **Node 26.6.0 runtime** | Official source builds produce the listed target binaries; musl remains experimental | Node's Tier 1/2 contract states full test infrastructure; no individual Node CI run was independently replayed here | **Yes** for Linux x86-64/arm64/ppc64le/s390x, macOS x86-64/arm64, Windows x86-64/arm64, and AIX ppc64; **no official musl artifact** | Exact package accepted by `engines.node >=20.19`; accepted E07 live run passed | **Yes**, official Linux x86-64 Node 26.6.0 only |
| **OpenCode `4306c07b` main Bun CLI** | **Source-compilable**, twelve cells: Linux x86-64/arm64 × glibc/musl plus x86-64 baseline variants; macOS x86-64/arm64 plus x86-64 baseline; Windows x86-64/arm64 plus x86-64 baseline | All twelve were CI-built in `build-cli`; native Linux and Windows unit/service-smoke checks succeeded. Windows unit sets `OPENCODE_EXPERIMENTAL_DISABLE_FILEWATCHER=true`; arm/musl/macOS target-host tests are not established | Exact Actions artifact exists; publish job succeeded | Generated npm manifests constrain `os`/`cpu`; postinstall selects libc and x86-64 baseline. **The exact source/lock contains no `@superbfowle/*` package** | Native Linux and Windows CI executed OpenCode, but not this transport; no local OpenCode integration run |
| **OpenCode `4306c07b` alternate Node CLI** | **Source-compilable** for Linux x86-64/arm64, macOS arm64, Windows x86-64/arm64; explicitly no macOS x86-64 SEA; no musl cell | All five exact CI builds succeeded; service smoke ran on all except Windows arm64 | Exact Actions artifacts exist | Built around Node **26.4.0**, not E07's 26.6.0 | CI-host execution only; not this report's local probe |

### Platform intersection summary

| OS/libc/CPU | What is established for the whole proposed transport → daemon path |
| --- | --- |
| Linux glibc x86-64 | **Live** for exact Bun 1.4.2 + exact npm transport/codec + deployed Watchwoman. Accepted E07 separately provides exact npm artifacts under Node 26.6.0 and Bun 1.4.1. This is not an OpenCode-integrated run. |
| Linux glibc arm64 | Watchwoman v0.7 CI/release, Bun/Node releases, and OpenCode build artifacts exist independently; exact deployed-pin transport-to-daemon behavior is unexecuted. |
| Linux musl x86-64/arm64 | Watchwoman v0.7 CI/release and Bun/OpenCode main artifacts exist independently. No musl host ran the ESM transport. Official Node 26.6.0 treats musl x86-64 as experimental and ships no musl binary. |
| macOS x86-64/arm64 | Watchwoman v0.7 CI/release and Bun/OpenCode artifacts exist; exact deployed-pin ESM path is unexecuted. OpenCode's Node alternative has arm64 only. |
| Windows x86-64/arm64 | Bun, Node, stock-Watchman source paths, and OpenCode artifacts exist independently, but deployed Watchwoman explicitly has no Windows daemon. Exact stock Watchman CI failed and no recent release asset was present. No JS discovery run occurred on Windows. |
| Other CPU architectures | Node alone has broader official binaries (ppc64le, s390x, AIX ppc64). Examined Watchwoman, Bun npm, and OpenCode matrices stop at x86-64/arm64, so no wider whole-stack claim exists. |

## Exact Bun 1.4.2 residual

### Provenance

The private runtime is
`/home/rektide/tmp-opencode/v4-o2-platform/bun/bun-linux-x64/bun`.
It was not installed through mise and did not replace the host's Bun 1.4.1.

1. GitHub's [Bun v1.4.2 release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.2)
   identifies commit
   [`744846f844374847c902b5e7fd59b4342a51ef99`](https://github.com/oven-sh/bun/commit/744846f844374847c902b5e7fd59b4342a51ef99)
   and publishes `bun-linux-x64.zip`, `SHASUMS256.txt`, and its PGP-clearsigned
   counterpart.
2. The archive SHA-256 is
   `36368faef7527875d5ffa52e53cd48021741f2a83eb6208a8dd64068d422a913`.
   Four values are identical: the downloaded bytes, GitHub's release-asset
   `digest`, the standalone checksum file, and the PGP-authenticated checksum
   payload.
3. GnuPG reports a good Ed25519 signature by
   `Robobun <robobun@oven.sh>`, fingerprint
   `F3DC C08A 8572 C074 9B3E 1888 8EAB 4D40 A7B2 2B59`. The key came from
   `keys.openpgp.org` into a scratch-only keyring and has no local Web-of-Trust
   certification; the independent GitHub asset digest supplies a second
   provenance channel.
4. The executable reports `1.4.2` and revision `744846f…ef99`. It is Linux
   x86-64 ELF, dynamically linked only to the ordinary glibc-side runtime
   libraries and has maximum imported symbol version `GLIBC_2.17`, matching
   Bun's [documented glibc 2.17 floor](https://bun.com/docs/installation#musl-binaries).

### Exact package artifacts

The registry metadata and downloaded bytes agree:

| Artifact | Registry SHA-1 | Registry/download SHA-512 integrity | Tar contents |
| --- | --- | --- | --- |
| `@superbfowle/fb-watchman-esm@3.0.0` | `a6ad7ac56e20db33b75a5fb7e8155f64c2946c32` | `sha512-s7jSAaWgMgLj3OHXeWK2UjBWw56qAND/rjomE+2ujRO3AxD4XQ8WtZ5TeYAqXoKe3q9F1iBZ5Ra9zaWqYZhpwg==` | `index.js`, `package.json`, `README.md` |
| `@superbfowle/bser-esm@3.0.0` | `1ede677b526a23c8be163d81f501b6bda5cbb596` | `sha512-xEgNuGzq8G0yUfCeX8PgTLFgKpTOONwmie438yK2TyhLOmFgwrPPWeFSzAr/ljsvaSfdjJyV9OyTe9L9hycWXg==` | `index.js`, `package.json`, `README.md` |

Both published manifests declare ESM and `engines.node >=20.19`, with no
`os` or `cpu` restriction. The transport's sole dependency is
`@superbfowle/bser-esm@^3.0.0`. Both published `index.js` files are SHA-256
identical to the inspected fork workspace files. As accepted E07 found, the
transport tarball omits `index.d.ts`; the published package manifest also lacks
the source manifest's `types` field.

There is no package lock beneath the fork's `watchman/node` tree (its history
explicitly removed the stale `yarn.lock`). Consequently `^3.0.0` alone does not
freeze a future install to BSER 3.0.0; this probe manually extracted and paired
the two independently integrity-verified 3.0.0 tarballs.

The source is architecture-neutral JavaScript, not native code:

- transport imports BSER plus `node:child_process`, `node:events`, and
  `node:net` ([source](https://github.com/rektide/watchman-esm/blob/e8f14498f29d1dfac2ee1071e92a608b21d77989/watchman/node/index.js#L11-L14));
- BSER imports only `node:events` and `node:os`, then uses Buffer and native
  endianness ([source](https://github.com/rektide/watchman-esm/blob/e8f14498f29d1dfac2ee1071e92a608b21d77989/watchman/node/bser/index.js#L8-L19));
- no package-specific CI workflow was found in the fork checkout.

No native code plus absent `os`/`cpu` metadata establishes package-manager
admission across the runtime platforms. It does not establish off-host import,
socket, process-spawn, or daemon behavior.

### Executed checks

All checks below passed under exact Bun 1.4.2 on Linux x86-64/glibc 2.42:

| Check | Result |
| --- | --- |
| Exact ESM import, `Client` construction, `EventEmitter` identity | PASS |
| Exact BSER artifact encode/decode of strings, signed/large integers, booleans, null, arrays, and nested objects | PASS; emitted BSER v1 header `00 01`, 130 bytes, exact round trip |
| `watchmanBinaryPath` override | PASS; shim received exactly `--no-pretty get-sockname`, client connected to private Watchwoman, response `buildinfo: "watchwoman 0.7.0"` |
| `WATCHMAN_SOCK` precedence | PASS; client connected despite deliberately nonexistent binary path, proving env short-circuit |
| Private-daemon isolation | PASS; socket lived only under the apparatus; ambient system service remained `active` before/after and was not contacted |
| Cleanup | PASS; private PID exited through private-socket `shutdown-server`; private socket and pidfile are absent |

### Bun 1.4.2 stale-watch/re-arm result

The minimal E10 A2/A3 distinction was rerun sequentially:

1. arm `fs.watch(parent)`;
2. recursively remove and recreate `parent`;
3. recreate `parent/link`;
4. either close the stale watcher **before** arming watcher two, or leave it
   open;
5. rename a replacement symlink over `parent/link` and wait 300 ms.

| Runtime / case | Repetitions with watcher-two delivery |
| --- | ---: |
| Bun 1.4.2, stale watcher closed before re-arm | **30/30** (`rename/link`) |
| Bun 1.4.2, stale watcher remains open | **0/30** |
| Bun 1.4.1 sensitivity rerun, close first | 3/3 |
| Bun 1.4.1 sensitivity rerun, stale open | 0/3 |

Therefore the deterministic Bun 1.4.1 defect established by accepted E10
persists in exact Bun 1.4.2 on this Linux/inotify/btrfs host. This experiment
does not characterize macOS or Windows watcher implementations.

## Component evidence

### Deployed Watchwoman versus released Watchwoman

The exact deployment is `a1e16cbf`, `v0.7.0-5-ga1e16cb`, as established by
E01. It is not the v0.7.0 release commit. The distinction is material:

- GitHub exposes no check runs for `a1e16cbf` in either the upstream or fork
  repository, and no release asset names that pin that commit.
- Its CI/CD files are byte-identical to v0.7.0's. They declare six release
  targets—macOS x86-64/arm64, Linux GNU x86-64/arm64, and Linux musl
  x86-64/arm64—and explicitly omit Windows
  ([matrix](https://github.com/radiosilence/watchwoman/blob/b2258bbe74b431c327b099604882b44efbe945dc/.github/workflows/ci.yml#L120-L150)).
- At the v0.7.0 commit, all six build checks, test, lint, format, and MSRV
  succeeded ([CI run](https://github.com/radiosilence/watchwoman/actions/runs/30924940797)).
  CD then succeeded at release creation, crates.io publication, and Homebrew-tap
  update ([CD run](https://github.com/radiosilence/watchwoman/actions/runs/30925107855)).
  The public release has exactly six tarballs and six checksum files.
- Every archive carries `watchwoman`, the `watchman` alias, `watchman-wait`,
  `watchman-make`, `watchman-diag`, and `watchmanctl`
  ([package step](https://github.com/radiosilence/watchwoman/blob/b2258bbe74b431c327b099604882b44efbe945dc/.github/workflows/ci.yml#L193-L223)).
- Inspected v0.7.0 Linux x86-64 artifacts match their release checksums. The
  GNU binary is dynamic and imports up through `GLIBC_2.39`; the musl binary is
  static PIE with no dynamic section. Thus the actual GNU artifact does **not**
  establish compatibility with glibc older than 2.39, despite the broad
  “glibc” platform label; the musl artifact is materially self-contained.
- The deployed local GNU binary is Linux x86-64, imports through
  `GLIBC_2.39`, and reports `watchwoman 0.7.0`. Exact Bun 1.4.2 live traffic
  reached a private instance of those deployed bytes.

The source boundary is explicit rather than inferred. README declares only
Linux/macOS, amd64/arm64, Linux glibc/musl, and calls Windows out of scope
([platform statement](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/README.md#L102-L109)).
The daemon imports `std::os::unix::net::UnixListener`, Tokio Unix sockets, Unix
signals, `setsid`, and Unix user lookup without a Windows implementation
([server](https://github.com/rektide/watchwoman/blob/a1e16cbf35b6bb1e4b429af53d65e738f955c32b/crates/watchwoman/src/daemon/server.rs#L1-L52)).
`notify` supplies FSEvents/inotify/kqueue backend dependencies, but no BSD CI or
release lane was found; kqueue presence does not create a release-supported BSD
claim.

### Stock Watchman

Stock source pin `923b0935` explicitly contains:

- CMake/getdeps builds with C/C++, Rust, and a broad dependency graph including
  Boost, Folly, fbthrift, fb303, edencommon, PCRE2, glog/gflags and others
  ([manifest](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/build/fbcode_builder/manifests/watchman#L1-L30));
- independent native Ubuntu 24.04, `macOS-latest`, and Windows 2022 build/test
  workflows ([Linux](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/.github/workflows/getdeps_linux.yml#L22-L60),
  [macOS](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/.github/workflows/getdeps_mac.yml#L22-L64),
  [Windows](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/.github/workflows/getdeps_windows.yml#L22-L61));
- CMake Windows branches, a dedicated `ReadDirectoryChangesW` watcher, named
  pipes, and an enforced 64-bit Windows target;
- source documentation claiming Linux/inotify, macOS/FSEvents, and Windows 10
  64-bit, with FreeBSD/Solaris community-maintained or stale
  ([install guide](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/website/docs/install.md#L7-L25)).

That is source-target evidence, not a green exact matrix. GitHub check records
for `923b0935` show the Linux, macOS, Windows, and Ubuntu packaging builds all
failed ([Linux](https://github.com/facebook/watchman/actions/runs/33532808345),
[macOS](https://github.com/facebook/watchman/actions/runs/33532808401),
[Windows](https://github.com/facebook/watchman/actions/runs/33532808385),
[package](https://github.com/facebook/watchman/actions/runs/33532808383)). The
v2026.08.31.00 release tag similarly has failed Linux/package jobs and
cancelled macOS/Windows release jobs, which explains its zero assets only at
the status level; unauthenticated job-log downloads returned HTTP 403, so the
underlying failure causes remain unknown.

Actual distribution is narrower than the release YAML. The source config still
describes Ubuntu 22/24 DEBs, Fedora 40/41/42 RPMs, and generic Linux/macOS/
Windows ZIPs
([release workflow](https://github.com/facebook/watchman/blob/923b0935155590be54c0fc052fdca0201f8ebc4b/.github/workflows/release.yml#L136-L198)),
but the five newest public releases through
[v2026.08.31.00](https://github.com/facebook/watchman/releases/tag/v2026.08.31.00)
contain no assets. The newest populated release examined,
[v2026.07.27.00](https://github.com/facebook/watchman/releases/tag/v2026.07.27.00), contains only an
x86-64 Fedora 42 RPM and an x86-64 Linux ZIP. No examined stock artifact or CI
lane establishes musl, arm64, or another Linux CPU.

The locally installed stock fallback is a separate older build,
`20260708.093114.0`, not `923b0935`. Its executable probe establishes Linux
x86-64/glibc loading on this host; ELF inspection shows maximum `GLIBC_2.38`
and many dynamic dependencies. This assignment did not start a private stock
daemon or route exact Bun through it.

### Transport and daemon discovery

The transport has exactly two discovery routes:

1. if `WATCHMAN_SOCK` is present, pass it directly to
   `net.createConnection` without spawning a binary;
2. otherwise spawn `watchmanBinaryPath` (default `watchman`) with
   `--no-pretty get-sockname`, parse JSON, then connect
   ([source](https://github.com/rektide/watchman-esm/blob/e8f14498f29d1dfac2ee1071e92a608b21d77989/watchman/node/index.js#L175-L192)).

This is agnostic to daemon brand. Exact Bun 1.4.2 verified both paths only with
deployed Watchwoman on a Unix socket. The source contains a Windows-specific
spawn-hang comment and `windowsHide`, but there is no Windows test, and
Watchwoman has no Windows named-pipe endpoint. Stock Watchman's Windows named
pipe plus Node/Bun's Windows `net.createConnection(path)` remain an unexecuted
composition.

### OpenCode packaging at `4306c07b`

The carrier root pins `packageManager: bun@1.4.2`
([manifest](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/package.json#L1-L9)).
Its main CLI build declares twelve Bun compile targets
([target list](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/cli/script/build.ts#L33-L51)):

- Linux arm64/x86-64 GNU, Linux arm64/x86-64 musl, plus x86-64 baseline for
  each libc;
- macOS arm64/x86-64 plus x86-64 baseline;
- Windows arm64/x86-64 plus x86-64 baseline.

For each target it statically chooses a matching `@parcel/watcher-*` native
package, sets libc build constants, compiles a Bun executable, and writes a
per-target npm manifest with `os` and `cpu`
([binding/package step](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/cli/script/build.ts#L82-L183)).
The umbrella package's postinstall detects Linux musl and x86-64 AVX2 before
copying the matching optional platform package. This supports target selection;
it does not itself reveal the minimum glibc symbol version of the combined
OpenCode binary.

The exact `bun.lock` pins `@parcel/watcher@2.5.1` and its Darwin, Linux
glibc/musl, and Windows native packages (including more optional architectures
than this CLI's x86-64/arm64 build list). It contains no `@superbfowle/*`
resolution.

The exact commit's publish workflow explicitly used Bun 1.4.2 and
`BUN_COMPILE_RELEASE=bun-v1.4.2`
([workflow](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/.github/workflows/publish.yml#L82-L120)).
Its `build-cli`, macOS sign/verify, and final publish checks succeeded
([publish run](https://github.com/anomalyco/opencode/actions/runs/33950407987)),
and the Actions run retains both unsigned and signed `opencode-preview-cli`
artifacts.
The build happens once on Linux and cross-compiles the matrix; only macOS
signature verification runs on macOS. Separately, native Linux and Windows unit
and service-smoke checks succeeded
([test run](https://github.com/anomalyco/opencode/actions/runs/33950407993)), but Windows unit tests explicitly disable
the file watcher
([test workflow](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/.github/workflows/test.yml#L55-L123)).

Most importantly for the scope of this report, `git grep` over the exact pin's
entire tree and `bun.lock` finds neither `@superbfowle/fb-watchman-esm` nor
`@superbfowle/bser-esm`. OpenCode's green platform build therefore establishes
carrier packaging capacity, not transport inclusion or transport conformance.

The alternate Node build is a separate distribution. It hard-codes Node
26.4.0 and five targets—Linux arm64/x86-64, macOS arm64, Windows arm64/x86-64;
it explicitly rejects macOS x86-64 SEA and has no musl target
([build source](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/cli/script/build-node.ts#L17-L61)).
All five exact build checks succeeded; service smoke excludes Windows arm64.

### Node 26.6.0 and Bun 1.4.2 runtime surfaces

Node 26.6.0's source contract separates support by OS, CPU, kernel, and libc
([platform table](https://github.com/nodejs/node/blob/v26.6.0/BUILDING.md#L66-L125)):

- Tier 1: Linux x86-64/arm64 with glibc ≥2.28 and kernel ≥4.18, Windows x86-64
  on Windows 10/Server 2016+, macOS arm64 13.5+;
- Tier 2: Windows arm64, macOS x86-64, Linux ppc64le/s390x and other named
  systems;
- experimental: Linux x86-64 musl ≥1.1.19, with no official release binary.

The official v26.6.0 checksum manifest actually lists Linux x86-64/arm64/
ppc64le/s390x, macOS x86-64/arm64, Windows x86-64/arm64, and AIX ppc64
artifacts. The host Node executable is byte-identical to the checksum-verified
official Linux x86-64 archive and imports through `GLIBC_2.28`. Accepted E07
already live-tested the exact ESM artifacts under that Node binary, so this
assignment did not repeat the suite.

Bun 1.4.2 actually distributes GitHub and npm binaries for Linux glibc/musl,
macOS, Windows, FreeBSD, and Android across x86-64/arm64 where applicable. For
the requested cells, its
[installation contract](https://bun.com/docs/installation#direct-downloads)
states Linux x86-64/arm64, musl x86-64/arm64, macOS x86-64/arm64, and Windows
x86-64/arm64; Windows requires version 10 1809+, macOS requires 13+, glibc
requires 2.17+, and x86-64 requires SSE4.2. The release still exposes
`-baseline` asset aliases, and OpenCode still emits separate baseline package
names; this report did not compare every baseline executable byte-for-byte.

## Unknowns and confidence

### Explicit unknowns

1. No macOS, Windows, arm64, musl, older-glibc, or non-x86 host was available.
   Package metadata and independent component releases do not substitute for a
   live transport-to-daemon run there.
2. Exact Watchwoman `a1e16cbf` has no public CI check. The v0.7.0 six-target
   green matrix and release are adjacent evidence; only deployed Linux
   x86-64/glibc was live-tested at `a1e16cbf`.
3. Stock Watchman's exact CI failure causes are unavailable because public job
   log downloads returned HTTP 403. Failed checks establish only that the pin
   is not CI-green, not that every target is intrinsically uncompilable.
4. No exact recent stock macOS or Windows release artifact exists in the
   examined releases, despite source and workflow support. No musl/arm64 stock
   evidence was found.
5. The ESM package has no package-specific off-host CI. Windows named-pipe
   discovery under Node or Bun and macOS Unix-socket discovery remain
   unverified.
6. OpenCode's successful exact matrix excludes the proposed `@superbfowle/*`
   dependency. It cannot be counted as transport CI. Its Windows unit lane also
   disables the current file watcher.
7. The combined OpenCode artifact's actual minimum glibc version was not
   measured; source ABI labels alone do not establish one.
8. Bun's stale-watch result is specific to Bun 1.4.2 on this Linux 7.1,
   inotify, btrfs host. It says nothing about Bun's macOS or Windows watcher.

### Confidence

- **High:** exact source pins and target lists; exact GitHub check conclusions;
  actual public asset inventories; npm integrity matches; Bun/Node provenance;
  ELF architecture/libc inspection; Bun 1.4.2 transport and stale-rearm probes;
  private-daemon cleanup.
- **Medium:** statements explicitly labeled adjacent, because v0.7.0
  Watchwoman CI/release is not the deployed five-commit-ahead source pin.
- **No confidence claimed:** unavailable-host behavior or a composed platform
  path not listed as live-verified.

## Apparatus and cleanup

[`/home/rektide/tmp-opencode/v4-o2-platform/README.md`](file:///home/rektide/tmp-opencode/v4-o2-platform/README.md)
indexes downloaded metadata/artifacts, pinned source extracts, digest and ELF
transcripts, probes, and results. Two outputs from an accidentally concurrent
first stale-watch comparison are retained with `INVALID-concurrent-` prefixes
and excluded; the authoritative 1.4.1 sensitivity and 1.4.2 30-repetition runs
were sequential.

Cleanup record `results/cleanup.txt` says:

```text
private pid alive: no
private socket exists: no
private pidfile exists: no
ambient service before: active
ambient service after: active
```

The ambient service was never queried over its socket. No repository
dependency, global runtime install, production source, or pre-existing design
file was changed; only this requested new evidence report and scratch corpus
were written, and no commit was made.

## Cross-references

- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md) —
  assigns O2/E17 and records Bun 1.4.2 as the remaining runtime residual.
- [`v2-readd4-e01-daemon0.glm53max.md`](v2-readd4-e01-daemon0.glm53max.md) —
  authoritative deployed Watchwoman identity, installed stock fallback, socket
  ownership, and source-versus-installed distinction used here.
- [`v2-readd4-e07-transport-conformance0.glm53max.md`](v2-readd4-e07-transport-conformance0.glm53max.md) —
  exact npm-artifact behavior under Node 26.6.0 and Bun 1.4.1, including
  transport classifier/lifecycle limits; this report closes only its Bun 1.4.2
  and platform-distribution gaps.
- [`v2-readd4-e10-symlink-sentinel0.glm53max.md`](v2-readd4-e10-symlink-sentinel0.glm53max.md) —
  original 30-repetition Bun 1.4.1 stale-watch-before-rearm evidence; the exact
  1.4.2 rerun reproduces the same result.
