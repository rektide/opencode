---
type: Reference
title: Watchman carrier tooling inventory
description: Executed carrier-plan checks and attributed prior-wave probes, with results, consolidation goals, durability decisions, and proposed homes for reusable tooling.
resource: /.design/watchman/tools0.gpt56s.md
tags: [opencode, watchman, tooling, validation, carrier, lineage, documentation, probes]
status: draft
generated: { by: model:gpt-5.6-sol, at: 2026-09-03 }
verified: { by: model:gpt-5.6-sol, at: 2026-09-03 }
stale_after: 2026-10-03
sources:
  - id: carrier-plan
    resource: /.design/watchman/carrier0.gpt56s.md
    title: Watchman clean-slate replacement carrier
    author: model:gpt-5.6-sol
    last_modified: 2026-09-03
  - id: consolidation-vision
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision and direction decision
    author: model:openai-gpt-5.6-sol + model:glm-5.3 + human:rektide
    last_modified: 2026-09-03
  - id: ownership-review
    resource: /.design/watchman/review-ownership0.gpt56s.md
    title: Watchman downstream ownership and carryability audit
    author: model:openai-gpt-5.6-sol
    last_modified: 2026-09-01
  - id: failure-review
    resource: /.design/watchman/review-failure-paths0.gpt56s.md
    title: Watchman failure-path and test audit
    author: model:openai-gpt-5.6-sol
    last_modified: 2026-09-01
  - id: maintenance-log
    resource: /.design/watchman/README.md
    title: Root-scoped Watchman maintenance log
    author: model:gpt-5.6-terra
    last_modified: 2026-09-01
  - id: daemon-validation
    resource: /.design/watchman/watchwoman0.unknown.md
    title: Watchwoman daemon validation
    author: llm:unknown-model
    last_modified: 2026-08-30
  - id: metrics-guide
    resource: /.design/watchman/metrics0.glm53.md
    title: Watchman channel metrics reading guide
    author: model:glm-5.3
    last_modified: 2026-08-31
  - id: since-query-probe
    resource: file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/probe.py
    title: Live watchwoman since-query probe
    author: model:glm-5.3
    last_modified: 2026-09-01
  - id: vcs-targets
    resource: /.design/watchman/watches.glm53.md
    title: VCS-internal watch targets for the Watchman backend
    author: model:glm-5.3
    last_modified: 2026-09-02
  - id: patch-policy
    resource: file:///home/rektide/a/doc/opencode/patches.md
    title: OpenCode patches and ideas
    author: human:rektide + agents
    last_modified: 2026-09-03
---

# Watchman carrier tooling inventory

## Scope and provenance

This reference records tooling behind
[`carrier0.gpt56s.md`](/.design/watchman/carrier0.gpt56s.md), not tooling that
the carrier merely proposes somebody should write. It has three provenance
labels:

| Label | Meaning |
| --- | --- |
| **Executed: carrier session** | I ran this exact command while researching, writing, validating, or committing `carrier0.gpt56s.md` on 2026-09-03. |
| **Written: carrier session** | I wrote the exact check into the carrier plan as a future gate but did not execute it because the assignment was documentation-only. |
| **Observed: prior wave** | A cited review, maintenance record, or existing `.test-agent` artifact says an earlier wave ran or used it. I inspected it for this inventory but did not claim its result as my own run. |

Commands shown together in one fence were sometimes issued as separate tool
calls. Every command line itself is reproduced as run or as preserved by its
attributed source. Placeholder-bearing prior commands remain placeholders; they
are evidence recipes, not ready-to-run automation.

No Watchman implementation test was run during the carrier-plan session. The
session was a static design and repository audit. Its executable work was
lineage inspection, collision analysis, upstream-drift inspection, corpus QA,
and a one-file commit gate.

The `.test-agent` paths linked below are local ignored artifacts, and the
`file://` paths belong to sibling workspaces on this host. Their fenced copies
in this tracked document are the durable snapshots; the links identify
provenance and may not resolve in another clone.

## Consolidation goals

Each tool maps to one or more of the requested goals:

| Goal | Tooling question |
| --- | --- |
| **Carrier-boundary/collision auditing** | Does the feature contain only intended files, and where does it overlap current upstream? |
| **Doc-corpus QA** | Does Markdown parse, does OKF frontmatter parse, and do local links and line anchors point to real content? |
| **Deterministic test matrix support** | Can M1-M6 and the added B2/VCS gates be driven without sleeps, random backoff, or a real daemon? |
| **Lineage/bookmark auditing** | Which DAG and remote are authoritative, what is the feature base, and is real work above the floating bookmark? |
| **Upstream-drift detection** | Which touched seams changed after the declared base, and was the change mechanical or semantic? |
| **Failure-path validation gates** | Do focused and live checks cover pre-ack loss, retry scope, terminal lifetime, inactive native acquisition, and daemon continuity? |

## Inventory summary

| Tool | Provenance | Verdict | Proposed durable home | Primary goals |
| --- | --- | --- | --- | --- |
| Lineage and bookmark snapshot | Executed | **Durable** | `script/vcs/feature-line-audit.ts` | lineage/bookmark, upstream drift |
| Changed-file intersection audit | Executed | **Durable** | same `script/vcs/feature-line-audit.ts` | carrier boundary, upstream drift |
| Upstream path-history drill-down | Executed | **One-shot recipe** | keep in this reference; automate only the candidate selection | upstream drift |
| Historical commit sizing/fold audit | Executed | **Durable** | `script/vcs/carrier-diff.ts` or fold into feature-line audit | carrier boundary, no diff creep |
| Harness-native file/env discovery | Executed | **One-shot queries** | behavior becomes focused test helpers, not a query wrapper | deterministic matrix, env isolation |
| GFM/OKF/link/range validation bundle | Executed | **Durable** | `script/docs/check-corpus.ts` plus root `check:docs` script | doc-corpus QA |
| ASCII, trailing-space, and table diagnostics | Executed | **Durable as linter rules** | fold into `script/docs/check-corpus.ts` | doc-corpus QA |
| One-file change/commit gate | Executed | **Durable** | `script/vcs/change-scope.ts` or carrier audit mode | carrier boundary, lineage |
| Carrier C1-C12 verification block | Written, not run | **Durable** | package-level `check:watchman` and `check:watchman-live` scripts | all failure-path gates |
| Ownership review evidence bundle | Observed | **Durable precedent** | superseded by feature-line audit | lineage, collision, upstream drift |
| Failure-review focused test commands | Observed | **Durable** | package-level Watchman check scripts | failure-path gates |
| Scripted `RawClient` test double | Observed | **Durable, extract** | `packages/core/test/filesystem/fixture/watchman/client.ts` | deterministic M1-M3 |
| Fake/live metrics smoke scripts | Observed | **One-shot; retire metrics shape** | keep under `.test-agent/watchman-metrics/`; migrate only harness ideas | failure-path observation |
| Metrics `jq` recipes | Observed | **One-shot; superseded** | historical doc only | observation validation |
| Watchwoman CLI validation recipe | Observed | **Durable operator recipe** | `.test-agent/watchman-live/README.md` | live failure-path gates |
| Since-query daemon probe | Observed | **Durable in daemon repo** | keep in `watchwoman-systemd/.test-agent/since-queries/` | daemon semantics |
| Jujutsu layout/snapshot probes | Observed | **Durable in jj-vcs repo** | keep in `opencode-jj-vcs/.test-agent/` | VCS allowlist, cross-workspace |
| Process/socket incident assessors | Observed | **One-shot as written** | generalize into `script/watchman/process-audit.ts` | operational failure paths |
| Incident root reappearance catcher | Observed | **One-shot incident artifact** | retain under `.test-agent/watchman-fire/` | operational root-placement failure |
| Watchman cutover helper | Observed | **One-shot and host-specific** | retain only in `.test-agent/watchman-cutover/` | operational migration |

# Executed carrier-session checks

## Lineage and bookmark snapshot

**Provenance:** Executed: carrier session.

These commands established that the OpenCode DAG came from `jj`, not the
workspace's unrelated beads `.git`; found the declared base and real commit
sequence; counted the inherited line; captured local/remote bookmark state; and
rechecked the exact parent and upstream tip before the carrier document was
committed.

```sh
jj status
jj log --limit 50 -r '::@' -T 'change_id.short() ++ " " ++ commit_id.short() ++ " " ++ description.first_line() ++ "\n"'
jj bookmark list --all-remotes
jj log --no-graph -r '43d09b9d..@-' -T 'commit_id.short() ++ " " ++ description.first_line() ++ "\n"'
jj log --no-graph -r '43d09b9d..@-' -T 'commit_id ++ "\n"' | wc -l
jj bookmark list 'watchman*'
jj log --no-graph -r 'v2@origin' -T 'commit_id ++ " " ++ description.first_line() ++ "\n"'
jj log --no-graph -r '@-' -T 'commit_id ++ " " ++ description.first_line() ++ "\n"'
```

**Result.** The inherited line contained 40 real commits before the carrier
plan. At the final pre-commit freeze, `v2@origin` was
`4772b6a3e8c2eaeb7594503c4584fb225c75bb15`, the working parent was
`d67c5a42c89de8ac5268934ec30dad766cabd5d9`, local `watchman` and
`watchman-20260903` were at `fac6e6e5483c`, and the older dated snapshots were
still present. This directly exposed real documentation above the floating
bookmark and grounded the duplicate/snapshot mechanics in the carrier.

**Goal served.** Lineage/bookmark auditing and upstream-drift detection.

**Durability.** Durable, but not as copied shell. A generic read-only
`script/vcs/feature-line-audit.ts` should accept the feature bookmark, upstream
bookmark, and optional declared base; emit full IDs, base, work-above-bookmark,
dated snapshots, remote URLs, and a machine-readable report; and never mutate
bookmarks.

## Changed-file collision audit

**Provenance:** Executed: carrier session.

The core intersection check was the ownership review's `comm` recipe rerun
against the now-current upstream. The surrounding commands made the two input
sets and the contaminated commit independently inspectable.

```sh
comm -12 <(jj diff --name-only --from 43d09b9d --to @- | sort) <(jj diff --name-only --from 43d09b9d --to v2@origin | sort)
jj diff --name-only --from 43d09b9d --to v2@origin
jj diff --stat --from 43d09b9d --to @-
jj diff --summary --from 98b4d82fcae6- --to 98b4d82fcae6
jj diff --name-only --from 43d09b9d --to @- | sort
jj diff --name-only --from 43d09b9d --to v2@origin | sort | rg '^(AGENTS\.md|bun\.lock|packages/(cli/src/server-process\.ts|core/(src/(config\.ts|config/plugin/(skill|agent|command|source)\.ts|filesystem/watcher\.ts)|test/(config/config\.test\.ts|filesystem/watcher\.test\.ts|location-layer\.test\.ts))|server/src/routes\.ts))$'
```

**Result.** The old ownership-review result `{AGENTS.md, bun.lock}` was still
correct for that review's upstream freeze. Against `4772b6a3e8c2`, the rerun
found ten raw intersections:

```text
AGENTS.md
bun.lock
packages/cli/src/server-process.ts
packages/core/src/config/plugin/skill.ts
packages/core/src/config.ts
packages/core/src/filesystem/watcher.ts
packages/core/test/config/config.test.ts
packages/core/test/filesystem/watcher.test.ts
packages/core/test/location-layer.test.ts
packages/server/src/routes.ts
```

The `98b4d82fcae6` summary independently proved that its only content was one
design rename, a `.gitignore` modification, and deletion of `AGENTS.md`:

```text
R .design/{watch => watchman}/draft1.gpt56t.md
M .gitignore
D AGENTS.md
```

Removing the contamination leaves nine current intersections, not only
`bun.lock`. That correction drove the carrier's requirement to re-author
upstream-owned hotspots on the then-current `v2@origin`.

**Goal served.** Carrier-boundary/collision auditing and upstream-drift
detection.

**Durability.** Durable. The shell is compact but too easy to run against a
stale base or wrong bookmark. `script/vcs/feature-line-audit.ts` should resolve
and print all three revisions before computing the sorted intersection, retain
both full input sets in JSON, classify lock/instruction files separately, and
exit nonzero only under a caller-selected policy.

## Upstream path-history drill-down

**Provenance:** Executed: carrier session.

The broad path log identified upstream commits that touched any current or
planned carrier hotspot.

```sh
jj log --no-graph -r '43d09b9d..v2@origin' packages/core/src/filesystem/watcher.ts packages/core/src/config.ts packages/core/src/config/plugin/skill.ts packages/core/src/config/plugin/agent.ts packages/core/src/config/plugin/command.ts packages/core/src/config/plugin/source.ts packages/core/src/vcs.ts packages/core/src/filesystem/location-watcher.ts packages/core/src/filesystem/location-watcher-policy.ts packages/core/src/config/plugin/location-watcher.ts packages/server/src/routes.ts packages/server/src/options.ts packages/cli/src/server-process.ts packages/core/package.json bun.lock -T 'commit_id.short() ++ " " ++ description.first_line() ++ "\n"'
```

The next commands read the current upstream shapes with stable display line
numbers. They were issued individually and are grouped here without changing
their text.

```sh
jj file show -r v2@origin packages/core/src/filesystem/watcher.ts | nl -ba | sed -n '1,340p'
jj file show -r v2@origin packages/core/src/config.ts | nl -ba | sed -n '1,430p'
jj file show -r v2@origin packages/core/src/config/plugin/skill.ts | nl -ba | sed -n '1,300p'
jj file show -r v2@origin packages/core/src/vcs.ts | nl -ba | sed -n '1,260p'
jj file show -r v2@origin packages/core/src/filesystem/location-watcher.ts | nl -ba | sed -n '1,180p'
jj file show -r v2@origin packages/server/src/routes.ts | nl -ba | sed -n '90,145p'
jj file show -r v2@origin packages/cli/src/server-process.ts | nl -ba | sed -n '110,160p'
jj file show -r v2@origin packages/core/test/filesystem/watcher.test.ts | nl -ba | sed -n '1,390p'
jj file show -r v2@origin packages/core/test/config/config.test.ts | nl -ba | sed -n '300,390p'
jj file show -r v2@origin packages/core/test/location-layer.test.ts | nl -ba | sed -n '1,180p'
```

I first attempted path-filtered `jj show` commands. `jj show` rejected the path
arguments, so the working form became `jj diff --git -r <commit> <files...>`.
The failed calls are retained because a durable wrapper should not rediscover
this CLI distinction.

```sh
jj show --git 7aabfd355461 -- packages/core/src/filesystem/watcher.ts packages/core/test/filesystem/watcher.test.ts packages/core/test/config/config.test.ts
jj show --git b45882ec8708 -- packages/core/src/config.ts packages/core/src/config/plugin/skill.ts packages/core/src/config/plugin/agent.ts packages/core/src/config/plugin/command.ts packages/core/src/config/plugin/source.ts
jj show --git 4b6e879ba83f -- packages/core/src/config/plugin/skill.ts packages/core/src/config/plugin/agent.ts packages/core/src/config/plugin/command.ts packages/core/src/config/plugin/source.ts
jj show --git 473c29252181 -- packages/core/src/config.ts packages/core/test/config/config.test.ts
jj show --git 33dd4e3ba8e9 -- packages/cli/src/server-process.ts
jj show --git e76e90b71e0b -- packages/server/src/routes.ts packages/core/src/filesystem/location-watcher.ts packages/core/test/filesystem/watcher.test.ts
```

Every failed call reported the same shape:

```text
error: unexpected argument 'packages/...' found

Usage: jj show [OPTIONS] [REVSET]
```

The corrected commands were:

```sh
jj diff --git -r 7aabfd355461 packages/core/src/filesystem/watcher.ts packages/core/test/filesystem/watcher.test.ts packages/core/test/config/config.test.ts
jj diff --git -r b45882ec8708 packages/core/src/config.ts packages/core/src/config/plugin/skill.ts packages/core/src/config/plugin/agent.ts packages/core/src/config/plugin/command.ts packages/core/src/config/plugin/source.ts
jj diff --git -r 4b6e879ba83f packages/core/src/config/plugin/skill.ts packages/core/src/config/plugin/agent.ts packages/core/src/config/plugin/command.ts packages/core/src/config/plugin/source.ts
jj diff --git -r 473c29252181 packages/core/src/config.ts packages/core/test/config/config.test.ts
jj diff --git -r 33dd4e3ba8e9 packages/cli/src/server-process.ts
jj diff --git -r e76e90b71e0b packages/server/src/routes.ts packages/core/src/filesystem/location-watcher.ts packages/core/test/filesystem/watcher.test.ts
```

**Result.** The drill-down identified upstream's routed in-memory watcher
(`7aabfd35`), source-side debounce (`b45882ec`), eager consumer subscriptions
(`4b6e879b`), canonical Config path resolution (`473c2925`), replacement server
process (`33dd4e3b`), plugin graph migration (`e76e90b7`), and later State API
rename. Those findings became explicit preservation requirements in C1-C5 and
C10 rather than conflict-resolution guesses.

**Goal served.** Upstream-drift detection and carrier-boundary auditing.

**Durability.** The semantic drill-down is one-shot and judgment-dependent.
The durable feature-line auditor should produce the candidate commit/path list,
but a human or reviewing agent should still read each selected diff and state
both intents. Automating the resolution decision would violate the patch
policy's semantic-collision bail-out.

## Historical commit sizing and fold audit

**Provenance:** Executed: carrier session.

The full historical log established every code/test commit that needed an
explicit fold disposition. Per-commit diffstats supplied rough carrier sizing
without pretending chronological commits were architectural slices.

```sh
jj log --no-graph -r '43d09b9d..@-' -T 'commit_id.short() ++ " " ++ description.first_line() ++ "\n"'
jj diff --stat -r 0ec2359fe72f
jj diff --stat -r 04d753adef84
jj diff --stat -r f63ad64de79d
jj diff --stat -r 4d00a833ad55
jj diff --stat -r 4d338ff1268e
jj diff --stat -r 1c2af67c2778
jj diff --stat -r a7b15cf2ce2e
jj diff --stat -r bca61e06becd
jj diff --stat -r 6fc4bba444ed
jj diff --stat -r d38bcfe3af2a
jj diff --stat -r 3a13e52cb542
jj diff --stat -r 84777a2af874
jj diff --stat -r 9d62e280938e
```

**Result.** All 13 non-documentation commits were accounted for in the
carrier's fold map. The stats exposed, among other things, that the original
root backend was about 1,000 changed lines including tests, channel metrics
were about 860 changed lines, and metrics option plumbing was a separate
29-line change that survives nowhere. This supported the final 12-commit size
ranges and the two-pass proof/recreate strategy.

**Goal served.** Carrier-boundary auditing and patches-policy no-diff-creep
reporting.

**Durability.** Durable as a carrier comparison mode. Proposed
`script/vcs/carrier-diff.ts` should compare an old feature range, proof tree,
and replacement range; emit per-commit and per-file stats; flag new files and
large unexplained growth; and require an attribution note for every difference.

## Harness-native source, test, and environment discovery

**Provenance:** Executed: carrier session.

These were actual OpenCode tool calls rather than shell commands. They found the
Watchman module/test inventory and checked whether ambient Watchman options were
already leaking into focused tests.

```json
functions.glob({"path":"packages/core/src/filesystem","pattern":"watcher/**/*.ts","limit":100})
functions.glob({"path":"packages/core/test","pattern":"**/*watch*.test.ts","limit":100})
functions.grep({"path":"packages/core/test","include":"*.test.ts","pattern":"OPENCODE_(WATCHMAN|WATCHER)_","limit":200})
functions.grep({"path":"packages/core/test","include":"*.test.ts","pattern":"process\\.env|Bun\\.env|OPENCODE_","limit":500})
functions.glob({"path":"packages","pattern":"**/test/**/env*.ts","limit":100})
functions.glob({"path":"packages","pattern":"**/test/fixture/**/*.ts","limit":200})
```

**Result.** The source inventory found eight files under
`watcher/`, including six downstream Watchman modules. The focused test glob
found `watchman-root`, `watchman-metrics`, `watchman-live`, `watcher`, and
`watcher-interests`. Only `watchman-live.test.ts` read a Watchman environment
variable in Core, and it used `OPENCODE_WATCHMAN_LIVE` solely as an explicit
suite gate. Broader inspection found existing
`packages/core/test/fixture/env.ts` and
`packages/cli/test/fixture/environment.ts`, so the carrier chose reuse and
extension over another environment helper. Reading `server-process.ts` then
showed that production startup, not root/backend unit tests, consumes the
runtime Watchman knobs.

**Goal served.** Deterministic test-matrix support, environment-hermeticity
validation, and failure-path gates.

**Durability.** The discovery calls are one-shot. Their conclusion should be
durable: Core lifecycle tests inject options directly; CLI subprocess fixtures
scrub `OPENCODE_WATCHER_*` and `OPENCODE_WATCHMAN_*`; and a focused test proves
ambient production exports cannot alter default assertions.

## Corpus sizing and table diagnostics

**Provenance:** Executed: carrier session.

```sh
wc -l .design/watchman/*.md
awk '/^\|/ { s=$0; n=gsub(/\|/, "|", s); print NR, n }' .design/watchman/carrier0.gpt56s.md
wc -l -w .design/watchman/carrier0.gpt56s.md
```

**Result.** Before this inventory, the Watchman corpus was 10,605 lines,
including the 1,144-line first carrier draft. The row pipe-count diagnostic
exposed literal `|` characters inside code spans in two tables; those cells
were rewritten as "`watchman` or `parcel`" before final rendering. The shown
`wc` invocation measured an intermediate 1,169-line, 8,470-word draft; the
final pre-commit `jj diff --stat` recorded 1,192 inserted lines.

**Goal served.** Doc-corpus QA and honest sizing of C12's folded docs commit.

**Durability.** Raw corpus sizing is one-shot. Table structure belongs in the
future Markdown parser-based corpus checker; counting pipe characters is a
useful diagnostic but too syntax-naive to be a merge gate.

## GFM, OKF, links, and line-range validation

**Provenance:** Executed: carrier session.

The final validation bundle parsed GitHub-flavored Markdown, parsed only the
opening OKF YAML block, verified root-relative and `file://` link targets,
verified every root-relative `#Lx-Ly` range against the target's current line
count, and checked whitespace and character policy.

```sh
pandoc --from=gfm --to=html .design/watchman/carrier0.gpt56s.md -o /dev/null
awk 'NR == 1 { next } /^---$/ { exit } { print }' .design/watchman/carrier0.gpt56s.md | yq eval '.' - >/dev/null
```

The exact local/file link checker was:

```sh
bash -lc '
doc=.design/watchman/carrier0.gpt56s.md
missing=0
while IFS= read -r target; do
  candidate=".${target}"
  if [[ ! -e "$candidate" ]]; then
    printf "missing local link: %s\n" "$target"
    missing=1
  fi
done < <(rg -o "\\]\\(/[^)#]+" "$doc" | sed "s/^](//" | sort -u)
while IFS= read -r target; do
  if [[ ! -e "$target" ]]; then
    printf "missing file link: %s\n" "$target"
    missing=1
  fi
done < <(rg -o "\\]\\(file:///[^)#]+" "$doc" | sed "s#^](file://##" | sort -u)
exit "$missing"
'
```

The exact line-range checker was:

```sh
bash -lc '
doc=.design/watchman/carrier0.gpt56s.md
bad=0
while IFS= read -r ref; do
  target=${ref%%#L*}
  range=${ref#*#L}
  end=${range#*-L}
  if [[ "$end" == "$range" ]]; then end=$range; fi
  lines=$(wc -l < ".${target}")
  if (( end > lines )); then
    printf "out-of-range link: %s (%s lines)\n" "$ref" "$lines"
    bad=1
  fi
done < <(rg -o "/[^)#]+#L[0-9]+(-L[0-9]+)?" "$doc" | sort -u)
exit "$bad"
'
```

The policy checks were:

```sh
rg -n '[[:blank:]]+$' .design/watchman/carrier0.gpt56s.md
LC_ALL=C rg -n '[^\x00-\x7F]' .design/watchman/carrier0.gpt56s.md
```

A Git-like whitespace shortcut was attempted first, but `jj diff` does not
implement it:

```sh
jj diff --check
```

```text
error: unexpected argument '--check' found

  tip: to pass '--check' as a value, use '-- --check'

Usage: jj diff [OPTIONS] [FILESETS]...

For more information, try '--help'.
```

**Result.** Pandoc, `yq`, both link scripts, and all target/range checks exited
zero with no diagnostics. Both `rg` policy checks exited one with no matches,
which is success for negative-match checks: no trailing whitespace and no
non-ASCII content. The one-file diff remained the only repository change.

**Goal served.** Doc-corpus QA and carrier-boundary auditing.

**Durability.** Strongly durable. Replace the shell bundle with
`script/docs/check-corpus.ts`, which should parse rather than regex Markdown,
validate required OKF fields and source records, resolve bundle-root-relative
and file links, validate both start and end line anchors, report stale external
paths separately, and understand allowed Unicode instead of banning it
globally. Expose it as `check:docs` and include it in the repository aggregate
`check` target.

### Failed first link-check attempt

The first version is worth retaining as a tooling failure. It ran in zsh,
assigned to zsh's special `path` array, and consequently lost command lookup;
the corrected checker uses `candidate` and an explicit Bash subshell.

```sh
doc=.design/watchman/carrier0.gpt56s.md
missing=0
while IFS= read -r target; do
  path=".${target}"
  if [[ ! -e "$path" ]]; then
    printf 'missing local link: %s\n' "$target"
    missing=1
  fi
done < <(perl -ne 'while (m{\]\((/[^)#]+)}g) {print "$1\n"}' "$doc" | sort -u)
while IFS= read -r target; do
  if [[ ! -e "$target" ]]; then
    printf 'missing file link: %s\n' "$target"
    missing=1
  fi
done < <(perl -ne 'while (m{\]\(file://(/[^)#]+)}g) {print "$1\n"}' "$doc" | sort -u)
exit $missing
```

```text
zsh:10: command not found: perl
zsh:10: command not found: sort
```

This is another reason the durable checker should be TypeScript rather than a
shell fragment sensitive to shell-specific tied variables and process
substitution.

## One-file scope, syntax, commit, and post-commit gate

**Provenance:** Executed: carrier session.

```sh
jj diff --name-only
jj diff --stat
jj diff --git -- .design/watchman/carrier0.gpt56s.md >/dev/null
jj commit -m "docs(watchman): plan clean-slate replacement carrier" .design/watchman/carrier0.gpt56s.md
jj log --no-graph -r '@-' -T 'commit_id ++ " " ++ description.first_line() ++ "\n"'
jj status
jj diff --summary -r '@-'
```

**Result.** Before commit, both scope commands named only
`.design/watchman/carrier0.gpt56s.md`; its final diff was 1,192 insertions. The
explicit-files commit produced
`0ca347b814de4130dc91c69c483391bd05835936`; the new working copy was empty;
and the committed summary contained one added file.

**Goal served.** Carrier-boundary auditing, doc-corpus QA, and lineage auditing.

**Durability.** The explicit `jj commit ... <file>` pattern remains the right
one-shot action. A reusable `script/vcs/change-scope.ts` should accept an
allowlist, reject additions outside it, record the pre-commit diffstat, and
optionally verify a committed revision afterward without staging or mutating
history.

## Carrier verification block written but not run

**Provenance:** Written: carrier session.

This is the exact final verification block written into the plan. It names
future files and therefore could not pass on the historical line. It is not an
executed result.

```sh
cd packages/core
bun typecheck
bun test test/filesystem/watcher.test.ts \
  test/filesystem/watcher-interests.test.ts \
  test/filesystem/ignore.test.ts

bun test test/config/config.test.ts \
  test/config/skill.test.ts \
  test/config/agent.test.ts \
  test/config/command.test.ts \
  test/config/plugin-source.test.ts \
  test/plugin/skill.test.ts

bun test test/filesystem/watchman-client.test.ts \
  test/filesystem/watchman-root.test.ts \
  test/filesystem/watchman-backend.test.ts \
  test/filesystem/watchman-observation.test.ts

bun test test/vcs.test.ts \
  test/vcs-hg.test.ts \
  test/vcs-watcher.test.ts \
  test/location-layer.test.ts

OPENCODE_WATCHMAN_LIVE=1 bun test test/filesystem/watchman-live.test.ts

cd ../server
bun typecheck
bun test test/options.test.ts

cd ../cli
bun typecheck
bun test test/server-process-watchman.test.ts
```

**Result.** Not run. The historical repo does not yet contain
`watchman-client.test.ts`, `watchman-backend.test.ts`,
`watchman-observation.test.ts`, `vcs-watcher.test.ts`,
`plugin-source.test.ts`, or `server-process-watchman.test.ts`.

**Goal served.** Deterministic test-matrix support and every failure-path
validation gate, including live daemon recovery and VCS allowlisting.

**Durability.** Durable once the carrier exists. Add package scripts for the
stable groups rather than preserving a long hand-maintained shell block:
`check:watchman`, `check:watchman-consumers`, `check:watchman-vcs`, and an
explicit opt-in `check:watchman-live`. The aggregate must keep live daemon tests
out of ordinary hermetic checks.

# Prior-wave tooling inspected

## Ownership-review evidence bundle

**Provenance:** Observed: prior wave. The commands below are verbatim from
[`review-ownership0.gpt56s.md:403-426`](/.design/watchman/review-ownership0.gpt56s.md#L403-L426).
I reused the `comm` method in the carrier session; I did not rerun every command
in this bundle.

```sh
jj git remote list
jj bookmark list --all-remotes
jj log -r 'heads(::@ & ::v2@origin)'
jj log --no-graph -r 'watchman..@-'
jj diff --summary --from 43d09b9d --to @-
jj diff --summary --from 43d09b9d --to @- -- patches
jj file annotate -r @- packages/core/src/filesystem/watcher.ts
jj log -r '43d09b9d..@-' -- packages/core/src/filesystem/watcher.ts packages/core/src/filesystem/watcher
comm -12 <(jj diff --name-only --from 43d09b9d --to @- | sort) <(jj diff --name-only --from 43d09b9d --to v2@origin | sort)
```

The review also ran this from the shared source archive, not from the workspace
whose `.git` belongs to beads:

```sh
git -C /home/rektide/archive/anomalyco/opencode log --follow \
  43d09b9d75ad5d74cda5bd29ab72319e724fbbb9 -- \
  packages/core/src/filesystem/watcher.ts
```

**Prior result.** The bundle established `v2@origin` as the actual anomalyco
remote, found `43d09b9d75ad` as the common ancestor, exposed six then-real
commits above the floating bookmark, separated downstream Watchman files from
upstream-owned seams, and produced the historical `{AGENTS.md, bun.lock}`
intersection. The archive Git query supplied inherited symbol history without
mistaking the workspace beads repo for OpenCode.

**Goal served.** Lineage/bookmark auditing, carrier-boundary/collision
auditing, and upstream-drift detection.

**Durability.** This is the direct prior-art seed for
`script/vcs/feature-line-audit.ts`. The durable tool should use `jj` for the
shared repository and only offer archive Git history as an explicitly labeled
read-only fallback. It must never infer that a remote named `upstream` is the
authority.

## Failure-review focused verification

**Provenance:** Observed: prior wave. This block is verbatim from
[`review-failure-paths0.gpt56s.md:673-686`](/.design/watchman/review-failure-paths0.gpt56s.md#L673-L686).

```sh
bun typecheck
bun test test/filesystem/watchman-root.test.ts \
  test/filesystem/watchman-metrics.test.ts
bun test test/filesystem/watcher.test.ts \
  test/filesystem/watcher-interests.test.ts
bun test test/filesystem/watcher.test.ts \
  --test-name-pattern 'publishes .hg/branch events'
```

**Prior result.** Core typecheck passed; Watchman root plus metrics passed
14/14; watcher plus interests passed 16 tests except for one occurrence of the
known `.hg/branch` five-second timeout; and the isolated `.hg/branch` test
passed in 47.59 ms. The separation between combined and isolated runs prevented
the load-sensitive Mercurial timeout from being misclassified as a Watchman
regression.

The review also reports six focused in-process probes, but it explicitly says
they were executed without creating repository files. No complete source text
or command invocation survives in the corpus. Their recorded outcomes were:

| Ephemeral probe | Recorded result |
| --- | --- |
| Complete `SubscribeResponse` decode | Effect Schema stripped files, clock, root, and fresh flag. |
| Native publish before acquisition return | The later logical Watcher stream did not receive it. |
| Fatal state across scopes | Shared while a root lease remained; absent after final release and reacquisition. |
| Fatal metric across scopes | Incorrectly remained true after successful reacquisition. |
| Concurrent nonfatal factory failure | First waiter failed; next waiter built a healthy client. |
| Admitted timeout flag | Could surface as `GenerationClosed(false)` and was not a sound policy discriminator. |

The missing probe source is itself a tooling finding: these results cannot be
rerun byte-for-byte. They should be reconstructed as named M1-M6 tests on a
shared scripted harness, not repeated as ad hoc in-process snippets.

**Goal served.** Validation gates from the failure-path review and deterministic
test-matrix support.

**Durability.** The focused commands become package scripts. The ad hoc probes
are one-shot evidence and should be retired only after equivalent deterministic
tests land.

## Existing scripted RawClient test double

**Provenance:** Observed: prior wave. The reusable core below is verbatim from
[`watchman-root.test.ts:9-60`](/packages/core/test/filesystem/watchman-root.test.ts#L9-L60).

```ts
type TestClient = RawClient & {
  readonly commands: (readonly unknown[])[]
  readonly emit: (event: string, value?: unknown) => void
  readonly ended: () => number
}

function client(
  respond: (
    args: readonly unknown[],
    callback: (error: Error | null, response?: unknown) => void,
    client: TestClient,
  ) => void = standard,
): TestClient {
  const listeners = new Map<string, (value?: unknown) => void>()
  const commands: (readonly unknown[])[] = []
  let ended = 0
  const result: TestClient = {
    commands,
    end: () => {
      ended++
    },
    ended: () => ended,
    command: (args, callback) => {
      commands.push(args)
      respond(args, callback, result)
    },
    capabilityCheck: (_capabilities, callback) => callback(null, { capabilities: { relative_root: true } }),
    on: (event, listener) => {
      listeners.set(event, listener)
      return result
    },
    emit: (event, value) => listeners.get(event)?.(value),
  }
  return result
}

function standard(args: readonly unknown[], callback: (error: Error | null, response?: unknown) => void) {
  if (args[0] === "watch") return callback(null, { watch: args[1] })
  if (args[0] === "clock") return callback(null, { clock: "c:1" })
  if (args[0] === "subscribe") return callback(null, { subscribe: args[2] })
  callback(null, { unsubscribe: args[2], deleted: true })
}

function input(target: string, updates: Watcher.Update[] = []) {
  return {
    type: "directory" as const,
    target,
    ignore: [] as const,
    placement: { type: "project" as const, root: "/repo" },
    publish: (update: Watcher.Update) => updates.push(update),
    fail: (_error: Error) => {},
  }
}
```

**Prior result.** This double already records commands, emits unilateral events,
counts `end()`, scripts command callbacks, and supplies standard watch/clock/
subscribe/unsubscribe responses. It enabled the existing root-sharing,
reconnect, cancellation, timeout, and unsubscribe tests. A near-copy also
exists in `watchman-metrics.test.ts`, proving the extraction opportunity.

**Goal served.** Deterministic test-matrix support, especially M1-M3 and M6.

**Durability.** Extract and deepen it under
`packages/core/test/filesystem/fixture/watchman/client.ts`. The durable harness
needs queued command expectations, named Deferred barriers, explicit command
admission, unilateral PDU routing, generation close/error/end controls,
deterministic backoff/jitter injection, and assertions for unconsumed scripted
steps.

## Maintenance README verification block

**Provenance:** Observed: prior wave. This is verbatim from
[`README.md:144-163`](/.design/watchman/README.md#L144-L163).

```sh
cd packages/core
bun typecheck
bun test test/filesystem/watchman-root.test.ts \
  test/filesystem/watcher-interests.test.ts \
  test/config/skill.test.ts \
  test/config/config.test.ts
OPENCODE_WATCHMAN_LIVE=1 bun test test/filesystem/watchman-live.test.ts

cd ../server
bun typecheck
bun test test/options.test.ts

cd ../cli
bun typecheck
```

**Prior result.** The maintenance record reports clean Core/Server/CLI
typechecks, focused Watchman/interest/Config/Skill results, and a passing live
watchwoman 0.7.0 suite across its 2026-08-30, 2026-08-31, and 2026-09-01 runs.
It also records the isolated `.hg/branch` flake, the watcher-sharing
`location-layer` gate, and metrics smoke runs.

**Goal served.** Failure-path validation gates and regression verification
across upstream-owned integration seams.

**Durability.** This block is the baseline for package scripts, but the final
carrier must replace the metrics suite and add B2 consumers, strict backend,
VCS targets, observation, and environment-hermeticity tests as listed in the
new carrier block.

## Fake metrics rendering smoke

**Provenance:** Observed: prior wave. The maintenance record points to this
pre-existing `.test-agent` script; author metadata is not preserved. Full file
[`smoke.ts`](/.test-agent/watchman-metrics/smoke.ts):

```ts
// Smoke: render one realistic wide metrics event from a fake watchman client.
import { Effect } from "effect"
import type { RawClient } from "@opencode-ai/core/filesystem/watcher/watchman/client"
import { makeRegistry } from "@opencode-ai/core/filesystem/watcher/watchman/root"

type Listener = (value?: unknown) => void

function fakeClient(): RawClient & { emit: (event: string, value?: unknown) => void } {
  const listeners = new Map<string, Listener>()
  const self: RawClient & { emit: (event: string, value?: unknown) => void } = {
    end: () => {},
    command: (args, callback) => {
      const label = String(args[0])
      setTimeout(() => {
        if (label === "watch") return callback(null, { watch: args[1] })
        if (label === "clock") return callback(null, { clock: "c:1693496400:1:2:3" })
        if (label === "subscribe") return callback(null, { subscribe: args[2] })
        callback(null, { unsubscribe: args[2], deleted: true })
      }, 3)
    },
    capabilityCheck: (_caps, callback) => setTimeout(() => callback(null, { capabilities: { relative_root: true } }), 2),
    on: (event, listener) => {
      listeners.set(event, listener)
      return self
    },
    emit: (event, value) => listeners.get(event)?.(value),
  }
  return self
}

await Effect.gen(function* () {
  const first = fakeClient()
  const second = fakeClient()
  let created = 0
  const registry = yield* makeRegistry(() => (++created === 1 ? first : second), { metricsIntervalMs: 0 })
  const config = yield* registry.subscribe(
    { type: "project", project: "/home/rektide/src/opencode-watchman" },
    {
      type: "directory",
      target: "/home/rektide/src/opencode-watchman/.opencode",
      ignore: ["session"],
      placement: { type: "project", root: "/home/rektide/src/opencode-watchman" },
      publish: () => {},
      fail: (error) => console.error("fail", error),
    },
  )
  const skills = yield* registry.subscribe(
    { type: "project", project: "/home/rektide/src/opencode-watchman" },
    {
      type: "directory",
      target: "/home/rektide/src/opencode-watchman/.opencode/skills",
      ignore: [],
      placement: { type: "project", root: "/home/rektide/src/opencode-watchman" },
      publish: () => {},
      fail: () => {},
    },
  )
  const external = yield* registry.subscribe(
    { type: "exact", target: "/etc/nixos" },
    {
      type: "directory",
      target: "/etc/nixos",
      ignore: [],
      placement: { type: "exact" },
      publish: () => {},
      fail: () => {},
    },
  )
  yield* Effect.sleep("20 millis")

  const files = Array.from({ length: 40 }, (_, i) => ({ name: `file-${i}.ts`, exists: true, new: true, type: "f" }))
  first.emit("subscription", {
    subscription: "opencode-1-1",
    root: "/home/rektide/src/opencode-watchman",
    clock: "c:1693496401:1:2:3",
    is_fresh_instance: false,
    files: [...files, { name: "session/one.json", exists: true, new: true, type: "f" }],
  })
  second.emit("subscription", {
    subscription: "opencode-1-1",
    root: "/etc/nixos",
    clock: "c:1693496402:1:2:3",
    is_fresh_instance: false,
    files: files.slice(0, 5),
  })
  yield* Effect.sleep("20 millis")
  yield* Effect.promise(() => skills.unsubscribe())
  yield* Effect.sleep("5 millis")

  const wide = registry.metrics.render("interval", 900_000, "wide")
  console.log(`--- wide (${wide[0].length} chars) ---`)
  console.log(wide[0])
  console.log("--- lines ---")
  for (const line of registry.metrics.render("final", 900_000, "lines")) console.log(line)

  yield* Effect.promise(() => config.unsubscribe())
  yield* Effect.promise(() => external.unsubscribe())
}).pipe(Effect.scoped, Effect.runPromise as never)
```

**Prior result.** It rendered a realistic two-root event in both `wide` and
`lines` modes, exercised ignored rows and subscription removal, and established
the approximately 3.3 KB sample size cited by the metrics guide.

**Goal served.** Failure-path observation and pre-trim metrics verification.

**Durability.** One-shot as written. It uses real timers, hard-coded paths, and
the wide/lines renderer that C11 deletes. Keep it as historical evidence; move
its fake-client and multi-root scenarios into deterministic tests on the shared
future harness.

## Live metrics smoke

**Provenance:** Observed: prior wave. Full pre-existing file
[`live-smoke.ts`](/.test-agent/watchman-metrics/live-smoke.ts):

```ts
// Live smoke: real watchwoman daemon, metrics interval 4s, watch a tmp dir,
// touch files, print what the server would console.log.
import { Effect } from "effect"
import { loadFactory } from "@opencode-ai/core/filesystem/watcher/watchman/client"
import { makeRegistry } from "@opencode-ai/core/filesystem/watcher/watchman/root"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-metrics-"))
await fs.mkdir(path.join(dir, "src"), { recursive: true })

await Effect.gen(function* () {
  const factory = yield* loadFactory()
  const registry = yield* makeRegistry(factory, { metricsIntervalMs: 4000, metricsMode: "wide" })
  const updates: string[] = []
  const sub = yield* registry.subscribe(
    { type: "project", project: dir },
    {
      type: "directory",
      target: path.join(dir, "src"),
      ignore: [],
      placement: { type: "project", root: dir },
      publish: (update) => updates.push(update.path),
      fail: (error) => console.error("fail", error),
    },
  )
  yield* Effect.sleep("200 millis")
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "src", "a.ts"), "one"))
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "src", "b.ts"), "two"))
  yield* Effect.promise(() => fs.writeFile(path.join(dir, "src", "a.ts"), "three"))
  yield* Effect.sleep("5 millis")
  yield* Effect.promise(() => fs.unlink(path.join(dir, "src", "b.ts")))
  yield* Effect.sleep("4500 millis")
  console.error(`updates seen: ${updates.length}`)
  yield* Effect.promise(() => sub.unsubscribe())
}).pipe(Effect.scoped, Effect.runPromise as never)

await fs.rm(dir, { recursive: true, force: true })
```

**Prior result.** Against watchwoman 0.7.0, the smoke observed daemon
coalescing: two writes to `a.ts` and create/delete of `b.ts` surfaced as two
updates. Its final metrics dump also exposed a best-effort unsubscribe response
racing generation shutdown.

**Goal served.** Live failure-path validation and observation honesty.

**Durability.** The exact metrics script is one-shot and becomes uncompilable
after metrics trim. Preserve the live mutation scenario in
`watchman-live.test.ts`; replace fixed sleeps with Deferred-visible milestones
where the API permits, and retain bounded timeouts only as hang guards.

## Historical metrics jq checks

**Provenance:** Observed: prior wave. Verbatim recipes from
[`metrics0.glm53.md:156-173`](/.design/watchman/metrics0.glm53.md#L156-L173):

```sh
# per-channel window activity
… | jq -c '.channels[] | {id, pdus: .delta.pdus_in, files: .delta.files_in, updates: .delta.updates_out}'

# churn and timeouts per window
… | jq -c '[.channels[] | {id, timeouts: .delta.command_timeouts, gens: .delta.generations, retries: .delta.reconnect_attempts, recovering, fatal}]'

# noisiest live subscription
… | jq -c '.channels[] | .subs[] | {target, files_in, updates_out, clock}'

# ignore-filter drop volume this window
… | jq -c '.totals_delta | {files_in, updates_out, dropped: (.files_in - .updates_out)}'
```

**Prior result.** These queries made channel churn, timeouts, cursor freeze,
fallbacks, and the old `files_in - updates_out` interpretation inspectable.
They helped establish which observations were operationally useful before the
consolidation decision.

**Goal served.** Failure-path observation.

**Durability.** Superseded one-shot tooling. The final design deletes cursor,
fallback, fatal-gauge, render-mode, and conflated `updates_out` fields. New
query examples should be written only after C11 fixes the transition event
shape and separates `exact_updates_out`, `invalidations_out`, and
`ignored_rows`.

## Watchwoman CLI validation recipe

**Provenance:** Observed: prior wave. Verbatim from
[`watchwoman0.unknown.md:410-423`](/.design/watchman/watchwoman0.unknown.md#L410-L423).
The comments identify commands that mutate scratch daemon state.

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

**Prior result.** The daemon review used these commands to verify version and
capabilities, recursive crawl/query performance, since-query behavior,
watch-project placement, subscription/unsubscribe behavior, lingering
subscriptions, and explicit cleanup of scratch roots. It found the marker-climb
hazard that made plain `watch` mandatory for the retained backend.

**Goal served.** Live validation gates from the failure-path and daemon reviews.

**Durability.** Durable as an operator recipe, not as an ordinary test. Move a
parameterized, safe subset to `.test-agent/watchman-live/README.md`; require a
fresh scratch root for mutating commands; and never expose `watch-del` through
production reconciliation.

## Watchwoman since-query probe

**Provenance:** Observed: prior wave in the separate watchwoman-systemd
workspace. The probe-backed reference attributes it to its 2026-09-01
watchwoman investigation. Full
[`probe.py`](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/probe.py):

```python
#!/usr/bin/env python3
"""Probe: since-query semantics (getEventsSince as a daemon since-query).

Verifies against a live daemon:
  A. since-query basics — tombstones (exists:false), new files, coalescing
  B. THE SHARP EDGE — bare clocks lose deletions after a GC sweep
  C. named cursors retain deletions across GC + advance atomically
  D. unknown/foreign clocks reset to a full result

Run:  ./probe.py [path-to-watchwoman-binary]
"""

import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BIN = sys.argv[1] if len(sys.argv) > 1 else str(
    Path(__file__).resolve().parents[2] / "target" / "debug" / "watchwoman"
)

workdir = Path(tempfile.mkdtemp(prefix="ww-since-probe-"))
sock = workdir / "sock"
root = workdir / "root"
root.mkdir()
(root / ".git").mkdir()

log = open(workdir / "daemon.log", "wb")
daemon = subprocess.Popen(
    [BIN, "--sockname", str(sock), "--foreground-daemon"],
    stdout=log, stderr=subprocess.STDOUT,
    env={**os.environ, "RUST_LOG": "debug"},
)
try:
    for _ in range(200):
        if sock.exists():
            break
        time.sleep(0.05)
    else:
        raise SystemExit(f"daemon never bound {sock}; log:\n{workdir/'daemon.log'}")

    s = socket.socket(socket.AF_UNIX)
    s.connect(str(sock))
    f = s.makefile("rw")
    s.settimeout(10)

    def call(*cmd):
        f.write(json.dumps(list(cmd)) + "\n")
        f.flush()
        resp = json.loads(f.readline())
        if "error" in resp:
            raise RuntimeError(f"{cmd[0]}: {resp['error']}")
        return resp

    def query(since, fields=("name", "exists")):
        return call("query", str(root), {
            "since": since, "fields": list(fields),
        })["files"]

    def rows(files):
        """name -> exists, from either object rows or bare names."""
        out = {}
        for r in files:
            if isinstance(r, str):
                out[r] = True  # bare-name shortcut implies exists
            else:
                out[r["name"]] = r.get("exists")
        return out

    def settle():
        time.sleep(0.3)  # >> the 5 ms event batch window

    call("watch-project", str(root))
    print(f"root: {root}\n")

    # --- A. since-query basics ---------------------------------------
    (root / "a.txt").write_text("1")
    (root / "b.txt").write_text("2")
    settle()
    c1 = call("clock", str(root))["clock"]
    (root / "a.txt").unlink()          # delete
    (root / "c.txt").write_text("3")   # create
    (root / "c.txt").write_text("3b")  # modify (coalesces with create)
    settle()
    r = rows(query(c1))
    print(f"A. query since {c1}:")
    print(f"   a.txt -> {r.get('a.txt')}   (expect False: tombstone)")
    print(f"   c.txt -> {r.get('c.txt')}   (expect True: created)")
    print(f"   b.txt present: {'b.txt' in r}   (expect False: unchanged)")
    assert r.get("a.txt") is False and r.get("c.txt") is True and "b.txt" not in r

    # --- B. bare clock vs tombstone GC --------------------------------
    c2 = call("clock", str(root))["clock"]
    (root / "b.txt").unlink()
    settle()
    # Confirm the deletion is visible *before* GC...
    pre = rows(query(c2))
    assert pre.get("b.txt") is False, f"pre-GC: {pre}"
    # ...force the 60s GC sweep now, then ask the same clock again.
    call("debug-gc-tick")
    post = rows(query(c2))
    print(f"B. bare-clock poller after debug-gc-tick:")
    print(f"   b.txt row present: {'b.txt' in post}   (expect False — deletion LOST)")
    assert "b.txt" not in post

    # --- C. named cursor retention ------------------------------------
    (root / "d.txt").write_text("4")
    settle()
    r = query("n:poller")  # first named query: advances cursor to now
    print(f"C1. cursor n:poller first query sees: {sorted(rows(r))}")
    (root / "c.txt").unlink()
    settle()
    call("debug-gc-tick")  # tombstone kept: oclock > cursor watermark
    r = rows(query("n:poller"))
    print(f"C2. after delete + GC, n:poller sees c.txt -> {r.get('c.txt')}   (expect False: retained)")
    assert r.get("c.txt") is False
    r2 = rows(query("n:poller"))
    print(f"C3. immediate re-query sees: {sorted(r2)}   (expect [] — cursor advanced)")
    assert "c.txt" not in r2 and not r2

    # --- D. foreign clock resets --------------------------------------
    bogus = "c:1:1:99999:1"  # different start/pid/root
    resp = call("query", str(root), {"since": bogus, "fields": ["name", "exists"]})
    names = sorted(rows(resp["files"]))
    fresh = resp.get("is_fresh_instance")
    print(f"D. foreign clock returns {len(names)} files (expect the whole live tree)")
    print(f"   is_fresh_instance: {fresh}")
    assert "d.txt" in names

    # --- E. daemon restart ---------------------------------------------
    c_old = call("clock", str(root))["clock"]
    (root / "e.txt").write_text("5")  # change the client will ask about
    settle()
    daemon.terminate()  # simulate crash/upgrade
    daemon.wait(timeout=5)
    daemon2 = subprocess.Popen(
        [BIN, "--sockname", str(sock), "--foreground-daemon"],
        stdout=log, stderr=subprocess.STDOUT,
        env={**os.environ, "RUST_LOG": "debug"},
    )
    try:
        for _ in range(200):
            if sock.exists():
                break
            time.sleep(0.05)
        else:
            raise SystemExit("daemon never re-bound after restart")
        s.close()
        s2 = socket.socket(socket.AF_UNIX)
        s2.connect(str(sock))
        s2.settimeout(10)
        f2 = s2.makefile("rw")

        def call2(*cmd):
            f2.write(json.dumps(list(cmd)) + "\n")
            f2.flush()
            return json.loads(f2.readline())

        # Roots are in-memory too: the old root handle is gone.
        gone = call2("watch-list")
        print(f"E1. watch-list after restart: {gone.get('roots')}   (expect [] — roots are in-memory)")
        assert not gone.get("roots")
        call2("watch-project", str(root))
        resp = call2("query", str(root), {
            "since": c_old, "fields": ["name", "exists"],
        })
        names = sorted(rows(resp["files"]))
        fresh = resp.get("is_fresh_instance")
        print(f"E2. since pre-restart clock {c_old}:")
        print(f"   -> {len(names)} files (expect the whole live tree, incl. e.txt)")
        print(f"   -> is_fresh_instance: {fresh}   (upstream watchman: True)")
        assert "e.txt" in names and "a.txt" in names
        # The named-cursor case: cursor memory is gone, degrades the same way.
        resp = call2("query", str(root), {"since": "n:poller", "fields": ["name", "exists"]})
        print(f"E3. since n:poller after restart: {len(resp['files'])} files, "
              f"is_fresh_instance: {resp.get('is_fresh_instance')}   (cursor memory gone)")
        assert resp["files"]
    finally:
        daemon2.terminate()
        try:
            daemon2.wait(timeout=5)
        except subprocess.TimeoutExpired:
            daemon2.kill()

    print("\nALL PROBES PASSED")
finally:
    daemon.terminate()
    try:
        daemon.wait(timeout=5)
    except subprocess.TimeoutExpired:
        daemon.kill()
    log.close()
    print(f"(scratch kept at {workdir})")
```

Its recorded invocation was:

```sh
cargo build -p watchwoman
.test-agent/since-queries/probe.py            # uses target/debug/watchwoman
# or: probe.py /path/to/other/watchwoman|watchman
```

**Prior result.** Every assertion passed. The probe demonstrated normal
create/delete/coalescing rows, bare-clock tombstone loss after forced GC, named
cursor retention and atomic advance, foreign-clock full-state reset, and
full-state behavior after daemon restart. That evidence informed the old cursor
analysis and, by exposing its complexity, the later decision to use fresh-clock
establishment plus subtree invalidation instead of cursor correctness.

**Goal served.** Daemon semantics and failure-path validation gates around
continuity loss.

**Durability.** Durable in the daemon repository, where `debug-gc-tick` and
wire behavior are owned. Do not copy it into OpenCode. Add a separate
subscribe-race scenario there for F4; OpenCode's live suite should consume only
the resulting public daemon contract.

## Jujutsu filesystem-layout probe

**Provenance:** Observed: prior jj-vcs wave. The VCS watch-target design cites
the `.test-agent/jj-flow-probe` corpus. Full
[`probe.sh`](file:///home/rektide/src/opencode-jj-vcs/.test-agent/jj-flow-probe/probe.sh):

```bash
#!/usr/bin/env bash
# Probe jj 0.40 on-disk layout to validate a filesystem-only rewrite of jjDiscover:
#   1. non-colocated main repo: .jj/repo shape, jj git root output, .jj/repo/git existence
#   2. colocated repo: same questions
#   3. secondary workspace: .jj/repo pointer shape + resolved target vs jj git root / jj workspace root
#   4. forgotten workspace: does the pointer still resolve?
set -euo pipefail
base="$(mktemp -d)"
trap 'rm -rf "$base"' EXIT

echo "=== 1. non-colocated main ==="
mkdir -p "$base/main/a/b"
(cd "$base/main" && jj git init --no-colocate >/dev/null)
echo "jj git root:        $(cd "$base/main/a/b" && jj git root)"
echo ".jj/repo is dir:    $([ -d "$base/main/.jj/repo" ] && echo yes || echo no)"
echo ".jj/repo/git is dir:$([ -d "$base/main/.jj/repo/git" ] && echo yes || echo no)"
echo ".jj/repo contents:  $(ls "$base/main/.jj/repo" | tr '\n' ' ')"

echo "=== 2. colocated ==="
mkdir -p "$base/colo"
(cd "$base/colo" && jj git init --colocate >/dev/null)
echo "jj git root:        $(cd "$base/colo" && jj git root)"
echo ".jj/repo is dir:    $([ -d "$base/colo/.jj/repo" ] && echo yes || echo no)"
echo ".jj/repo/git is dir:$([ -d "$base/colo/.jj/repo/git" ] && echo yes || echo no)"
echo ".git is dir:        $([ -d "$base/colo/.git" ] && echo yes || echo no)"

echo "=== 3. secondary workspace ==="
(cd "$base/main" && jj workspace add --name second "$base/second" >/dev/null)
echo "pointer is file:    $([ -f "$base/second/.jj/repo" ] && echo yes || echo no)"
echo "pointer content:    $(cat "$base/second/.jj/repo")"
echo "resolved target:    $(cd "$(dirname "$base/second/.jj/repo")" && realpath "$(cat "$base/second/.jj/repo")")"
echo "jj workspace root:  $(cd "$base/second" && jj workspace root)"
echo "jj git root:        $(cd "$base/second" && jj git root)"
echo "target/git is dir:  $([ -d "$(cd "$base/main" && realpath "$(cat "$base/second/.jj/repo")")/git" ] && echo yes || echo no)"

echo "=== 4. forgotten workspace ==="
(cd "$base/main" && jj workspace forget second >/dev/null)
echo "pointer still file: $([ -f "$base/second/.jj/repo" ] && echo yes || echo no)"
echo "resolved target:    $(cd "$(dirname "$base/second/.jj/repo")" && realpath "$(cat "$base/second/.jj/repo")" 2>&1 || echo DANGLING)"
echo "target/git is dir:  $([ -d "$(cd "$base/main" && realpath "$(cat "$base/second/.jj/repo")")/git" ] && echo yes || echo no)"

echo "=== 5. colocated main + secondary workspace ==="
(cd "$base/colo" && jj workspace add --name csecond "$base/csecond" >/dev/null)
echo "csecond pointer:    $(cat "$base/csecond/.jj/repo")"
echo "jj git root (csec): $(cd "$base/csecond" && jj git root)"
echo "store dir (colo):   $(ls "$base/colo/.jj/repo/store" 2>/dev/null | tr '\n' ' ')"
echo "store/git (colo):   $([ -e "$base/colo/.jj/repo/store/git" ] && echo exists || echo absent)"
echo "git_target content: $(cat "$base/colo/.jj/repo/store/git_target" 2>/dev/null || echo none)"
echo "main store/git:     $( [ -d "$base/main/.jj/repo/store/git" ] && echo dir || echo other )"

echo "=== 6. does --ignore-working-copy work on read-only cmds ==="
(cd "$base/main" && echo x > wctoggle.txt)
before="$(cd "$base/main" && jj log --no-graph -r @ -T commit_id --ignore-working-copy)"
touch "$base/main/wctoggle.txt" && echo y >> "$base/main/wctoggle.txt"
after_ignore="$(cd "$base/main" && jj log --no-graph -r @ -T commit_id --ignore-working-copy)"
after_live="$(cd "$base/main" && jj log --no-graph -r @ -T commit_id)"
echo "ignore flag stable: $([ "$before" = "$after_ignore" ] && echo yes || echo no)"
echo "live moved @:       $([ "$before" = "$after_live" ] && echo no-else-same || echo yes)"
```

**Prior result.** For jj 0.40.0, main repositories use a real `.jj/repo`
directory, secondary workspaces use a pointer to it, non-colocated Git lives at
`<repo>/store/git`, colocated Git resolves through `<repo>/store/git_target`,
and forgotten workspace pointers still resolve. `--ignore-working-copy` kept
metadata reads from moving `@`. These findings make one repo-global
`<vcs.store>/op_heads/heads` exact interest possible across workspaces.

**Goal served.** VCS allowlist design, cross-workspace validation, and
upstream-drift avoidance around jj layout.

**Durability.** Durable in the jj-vcs workspace, not this carrier. Keep it
version-stamped and rerun on jj upgrades. The OpenCode carrier needs only a
small fixture reproducing direct-directory and pointer-file layouts.

## Jujutsu auto-snapshot probe

**Provenance:** Observed: prior jj-vcs wave. Full
[`probe.sh`](file:///home/rektide/src/opencode-jj-vcs/.test-agent/jj-snapshot-probe/probe.sh):

```bash
#!/usr/bin/env bash
# Probe: does each jj command snapshot the working copy?
# A snapshot shows up as @'s commit_id changing after we edit a tracked file.
set -euo pipefail
cd "$(dirname "$0")"
rm -rf repo
jj git init --colocate repo >/dev/null
cd repo
echo one > file.txt
jj commit -m base >/dev/null          # file.txt committed as base
echo two >> file.txt                  # uncommitted working-copy edit

probe() {
  local label="$1"; shift
  local before after
  before=$(jj log --ignore-working-copy --no-graph -r @ -T commit_id)
  "$@" >/dev/null 2>&1 || true
  after=$(jj log --ignore-working-copy --no-graph -r @ -T commit_id)
  if [[ "$before" == "$after" ]]; then
    echo "no-snapshot: $label"
  else
    echo "SNAPSHOT:    $label"
  fi
  # leave the pending edit so the next probe has something to absorb? no:
  # after a snapshot the edit is absorbed; re-dirty for the next probe.
  echo two >> file.txt 2>/dev/null || true
}

# Commands our stack runs (packages/core/src/project.ts jjDiscover,
# packages/core/src/vcs/jj.ts adapter, packages/core/src/project/copy-strategies.ts):
probe "jj workspace root                (jjDiscover)"        jj workspace root
probe "jj git root                       (jjDiscover)"        jj git root
probe "jj workspace list                 (jjDiscover/labels/refresh)" jj workspace list
probe "jj log -r @  identity template    (adapter info)"      jj log --no-graph -r @ -T 'change_id'
probe "jj log -r trunk()                 (adapter review)"    jj log --no-graph -r 'trunk()' -T commit_id
probe "jj diff -r @  status template     (adapter status)"    jj diff -r @ -T 'path'
probe "jj diff -r @ --git                (adapter patch)"     jj diff -r @ --git
probe "jj log -r @ conflicted_files      (adapter conflicts)" jj log --no-graph -r @ -T 'conflict'
echo
echo "final @ description:"
jj log --ignore-working-copy --no-graph -r @ -T 'description ++ " empty=" ++ empty ++ "\n"'
cd ..
```

**Prior result.** The recorded probe distinguished metadata commands that
auto-snapshot from reads protected by `--ignore-working-copy`. The VCS target
design relies on protected metadata rereads remaining quiet so an
`op_heads/heads` notification cannot feed an endless refresh loop.

**Goal served.** Deterministic VCS invalidation, cross-workspace behavior, and
failure-path noise control.

**Durability.** Durable in the jj-vcs workspace. The final carrier's live VCS
gate should separately assert that its own metadata reread produces no new
`op_heads` event; it should not copy this broad command survey.

## Existing process and socket assessors

**Provenance:** Observed: prior operational wave. These files were present under
`.test-agent/watchman-fire/` but were not cited as evidence for the carrier
architecture. They are included because they reveal a second tooling domain:
host deployment diagnosis rather than code correctness.

Full [`assess-clients.sh`](/.test-agent/watchman-fire/assess-clients.sh):

```bash
#!/usr/bin/env bash
# Inventory every watchman-family daemon, which socket each serves,
# which client processes are connected (unix-socket inode -> peer pid),
# each client's WATCHMAN_SOCK env + binary age, and the tmux pane the
# client runs in. Read-only assessment for the flip-back cleanup.

set -u
out="$(cd "$(dirname "$0")" && pwd)/assess-$(date +%Y%m%dT%H%M%S).log"

say() { printf '%s\n' "$*" | tee -a "$out"; }

say "=== watchman-family processes ==="
ps -eo pid,ppid,lstart,etime,args | grep -E "watchman|watchwoman" | grep -v grep | tee -a "$out"

say ""
say "=== systemd sockets (user) ==="
systemctl --user list-sockets --no-pager 2>/dev/null | grep -iE "watch|sock" | tee -a "$out"

say ""
say "=== unix listeners on watchman paths ==="
ss -xl 2>/dev/null | grep -iE "watchman|rektide-state" | tee -a "$out"

# daemon pids: any process whose exe or argv matches watchman/watchwoman
mapfile -t daemons < <(pgrep -f "watchman|watchwoman" 2>/dev/null | while read -r p; do
  [ "$p" = "$$" ] && continue
  exe=$(readlink "/proc/$p/exe" 2>/dev/null) || continue
  case "$exe" in *watchman*|*watchwoman*) echo "$p" ;; esac
done)

say ""
say "=== per-daemon client map ==="
# Build pid->tmux-pane lookup once.
declare -A PANE_OF
while IFS=$'\t' read -r pane_pid pane_desc; do
  PANE_OF["$pane_pid"]="$pane_desc"
done < <(tmux list-panes -a -F '#{pane_pid}	#{session_name}:#{window_index} #{pane_current_command}' 2>/dev/null)

pane_for() {
  local p="$1" chain=""
  while [ "$p" ] && [ "$p" != "1" ]; do
    if [ -n "${PANE_OF[$p]:-}" ]; then printf '%s (via %s)' "${PANE_OF[$p]}" "$chain"; return; fi
    chain="$chain $p"
    p=$(awk '/^PPid:/{print $2}' "/proc/$p/status" 2>/dev/null)
  done
  printf 'NO-TMUX-PANE (parent chain:%s)' "$chain"
}

for d in "${daemons[@]:-none}"; do
  [ "$d" = "none" ] && continue
  say ""
  say "daemon $d exe=$(readlink /proc/$d/exe 2>/dev/null) started=$(ps -o lstart= -p "$d" 2>/dev/null | tr -s ' ')"
  say "  cmdline: $(tr '\0' ' ' </proc/$d/cmdline 2>/dev/null | cut -c1-160)"
  for fdlink in /proc/$d/fd/*; do
    tgt=$(readlink "$fdlink" 2>/dev/null) || continue
    case "$tgt" in
      socket:*)
        ino=${tgt#socket:[}; ino=${ino%]}
        [ -n "$ino" ] || continue
        peers=$(find /proc/[0-9]*/fd -maxdepth 1 -lname "socket:\[$ino\]" -printf '%h\n' 2>/dev/null \
          | sed 's|/proc/||; s|/fd||' | sort -u | grep -vx "$d" || true)
        for peer in $peers; do
          [ -d "/proc/$peer" ] || continue
          exe=$(readlink "/proc/$peer/exe" 2>/dev/null)
          wsock=$(tr '\0' '\n' <"/proc/$peer/environ" 2>/dev/null | grep '^WATCHMAN_SOCK=' | head -1 | cut -d= -f2-)
          back=$(tr '\0' '\n' <"/proc/$peer/environ" 2>/dev/null | grep '^OPENCODE_WATCHER_BACKEND=' | head -1 | cut -d= -f2-)
          started=$(ps -o lstart= -p "$peer" 2>/dev/null | tr -s ' ')
          say "  client $peer exe=$exe"
          say "    started=$started WATCHMAN_SOCK=${wsock:-<unset>} BACKEND=${back:-<unset>}"
          say "    tmux: $(pane_for "$peer")"
          say "    cmd: $(tr '\0' ' ' </proc/$peer/cmdline 2>/dev/null | cut -c1-140)"
        done
        ;;
    esac
  done
done

say ""
say "=== summary ==="
say "log: $out"
```

Full [`env-assess.sh`](/.test-agent/watchman-fire/env-assess.sh):

```bash
#!/usr/bin/env bash
# Bucket every opencode-family process by the watchman endpoint its
# environment points at, and map each to its tmux pane so stale
# environments can be refreshed deliberately.

set -u
out="$(cd "$(dirname "$0")" && pwd)/env-assess-$(date +%Y%m%dT%H%M%S).log"
say() { printf '%s\n' "$*" | tee -a "$out"; }

# pid -> tmux pane (walk PPid up to a pane_pid)
declare -A PANE_OF
while IFS=$'\t' read -r pane_pid pane_desc; do
  PANE_OF["$pane_pid"]="$pane_desc"
done < <(tmux list-panes -a -F '#{pane_pid}	#{session_name}:#{window_index} #{pane_current_command}' 2>/dev/null)

pane_for() {
  local p="$1" hops=0
  while [ "$p" ] && [ "$p" != "1" ] && [ "$hops" -lt 12 ]; do
    if [ -n "${PANE_OF[$p]:-}" ]; then printf '%s' "${PANE_OF[$p]}"; return; fi
    p=$(awk '/^PPid:/{print $2}' "/proc/$p/status" 2>/dev/null)
    hops=$((hops + 1))
  done
  printf 'no-tmux'
}

say "=== opencode-family processes by watchman endpoint ==="
pgrep -f "opencode" 2>/dev/null | sort -n | while read -r p; do
  exe=$(readlink "/proc/$p/exe" 2>/dev/null) || continue
  cmd=$(tr '\0' ' ' <"/proc/$p/cmdline" 2>/dev/null | cut -c1-110)
  wsock=$(tr '\0' '\n' <"/proc/$p/environ" 2>/dev/null | grep '^WATCHMAN_SOCK=' | head -1 | cut -d= -f2-)
  back=$(tr '\0' '\n' <"/proc/$p/environ" 2>/dev/null | grep '^OPENCODE_WATCHER_BACKEND=' | head -1 | cut -d= -f2-)
  case "$wsock" in
    "/home/rektide/.local/var/lib/watchman-main/sock") bucket="OLD-PATH (upstream watchman-main)" ;;
    "/home/rektide/.local/state/watchman/rektide-state/sock") bucket="NEW-PATH (watchwoman state-home)" ;;
    "") bucket="UNSET (defaults to state-home via CLI resolution)" ;;
    *) bucket="OTHER: $wsock" ;;
  esac
  say "pid $p | $bucket | backend=${back:-unset}"
  say "   pane: $(pane_for "$p")"
  say "   exe:  $exe"
  say "   cmd:  $cmd"
done

say ""
say "=== tmux sessions/windows overview ==="
tmux list-windows -a -F '#{session_name}:#{window_index} #{window_name} | #{pane_current_command} | panes=#{window_panes}' 2>/dev/null | tee -a "$out"
say ""
say "log: $out"
```

**Prior result.** The retained logs show two simultaneous daemons on different
Unix sockets and OpenCode-family processes split between an explicit old socket
and an unset/default-resolved socket. Several clients were running deleted
binary images. This proved that process environment and binary age can explain
apparently inconsistent backend behavior even when source configuration is
uniform.

**Goal served.** Operational failure-path validation and environment
hermeticity evidence.

**Durability.** One-shot as written because usernames, paths, process names,
tmux assumptions, Linux `/proc`, and old/new labels are hard-coded. The read-only
logic deserves a parameterized `script/watchman/process-audit.ts` that discovers
socket paths, reports JSON plus a human table, never mistakes its own process
for a client, and keeps mutation out of the assessor.

## Incident root reappearance catcher

**Provenance:** Observed: prior operational wave. Full
[`catch-culprit.sh`](/.test-agent/watchman-fire/catch-culprit.sh):

```bash
#!/usr/bin/env bash
# Poll for /home/rektide reappearing in the watch list; the instant it does,
# map the daemon's accepted-socket inodes to peer client PIDs via /proc.
# Logs everything into this directory. Exits after one capture or 20 min.

set -u
dir="$(cd "$(dirname "$0")" && pwd)"
out="$dir/culprit-$(date +%Y%m%dT%H%M%S).log"

echo "watching for /home/rektide root, start $(date)" >>"$out"
for i in $(seq 1 240); do
  if watchman watch-list 2>/dev/null | grep -q '"/home/rektide"'; then
    {
      echo "=== HOME ROOT WATCHED at $(date) ==="
      dpid=$(pgrep -x watchwoman | head -1)
      echo "daemon pid: $dpid"
      watchman status 2>/dev/null
      echo "--- ss ---"
      ss -xp 2>/dev/null | grep "rektide-state"
      echo "--- inode -> peer pid mapping ---"
      # every socket fd the daemon holds
      for fdlink in /proc/$dpid/fd/*; do
        tgt=$(readlink "$fdlink" 2>/dev/null) || continue
        case "$tgt" in
          socket:*)
            ino=${tgt#socket:[}; ino=${ino%]}
            [ -n "$ino" ] || continue
            # find other processes holding the same socket inode (unix peers share it)
            peers=$(find /proc/[0-9]*/fd -maxdepth 1 -lname "socket:\[$ino\]" -printf '%h\n' 2>/dev/null \
              | sed 's|/proc/||; s|/fd||' | sort -u | grep -v "^$dpid$" || true)
            if [ -n "$peers" ]; then
              echo "inode $ino (daemon fd ${fdlink##*/}) peers: $peers"
              for p in $peers; do
                echo "  pid $p exe=$(readlink /proc/$p/exe 2>/dev/null) cwd=$(readlink /proc/$p/cwd 2>/dev/null)"
                echo "  cmdline: $(tr '\0' ' ' </proc/$p/cmdline 2>/dev/null | cut -c1-300)"
              done
            fi
            ;;
        esac
      done
      echo "=== capture done $(date) ==="
    } >>"$out" 2>&1
    exit 0
  fi
  sleep 5
done
echo "no home root observed in 20min, end $(date)" >>"$out"
```

**Prior result.** The retained log contains only the start marker; no culprit
capture or normal timeout line survives. It therefore proves that the probe was
started, not that the home-root recurrence was absent for the full interval.

**Goal served.** One operational root-placement failure path.

**Durability.** One-shot. A generalized process audit plus root-transition
observation should make polling a hard-coded root unnecessary. Keep this only
as incident history.

## Standalone-client cutover helper

**Provenance:** Observed: prior operational wave. Full
[`cutover.sh`](/.test-agent/watchman-cutover/cutover.sh):

```bash
#!/usr/bin/env bash
set -euo pipefail

old_socket="${HOME}/.local/state/watchman/$(id -un)-state/sock"
new_socket="${HOME}/.local/var/lib/watchman-main/sock"
message='echo "watchman-main shell configuration loaded"; exec zsh'
execute=0

if [[ "${1:-}" == "--execute" ]]; then
  execute=1
elif [[ "${1:-}" != "" ]]; then
  printf 'usage: %s [--execute]\n' "$0" >&2
  exit 2
fi

declare -A standalone_pids=()
declare -A pane_targets=()

# Find peer socket inodes for the old pathname, then resolve those inodes to
# client processes. This avoids assuming which daemon won a duplicated bind.
while read -r inode; do
  [[ "$inode" =~ ^[0-9]+$ ]] || continue
  while read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    command_line=$(ps -o args= -p "$pid" 2>/dev/null || true)
    [[ "$command_line" == *"opencode2 --standalone"* ]] || continue
    standalone_pids["$pid"]="$pid"
  done < <(lsof -nU 2>/dev/null | awk -v inode="$inode" '$0 ~ (" " inode " ") {print $2}' | sort -u)
done < <(ss -xap 2>/dev/null | awk -v socket="$old_socket" '$0 ~ socket {for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+$/) print $i}' | sort -u)

pane_for_pid() {
  local pid="$1"
  local pane pane_pid parent
  while read -r pane pane_pid; do
    parent="$pid"
    while [[ "$parent" =~ ^[0-9]+$ && "$parent" != "1" ]]; do
      [[ "$parent" == "$pane_pid" ]] && printf '%s\n' "$pane" && return 0
      parent=$(ps -o ppid= -p "$parent" 2>/dev/null | tr -d ' ' || true)
    done
  done < <(tmux list-panes -a -F '#{session_name}:#{window_index}.#{pane_index} #{pane_pid}' 2>/dev/null)
  return 1
}

printf 'old socket: %s\nnew socket: %s\n' "$old_socket" "$new_socket"
printf 'mode: %s\n' "$([[ "$execute" == 1 ]] && printf execute || printf dry-run)"

if ((${#standalone_pids[@]} == 0)); then
  printf 'No standalone OpenCode clients were found on the old socket.\n'
else
  for pid in "${!standalone_pids[@]}"; do
    pane=$(pane_for_pid "$pid" || true)
    if [[ -z "$pane" ]]; then
      printf 'standalone pid=%s pane=NOT_FOUND\n' "$pid"
      continue
    fi
    pane_targets["$pane"]="$pid"
    printf 'standalone pid=%s pane=%s cwd=%s\n' "$pid" "$pane" "$(readlink "/proc/$pid/cwd")"
  done
fi

if ((${#pane_targets[@]} > 0)); then
  printf '\nManual command examples after the panes return to zsh:\n'
  for pane in "${!pane_targets[@]}"; do
    printf 'tmux send-keys -t %q -l -- %q Enter\n' "$pane" "$message"
  done
fi

if ((execute == 0)); then
  printf '\nDry-run only. Re-run with --execute to modify ~/.zshrc, notify panes, and terminate these standalone processes.\n'
  exit 0
fi

for pane in "${!pane_targets[@]}"; do
  printf 'Notifying %s\n' "$pane"
  tmux send-keys -t "$pane" -l -- "$message"
  tmux send-keys -t "$pane" Enter
done

for pid in "${!standalone_pids[@]}"; do
  if kill -0 "$pid" 2>/dev/null; then
    while read -r child; do
      [[ "$child" =~ ^[0-9]+$ ]] || continue
      printf 'Terminating standalone OpenCode child pid=%s\n' "$child"
      kill -TERM "$child" 2>/dev/null || true
    done < <(pgrep -P "$pid" || true)
    printf 'Terminating standalone OpenCode pid=%s\n' "$pid"
    kill -TERM "$pid"
  fi
done

for pane in "${!pane_targets[@]}"; do
  for _ in {1..50}; do
    [[ "$(tmux display-message -p -t "$pane" '#{pane_current_command}' 2>/dev/null || true)" == "zsh" ]] && break
    sleep 0.2
  done
  if [[ "$(tmux display-message -p -t "$pane" '#{pane_current_command}' 2>/dev/null || true)" != "zsh" ]]; then
    printf 'Skipping %s: pane did not return to zsh\n' "$pane" >&2
    continue
  fi
  printf 'Sending shell reset to %s\n' "$pane"
  tmux send-keys -t "$pane" -l -- "$message"
  tmux send-keys -t "$pane" Enter
done

printf '\nStandalone OpenCode processes were signalled, panes were awaited, and shell resets were sent where safe. The system opencode.service and old Watchman daemons were not touched.\n'
```

The recorded operator interface was:

```sh
./.test-agent/watchman-cutover/cutover.sh
./.test-agent/watchman-cutover/cutover.sh --execute
```

**Prior result.** The README documents a dry-run-first migration of matching
standalone OpenCode processes and tmux panes. No execution log is retained, so
this inventory does not claim that `--execute` ran or that a cutover completed.

**Goal served.** Host migration and operational validation, not carrier code
correctness.

**Durability.** Intentionally one-shot. It terminates processes, sends tmux
input, assumes zsh, and embeds historical socket roles. Keep it in
`.test-agent/watchman-cutover/`; do not promote a destructive migration helper
to a routine repository command. Reuse only its dry-run and explicit-approval
principles.

# Future tool candidates

## 1. Scripted Watchman protocol harness

**Proposed home:**
`packages/core/test/filesystem/fixture/watchman/harness.ts` with smaller
`client.ts`, `script.ts`, and `assertions.ts` modules if the final interface
cannot remain deep in one file.

This is the highest-value gap. The existing `client()` helper is a callback
stub, while M1-M3 and M6 need a protocol actor that can coordinate several
callers and generations without wall-clock guesses.

The harness should provide:

- A queue of expected `capabilityCheck`, `watch`, `clock`, `subscribe`, and
  `unsubscribe` calls with exact argument matchers.
- Named Deferred barriers for "submitted", "respond now", "generation ended",
  and "PDU delivered" rather than `Effect.sleep`.
- Explicit response, callback error, malformed response, no-response timeout,
  transport `error`, transport `end`, canceled PDU, fresh-instance PDU, and
  normal PDU actions.
- Multiple root factories and generation IDs so root isolation and collateral
  interests are observable.
- An injected sleeper and deterministic jitter source with recorded retry
  intervals.
- End-of-test assertions for unconsumed script steps, leaked listeners,
  unexpected commands, and extra `end()` calls.
- Helpers that build complete subscribe responses, including fields the client
  intentionally ignores, so M1 proves fresh-clock invalidation rather than an
  incomplete fixture.

**Acceptance.** M1-M3 and M6 run with no real daemon, random values, or
ordering sleeps; every transition is released by a test-owned barrier; and the
same harness replaces the duplicated clients in root and observation tests.

**Goals served.** Deterministic test-matrix support and validation gates from
the failure-path review.

## 2. Read-only jj feature/carrier auditor

**Proposed home:** `script/vcs/feature-line-audit.ts`, with a
`script/vcs/carrier-diff.ts` module if the reporting surface becomes too broad.

This combines three carrier-session checks that share revision resolution and
should not drift independently:

- Lineage and remote truth: authoritative remote URL, exact upstream tip,
  merge base, floating bookmark, dated snapshots, and real work above the
  floating bookmark.
- Collision truth: both changed-file sets, their intersection, special
  classification of lockfiles and instruction files, and upstream commits that
  touched each intersecting path.
- No-diff-creep truth: old/proof/carrier per-file stats, added/removed path
  inventory, downstream-only versus upstream-owned classification, and a field
  for the required human explanation of every unexpected delta.

Use async subprocess APIs and `jj` exclusively in a workspace. The command
should accept explicit revisions rather than hide a frozen base, print resolved
full commit IDs before analysis, produce JSON plus a Markdown freshen-report
fragment, and never write commits or bookmarks. Semantic overlap remains a
human bail-out decision.

**Acceptance.** Given the carrier freeze inputs, the tool reproduces the ten
raw intersections and 40-commit count; after a supplied contamination-exclusion
spec it reports nine intersections; it detects real work above `watchman`; and
its report contains every item required by the patches policy's freshen
reporting section.

**Goals served.** Carrier-boundary/collision auditing, lineage/bookmark
auditing, upstream-drift detection, and no-diff-creep reporting.

## 3. Documentation corpus checker

**Proposed home:** `script/docs/check-corpus.ts`, exposed as `check:docs` and
included in the repository's aggregate `check` script.

The shell validation proved useful but is too dependent on regex and shell
behavior. A durable checker should:

- Parse GFM and reject malformed tables, fences, and links.
- Parse the first YAML block and validate required OKF fields, generated and
  verified identities, dates, status, resource, source IDs, and canonical
  resource forms.
- Resolve `/...` links against the bundle root and `file://` links against the
  local filesystem, with a configurable policy for host-specific references.
- Validate `#Lx` and `#Lx-Ly` start/end ranges and reject reversed or partial
  anchors.
- Detect duplicate resources, broken reciprocal references, missing model
  suffixes on wave files, stale-after dates, trailing whitespace, and
  accidental non-ASCII while allowing verbatim sourced blocks such as the
  probe in this inventory.
- Emit a concise terminal report and machine-readable JSON rather than relying
  on a series of silent exit codes.

**Acceptance.** It passes the current Watchman corpus, catches a deliberately
broken root-relative link, catches an end line past EOF, catches the two
unescaped table-pipe examples the ad hoc count exposed, and distinguishes
allowed source-block Unicode from accidental prose Unicode.

**Goals served.** Doc-corpus QA and durable carrier documentation gates.

## 4. Live daemon lifecycle and VCS allowlist orchestrator

**Proposed home:** deterministic fixtures under
`packages/core/test/filesystem/fixture/watchman/daemon.ts`, with opt-in operator
entrypoints under `.test-agent/watchman-live/`.

The current live test proves one update. The final carrier requires a controlled
daemon-absent start, delayed daemon appearance, restart during writes/deletes,
exact external roots, many roots, canceled subscriptions, daemon-side VCS
allowlisting, excluded churn, and a two-jj-workspace `op_heads/heads` signal.
The orchestrator should create its own socket and scratch roots, start and stop
the daemon it owns, capture logs, and leave the user's system daemon and roots
untouched.

**Acceptance.** One opt-in command runs every live row, records daemon binary
and version, proves the allowlist positively and negatively, and emits an
artifact directory sufficient to diagnose a timeout.

**Goals served.** Live failure-path gates, VCS allowlist verification, and
cross-workspace invalidation.

## 5. Watchman process auditor

**Proposed home:** `script/watchman/process-audit.ts`.

Parameterize and merge the useful read-only parts of `assess-clients.sh` and
`env-assess.sh`: daemon binaries, listening Unix sockets, client peers, inherited
`WATCHMAN_SOCK`, selected backend, executable path/deleted status, parent chain,
and optional tmux pane. Linux-specific collectors should be explicit modules,
and missing permissions should produce unknown fields rather than silently
empty maps.

**Acceptance.** It reports both historical socket topologies without hard-coded
user paths, excludes itself, has a JSON schema, and performs no process, tmux,
shell, or daemon mutation.

**Goals served.** Operational failure-path diagnosis and environment
hermeticity.

## 6. Watchman environment fixture policy

**Proposed home:** extend `packages/cli/test/fixture/environment.ts`; reuse
`packages/core/test/fixture/env.ts` for in-process tests.

This is primarily a test-helper change rather than a standalone tool. Define
the complete runtime variable family in one place, scrub it before explicit
overrides, and add a startup/options test that seeds hostile ambient values.
Keep `OPENCODE_WATCHMAN_LIVE` outside the runtime family because it is a test
selection gate.

**Acceptance.** Focused server/CLI defaults are identical with and without
ambient production Watchman exports, while every explicit valid/invalid
override remains covered.

**Goals served.** Deterministic test support and environment-related validation
gates.

## Recommended build order

| Rank | Candidate | Why first |
| ---: | --- | --- |
| 1 | Scripted Watchman protocol harness | It turns the highest-risk supervisor and disposition work into deterministic M1-M3/M6 tests before implementation. |
| 2 | Read-only jj feature/carrier auditor | It protects the imminent old-line surgery and clean-carrier rebuild while upstream and bookmarks continue moving. |
| 3 | Documentation corpus checker | The corpus already exceeds ten thousand lines and carries many exact local/host line links; silent drift is now likely. |
| 4 | Live daemon/VCS orchestrator | Required before final promotion, but most policy can first be proved hermetically. |
| 5 | Environment fixture policy | Small and valuable; naturally lands with C10 rather than blocking C1-C9. |
| 6 | Process auditor | Operationally useful but not required to construct the carrier. |

# What should remain one-shot

- Semantic interpretation of upstream commits remains review work. A tool can
  find candidate overlap; it cannot decide that two intents are compatible.
- `watchman-cutover/cutover.sh` remains a dated host migration artifact because
  it terminates processes and injects tmux input.
- Historical wide/lines metrics rendering and `jq` recipes remain evidence;
  their schema is deliberately deleted by the final carrier.
- The home-root culprit poller remains incident history; compact root
  transitions and a read-only process auditor replace it.
- Raw corpus line/word counts remain planning aids, not quality gates.
- Exact `jj file show | nl | sed` slices remain useful investigation commands;
  freezing their ranges into a generic tool would add ceremony without
  automating judgment.

# Cross-references

- [`carrier0.gpt56s.md`](/.design/watchman/carrier0.gpt56s.md) consumes the
  executed collision/doc checks, maps M1-M6 to C1-C11, and defines the final
  verification and branch-promotion gates this inventory proposes automating.
- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) supplies the final
  strict/B2 direction and the requirement that contract failures be pinned with
  scripted callbacks and Deferred barriers before policy implementation.
- [`review-ownership0.gpt56s.md`](/.design/watchman/review-ownership0.gpt56s.md)
  is the prior-art evidence-command bundle for remote truth, merge-base,
  bookmark debt, changed-file intersection, annotations, and path history.
- [`review-failure-paths0.gpt56s.md`](/.design/watchman/review-failure-paths0.gpt56s.md)
  supplies the focused verification record, ephemeral-probe findings, and
  deterministic M1-M6 matrix that motivates the reusable protocol harness.
- [`README.md:144-163`](/.design/watchman/README.md#L144-L163) is the historical
  package-level verification baseline; the carrier expands it with B2, strict
  backend, VCS, observation, and environment gates.
- [`watchwoman0.unknown.md`](/.design/watchman/watchwoman0.unknown.md) records
  the daemon CLI recipe and live findings behind plain-watch routing and safe
  scratch-root cleanup.
- [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) documents the
  fake/live smoke artifacts and query recipes that are retained as historical
  evidence but not as final metrics contracts.
- [`watches.glm53.md`](/.design/watchman/watches.glm53.md) relies on the jj
  filesystem probes and defines the live allowlist and cross-workspace checks
  still missing from OpenCode tooling.
- [Watchwoman since-query probe](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/probe.py)
  is daemon-owned executable evidence for clock, tombstone, cursor, and restart
  semantics.
- [OpenCode patch policy](file:///home/rektide/a/doc/opencode/patches.md)
  defines the lineage, collision bail-out, no-diff-creep, verification, and
  reporting obligations for the proposed feature/carrier auditor.
