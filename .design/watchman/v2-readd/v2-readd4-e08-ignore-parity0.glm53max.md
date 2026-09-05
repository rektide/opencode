---
type: Evidence
title: "E08: @parcel/watcher literal/glob ignore semantics and current OpenCode call-site behavior across L != C"
description: Source-pinned and live-verified Parcel ignore semantics (logical-namespace literals, relative-path globs, symlink/failure behavior on Linux) plus the complete canonical caller inventory that a Watchman backend must preserve; research only, no design selected.
resource: /.design/watchman/v2-readd/v2-readd4-e08-ignore-parity0.glm53max.md
tags: [opencode, watchman, parcel, ignore, parity, e08, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: canonical-opencode
    resource: file:///home/rektide/a/a/opencode
    title: canonical OpenCode v2 checkout (pinned detached HEAD for this research)
    revision: 4306c07b340b9a0504e65785f366d2793cd1b169 (v2)
  - id: parcel-watcher
    resource: file:///home/rektide/a/a/opencode/packages/core/node_modules/@parcel/watcher
    title: "@parcel/watcher 2.5.1 (wrapper.js + src/) with @parcel/watcher-linux-x64-glibc@2.5.1 prebuilt watcher.node"
    revision: 2.5.1 (micromatch 4.0.8, is-glob 4.0.3)
  - id: harness
    resource: file:///home/rektide/tmp-opencode/v4-p2-ignore-parity
    title: disposable E08 experiment area (harness, matrix, oracle, fts probe, results)
    last_modified: 2026-09-05
  - id: donor
    resource: file:///home/rektide/src/opencode-watchman-old
    title: donor worktree (watchman backend, uncommitted proposal context only)
  - id: carrier
    resource: file:///home/rektide/src/opencode-watchman-v2-readd
    title: dirty carrier worktree (v2-readd4 design doc; not accepted behavior)
---

# E08 — Parcel ignore semantics and caller behavior a Watchman backend must preserve

Scope guard: research only. This document records what `@parcel/watcher`
2.5.1 — exactly as driven by canonical OpenCode at `4306c07b` — does with
`ignore` values, and how every current recursive-watcher caller constructs
them. It does not select a Watchman ignore design. All experiments ran on this
Linux host (kernel `7.1.0-debplus.1`, glibc, Node `v26.6.0`) against the
prebuilt inotify binding, through OpenCode's exact wrapper pathway, in
`/home/rektide/tmp-opencode/v4-p2-ignore-parity/`.

## One-sentence answer

A Watchman backend must treat every literal ignore as `path.resolve(L, value)`
— L being the caller-supplied resolved (never realpath'd) root string —
matching paths **equal to or component-below** it by pure byte-string
comparison in the **logical namespace** (the same namespace events are
published in), treat glob ignores as micromatch-compiled (`dot: true`) anchored
full matches against **L-relative POSIX paths**, apply both to files,
directories, and symlinks alike with no existence check, and know that on
Linux today a root whose **final** path component is a symlink never
subscribes at all (inotify `ENOTDIR` → OpenCode ends the subscriber stream),
while a root through **intermediate** symlinks subscribes with every event —
including ignores — resolved against the logical string.

## Caller inventory at 4306c07b (who passes `ignore`, and how)

Recursive `directory` watches — the only kind that carries `ignore`
(`packages/core/src/filesystem/watcher.ts:35-38`):

| # | Caller | file:line | Roots watched | `ignore` passed |
| --- | --- | --- | --- | --- |
| 1 | Config watch reconcile | `packages/core/src/config.ts:250` executing `ConfigWatch.plan` from `packages/core/src/config/watch.ts:25-38` (ignore array at `watch.ts:30`) | `sources.global` (`$XDG ~/.config/opencode`) plus every discovered project `.opencode` directory (`config/discovery.ts:63-70`); paths are the **unresolved logical** strings (`discovery.ts:41-44` builds `path.join`, `fs.resolve` used only for comparisons) | Hardcoded `["node_modules", ".git", "**/{node_modules,.git}/**"]` — two relative literals + one brace-expansion glob |
| 2 | Configured plugin source watch | `packages/core/src/config/plugin/source.ts:55-63` (`watcher.subscribe` at `:60`) | Any absolute configured plugin target that is a directory (may live outside config roots) | none (`ignore` omitted → `[]`) |
| 3 | Skill source watch | `packages/core/src/config/plugin/skill.ts:31-40` (`watcher.subscribe` at `:38`), with `watchDirectory` at `:54-79` | Every skill directory; **realpath'd first**: `fs.realPath(directory)` at `:57`, watch of `resolved` as `directory` plus a `file` watch on the unresolved `target` when they differ (`:59-61`) | none |

Non-recursive context (no Parcel ignores involved): `location-watcher.ts:69`
(`file` watch on `.git/HEAD`), `config/plugin/instruction.ts:52` (`file`),
and Node `fs.watch` for `file`/`entries` inside `watcher.ts:208-222`.

Adjacent ignore surfaces that do **not** reach Parcel:

- User config `watcher.ignore` (`packages/schema/src/config/watcher.ts:5-9`)
  is consumed only by `config/plugin/location-watcher.ts:15-21` into
  `LocationWatcherPolicy`, whose sole consumer
  (`filesystem/location-watcher.ts:60-61`) string-compares aliases to decide
  whether to keep the `.git/HEAD` **file** watch. It never filters recursive
  directory watches.
- `packages/core/src/filesystem/ignore.ts` exports `Ignore.PATTERNS`
  (folder literals + file globs like `**/*.log`); it is referenced only by
  `packages/core/test/filesystem/ignore.test.ts:17`. No production caller at
  this pin.

Construction/transport path for ignores (caller → native):

1. `Watcher.Service.subscribe` resolves the root once:
   `target = path.resolve(input.path)` and `ignore = [...new Set(...)].toSorted()`
   (`watcher.ts:130-131`). Ordering is normalized; the array becomes part of
   the structural `RcMap` key (`watcher.ts:140`).
2. `nativeLayer` routes directories to `subscribeDirectory`
   (`watcher.ts:224`), which copies the array ("aliases the RcMap key") and
   calls `native.subscribe(directory, callback, { ignore: [...ignore], backend })`
   (`watcher.ts:253-255`) where `native = createWrapper(loadBinding())`
   (`watcher.ts:4,18-24`) and `backend = "inotify"` on Linux
   (`watcher.ts:26-30`).
3. The in-repo test layer already emulates the literal rule:
   `path.resolve(input.target, entry)` + `FSUtil.contains` equal-or-under
   check (`watcher.ts:170-178`; `FSUtil.contains` at
   `packages/util/src/fs-util.ts:271-275`).

## Source mechanism (what the installed code actually does)

### Wrapper classification — `wrapper.js` (the exact module OpenCode imports)

`normalizeOptions(dir, opts)` (`@parcel/watcher/wrapper.js:5-39`), with `dir`
already `path.resolve`d in `subscribe` (`wrapper.js:58-60`):

- `isGlob(value)` true → `micromatch.makeRe(value, { dot: true, lookbehinds: false })`
  and the **regex source string** is appended to `opts.ignoreGlobs`
  (`wrapper.js:12-28`). No path resolution is applied to globs.
- otherwise (literal) → `path.resolve(dir, value)` appended to
  `opts.ignorePaths` (`wrapper.js:29-34`). Absolute values win over `dir`;
  `.` collapses to `dir`; `..` escapes; trailing slashes are stripped — all by
  `path.resolve` semantics, before native code ever sees the value.

### Native matching — `Watcher::isIgnored` (`src/Watcher.cc:214-237`)

Given an absolute path string `path` in the watched tree's namespace:

1. **Literals first, unconditionally**: ignored iff `path == literal` or
   `path` starts with `literal + "/"` (component-boundary prefix;
   `Watcher.cc:215-220`). This loop runs before any containment check, so a
   literal can in principle match paths outside the root.
2. If `path` is not under `mDir + "/"`, return not-ignored (`Watcher.cc:222-225`).
3. `relative = path` minus `mDir + "/"`; each glob regex is **full-matched**
   (`std::regex_match`, ECMAScript grammar) against `relative`
   (`Watcher.cc:228-234`, `src/Glob.cc:15-22`).

`mDir` is exactly the string the wrapper resolved — **never** realpath'd
anywhere in the package.

### Linux crawl — `src/unix/legacy.cc` (NOT `fts.cc`; see binding.gyp linux block, `binding.gyp:39-45`)

- Root is opened with plain `open(mDir, O_RDONLY)` — **intermediate symlinks
  and a symlinked final component are both followed here** (`legacy.cc:71-74`).
  Missing root leaves `fd == -1` which passes the buggy `if (fd)` truthiness
  check and dies in `openat` with `EBADF` ("Bad file descriptor").
- All tree paths are built from the **logical** root string:
  `fullPath = dirname + "/" + ent->d_name` starting at `dirname = mDir`
  (`legacy.cc:40,46,54`). Canonical names never appear.
- Children are opened with `O_NOFOLLOW` and classified by `d_type`
  (`legacy.cc:28-29,50-54`): **symlinks are never descended and are recorded
  as non-dir entries**. `EACCES` subdirs are silently skipped
  (`legacy.cc:31-33`).
- `isIgnored(fullPath)` prunes the crawl for ignored entries of any type
  (`legacy.cc:48`).

### Linux events — `src/linux/InotifyBackend.cc`

- Every watched directory (root and crawled/created subdirs) gets
  `inotify_add_watch` with `IN_DONT_FOLLOW | IN_ONLYDIR` in the mask
  (`InotifyBackend.cc:8-11,81-94`). A **symlinked final root component fails
  here with ENOTDIR-class error** ("inotify_add_watch on '<L>' failed: Not a
  directory") even though the crawl had succeeded.
- Event handling builds `path = sub->path + "/" + name` — `sub->path` comes
  from the logically-named tree — and **drops the event entirely before any
  processing** when `isIgnored(path)` (`InotifyBackend.cc:151-163`): no event
  row, no `mEvents` entry, no `tree` update, and for created directories no
  watch registration. Suppression is total.
- Renames: `IN_MOVED_FROM`/`IN_MOVED_TO` produce delete/create rows under
  their respective names; the old wd is erased by exact path match
  (`InotifyBackend.cc:198-206`) but **nested wds keep stale pre-rename
  paths**, so descendants of a renamed watched directory surface under the
  old prefix (live-proven below).
- The callback fires only on post-subscription changes (debounce 50 ms,
  `src/Debounce.hh:9`); there is **no initial snapshot batch**.

## Experiment matrix / results

Harness: `createWrapper(loadBinding())` + `wrapper.subscribe(dir, cb,
{ignore, backend: "inotify"})` on `@parcel/watcher-linux-x64-glibc@2.5.1`,
scratch dirs under `$TMPDIR`, 50 ms debounce with 600–900 ms settles.
Full JSON: `v4-p2-ignore-parity/results/matrix-full.json`; follow-ups inline
below. "—" = suppressed/no row.

| # | Scenario | Ignore | Ops | Observed (verbatim outcome) |
| --- | --- | --- | --- | --- |
| A1 | `lit-rel-dir` | `["node_modules"]` | create/update/delete under ignored dir (pre-existing + new), mkdir under it, control file | only control create; every `node_modules` create/update/delete row absent |
| A2 | `lit-missing-then-created` | `["willappear"]` | ignored path created after subscribe, file written inside | fully suppressed — no existence check ever happens on ignore values |
| A3 | `lit-file` | `["secret.txt"]` | create/update/delete of the file | all three suppressed; sibling `secret.txt2` reported (create+update) |
| A4 | `lit-prefix-boundary` | `["node_modules"]` | `node_modules2/`, `not_node_modules`, `node_modules_extra` | all reported — prefix matches only at `/` boundaries |
| A5 | `lit-abs-inside` | `[<abs L>/vendor]` | write under `vendor` + control | `vendor/**` suppressed; absolute behaves as the relative equivalent |
| A6 | `lit-abs-outside` | `["/tmp/definitely-not-inside-any-root"]` | control write | subscribe fine; inert (events only originate under L) |
| A7 | `lit-dotdot` | `["../sibling-elsewhere"]` | control write | inert (resolve escaped the root) |
| A8 | `lit-root-self` | `["."]` | two writes | **zero events** — the whole tree is under `<L>/` |
| A9 | `lit-trailing-slash` | `["node_modules/"]` | writes under `node_modules` | identical to A1 (slash stripped by resolve) |
| A10 | `lit-case` | `["Node_Modules"]` | writes under `node_modules` | reported, not suppressed — byte-exact comparison on this host |
| A11 | `lit-moved-to-dir` | `["moved"]` | `rename(staging → moved)` then write inside | create side under `moved` suppressed, **but** delete of old name `staging` reported and the later child write surfaced as `staging/inner/f` (stale nested-wd path, not ignored) |
| A12 | `lit-delete-preexisting` | `["goner"]` | `rm -rf` of pre-existing ignored tree | zero rows — never crawled, never watched |
| B1 | `root-symlink` (final component) | `["node_modules"]` | — | **subscribe rejects**: `inotify_add_watch on '<L>' failed: Not a directory` |
| B2 | `root-missing` | — | — | subscribe rejects: `Bad file descriptor` (fd=-1 truthiness bug, `legacy.cc:72-74`) |
| B3 | `root-is-file` | — | — | subscribe rejects: `Not a directory` |
| B4 | `root via intermediate symlink` (`L = …/link/subdir`, `link → real`) | `["node_modules", "**/{node_modules,.git}/**"]` | writes **via canonical** `real/subdir/...` and via `L` | subscribe **succeeds**; every event under the **logical** prefix `<L>/…` regardless of write path; logical literal suppresses `<L>/node_modules/**` even for canonical-path writes |
| B5 | canonical-namespace absolute ignore | `[<abs canonical>/node_modules]` under logical root B4 | write under node_modules | **inert** — `node_modules` create+update flow through, reported as `<L>/node_modules/f.js`: ignores only match in the watched root's namespace |
| C1 | `sym-ignored-name` | `["node_modules"]` | create + delete a symlink **named** `node_modules` | link create/delete suppressed (string match on the link's own path) |
| C2 | `sym-target-events` | `[]` | write via `realdir/x` and via `link/x` | both surface as `realdir/…`; never `link/…` |
| C3 | `sym-outside-target` (target truly outside root) | `[]` | symlink to outside dir; write inside target | link create reported; **no events** from outside target |
| C4 | `sym-nested-chain` (`a/b → c`) | `[]` | write `c/x` and `a/b/y` | only `c/…` paths; never `a/b/…` |
| C5 | `sym-retarget-watched-link` | `[]` | rm + recreate link; write new target | `lnk` delete+create rows; content under real target name |
| D1 | `glob-config-plan` | full Config plan | nested `sub/node_modules`, `sub/.git`, `deep/a/node_modules` writes | all suppressed incl. `deep/a/node_modules/f`; controls (`sub/src/keep.js`, `deep`) reported |
| D2 | `glob-literal-depth-contrast` | `["node_modules"]` (literal only) | `sub/node_modules/f` vs root `node_modules/f` | nested **reported** (literal = one logical path, not a basename); root suppressed |
| D3 | wrapper oracle | Config plan | captured `ignorePaths`/`ignoreGlobs` | literals → `["<L>/node_modules","<L>/.git"]`; glob → single anchored regex matching `node_modules`, `sub/.git`, `deep/a/node_modules`, everything beneath; not `node_modules2`, not `src/index.ts`; absolute glob (`"/abs/**"`) compiles to a regex that can never match a relative path → inert |
| D4 | stepwise mkdir under Config plan | plan | `deep` → `deep/a` → `deep/a/node_modules` with 120 ms gaps | `deep` and `deep/a` reported; `deep/a/node_modules` (dir alone) glob-matched and suppressed |

Corollary observations (recorded because they bound parity expectations):

- **Rapid-create loss**: `mkdir -p deep/a/node_modules` in one burst lost the
  `deep/a` create row entirely (child created before the parent's
  `inotify_add_watch` registration); stepwise creation reported it. Parcel's
  inotify backend has no recrawl/since mechanism; a Watchman backend with
  clock queries will observe **more** creates than Parcel does today.
- **Stale rename paths**: after renaming a *watched* directory, descendants
  keep surfacing under the pre-rename prefix until re-registration
  (`newname/top` reported under the new name because `IN_MOVED_TO` registered
  a fresh wd; `newname/inner/f` surfaced as `srcdir/inner/f`). Ignore
  evaluation in Parcel runs against these possibly-stale logical strings.
- **`before: []` in every scenario**: no initial event batch on subscribe.

## Known / Unknown / Confidence

| ID | Claim | Status |
| --- | --- | --- |
| K1 | Wrapper classification: `is-glob` → compiled regex source; else `path.resolve(L, value)`; `dir` itself only `path.resolve`d, never realpath'd | Known (source `wrapper.js:5-60` + oracle capture D3) |
| K2 | Literal rule: equal or component-boundary-below, byte-exact, case-sensitive on this host, applies to files/dirs/symlinks, no existence check, applies before (and regardless of) root containment | Known (`Watcher.cc:214-220` + A1–A12) |
| K3 | Glob rule: anchored full match of micromatch(`dot:true`) regex against L-relative POSIX path; only paths under L reach glob evaluation; absolute globs inert | Known (`Watcher.cc:222-234`, `Glob.cc:15-22` + D1–D4) |
| K4 | Matching and publishing both happen in the **logical** namespace of the string passed to subscribe; canonical-namespace ignores (absolute or `..`-escaped) are inert; `.` ignores everything | Known (B4/B5/A6–A8 + `legacy.cc:40-54`) |
| K5 | Linux root whose final component is a symlink: crawl succeeds logically but `inotify_add_watch` (IN_DONT_FOLLOW/IN_ONLYDIR) rejects the subscribe; OpenCode maps rejection → `undefined` (`watcher.ts:266-271`) → pubsub shutdown → subscriber stream ends. Missing root and file root also reject | Known (B1–B3 + `InotifyBackend.cc:8-11,67-79` + `watcher.ts:110-118`) |
| K6 | Root through intermediate symlinks subscribes; all events publish under `<L>/…` regardless of the write path's namespace; caller literals resolved against L suppress them | Known (B4 live) |
| K7 | Ignored entries of any type are dropped whole: no rows, no watch registration, no crawl descent, no delete rows on removal; rename into an ignored name suppresses only the new-name side | Known (A1–A4, A11, A12, C1, D1, D4 + `InotifyBackend.cc:161-163`, `legacy.cc:48`) |
| K8 | Symlinks inside the tree: never descended; contents surface only under real (watched) prefixes; the link's own create/delete/(attrib) rows surface under the link path; ignored-basename links suppressed | Known (C1–C5 + `legacy.cc:28-54`) |
| K9 | Caller surface at this pin: only `ConfigWatch.plan` passes ignores (hardcoded trio); plugin-source and skill pass none; skill realpaths roots (watching C as directory + L as file); user `watcher.ignore` never reaches recursive watches; `Ignore.PATTERNS` production-unused | Known (inventory above) |
| K10 | Parcel emits no initial snapshot; rapid creates can be lost; renamed-dir descendants can surface under stale prefixes | Known (live, reproduced) |
| U1 | Non-Linux behavior (FSEvents canonicalization, Windows `WindowsBackend.cc:219` ignore filtering) — not exercised; E08's parity target is this Linux host | Out of scope (noted) |
| U2 | `std::regex` (ECMAScript) vs JS `RegExp` divergence for micromatch sources of pathological patterns (e.g. unicode classes); the Config-plan glob compiles and matches identically (D1/D3/D4 live) | Untested for exotic patterns |
| U3 | Exact errno string for B1 on other kernels (EINVAL/ELOOP variants); outcome (rejection) is what OpenCode consumes | Low-impact residual |
| U4 | Rename of a watched dir **out of the root** (single delete row via MOVED_FROM, MOVE_SELF dropped by `InotifyBackend.cc:190-194`) | Source-derived; not separately live-run |
| U5 | Donor `root.ts:453-481` resolves literals against the **daemon event root** and publishes canonical paths, and drops `..`-escaping literals; carrier `v2-readd4` §Ignore Policy says "literals … enforced against canonical paths" | Recorded as proposals only; K4/K6 are the Parcel facts any such mapping must reconcile — not evaluated for acceptance here |

Confidence: **high** for all K rows — each is pinned to installed-source lines
and reproduced on the actual binding through OpenCode's own wrapper pathway.

## Factual constraints (for the eventual design, not decisions)

1. Literal parity is namespace-coupled: whatever namespace events are
   published in is the namespace literals must be resolved against
   (`path.resolve(L, …)`), or suppression fails exactly as B5 shows.
2. Parcel publishes events under the caller's logical root string; a backend
   publishing canonical paths changes consumer-visible paths whenever L≠C.
3. Literal semantics are "equal-or-below", type-agnostic, existence-free,
   byte-exact, component-boundary; glob semantics are anchored full matches
   of micromatch(`dot:true`) regexes against L-relative POSIX paths.
4. Today no working symlinked-final-component recursive watch exists to
   preserve — the observable contract is subscribe failure (stream end).
   L≠C parity that exists in production is only intermediate-symlink roots
   (B4) and Skill's explicit dual watch.
5. Ignored subtrees produce **zero** rows of any event type, including
   deletion of pre-existing ignored trees.
6. Outside-root, `..`-escaped, and absolute-glob ignore values are inert, not
   errors.
7. Rapid-create coverage in Parcel is weaker than a clock-based backend; and
   stale rename prefixes are real consumer-visible strings ignores may be
   evaluated against.

## Cross-references

- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) — assigned P2/E08 ("What exact Parcel semantics apply to literal ignores across L != C, missing paths, ignored symlinks, and paths outside the root, and how do current callers construct those values?") and marked ignore parity as remaining research.
- [`v2-readd4.gpt56solxh.md`](../../../opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md) (carrier, unaccepted) — §Ignore Policy proposes canonical-namespace literal enforcement and micromatch `{dot:true}` globs against logical-relative paths; constraint 1–2 above are the Parcel facts that proposal must satisfy; its E08 row asked for exactly this matrix.
- [`v2-readd4-e06-expression0.glm53max.md`](v2-readd4-e06-expression0.glm53max.md) — `name`/`dirname` are literal-equality on both daemons (`dirname` depth/empty-string divergence), which bounds any daemon-side literal term a backend might send; donor `root.ts:459-462` builds exactly those terms.
- Donor `packages/core/src/filesystem/watcher/watchman/root.ts:453-481` — the uncommitted proposed ignore mapping (canonical `eventRoot` resolution, wholename/dirname expression, client-side `micromatch.isMatch`), recorded as context under U5.
- [`v2-readd4-e10-symlink-sentinel0.glm53max.md`](v2-readd4-e10-symlink-sentinel0.glm53max.md) (when written) — symlinked-root consumer analysis; B1/K5 here establish the current failure that sentinel work must not regress.
- Harness and raw results: [`/home/rektide/tmp-opencode/v4-p2-ignore-parity/README.md`](file:///home/rektide/tmp-opencode/v4-p2-ignore-parity/README.md) with `results/matrix-full.json`.
