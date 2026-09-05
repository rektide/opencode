---
type: Evidence
title: "E06: expression term capabilities, cookie-name matching at depth, and literal wholename name/dirname — stock Watchman vs Watchwoman"
description: Source-pinned and live-verified expression semantics for true/not/anyof/name/dirname on both daemons, the two divergent cookie-visibility layers, and the literal-match facts that bound server-side traffic reduction; no filtering design chosen.
resource: /.design/watchman/v2-readd/v2-readd4-e06-expression0.glm53max.md
tags: [opencode, watchman, watchwoman, e06, expression, capability, cookie, evidence]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: stock-watchman
    resource: file:///home/rektide/a/facebook/watchman
    title: facebook/watchman checkout (read-only source inspection)
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b (v2026.08.31.00-2-g923b09351, 2026-09-01, clean)
  - id: watchwoman-src
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: radiosilence/watchwoman checkout (read-only source inspection)
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b (v0.7.0-5-ga1e16cb, 2026-08-30) — identical to the installed/running binary per E01
  - id: stock-binary
    resource: file:///usr/local/bin/watchman-facebook
    title: installed stock Watchman fallback binary (actually exercised)
    revision: client 20260708.093114.0, buildinfo 54602bcad27e0887fd26f77c6747a38f0d701fc7
  - id: watchwoman-binary
    resource: file:///usr/local/bin/watchwoman
    title: installed Watchwoman binary (actually exercised)
    revision: watchwoman 0.7.0 @ a1e16cbf (wire version 2026.03.30.00)
  - id: transcripts
    resource: file:///home/rektide/tmp-opencode/v4-n7-expression
    title: isolated-daemon experiment area (client.mjs, scenarios, fixtures, transcripts)
    last_modified: 2026-09-05
  - id: e01
    resource: /.design/watchman/v2-readd/v2-readd4-e01-daemon0.glm53max.md
    title: E01 daemon target identity
  - id: e03
    resource: /.design/watchman/v2-readd/v2-readd4-e03-protocol-ordering0.glm53max.md
    title: E03 protocol ordering
  - id: validation0
    resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
    title: v4 evidence validation and next research wave (N7/E06 assignment)
---

# E06 — expression capabilities, cookie-name matching, literal name/dirname

Scope guard: research only. This document records what each daemon's
expression language supports and what it visibly does; it does not select a
filtering design, a final expression, or any OpenCode behavior. All live
captures used private daemons on private sockets under
`/home/rektide/tmp-opencode/v4-n7-expression/`; the active systemd watchman
service was never contacted, and no `watch-project`/`watch-del` was sent.

## One-sentence answer

On both daemons `true`, `not`, `anyof`, `name`, and `dirname` are core terms
whose only capability requirement is the always-registered `term-<name>`
capability (live-verified via `version` with `required`), but `name` is
**literal string equality, not glob**, so `["name", ".watchman-cookie-*"]`
matches **nothing on either daemon at any depth** — and cookie visibility
diverges underneath the expression layer: stock Watchman hides only its own
per-process `.watchman-cookie-<hostname>-<pid>-*` cookies (foreign
cookie-named files **are** matched by literal `name` at root and arbitrary
nested depth), while Watchwoman strips **every** basename starting with
`.watchman-cookie-` from all query and subscription results *before*
expression evaluation, so no cookie-named file can ever match any expression
there.

## Source/revision matrix

| Source | Path | Revision | Role |
| --- | --- | --- | --- |
| Stock Watchman source | `/home/rektide/a/facebook/watchman` | `923b0935…` (`v2026.08.31.00-2-g923b09351`) | source reading (term registration, parsers, cookie guard) |
| Watchwoman source | `/home/rektide/a/radiosilence/watchwoman` | `a1e16cbf…` (`v0.7.0-5-ga1e16cb`) | source reading (expr parser, query runner, capabilities) |
| Stock binary exercised | `/usr/local/bin/watchman-facebook` | `20260708.093114.0` (buildinfo `54602bcad27e…`) | all stock live transcripts (July 8 build; E01 noted source≠binary for stock) |
| Watchwoman binary exercised | `/usr/local/bin/watchwoman` → archive `target/release/watchwoman` | `a1e16cbf`, sha256-equal to running process per E01 | all Watchwoman live transcripts |
| Isolation | `--sockname`, `--test-state-dir`, private config | `stock/test-config.json` sets `min_acceptable_nice_value: 19` (the daemon refuses nice 5, `watchman/main.cpp:87-107`) | no shared state with any other daemon |

## Capability registration (source)

### Stock Watchman @ 923b093

- Every parser in the fixed 19-entry table
  (`watchman/query/TermRegistry.h:22-41`: allof, anyof, dirname, empty,
  exists, false, idirname, imatch, iname, ipcre, match, name, not, pcre,
  since, size, suffix, true, type) is registered as capability `term-<name>`
  by a static initializer (`watchman/query/TermRegistry.cpp:30-38`), so the
  capability exists whenever the daemon runs — for these five terms there is
  **no conditional registration**.
- One caveat in the registration design: a parser slot may be `nullptr`
  (`W_TERM_PARSER_UNSUPPORTED`, `TermRegistry.h:53-54`) while its capability
  is still registered — the only current case is pcre/ipcre without PCRE
  support (`watchman/query/pcre.cpp:172-178`); parsing then throws
  `unsupported expression term` rather than `unknown` (`TermRegistry.cpp:44-53`).
  On the exercised July binary `term-pcre` is genuinely backed (live probe
  below), but capability presence alone cannot prove parser presence for
  pcre-class terms.
- `version` takes an optional object with `required` and `optional`
  capability arrays, answers a `capabilities` map of booleans for exactly the
  probed names, and sets `error` (without failing the PDU) when a required
  capability is missing (`watchman/cmds/info.cpp:30-95`, message
  `client required capabilities [x, y] not supported by this server`).
  `list-capabilities` returns the full set
  (`watchman/cmds/list-capabilities.cpp` / `CommandRegistry.cpp:116-126`).

### Watchwoman @ a1e16cbf

- A single static `CAPABILITIES` array
  (`crates/watchwoman/src/commands/info.rs:9-105`) advertises the same
  `term-*` names (all 19, including `term-pcre`/`term-ipcre`, which are
  backed by the Rust `regex` crate), plus `cmd-*`, `field-*`, generator, and
  `wildmatch`/`wildmatch-multislash` entries; `list-capabilities` appends the
  platform watcher capability `watcher-inotify`
  (`info.rs:168-173`; the real watcher here is inotify).
- `version` mirrors stock's contract: object arg with `required`/`optional`,
  per-name boolean map in `capabilities`, error string
  ``required capability `X` is not supported`` (`info.rs:129-166`). A bare
  `version` returns only `{version, buildinfo}` on both daemons.

### `version` capability queries (live transcripts)

`["version", {"required": ["term-true","term-not","term-anyof","term-allof","term-name","term-iname","term-dirname","term-idirname","term-match","wildmatch"]}]`:

- **Watchwoman** (`ww/run/transcript.jsonl:2`): all ten `true`; response also
  carries `version: "2026.03.30.00"`, `buildinfo: "watchwoman 0.7.0"`.
- **Stock** (`stock/run/transcript.jsonl:2`): all ten `true`; `version:
  "20260708.093114.0"`, `buildinfo: "54602bcad27e0887fd26f77c6747a38f0d701fc7"`.

`["version", {"required": ["term-e06-nope"]}]`:

- Watchwoman: `{"capabilities": {"term-e06-nope": false}, "error": "required capability `term-e06-nope` is not supported"}`.
- Stock: `{"capabilities": {"term-e06-nope": false}, "error": "client required capabilities [term-e06-nope] not supported by this server"}`.

Legacy-key probe `["version", {"required_capabilities": ["term-name"]}]`:
**silently ignored by both** daemons (response has no `capabilities` key and
no error) — an old-style capability probe would misread both servers as
supporting anything.

## The question: `["name", ".watchman-cookie-*"]` at root and nested depth

Two independent layers make the answer "no match, at any depth, on either
daemon", for different reasons that compound:

1. **`name` is literal equality on both daemons.** Stock `NameExpr::evaluate`
   compares the (optionally lower-cased) basename or wholename against the
   operand(s) with string equality / set lookup
   (`watchman/query/name.cpp:33-66`); the docs state "exact matches"
   (`website/docs/expr/name.md`). Watchwoman `match_name` is the same
   equality check (`crates/watchwoman/src/query/expr.rs:338-351`). The `*` in
   `.watchman-cookie-*` is a literal character; no file has that basename, so
   the term matches nothing, ever. Live proof on stock: literal
   `["name", ".watchman-cookie-000000"]` **returns** the root cookie-named
   fixture file, while `["name", ".watchman-cookie-*"]` returns `[]` even
   though six cookie-named files exist in the tree
   (`stock/run/transcript.jsonl` labels `q-name-cookie-literal-root` vs
   `q-name-cookie-star` vs `q-match-cookie-star`).
2. **Cookie visibility differs underneath the expression.**
   - Stock hides only its **own** cookies: the cookie prefix is per-process
     (`kCookiePrefix + hostname + "-" + pid + "-"`,
     `watchman/CookieSync.cpp:21-35`, `watchman/Cookie.h:15`), and the io
     thread drops those — "Never allow cookie files to show up in the tree" —
     while explicitly *reporting* cookies created by other processes on the
     same watch (`watchman/root/iothread.cpp:366-421`, the four-kinds
     comment: case 3 "we report these"). Live-proven: all six foreign
     `.watchman-cookie-*` fixture files (root, `sub/`, `sub/deep/`, and both
     notify- and crawl-admitted) appear in query results
     (`stock/run/transcript2.jsonl` `q-match-all-cookies` = 6 entries), while
     the daemon's own `.watchman-cookie-workhorse…-<pid>-N` cookies never do
     (they appear only in the query response's `debug.cookie_files`).
   - Watchwoman strips **any** basename starting with `.watchman-cookie-`
     from every result row, in `query::run`, before generators, SCM filters,
     and expression evaluation (`crates/watchwoman/src/query/run.rs:118-126`,
     comment: "If some other watchman-compatible client wrote cookies into
     our tree, hide them for parity"). Both `query` and the subscription push
     loop run through `query::run` (`commands/query.rs:23-25`,
     `commands/subscribe.rs:28-29` and `:122-129`), so the strip applies to
     subscription PDUs too. Live-proven three ways
     (`ww/run/transcript*.jsonl`): `["match", ".watchman-cookie-*",
     "basename"]` returns `[]` while cookie files exist on disk; a
     subscription with expression `["true"]` that writes only a
     `.watchman-cookie-777777` file produces **no PDU** (tick fires, result
     is empty after strip, empty non-fresh results are suppressed); literal
     `["name", ".watchman-cookie-777777"]` after the write returns `[]`.

So: literal basename `name` **does** match at root and arbitrary nested depth
for ordinary files on both daemons (stock and Watchwoman both returned
`target.txt` from root, `sub/`, `sub/deep/`, and `sub2/` — 3 depths — under
`["name", "target.txt"]`), and on stock the same is true for **foreign**
cookie-named files (`q-name-cookie-list` returned root, `sub/`, and
`sub/deep/` cookies). On Watchwoman no cookie-named file is matchable by any
expression at any depth. The `*` form matches nothing on either daemon.

Glob matching exists as a separate fact of the surface (recorded, not
proposed): `["match", ".watchman-cookie-*", "basename"]` parses and works on
both daemons (`term-match` + `wildmatch` capabilities verified true on both;
stock `watchman/query/match.cpp:224-225`, Watchwoman `expr.rs:136-156` via
`globset`), and on stock it is the only expression term that can see foreign
cookie-named basenames at depth.

## Exact-expression transcripts (query battery, both daemons)

Fixture (identical shape per daemon):

```
.watchman-cookie-000000, regular-root.txt, target.txt
sub/{target.txt, inner.txt, .watchman-cookie-111111, deep/{target.txt, .watchman-cookie-222222}}
sub2/{target.txt, other.txt}
```

All rows are `["query", <root>, {"expression": E, "fields": ["name"]}]`.
"files" lists the returned `name` values (cookies visible = foreign ones
only; each stock response additionally carries `debug.cookie_files` with the
daemon's own just-synced cookie — one own-cookie write per query, unlinked
afterwards; Watchwoman writes no cookie files at all).

| Label / expression | Watchwoman `a1e16cbf` files | Stock `20260708` files |
| --- | --- | --- |
| `q-true` `["true"]` | 10: all files+dirs, **no cookies** | 12: all files+dirs incl. **3 foreign cookies** |
| `q-name-cookie-literal-root` `["name",".watchman-cookie-000000"]` | `[]` | `[".watchman-cookie-000000"]` |
| `q-name-cookie-star` `["name",".watchman-cookie-*"]` | `[]` | `[]` (literal `*`) |
| `q-name-cookie-list` `["name",[…3 cookies…]]` | `[]` | all 3, at root/`sub/`/`sub/deep/` |
| `q-match-cookie-star` `["match",".watchman-cookie-*","basename"]` | `[]` | all 3 foreign cookies |
| `q-name-target-basename` `["name","target.txt"]` | 4 (root, `sub/`, `sub/deep/`, `sub2/`) | 4 (same set) |
| `q-name-target-wholename` `["name","target.txt","wholename"]` | `["target.txt"]` | `["target.txt"]` |
| `q-name-nested-wholename` `["name","sub/target.txt","wholename"]` | `["sub/target.txt"]` | `["sub/target.txt"]` |
| `q-name-list` `["name",["target.txt","inner.txt"]]` | 5 | 5 |
| `q-name-upper` `["name","TARGET.TXT"]` | `[]` (case-sensitive default) | `[]` |
| `q-iname-upper` `["iname","TARGET.TXT"]` | 4 | 4 |
| `q-dirname-empty` `["dirname",""]` | **root-level entries only** (`sub`, `sub2`, 2 root files) | **everything**, all depths |
| `q-dirname-empty-depth0` `["dirname","",["depth","eq",0]]` | same as above (depth **ignored**) | root-level only (depth honored) |
| `q-dirname-sub` `["dirname","sub"]` | `sub` descendants at all depths, no `sub` itself, no `sub2` | same, **plus** `sub`'s foreign cookies |
| `q-dirname-sub-depth1` `["dirname","sub",["depth","eq",1]]` | identical to `q-dirname-sub` (ignored) | depth-1-below-`sub` only (`sub/deep/*`) |
| `q-dirname-sub-depth2` `["dirname","sub",["depth","eq",2]]` | identical (ignored) | `[]` (nothing at that depth) |
| `q-dirname-deep` `["dirname","sub/deep"]` | `["sub/deep/target.txt"]` | `sub/deep/target.txt` + its cookie |
| `q-dirname-sub2` `["dirname","sub2"]` | `sub2/target.txt`, `sub2/other.txt` | same |
| `q-not-name-target` `["not",["name","target.txt"]]` | 6 (everything except the 4 targets, dirs included) | 8 (same, plus visible cookies) |
| `q-not-true` `["not",["true"]]` | `[]` | `[]` |
| `q-anyof` `["anyof",["name","inner.txt"],["dirname","sub2"]]` | `sub/inner.txt` + both `sub2` files | same |
| `q-allof` `["allof",["dirname","sub"],["name","target.txt"]]` | `sub/target.txt`, `sub/deep/target.txt` | same |
| `q-match-target-star` `["match","tar*","basename"]` | 4 | 4 |
| `q-true-bare-string` `"true"` (bare string) | all (as `q-true`) | all (as `q-true`) |

Depth convention (stock, `dirname.cpp:69-76`): depth is counted **below the
dirname operand** — direct children of `sub` are depth 0; `["dirname","sub"]`
defaults to `["depth","ge",0]` = unbounded descendants. Watchwoman's
`match_dirname` is parent-equality-or-prefix (`expr.rs:353-367`) with **no
depth support**; the third argument is parsed away and ignored
(`expr.rs:216-227` reads only `rest[0]`).

### Subscription streaming transcripts

`["subscribe", root, "e06", {"expression": ["name","watchme.txt"], "fields":["name"]}]`
then writes of `watchme.txt` (root, `sub/`, `sub2/`), `other.txt`, and two
cookie-named files:

- **Watchwoman** (`ww/run/transcript.jsonl:120-137`): merged ack (initial
  `files: []`); one unilateral PDU `files: ["watchme.txt","sub/watchme.txt",
  "sub2/watchme.txt"]` — basename match across depths, non-matching
  `other.txt` excluded; cookie writes produced no PDU.
- **Stock** (`stock/run/transcript.jsonl` tail): ack, then initial
  unilateral PDU (`is_fresh_instance: true`, `files: []`), then one settle
  PDU with the same three `watchme.txt` names across depths, `since` echoed;
  `other.txt` and both cookie writes produced no PDU (in this run the cookies
  were excluded by the expression; stock's cookie admission itself is proven
  by the query battery and run 2).

Both daemons therefore apply the subscription expression **server-side** and
suppress empty non-fresh result PDUs (stock `cmds/subscribe.cpp:269-277` per
E03; Watchwoman `subscribe.rs:132-134`), so expression filtering removes
non-matching rows and whole batches — the factual basis for traffic
reduction. Cookie traffic needs no expression on Watchwoman (stripped
unconditionally) and cannot be addressed by literal `name` on stock (literal
`*` matches nothing); the only stock expression term that can select
foreign cookie basenames at depth is the glob `match` family.

## Literal wholename `name`/`dirname` facts (traffic-reduction bounds)

Facts only — they bound what literal terms can and cannot do:

- Literal `name` basename scope matches the same basename at **every depth**
  (root through arbitrarily nested, live-proven at 3 depths on both
  daemons). It cannot express "root only" or any depth bound.
- Literal `name` wholename scope matches **exactly one** root-relative path
  (`sub/target.txt` ≠ `target.txt` ≠ `sub/deep/target.txt`); multiple
  alternatives via the array form (both daemons).
- Literal `dirname` matches a directory subtree at **unbounded depth**
  (`sub` itself never matches — only its descendants — but descendant
  *directory* entries such as `sub/deep` do, on both daemons), with
  sibling-prefix safety (`sub` does not capture `sub2`) on both daemons.
- Root-level restriction: `["dirname",""]` is **root-level only on
  Watchwoman** but **matches everything on stock** unless stock's depth
  operand is supplied (`["dirname","",["depth","eq",0]]`). This is the
  sharpest semantic divergence between the daemons found in this study.
- Depth bounding exists **only on stock** (`["dirname", d, ["depth", op, n]]`,
  0 = direct children); Watchwoman parses and ignores the operand.
- Neither literal `name` nor `dirname` supports wildcards, prefixes, or
  case-folding; those live in `match`/`imatch` (+`wildmatch` capability),
  `pcre`/`ipcre`, and `iname`/`idirname` — all advertised and live-verified
  true on both daemons for the probed subset (`term-match`, `wildmatch`,
  `term-iname`, `term-idirname`; `term-pcre` verified working on the stock
  July binary by `q-pcre-target` returning the 4 targets, and implemented by
  the `regex` crate in Watchwoman).
- Directory entries flow through expressions on both daemons (`["true"]`
  returned `sub`, `sub2`, `sub/deep` on both; Watchwoman's
  `always_include_directories` defaults true, `run.rs:69-72,88-94`).

## Unsupported / error / ignored differences

| Input | Stock `20260708` | Watchwoman `a1e16cbf` |
| --- | --- | --- |
| `["not"]` | error: `watchman::QueryParseError: failed to parse query: must use ["not", expr]` | error: `bad args: \`not\` requires an operand` |
| `["not", e, "surplus"]` | **error** (arity must be exactly 2, `base.cpp:36-45`) | **accepted**, surplus ignored (`expr.rs:119-124` uses `rest.first()`) |
| `"not"` bare string | error (QueryParseError) | error (`unknown bare expression \`not\``) |
| `["anyof"]` empty | **error** (`must use ["anyof", expr...]`, `base.cpp:187-193`) | **accepted, evaluates false** → empty result |
| `["allof"]` empty | **error** | **accepted, vacuously true** → returns the entire tree (live: all 10 rows) |
| `["bogus"]` | error: `unknown expression term 'bogus'` | error: `unknown expression operator \`bogus\`` |
| `["name"]` no args | error PDU with raw `std::out_of_range: vector::_M_range_check` (name.cpp:98 indexes `term.at(1)` unchecked) | clean error: `\`name\` requires at least a name` |
| `["name","a","basename","surplus"]` | **error** (`Invalid number of arguments`) | **accepted**, surplus ignored |
| `["name","a","bogus"]` | error (`Invalid scope 'bogus' for name expression`) | error (`unknown scope \`bogus\` (use basename or wholename)`) |
| `["dirname"]` / `["dirname",42]` | error (`Invalid number of arguments`) / not run (int arg) | clean bad-args errors (`\`dirname\` requires a path`) |
| `version` legacy `required_capabilities` key | silently ignored | silently ignored |
| unknown daemon behavior | Watchwoman's parser doc-comment promises unknown operators become `False` (`expr.rs:1-6`) but the implementation **errors** (`expr.rs:228-232`) — comment is stale | (same cell: stock has no such promise) |

Response-shape notes: both return error PDUs keyed `error` with a `version`
key and never fail the connection; stock errors carry the
`watchman::QueryParseError: failed to parse query:` prefix, Watchwoman's the
`bad args:` prefix. Stock query responses include `debug.cookie_files` (its
own per-query sync cookie); Watchwoman query responses instead include
`root`.

## Minimal factual capability set per daemon

For the five studied terms, the required capability set is identical and
minimal on both daemons, and all are live-verified:

| Term | Stock capability | Watchwoman capability | Extra needs |
| --- | --- | --- | --- |
| `["true"]` | `term-true` | `term-true` | none |
| `["not", e]` | `term-not` | `term-not` | none |
| `["anyof", e…]` | `term-anyof` | `term-anyof` | none |
| `["name", s\|[s…], scope?]` | `term-name` (+`term-iname`) | `term-name` (+`term-iname`) | none |
| `["dirname", d, depth?]` | `term-dirname` (+`term-idirname`) | `term-dirname` (+`term-idirname`) | none; depth honored only by stock |

Both daemons also advertise and honor `term-match` + `wildmatch` for glob
basename/wholename matching — factually the only stock-side term able to
select foreign cookie-named basenames, and equivalent to Watchwoman's
(globset) though its matches never include cookie-named files.

## Known / Unknown / confidence

| ID | Claim | Status |
| --- | --- | --- |
| K1 | `true`/`not`/`anyof`/`name`/`dirname` parse and evaluate on both daemons; capability probes all-true; error/bogus shapes captured | Known (source + live, both daemons) |
| K2 | `name` is literal equality on both; `["name",".watchman-cookie-*"]` matches nothing anywhere | Known (source lines + live contrast probes) |
| K3 | Stock hides only its own `.watchman-cookie-<host>-<pid>-*` cookies; foreign cookie-named files are query/subscription-visible at all depths, via both crawl and notify admission | Known (source `CookieSync.cpp:21-35`, `iothread.cpp:366-421` + live runs 1–2) |
| K4 | Watchwoman strips all `.watchman-cookie-*` basenames from every result row pre-expression, in queries and subscription pushes | Known (source `run.rs:118-126`, `subscribe.rs:122-129` + live runs 1–2, incl. `["true"]`-subscription no-PDU probe) |
| K5 | `["dirname",""]` = root-only on Watchwoman, everything on stock; depth operand honored only by stock; empty `anyof`=false/`allof`=true only on Watchwoman; surplus-argument leniency only on Watchwoman; `["name"]` crashes into a raw `std::out_of_range` error PDU on stock | Known (source + live) |
| K6 | Literal basename `name` and literal `dirname` match at arbitrary depth; wholename `name` is exact single-path; both daemons filter subscriptions server-side and suppress empty non-fresh PDUs | Known (live) |
| U1 | Stock source-vs-binary drift: all stock live evidence is from the July 8 binary (`20260708.093114.0`), while line citations are the Aug 31 checkout `923b0935`; the cookie-guard and name/dirname code predates July per git (`-S` pickaxe: last touched 2026-02-17), so readings align, but any behavior that changed between July and Aug cannot be excluded without a stock build of `923b0935` (also E03's N6) | Partially mitigated; untested revision gap |
| U2 | Watchwoman `match` glob details (e.g. `**`, character classes) and stock wildmatch flag differences at edge patterns | Not probed beyond `.watchman-cookie-*`/`tar*`; no divergence observed on probed patterns |
| U3 | `relative_root` interaction with `name`/`dirname` operands (Watchwoman evaluates on the stripped display path, `run.rs:133-140`; stock strips in result rendering) | Source-read only, not live-probed |
| U4 | `case_sensitive` spec key interplay (`name` case behavior derives from it on both) | Default (true on Linux) verified live; explicit override not probed |

Confidence: **high** for everything marked Known — each claim is pinned to
source lines at the exact revisions and reproduced on the actual binaries
with full transcripts. The stock July-binary/Aug-source revision gap (U1) is
the main residual risk and is owned by N6/E03 follow-up.

Side qualification for E01 (observed while isolating the daemon): the
deployed Watchwoman `a1e16cbf` source contains **no consumer of
`WATCHMAN_CONFIG_FILE`** — only per-root `.watchmanconfig` `ignore_dirs`
(`daemon/watcher.rs:241-256`) and env `WATCHWOMAN_STALE_IDLE_SECS`
(`daemon/gc.rs:62-66`) are read — so the `root_policy`/`max_files_per_root`
in `/opt/watchwoman-git/etc/watchwoman.json` are inert for this binary,
qualifying E01's "root-admission policy" row. (Possibly written for a newer
local branch; not investigated further.)

## Transcripts and artifacts

- `/home/rektide/tmp-opencode/v4-n7-expression/README.md` — experiment area
  description, safety notes, reproduction commands.
- `ww/run/transcript.jsonl`, `stock/run/transcript.jsonl` — full run 1:
  capability probes, 27-case query battery, error battery, subscription
  streaming (every socket line, both directions, millisecond timestamps).
- `ww/run/transcript2.jsonl`, `stock/run/transcript2.jsonl` — cookie
  admission/visibility follow-ups and stock `term-pcre` probe.
- `client.mjs`, `scenario.json`, `scenario-ww2.json`, `scenario-stock2.json`,
  `fixture.sh`, `stock/test-config.json` — exact harness used.

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — N7/E06 assignment ("Which expression terms require capabilities on both daemons, and does the cookie `name` term match basenames at root and nested depth?") answered by this document.
- [`v2-readd4-e01-daemon0.glm53max.md`](v2-readd4-e01-daemon0.glm53max.md) — binary identities, socket precedence, and stock fallback provenance used here; its root-admission-policy row is qualified above.
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — subscription PDU shapes, empty-result suppression, and the merged-ack divergence that the subscription transcripts here reuse; N6's stock-live baseline would also close U1.
- Watchwoman [`docs/PROTOCOL.md`](file:///home/rektide/a/radiosilence/watchwoman/docs/PROTOCOL.md) — documents the expression operator list and advertised capabilities consistent with code and transcripts (its stale parser-leniency comment is noted in the differences table).
