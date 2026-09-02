---
type: Analysis
title: Upstream jj-vcs adoption dangers
description: Catalog of concrete risks in adopting anomalyco's jj-vcs-plugin line as our Jujutsu substrate, each cited to the upstream code and paired with a mitigation.
resource: design/jj-vcs/upstream-danger0.glm53.md
tags: [vcs, jujutsu, upstream, risk]
status: draft
generated: { by: agent:glm53, at: 2026-09-02T06:45:00Z }
verified: { by: unassigned, at: never }
stale_after: 2026-09-16
sources:
  - id: jj-vcs-plugin
    resource: https://github.com/anomalyco/opencode/commits/jj-vcs-plugin
    title: anomalyco/opencode jj-vcs-plugin branch (tip cc7d4ebb, 2026-08-26)
    author: Shoubhit Dash
    last_modified: 2026-08-26
  - id: comparison
    resource: design/jj-vcs/jj-vcs.glm53.md
    title: Jujutsu VCS support — local WIP vs upstream jj-vcs-plugin (2026-09-02)
---

# Upstream jj-vcs adoption dangers

## Situation

On 2026-09-02 we set the direction for Jujutsu support in the `working` stack:
upstream-first. Shoubhit Dash's jj-vcs line on
[anomalyco/opencode](https://github.com/anomalyco/opencode) — the original
commits `bee852b5cf82` and `46465000a0e0`, plus the
[`jj-vcs-plugin`](https://github.com/anomalyco/opencode/commits/jj-vcs-plugin)
branch (`4eaf533cd03c` declarative markers + `cc7d4ebb` jj adoption) — is the
better substrate, and our own 12-commit line is preserved on bookmarks
(`jj-vcs`, `jj-vcs-20260902`, `jj-vcs-custom1` at `a5542af3`).

Adopting it is still not free. This document enumerates the concrete dangers,
each grounded in the upstream code as of branch tip `cc7d4ebb`, with the
failure scenario, an honest likelihood/impact read, and the mitigation we
would apply. It is the risk companion to
[`jj-vcs.glm53.md`](jj-vcs.glm53.md) (the concern-by-concern comparison) and
expands the dangers summary recorded in `~/ado/patches.md` under *Native
Jujutsu VCS support*.

Unless a commit is named otherwise, "upstream" below means the state of these
files at `jj-vcs-plugin@origin` (`cc7d4ebb`).

## The dangers

### 1. Unmerged-API bet — everything here may change shape

**What.** None of the jj-vcs line is merged: `v2@origin` and `dev@origin` do
not contain `4eaf533cd03c` or `cc7d4ebb` as of 2026-09-02 (verified by
revset: `dev@origin & ::4eaf533cd03c` is empty). The branch tip is itself a
work-in-progress unification — `cc7d4ebb`'s diff literally resolves jj
conflict snapshots (`<<<<<<< conflict 1 of 3 …`) left by merging the jj
hardening line (`46465000`) into the declarative-markers PR branch
(`4eaf533c`). The author is mid-refactor, and sibling branches
(`nxl/vcs-plugin-api`, `vcs-branch-metadata`, `fix-vcs-diffs`) show the
initiative still moving.

**Failure scenario.** We port the `vcsBackend`/declarative-marker shape into
`working`; upstream lands a revised version into `v2`; every subsequent
`working` rebuild re-pays conflict churn in
[`packages/core/src/project.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/project.ts)
until our port is dropped or re-pointed — the exact drift the patches.md
lineage rules exist to prevent.

**Likelihood/impact.** Certain to some degree: the branch *is* unmerged, and
the 2026-09-01 patches.md entry already recorded the "absorb or supersede
instead of drifting" rule for exactly this reason.

**Mitigation.** Already decided: port only `bee852b5` + `46465000`
(self-contained, fs-only, no marker machinery) onto the current `v2@origin`
tip; adopt declarative markers only at the moment they merge upstream. Track
the branch; when it lands, our port evaporates and the marker system becomes
upstream's problem.

### 2. Plugin execution — and npm — inside project-root detection

**What.** In
[`packages/core/src/project/markers.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/project/markers.ts),
`ProjectMarkers.discover` does not just walk directories for `.jj`. On every
call it: walks up for `.opencode`/`opencode.json(c)`, runs
`PluginSourceDirectory.discover` over the global config dir plus every
project `.opencode` root, parses every config file found, `stat`s each plugin
operation, and then **loads plugin modules** (`PluginModule.load`) to read
their `vcs` declarations. `PluginModule.load`
([`packages/core/src/plugin/module.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/plugin/module.ts))
calls `npm.add(target, { subpaths: ["server", ""], refresh: true })` for any
package-sourced plugin — a network/registry touch. The in-memory cache is
keyed by `JSON.stringify(operation)`, and operations embed the file `mtime`,
so touching `opencode.json` invalidates and re-`npm.add`s.

**Failure scenario.** First open (or first open after a config touch) of a
project whose config lists an npm plugin stalls root resolution on npm; if
npm fails, the plugin's markers silently vanish from classification (a
`logDebug` and `undefined`, nothing user-visible). Detection — the thing we
are fixing because it must *always work* — now has a network dependency and
executes third-party module top-levels.

**Likelihood/impact.** Medium likelihood (requires a package plugin in
config — we run local plugins today, but nothing stops one being added);
impact is latency plus silent marker loss, not a crash. The builtin jj
declaration does not depend on plugins, so core jj recognition survives.

**Mitigation.** Bound the scope at port time: our port of `bee852`+`46465000`
contains none of this. If/when markers merge, consider proposing upstream
that `discover` cache the file scan per directory and skip `PluginModule.load`
unless a plugin source actually changed (`mtime` equality, not inclusion).

### 3. Marker declarations are last-wins, with no collision detection

**What.** `markers.ts` builds a `Map<markerName, vcsId>` by iterating
declarations — jj builtin (`ProjectJj`), then SDK plugins, then loaded
plugins — calling `markers.set(marker, id)` unconditionally. Validation
rejects empty/`.`/`..`/path-separator markers and non-conforming ids
(`/^[a-z][a-z0-9._-]*$/`), but **nothing rejects a plugin redeclaring
`.git`, `.hg`, or `.jj`**; the later declaration silently wins. Relatedly,
any declared marker found on disk forks a project: the `if (marker)`
fallback in `resolve` persists a project rooted at *any* plugin marker
directory, overriding an enclosing git repo (that precedence is tested
upstream as intended — "prefers a nested plugin repository over its parent
git repository" — but it means installed plugins can move your project
root).

**Failure scenario.** Two VCS plugins both claim `.svn` (or a plugin claims
`.git` while another expects it); classification lands on whichever loads
last. Or: a plugin installed for an unrelated feature declares a marker that
happens to exist in a directory you open, and your project root silently
jumps to that marker's directory.

**Likelihood/impact.** Low today (few VCS plugins exist), growing with the
ecosystem the feature explicitly invites. Impact is misclassification — wrong
project root/identity — which is precisely the class of bug we are fixing.

**Mitigation.** If we adopt the marker system, carry a small patch (or
upstream proposal) reserving builtin markers and detecting collisions:
`.git`/`.hg`/`.jj` rejections plus a duplicate-marker error rather than
last-wins.

### 4. `vcsBackend` is set from marker presence even when jj discovery failed

**What.** In `resolve` (`cc7d4ebb`, project.ts), the colocated branch sets

```ts
...(marker && marker.directory === repo.worktree && marker.type !== "git"
      ? { vcsBackend: marker.type } : {})
```

`marker` here is just *a `.jj` directory exists next to the `.git`* — it is
set even when `ProjectJj.discover` returned `undefined` (dangling
`.jj/repo` pointer, moved main repo, partially deleted `.jj`). The jj plugin
then gates on `location.vcsBackend !== "jj"`
([`plugin/vcs/jj.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/plugin/vcs/jj.ts))
and activates, so every status/diff/branch call shells out to `jj` against a
broken store and fails — in a repository where the plain git adapter would
have worked fine.

**Failure scenario.** Colocated repo; user (or a tool) moves/breaks the
`.jj` directory; opencode's VCS panel goes dead with cryptic `jj` errors
instead of falling back to git.

**Likelihood/impact.** Low likelihood (requires a damaged colocated repo —
but jj repos get damaged exactly when people experiment with jj), impact is
user-visible breakage of the whole VCS surface for that project.

**Mitigation.** Gate `vcsBackend` on successful discovery (`jj !== undefined`
or `discovered !== undefined`), not marker presence. One-line semantic fix;
worth proposing upstream alongside any port. (Our local line degrades to git
in this case because `jjDiscover` requires the CLI probe to succeed.)

### 5. Standalone-jj identity is disjoint from git identity

**What.** Upstream persists standalone jj projects with
`id = cached(jj.store) ?? Hash("jj-repository:" + jj.store)` and caches under
the `jj.store` key; git projects derive identity from
`cached(repo.commonDirectory)` / remote URL / root commit. The two namespaces
never meet: nothing in the jj branch probes the backing git store's remote
(the way our local `jjDiscover` does with
`git --git-dir <store> remote get-url origin`).

**Failure scenario.** The same repository opened as pure jj and as git (a
colocated sibling clone), or a pure-jj project that later runs
`jj git init --colocate`: the standalone→colocated transition switches the
cache key (`jj.store` → `commonDirectory`, a guaranteed miss) and the ID
becomes remote/root-commit-derived — the project's identity, and with it its
session history grouping and inventory row, changes. Our line preserves
identity across the git→colocated transition whenever a remote exists (tested:
"reclassifies an opened git project after colocated jj initialization",
`jj.id === git.id`); upstream does not.

**Likelihood/impact.** Medium — every real jj repo we own either has a remote
or eventually gains one, and colocating onto an existing git checkout is the
standard jj adoption path. Impact is project/session fragmentation, annoying
and mostly invisible until sessions "disappear" from a project view.

**Mitigation.** If we adopt upstream's detection, carry the remote probe as
a small local commit (probe `origin` from `jj git root`'s store for the
jj-branch ID, like our `jjDiscover` does), or accept the split and document
that colocating migrates identity once. Decide at port time; do not discover
it in production.

### 6. Canonical root couples detection to jj's on-disk layout

**What.**
[`packages/core/src/project/jj.ts`](https://github.com/anomalyco/opencode/blob/jj-vcs-plugin/packages/core/src/project/jj.ts)
derives `canonical = path.dirname(path.dirname(store))` — i.e. "the store
always sits exactly two levels under the repo's main root" (true today:
`<main>/.jj/repo` directly, and secondary workspaces' `.jj/repo` pointer
files resolve into the main repo's store). jj has changed `.jj` internal
layout across releases before; this derivation encodes it as an API contract
with no version negotiation and no failure signal.

**Failure scenario.** A future jj relocates stores (say
`<main>/.jj/repos/<id>`); canonical silently lands on `.jj/` or the wrong
ancestor. Projects still resolve, but canonical roots — and everything keyed
off them (workspace grouping, identity caches) — quietly point at junk.

**Likelihood/impact.** Low likelihood per release, compounding over time;
impact silent and structural. Their live tests (`shares standalone Jujutsu
identity and canonical root across workspaces`) pin the current layout and
would catch an upstream break at freshen time — that is the real safety net.

**Mitigation.** Keep the workspace/canonical tests in whatever we port (they
run `jj workspace add` for real and assert `canonical == main`); they convert
this from silent to loud at the next freshen.

### 7. jj projects get no copy strategy — our workflow surface has no counterpart

**What.** `cc7d4ebb` sets
`strategy: project.vcs.type === "git" && project.vcsBackend !== "jj" ? "git" : undefined`
— deliberately: no copies for jj projects, colocated or pure. Our local line
ships a `jj_workspace` copy strategy (create/remove/list via
`jj workspace add`/`forget`, `ProjectCopy.Metadata` per directory, protocol +
server + TUI wiring) — the `~/src/<repo>-<variant>` workflow productized.

**Failure scenario.** Not a bug — an absence. Switching wholesale means the
project-copy UI offers nothing for jj projects, and the working-copy labels /
review flow our TUI commits add are gone too. The 2026-09-02 user-impact
analysis ([`jj-vcs-user-impact.glm53.md`](jj-vcs-user-impact.glm53.md))
resolved how much this costs: **copies are the one real feature** — `/move`
auto-lists every jj workspace of the repo (including shell-created variants),
`ctrl+m` creates a workspace via `jj workspace add` and moves the live
session into it, `ctrl+d` deletes with careful guards against losing
uncommitted/conflicting work — while **labels are thin** (a `dir:label`
prefix; most of the adapter's computed state renders nowhere) and the
**snapshot behavior is bug-shaped** (detection mutates `@`; a swallowed lock
failure silently demotes the project to a `directory:` project).

**Likelihood/impact.** Certain (it is a feature gap, not a defect); impact
now quantified: high for the copies layer, marginal for labels, negative for
snapshot behavior (dropping it is an improvement).

**Mitigation.** The upstream-first plan already accounts for this: port
detection first, then rebuild **only the copies layer** (and, nearly free if
ever wanted, a footer conflict indicator from the adapter's already-shipped
conflicted/empty flags) on the substrate. Labels rebuild last if at all —
upstream's bookmark-only label comes free. Nothing upstream blocks that
layering.

### 8. Detection is heavier than it looks even without plugins

**What.** With zero plugins configured, `ProjectMarkers.discover` per
resolve still does: an `fs.up` walk for config files, directory listings of
`plugin`/`plugins` under the global config root and every project `.opencode`
root, config-file parse, per-operation `stat`, and the marker `fs.up` walk —
then `resolve` *also* runs the separate native `.git`/`.hg` walk plus
`git.repo.discover` where applicable. That is several filesystem passes
where our line does one walk (plus subprocesses only in jj repos).

**Failure scenario.** Not a failure mode — a cost. On slow filesystems or
network mounts, project open/refresh latency grows; nothing breaks.

**Likelihood/impact.** Certain but mild on local disks; compare with our
line's 3–4 `jj` subprocesses per resolve in jj repos — different currencies,
similar order.

**Mitigation.** None needed at port scope (the `bee852`+`46465000` port has
none of the plugin machinery). If markers merge upstream, watch resolve
latency in the live server; the file-scan caching from danger 2 covers most
of this too.

## Summary

| # | Danger | Likelihood | Blast radius | Mitigation | Bites when |
| --- | --- | --- | --- | --- | --- |
| 1 | Unmerged-API bet | certain | rebase churn every rebuild | port only the 2 original commits; adopt markers on merge | any `working` rebuild |
| 2 | npm/network + plugin execution in detection | medium | resolve latency, silent marker loss | not in port scope; propose scan/load caching upstream | first open w/ npm plugin in config |
| 3 | marker collisions last-wins | low→growing | wrong project classification | reserve builtin markers, error on duplicates | multiple VCS plugins installed |
| 4 | `vcsBackend` from marker despite failed jj discovery | low | dead VCS surface for that project | gate on successful discovery; propose upstream | damaged colocated `.jj` |
| 5 | standalone-jj identity disjoint from git | medium | project/session fragmentation | carry the remote-probe ID commit or document the split | colocating / opening repo both ways |
| 6 | canonical = `dirname²(store)` layout coupling | low per release | silent canonical/identity corruption | keep the live workspace tests in the port | future jj layout change |
| 7 | no copies for jj | certain | workflow regression vs ours | rebuild copies/labels layer if user-impact verdict keeps it | immediately on wholesale switch |
| 8 | multi-pass detection cost | certain, mild | resolve latency | none needed at port scope; revisit with markers | slow/network filesystems |

Dangers 1, 7, and 8 are structurally knowable now; 2–6 are the ones that
bite in production and are all cheaply mitigated at port time (skip 2/8 by
scope, patch 3/4/5 with tiny local commits, guard 6 with tests).

## Balance

Our own line is not the safe alternative: its detection hard-depends on the
`jj` binary (absent binary = the unrecognized-root bug again), spawns
subprocesses per resolve, never passes `--ignore-working-copy` (detection
mutates `@` — verified live for `jj git root` and `jj workspace list`, though
not `jj workspace root`), swallows jj lock failures into a silent
`directory:`-project demotion, and hardcodes VCS literals that collide with
the direction upstream is taking. The full both-sides accounting is
[`jj-vcs.glm53.md`](jj-vcs.glm53.md); the decision it records stands —
upstream-first — and this document is the "eyes open" half of that decision.

## Verification checklist when the port lands

- Open the ported build in a directory whose `opencode.json` lists an npm
  plugin with the network severed: project root must still resolve (danger 2).
- Colocated repo with a sabotaged `.jj/repo` pointer: VCS ops must fall back
  to git, not fail (danger 4).
- Pure-jj project, then `git remote add` + `jj git init --colocate` in an
  existing git clone of the same repo: project identity continuity per
  whatever we decide for danger 5.
- `jj workspace add` secondary + `jj workspace forget`: canonical and
  membership behave per danger 6 tests.
- Confirm copies UI is absent-but-not-broken for jj projects (danger 7);
  the impact analysis keeps the copies layer for rebuild and defers labels.
- Open a project while holding an exclusive jj lock from a terminal `jj`
  command, on the ported build: resolution must not silently demote the
  project (the failure mode our own line's `jjDiscover` has today).

## Cross-references

- [`jj-vcs.glm53.md`](jj-vcs.glm53.md) — the comparison this expands; both
  documents share the 2026-09-02 upstream-first decision.
- [`jj-vcs-user-impact.glm53.md`](jj-vcs-user-impact.glm53.md) — landed
  2026-09-02; verdicts feeding danger 7 (copies keep, labels defer, snapshot
  drop) and the balance section. Its snapshot findings add a fourth problem
  to our own line: `jjDiscover` swallows jj lock failures and silently
  demotes the project to a `directory:` project.
- `~/ado/patches.md` (*Native Jujutsu VCS support*) — the manifest entry
  carrying the decision, the dangers summary, and the preservation bookmarks
  (`jj-vcs`, `jj-vcs-20260902`, `jj-vcs-custom1` at `a5542af3`).
- [anomalyco/opencode `jj-vcs-plugin`](https://github.com/anomalyco/opencode/commits/jj-vcs-plugin) —
  the upstream branch every citation here points at; re-verify against its
  (or v2's) tip before acting on this document.
