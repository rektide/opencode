---
type: Analysis
title: Jujutsu VCS support — local WIP vs upstream jj-vcs-plugin (revision 2)
description: Concern-by-concern comparison of our jj-vcs stack against Shoubhit Dash's upstream line, now with an explicit stance column encoding user judgements, an integrated danger catalog, the plugin-detection causality chain, the ID-space analysis, and the ideal detection flow; reflects the 2026-09-02 fixes (filesystem-only resolve, snapshot discipline, bookmark+distance labels).
resource: design/jj-vcs/jj-vcs2.glm53.md
tags: [vcs, jujutsu, project-root, upstream-comparison]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T08:30:00Z }
verified: { by: unassigned, at: never }
stale_after: 2026-09-16
sources:
  - id: local-stack
    resource: jj-vcs bookmark @ fd3eadd2 (14 commits on c29968bf0850)
    title: Local jj-vcs WIP (rektide), including 2026-09-02 fixes 0b2dc399 + fd3eadd2
  - id: upstream-jj-line
    resource: https://github.com/anomalyco/opencode/commits/jj-vcs-plugin
    title: anomalyco/opencode jj-vcs-plugin branch (bee852b5 → 46465000 → 4eaf533c → cc7d4ebb)
    author: Shoubhit Dash
    last_modified: 2026-08-26
  - id: probes
    resource: .test-agent/jj-flow-probe/probe.sh
    title: jj 0.40 on-disk layout probe grounding the filesystem-only resolve
---

# Jujutsu VCS support: ours vs upstream — revision 2

## What changed since revision 1

Revision 1 ([`jj-vcs.glm53.md`](jj-vcs.glm53.md)) compared a subprocess-heavy
local stack against upstream's fs-only line and recommended upstream-first.
Two local commits landed the same day to close the worst gaps, and this
revision re-scores everything:

- **`0b2dc399` fix(core): resolve jujutsu roots from the filesystem without
  jj invocations** — `jjDiscover` now reads `.jj/repo`, its pointer files,
  and the store layout directly (grounded in
  [`jj-flow-probe`](../../.test-agent/jj-flow-probe/README.md), jj 0.40).
  Known projects resolve with **zero subprocesses**; fresh projects run one
  `git remote get-url` against the backing store. Identity is cache-first
  and never churns when a remote appears.
- **`fd3eadd2` fix(core): skip working-copy snapshots on jujutsu metadata
  commands** — metadata invocations (`trunk`, `conflicts`, workspace and
  copy listings) pass `--ignore-working-copy`; diff/status/info-identity
  stay live by design. The label fallback now shows the **nearest ancestor
  bookmark plus commit distance** (`main+5`) instead of a change-id prefix.

This revision also folds in the standalone danger catalog (dropped as a
separate file) and adds a **Stance** column recording the user's judgements
alongside the facts, per the 2026-09-02 direction discussion.

## The two stacks

| | Ours (`jj-vcs` @ `fd3eadd2`) | Upstream (`jj-vcs-plugin` @ `cc7d4ebb`) |
| --- | --- | --- |
| Shape | 14 commits on `c29968bf0850` (~5 weeks old base) | jj commits `bee852b5`+`46465000`, then declarative markers `4eaf533c` + jj adoption `cc7d4ebb` on `0f7a76ef` (~1 week old base) |
| Merged into `v2@origin`/`dev@origin` | no | no (verified 2026-09-02; active initiative — `nxl/vcs-plugin-api`, `vcs-branch-metadata`, `fix-vcs-diffs` beside it) |
| Detection | filesystem-only as of today (marker walk → `.jj/repo` pointer → `store/git_target`/`store/git`) | filesystem-only since `bee852b5` (marker walk → pointer → `dirname²` canonical) |
| Identity | remote-derived when known, else cached, else store hash — **one ID space with git projects** | git projects: remote/root-commit IDs; standalone jj: `jj-repository:<store>` hash — **separate spaces** |
| Surface | jj adapter (conflicts, labels, review mode), jj-workspace project copies, TUI labels | plugin-registered adapter (bookmarks, trunk detection), no copies, no labels |

## Comparison with stance

Facts in the middle columns; the **Stance** column records our judgement
(2026-09-02 user direction), so future readers see not just what differs but
what we think it's worth.

| Concern | Ours | Upstream | Stance |
| --- | --- | --- | --- |
| Project-root recognition (the original bug) | Marker walk + `.jj/repo`/`store` layout reads; workspaces, colocated, nested repos all resolve; dangling pointer degrades to git/directory | Same mechanics, arrived at first | Solved on both; parity |
| jj invocations during resolve | **Zero** (was 3–4 `jj` + 1 `git` before `0b2dc399`); one `git remote get-url` only on cache miss | Zero jj; git subprocesses only where `.git` exists | Sucked, now fixed; see flow graph |
| jj binary dependency for detection | None | None | Parity as of today |
| Colocated jj+git | jj-first: `vcs: "jj"` with git remote-derived ID; reclassification tested | git-first: `vcs: "git"` + `vcsBackend: "jj"` string | Prefer jj-first — it matches how we actually work (jj is the mandated VCS); revisit only if adopting their plugin shape wholesale |
| **ID space** | Unified with git: colocated caches under `<root>/.git` (the git `commonDirectory`), so a git project and its jj re-resolution are **the same project**; non-colocated workspaces share the backing store's ID | Standalone jj hashed as `jj-repository:<store>`, cached under the jj store — disjoint from git IDs; gaining a remote or colocating changes identity | **The main reason we keep ours.** Project/session continuity across VCS transitions is worth more than upstream's simpler never-probes-remote rule |
| Canonical root | `dirname(dirname(resolved .jj/repo))` — adopted from upstream | Same derivation | Theirs was strong and good; we adopted it. Both are layout-coupled — the live workspace tests are the safety net |
| Workspace membership | Pointer-trust (adopted): a forgotten workspace still resolves through its pointer | Pointer-trust always | Dumb fault mode; don't care, documented (test renamed "documented edge") |
| Working-copy snapshot discipline | Metadata commands pass `--ignore-working-copy` (`fd3eadd2`); diff/status/info-identity deliberately live | Same discipline since `bee852b5` | Parity as of today; policy: metadata never mutates `@`, working-copy views stay live |
| VCS adapter capability | Conflicts surfaced, workspace/change/commit identity, review-vs-trunk diff, directory-scoped paths; labels `bookmark` / `main+5` / change-id | Bookmark listing, trunk detection, plugin registry registration; no conflicts/labels/scoping | Ours is the richer daily-driver adapter; theirs has the better extension seam |
| Project copies | Full `jj_workspace` strategy (create/remove/list via `jj workspace add`/`forget`), metadata rows, protocol + server + TUI | None — jj projects get `strategy: undefined` | **Keep — the one real feature** (user-impact verdict); rebuild on whatever substrate wins |
| Working-copy labels | `dir:label` prefix + footer; label = first local bookmark, else `main+5`, else change-id | None (bookmark-only label arrives free with their plugin) | Thin, but the `+N` distance upgrade makes it honest; rebuild last |
| Extension architecture | Hardcoded `Vcs` literals (see below) | Declarative markers: plugins declare `{id, markers}`, open validated string type, third-party VCS support with zero core changes | **Kind of badass — agreed.** Not impactful for us today; migrate when it merges upstream |
| Unmerged-API status | n/a | Nothing merged into v2/dev as of 2026-09-02; tip is a conflict-snapshot merge, author mid-refactor | Don't mind — port the two original commits now, adopt the marker system at merge time |
| Detection executing plugin code | n/a | `ProjectMarkers.discover` loads plugin modules during resolve; npm-backed plugins touch the network (see causality) | Notable, not scary — cool, even; causality documented below so it's a known quantity |
| Stale `.jj` in a colocated repo | Degrades to the git project (tested) | Sets `vcsBackend: "jj"` from marker presence; jj plugin activates and VCS ops fail where git worked | Dumb fault mode; documented here and in the dangers table; not a blocker |
| Test coverage | Live suites for pure-jj identity, colocated preference, reclassification, nested separation, forgotten-workspace edge, damaged-colocated fallback, adapter scoping, labels, copies | Live suites incl. hg, both nested-precedence directions, plugin-marker discovery without any VCS binary | Parity for detection; theirs tests more VCS *kinds*, ours tests more jj *behaviors* |
| Freshness / carry cost | 14 commits on an old base; detection now shape-compatible with upstream's (see carry tiers) | ~1-week-old base; expect the final merged shape to differ from the branch tip | Manageable — see "what our patches cost to carry" |

## Danger catalog (integrated)

Both sides' dangers, one line each — full reasoning lived in the dropped
`upstream-danger0.glm53.md` and is preserved here in compressed form.

| Danger | Side | Status after 2026-09-02 fixes | Mitigation |
| --- | --- | --- | --- |
| Unmerged API bet: marker shape may change before landing | theirs | open — accepted stance | port only `bee852b5`+`46465000`; adopt markers at merge |
| Plugin module load + `npm.add(refresh: true)` inside `Project.resolve`; config `mtime` re-triggers | theirs | open (accepted: cool, known) | none at port scope; propose scan/load caching upstream |
| Marker declarations last-wins, no collision detection — a plugin can redeclare `.git`/`.jj` | theirs | open, low today | propose reserved-builtin-markers patch if we adopt markers |
| `vcsBackend: "jj"` set from marker presence despite failed jj discovery | theirs | open, dismissed as dumb fault mode | documented; one-line upstream fix (gate on discovery success) |
| Standalone-jj identity disjoint from git identity | theirs | open — **the blocker concern**; precisely: not a flip but a permanent fork — standalone jj never consults the remote, so jj and git views of one repo stay two projects | keep our identity layer (that is the plan) |
| Remote-add re-IDs git/colocated projects (remote-first ordering) | both (stock) | by-design flip to remote ID; new row, old row orphaned until cleanup | accepted — test-pinned stock behavior ("prefers normalized origin over root commit"); our jj-typed path is cache-first and does not flip |
| Canonical `dirname²(store)` couples to jj on-disk layout | both (we adopted it) | open, guarded | live workspace/canonical tests convert silent breakage into freshen-time failures |
| Detection mutates `@` via auto-snapshot | ours | **fixed** (`fd3eadd2`) | metadata commands carry `--ignore-working-copy` |
| Detection spawns 3–4 subprocesses per resolve | ours | **fixed** (`0b2dc399`) | zero jj calls; one git call on cache miss |
| `jjDiscover` swallowed lock failures → silent `directory:` demotion | ours | **fixed structurally** — no jj calls left to fail; fs reads fail loudly into the git/directory fallback | covered by damaged-colocated test |
| Forgotten workspace still claims identity | both | open by pointer-trust (accepted) | documented edge; `jj workspace forget` should be followed by directory cleanup |
| jj projects get no copy strategy | theirs | open (feature gap) | our copies layer rebuilds on top |

## Plugin-detection causality (theirs, made concrete)

Wanted: how exactly plugin code execution ends up inside project-root
detection, and when npm is involved. The chain, per `markers.ts` at
`cc7d4ebb`:

1. `Project.resolve(dir)` calls `ProjectMarkers.discover(dir)` — every
   resolve, every project open/refresh.
2. `discover` walks up for `.opencode` / `opencode.json(c)` from `dir` plus
   the global config dir, and lists `plugin`/`plugins` subdirectories under
   each root — plain filesystem reads.
3. Every config file found is parsed for `plugins: [...]` entries → an
   operations list. Absolute/local targets stay local; package targets
   (anything not a path) become npm candidates.
4. For each operation **it imports the module**
   (`PluginModule.load` → `import(file-or-npm-entrypoint)`) to read its
   `vcs: { id, markers }` declaration. Package targets run
   `npm.add(target, { refresh: true })` first — this is the network touch.
   Results are cached in-memory per operation JSON; because the operation
   embeds the file `mtime`, touching `opencode.json` re-imports (and for
   package plugins, re-`npm.add`s).
5. Declarations accumulate into a `marker-name → vcs-id` map (jj builtin
   seeded first, then SDK plugins, then loaded plugins — later wins), then
   one `fs.up` walk with all marker names finds the nearest marker and its
   owning VCS id.

So: **causality is "config lists a plugin → resolve imports it → its
declaration participates in classification."** The jj builtin needs none of
this (seeded directly), local file plugins import from disk (no network),
and only *package* plugins introduce npm/network into the detection path —
first open or after a config touch, cached thereafter. The plugin's `effect`
(the part that runs arbitrary host code) is NOT executed during discovery —
only its module top-level and exported declaration object are read. That is
the "cool, not scary" boundary: discovery executes module initialization,
not plugin behavior.

## "Hardcoded literals", unpacked

The phrase from revision 1 that deserved unpacking. Ours (and upstream's
pre-marker code) encodes the VCS set as literal unions in several places:

- `Schema.Literals(["git", "hg", "jj"])` in
  [`packages/schema/src/project.ts`](/packages/schema/src/project.ts)
- `if (location.vcs?.type === "git") ... "jj") ... "hg")` dispatch in
  `vcs.ts` and `project.ts` (strategy selection, adapter selection)
- marker lists `[".jj", ".git", ".hg"]` inline in `Project.root` and
  discovery

**Implied cost**: every new VCS (svn, pijul, fossil…) means touching each of
those sites across schema/core/server and a client regen — core changes for
what could be data. **Implied benefit**: type-checked exhaustiveness today;
no stringly-typed dispatch. **Why it doesn't matter now**: we run exactly
git/hg/jj and nothing else is on the roadmap; the marker system upstream
built is the fix for a problem we don't have yet. **When it matters**: if
`jj-vcs-plugin` merges, our literal sites become the conflict surface of
every future VCS feature — at that point migrating to their declarations (or
carrying a thin compatibility shim for our jj-first typing) is the move.

## ID spaces, precisely

The worry, made mechanical. A project's identity is `cached(key) ?? derived`;
the key choice decides whether two views of one repository unify.

| Scenario | Ours | Theirs |
| --- | --- | --- |
| git clone, opened as git | `cached(<root>/.git)` → remote ID | same |
| same repo after `jj git init --colocate` | jj discovery derives git dir `<root>/.git` (via `store/git_target`) → **cache hit, same ID** (tested: "reclassifies… keeps id") | git branch stays primary; `vcsBackend` tag added; same ID path |
| pure jj repo (no colocate), main workspace | `cached(<repo>/store/git)` → miss → probe `origin` → remote ID if present, else `jj-store:` hash | `cached(<repo>)` → miss → `jj-repository:<repo>` hash — **no probe** |
| secondary workspaces of that repo | pointer resolves to the same store/git → **same cache key, same ID** | same store → same hash — same ID within jj |
| open the same repo as a git checkout elsewhere | same remote ID → **same project** | jj ID ≠ git ID → **two projects** |
| pure jj gains a remote later (`jj git remote add`) | cache-first: ID never churns | **nothing changes either** — the git branch never runs for standalone jj (no `.git` marker), so the ID stays the store hash; the cost is the permanent fork above, not a flip |
| pure jj later colocated | cache-first: ID never churns | colocate-onto-an-existing-git-checkout keeps the same `<root>/.git` cache key and remote-first re-derives the same ID — no break |
| git or colocated project gains a remote later | plain-git: **flips by design** to the remote ID (remote-first, new project row, old row orphaned until cleanup — stock behavior, test-pinned "prefers normalized origin over root commit"); jj-typed: cache-first, no flip | colocated: **flips by design** — same stock git path |

Net: ours trades one `git remote get-url` on cache miss for a single ID
space in every transition we plausibly hit (jj-mandated machines, colocated
adoption, workspace sprawl). Theirs buys never-run-git-during-jj-discovery
at the price of forking project identity across VCS views. Given sessions,
permissions, and inventory hang off project IDs, the unified space is worth
the probe — this is the load-bearing reason to keep our identity layer on
any substrate.

## The ideal detection flow

What data resolve needs, where it comes from, and what gates each step —
this is the graph `0b2dc399` implements:

```mermaid
flowchart TD
  start[resolve directory] --> walk{fs.up walk:<br/>.jj / .git / .hg}
  walk -- '.git|.hg first' --> nativenative[git / hg / directory paths]
  walk -- '.jj' --> repo[read .jj/repo:<br/>dir = main repo,<br/>file = pointer to it]
  repo -- dangling --> nativenative
  repo --> canonical[canonical = dirname&lt;sup&gt;2&lt;/sup&gt;(repo)<br/>fs-only]
  canonical --> gitdir{git backing store:<br/>store/git_target → checkout .git,<br/>else store/git,<br/>else none}
  gitdir --> cache{cached(gitdir ?? repo)}
  cache -- hit --> done[id = previous<br/>0 subprocesses]
  cache -- miss --> probe[git remote get-url origin<br/>1 subprocess, once]
  probe --> done2[remote ID, else jj-store hash]
```

Data → gate → source, as a table:

| Data needed | Gate | Source | Subprocesses |
| --- | --- | --- | --- |
| Is jj present & nearest | walk finds `.jj` before `.git`/`.hg` | `fs.up` | 0 |
| Workspace directory | always (marker found) | `dirname(marker)` | 0 |
| Repository store | `.jj/repo` dir vs pointer file | fs read + realPath | 0 |
| Canonical root | store resolved | `dirname²(store)` | 0 |
| Git backing dir | colocated (`git_target`) vs standalone (`store/git`) | fs reads | 0 |
| Identity | cache hit? | DB cache | 0 (hit) / 1 git (miss) |

Before `0b2dc399`: `jj workspace root` + `jj git root` + `jj workspace list`
+ `git remote get-url` on **every** resolve (4 subprocesses, each able to
snapshot or lock-fail). After: 0 jj calls ever; 1 git call once per project
lifetime (per cache eviction). The one deliberate live call remaining in the
system is the adapter's `info()` identity probe, which must snapshot to
report the current working-copy state.

## What our patches cost to carry

Portability tiers, for the "adopt theirs wholesale later?" question:

1. **Detection (2 commits, `0b2dc399` shape)** — now mechanically the same as
   upstream's. If their line merges, delete ours and take theirs; the only
   semantic delta left is jj-first colocated typing.
2. **Identity layer** — one small block in `project.ts` (cache-first +
   remote probe + key choice). Carries as-is onto any substrate; this is the
   piece we keep regardless.
3. **Adapter (`vcs/jj.ts`)** — standalone module + three lines of `vcs.ts`
   dispatch. Carries easily; migrating to their plugin-registry shape later
   is a mechanical re-registration.
4. **Copies subsystem** — self-contained (schema + migration + protocol +
   server + TUI strategy). Carries; re-key from `vcs.type === "jj"` to their
   `vcsBackend` when the substrate changes.
5. **TUI labels** — two small commits; carry or drop freely (deferred
   verdict).

The only genuinely divergent axis is colocated typing (jj-first vs
git+vcsBackend) — decide at adoption time, not now.

## Recommendation (revised)

1. Keep our line as the substrate **for now**: after today's fixes it matches
   upstream's detection mechanics, keeps the unified ID space, and is the
   only line with copies.
2. Freshen onto current `v2@origin` when promoting into `working` — the
   detection commits are now small and shape-compatible, so the rebase risk
   that motivated "port upstream's two commits instead" is much reduced.
   Either entry point is fine; ours preserves ID space, theirs doesn't.
3. Track `jj-vcs-plugin`; when it merges into v2, swap our detection tier
   for theirs, port the identity layer onto it, and re-key copies/labels to
   the plugin API.
4. The user-impact verdicts stand: copies rebuild, labels last, snapshot
   discipline already adopted.

## Verification checklist

- [x] Opening a secondary workspace (this repo) resolves to the shared
      anomalyco/opencode project — zero `jj` invocations (fresh resolve logs
      one `git remote get-url` at most).
- [x] `~/ado` → colocated `~/archive/doc` project, identity shared with a
      plain-git open.
- [x] `jj git init --colocate` inside an open git project reclassifies
      without changing the project ID (live test).
- [x] Damaged colocated `.jj` falls back to the git project (live test).
- [x] Forgotten workspace resolves through its pointer, canonical = main
      root (live test, documented edge).
- [x] Metadata commands leave `@` untouched (`--ignore-working-copy`); a
      footer refresh does not create snapshot operations (probe +
      `jj-snapshot-probe`).
- [x] Unbookmarked working copy labels as `main+5`-style (live test).

## Cross-references

- [`jj-vcs.glm53.md`](jj-vcs.glm53.md) — revision 1; superseded by this
  document (kept for the record).
- [`jj-vcs-user-impact.glm53.md`](jj-vcs-user-impact.glm53.md) — copies /
  labels / snapshot user-impact verdicts feeding the stance column.
- [`.test-agent/jj-flow-probe/`](../../.test-agent/jj-flow-probe/README.md)
  and [`.test-agent/jj-snapshot-probe/`](../../.test-agent/jj-snapshot-probe/README.md)
  — empirical grounding for the layout derivation and snapshot behavior.
- `~/ado/patches.md` (*Native Jujutsu VCS support*) — manifest entry with
  bookmarks (`jj-vcs` @ `fd3eadd2`; immutable `jj-vcs-20260902`,
  `jj-vcs-custom1` @ `a5542af3`).
- [anomalyco/opencode `jj-vcs-plugin`](https://github.com/anomalyco/opencode/commits/jj-vcs-plugin) —
  upstream line; re-verify against its (or v2's) tip before acting.

# Addendum — 2026-09-02 evening: upstream orphaned, line rewritten

The evening check ([`upstream-check-20260902.glm53.md`](upstream-check-20260902.glm53.md))
found upstream marker machinery added 08-26 and removed 08-31, leaving
`jj-vcs-plugin` orphaned on shapes v2 no longer carries — the "swap
the detection tier for theirs at merge" clause has nothing to swap to.
Ours is the only live jj line; this table's stance column ages
accordingly.

The line itself was rewritten same-day onto `v2@origin` `318a82f784`
in the provider-era shape (`plugin/vcs/jj.ts` beside git/hg,
`worktree/jj.ts` strategy, unified ID space retained). The carry tiers
above now map to an explicit 8-commit ladder — see
[`rewrite0.glm53.md`](rewrite0.glm53.md) and the outcome addendum in
[`rewrite1.glm53.md`](rewrite1.glm53.md).
