---
type: Index
title: Watchman design corpus
description: What the Watchman and observation documents say, how to use them, their chronology, and their dependency graph across the current and sibling workspaces.
resource: /.design/watchman/README.md
tags: [opencode, watchman, watchwoman, filesystem, index]
status: stable
generated: { by: model:glm-5.3-flash, at: 2026-09-03T23:59:00Z }
verified: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-04 }
stale_after: 2026-10-15
sources:
  - id: maintenance-log
    resource: /.design/watchman/maintenance.glm53.md
  - id: current-route
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
  - id: architecture-direction
    resource: /.design/watchman/direction0.gpt56solmax.md
  - id: human-decisions
    resource: /.design/watchman/vision0.gpt56s.md
  - id: current-orientation
    resource: file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md
  - id: scope-reassessment
    resource: /.design/watchman/rebuild-assessment0.gpt56solxh.md
  - id: crossing-contract
    resource: /.design/watchman/contract0.glm53max.md
  - id: watchwoman-direction
    resource: file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md
  - id: watchwoman-rebuild-audit
    resource: file:///home/rektide/src/watchwoman-systemd/.design/rebuild-audit/rebuild-audit0.gpt56solmid.md
  - id: current-implementation-handoff
    resource: /.design/watchman/static-selection-handoff.unknown.md
  - id: current-carrier-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
  - id: corpus-read
    resource: /.design/watchman/tools0.gpt56s.md
---

# Watchman design corpus

> **Current state:** the root-scoped backend is **built and instrumented** (see
> [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md)). Sibling
> workspaces contain a conflict-free Watchman + jj-vcs composition, one owner-
> lifecycle implementation commit, and a real but dormant Watchwoman config
> foundation. They do **not** contain a VCS observer, active config generations,
> `ViewFilter`, fresh production lifecycle code, Profile R, fresh deployment, or a clean
> carrier. [`observation-reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md)
> is the best continuation/status ledger under the recorded full-current-line
> scope. The newer
> [`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md)
> questions that scope and recommends parking the broader lanes; it is a draft,
> not a superseding decision. Watchwoman's newer
> [truthful-root direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md)
> makes root lifecycle a prerequisite to config/filter activation, but is also
> draft. Historical lifecycle code exists at `systemd-20260903`, while
> Compfuzor selects the floating `systemd@rektide` ref and the installed binary
> predates that snapshot. Neither is the fresh line; both remain behavior to
> audit and re-author.
> B3 remains deferred. G5, C0, Profile R acceptance and owner scope,
> legacy-v1 policy, and default promotion remain open.
>
> **Since 2026-09-05:** upstream `v2` rewrote the watcher/config seam under
> this branch. The collision is mapped in
> [`v2-conflict0`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md). After
> discussing the merge-based freshen, the human directed **Position 2**:
> re-add Watchman as a backend on upstream's substrate. The carry-first
> revision is
> [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md): preserve the public
> v2 API and owner plans, isolate two generic upstream-candidate commits, and
> freshly author an exact-root backend. It retains `v2-readd1`'s thin-adapter,
> spike, and fork-audit discipline while rejecting verbatim carry and synthetic
> path invalidation. The execution-ready work plan is
> [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md): build now,
> W0–W10 commit graph, no spike gate. The whole v2 payload — map, plans,
> lineage — is collected under [`v2-readd/`](/.design/watchman/v2-readd/README.md)
> with naming and compose-readiness conventions.

## What the corpus is trying to say

1. **The first built design had the wrong failure scope.**
   [`draft1`](/.design/watchman/draft1.gpt56t.md) used one process-global
   connection. One slow root occupied its shared FIFO and caused a fleet-wide
   outage. Draft1 is useful lineage, not reusable architecture.
2. **The August 30 incident drove the reset.**
   [`timeout0`](/.design/watchman/timeout0.gpt56s.md) established queue-residence
   deadline exhaustion on the serialized FIFO. The later
   [`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md) showed 3 cookie
   pathnames amplifying into 74 Skill refreshes: application amplification, not
   corruption. Together they justify admitted dispatch, root-local failure, and
   owner-boundary artifact filtering.
3. **Draft2 replaced the global connection, then live evidence amended it.**
   [`draft2`](/.design/watchman/draft2.gpt56t.md) introduced one
   `RootConnection` per route intent and source-owned interests; it is built,
   tested, and tuned. [`watchwoman0`](/.design/watchman/watchwoman0.unknown.md)
   added plain `watch`, best-effort `unsubscribe`, stale-cursor full state, and
   the 29.2 GB `$HOME` crawl warning. Its no-cancellation finding is historical
   to that daemon snapshot; later Watchwoman sources changed.
4. **The implemented result has two sharp known defects.**
   [`fallbacks0`](/.design/watchman/fallbacks0.glm53.md): the *acquisition
   cliff* — the same failure is permanent Parcel pre-ack but retry-forever
   post-ack. [`topic-query0`](/.design/watchman/topic-query0.glm53.md): the
   resume path discards the daemon-computed disconnect delta, violating
   draft2's own Amendment 3. The original row-replay fix is not the accepted
   destination: the September 3 decision chose fresh clocks, owner reread, and
   cursor deletion. Keep the scenario as correction/regression evidence.
5. **The watch-surface boundary is settled.** Directories earn the daemon
   layer; files stay on `node:fs.watch` unconditionally
   ([`files-too0`](/.design/watchman/files-too0.glm53.md)), and Parcel's own
   watchman client is documented as the incident class this layer eliminates
   ([`parcel0`](/.design/watchman/parcel0.glm53.md)).
6. **Most post-`vision0` work asks how to honestly rebuild.**
   [`vision0`](/.design/watchman/vision0.gpt56s.md) records the human **B2
   decision** (Config-local typed invalidation now; watcher-level B3 later).
   [`carrier1`](/.design/watchman/carrier1.gpt56s.md) proposes the remake
   architecture but *promotes B3* — ruled by
   [`carrier1-review0.gpt56sol`](/.design/watchman/carrier1-review0.gpt56sol.md)
   (SD1) to still require explicit human acceptance, and carrying 7 correctness
   blockers (CB1–CB7). Upstream then landed in the carrier's planned seams
   ([`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md)): the
   rebuild must preserve `ConfigWatch.plan` and its readiness outcomes.
   `upstream-delta0` recommends generalizing the inline executor into
   `WatchSet`; that module choice is not recorded human authority.
7. **Under the recorded September 3 scope, the route is `nav0-syn0`.**
   Authority before architecture:
   crossing contract → decide the open **G5 fork** at departure → build two
   deterministic harnesses and the **Profile R** floor, with any accepted G5
   audit proceeding after B2 in parallel → complete the current line including
   VCS signals → re-author the carrier from final state on pinned upstream.
   Profile RC is claimed only after both R and the G5 owner gates pass. The new
   rebuild assessment asks whether to supersede that scope; it does not do so.
8. **The recorded VCS direction uses internal watch signals** (git refs, jj
   `op_heads/heads`, hg branch) as invalidation-not-data
   ([`watches`](/.design/watchman/watches.glm53.md)), restructured by
   [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
   into two independently shippable lanes. Its accepted addendum corrects parts
   of the original topology and broad-root plan, with
   [`tools0`](/.design/watchman/tools0.gpt56s.md) specifying the harnesses
   that make it provable.
9. **The broad proposed architecture is owned observation.** Owners retain source and
   topology planning; an owner-scoped `WatchSet` executes complete plans; the
   process-global registry shares watches and supervises Node/Parcel; a root
   supervisor solely recovers Watchman; Watchwoman owns truthful root epochs.
   Profile R and the VCS tracer advance independently and join at the full
   current-line gate
   ([`direction0`](/.design/watchman/direction0.gpt56solmax.md)).
10. **Implementation has started in narrow sibling slices, not as the remake.**
    The corrected VCS contract is the
    [`spec`](file:///home/rektide/src/opencode-watchman-vcs-observation/.design/watchman/vcs-observation-spec0.gpt56solmax.md)
    plus its normative
    [`completion audit`](file:///home/rektide/src/opencode-watchman-vcs-observation/.design/watchman/vcs-observation-completion0.gpt56solmax.md).
    Composition and owner lifecycle exist; provider observation, topology,
    events, owner, proof, consumers, and activation remain open. Watchwoman's
    config foundation is implemented but not wired into runtime roots.
11. **The newest assessments separate scope before adding architecture.**
    [`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md)
    separates the narrow correction kernel, VCS product, daemon product,
    Profile R, carrier, and Watchment research. It recommends keeping the first
    and parking the others until intent is reconfirmed. Watchwoman's
    [direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md)
    independently prioritizes truthful root acquisition/loss before dormant
    config or filtering. Both are drafts; no human supersession is recorded.

## Useful reading paths

No single document answers both "what exists?" and "should this scope
continue?" Use the shortest path for the question at hand.

| Need | Start with | Use and caution |
| --- | --- | --- |
| Implement the current static-selection path | [`static-selection-handoff`](/.design/watchman/static-selection-handoff.unknown.md) | Stable execution reference: built controllers, exact unfinished seam, tests, three implementation commits, guardrails, and explicitly deferred deeper work. |
| What runs in this feature | [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) | Source of record for the tested root-scoped backend, configuration, metrics, and freshens. It describes the old fallback/cursor line, not the remake. |
| Decide whether the expansion is still wanted | [`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md), then the [`vision0` decision addendum](/.design/watchman/vision0.gpt56s.md#L883-L929) | The assessment is the best scope challenge; `vision0` is the human authority it asks to retain or supersede. Do not mistake the draft recommendation for a decision. |
| Continue Core VCS under the existing scope | [`observation-reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md), the [implementation record](file:///home/rektide/src/opencode-watchman-vcs-core/.design/watchman/vcs-observation-implementation0.gpt56solmax.md), and both VCS contract documents | Best current status and continuation set. The lifecycle commit is useful WIP, not a VCS observer or generic foundation acceptance. |
| Stabilize only the current backend | [`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) and [`review-simplification0`](/.design/watchman/review-simplification0.gpt56s.md) | Strongest narrow correction kernel: attachment-safe recovery, one failure owner, static selection, visible completion, and deterministic tests. |
| Audit assurance or architecture | [`direction0`](/.design/watchman/direction0.gpt56solmax.md), [`assurances0`](/.design/watchman/assurances0.gpt56sol.md), then [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | Current architecture, assurance atlas, and route. Profile R/RC recommendations are not accepted implementation facts. |
| Continue the daemon lane | [Truthful-root direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md), [rebuild audit](file:///home/rektide/src/watchwoman-systemd/.design/rebuild-audit/rebuild-audit0.gpt56solmid.md), [config implementation record](file:///home/rektide/src/watchwoman-systemd-vcs-config/.design/opencode/config-foundation-implementation0.gpt56solmax.md), then the [lifecycle spec](file:///home/rektide/src/watchwoman-systemd-production-lifecycle/.design/opencode/production-lifecycle-spec0.gpt56solmax.md) | Root truth now precedes config/filter activation. Config code is real but dormant; lifecycle is specified only. The direction and current workspace refinements remain unaccepted. |

## Document chronology

Read this table top to bottom. It records causal and authority movement, not the
future build order. `jj` order and explicit dependencies win when frontmatter
timestamps disagree. `direction0` and the uncommitted `contract0` were
co-drafted and cannot be ordered more precisely.

| # | Date | Wave | Decision or result | Relevance now |
| --- | --- | --- | --- | --- |
| 1 | 2026-08-18 to 08-20 | [`draft1`](/.design/watchman/draft1.gpt56t.md) | A process-global Watchman connection was accepted and built. Earlier `init0`/`draft0` alternatives were later pruned. | **Historical.** Explains the rejected global failure scope. |
| 2 | 2026-08-30 | [`timeout0`](/.design/watchman/timeout0.gpt56s.md) -> [`draft2`](/.design/watchman/draft2.gpt56t.md) -> [`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) | The FIFO incident forced a root-scoped replacement. Live daemon evidence then amended routing, unsubscribe, and stale-cursor behavior; draft2 was implemented that day. | **Essential baseline.** This is the origin of the system that runs. |
| 3 | 2026-08-31 to 09-01 20:44 | Metrics, cookie, file, Parcel, fallback, and since-query studies | Post-landing evidence exposed amplification, the acquisition cliff, and the dropped reconnect delta. | **High evidence.** Use for current defects and regression tests, not future authority. |
| 4 | 2026-09-01 21:17 to 23:36 | [`vision0`](/.design/watchman/vision0.gpt56s.md) -> four implementation reviews -> synthesis addendum | The work moved from a freeze frame to a consolidated correction model: one failure owner, static selection, attachment-safe recovery, and explicit invalidation. | **High foundation.** The reviews contain the strongest narrow correction analysis. |
| 5 | 2026-09-02 to 09-03 12:25 | [`watches`](/.design/watchman/watches.glm53.md) -> `vision0` VCS and decision addenda -> [`typed-watcher0`](/.design/watchman/typed-watcher0.glm53.md) -> [`carrier0`](/.design/watchman/carrier0.gpt56s.md) | VCS observation entered scope. The human decision selected B2 and full-current-line-first; B3 was deferred. | **Essential authority.** The final `vision0` addendum is the last accepted scope record. |
| 6 | 2026-09-03 15:30 to 16:05 | [`carrier1`](/.design/watchman/carrier1.gpt56s.md) -> two carrier reviews -> [`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md) | Carrier1 deepened continuity but promoted B3 without authority. Review restored B2, found CB1-CB7, and identified upstream Config outcomes that any rebuild must preserve. | **Conditional design evidence.** Do not implement carrier1 unchanged. |
| 7 | 2026-09-03 20:16 to 21:46 | [`assurances0`](/.design/watchman/assurances0.gpt56sol.md) -> three parallel `nav0` drafts -> [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | The corpus gained F/G guarantees, R-family profiles, and a route that respects the B2/full-current-line decision. Profile R and G5 remained recommendations. | **Conditional route.** Relevant only if the broader assurance program continues. |
| 8 | 2026-09-03 22:31 to 09-04 00:07 | [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md), [`position0`](/.design/watchman/position0.glm53max.md), both G5 pitches, maintenance/index split | Core exact-interest and Watchwoman broad-root work became independent lanes. VCS graph/filter direction was accepted; G5 remained undecided. | **Mixed.** VCS alignment is accepted for that lane; G5 pitches are deferred decision material. |
| 9 | 2026-09-04 00:22 to 01:34 | [`direction0`](/.design/watchman/direction0.gpt56solmax.md) plus [`contract0`](/.design/watchman/contract0.glm53max.md) | Owned observation translated the route into modules. C0 became a concrete but unaccepted crossing contract with a B2 naming conflict and three decision stations. | **Conditional architecture.** Use only after confirming the Profile R route still matters. |
| 10 | 2026-09-04 02:53 to 04:39 | VCS spec and correction -> Core composition and owner lifecycle -> [`observation-reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md) | The VCS lane gained a corrected contract. A sibling line landed composition and one lifecycle commit, not a VCS observer. Reconvergence separated implemented, dormant, specified, and open work. | **Current WIP status.** Useful only if VCS remains an active product goal. |
| 11 | 2026-09-04 06:04 onward | [`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md), Watchwoman [rebuild audit](file:///home/rektide/src/watchwoman-systemd/.design/rebuild-audit/rebuild-audit0.gpt56solmid.md), and [truthful-root direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md) | The newest wave separated the justified root-scoped feature from optional VCS, daemon, Profile R, carrier, and Watchment programs. It recommends narrow correction and truthful roots first, but records no superseding human decision. | **Current decision point.** Use it to confirm or narrow scope before more construction. |
| 12 | 2026-09-04 | [`static-selection-handoff0`](/.design/watchman/static-selection-handoff0.unknown.md) | The user reconfirmed static directory-backend selection as the immediate goal and accepted this handoff as the stable point-in-time reference. The old line subsequently landed shared acquisition and deleted both Parcel fallbacks. | **Donor authority.** Its target invariants feed the fresh v2 carrier; its module layout does not. |
| 13 | 2026-09-05 | [`v2-conflict0`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) -> [`v2-readd0`](/.design/watchman/v2-readd/v2-readd0.glm53max.md) | Upstream `v2` rewrote the watcher/config seam under the branch; the conflict was probed and mapped (5 files, two competing architectures, paths A/B/C). Verification then showed static selection substantially landed and the seam quiet, so the plan recommends composing with `v2@origin` now: one merge resolved per the map, then a four-commit adaptation stack, with the five forced decisions pre-recommended. | **Superseded strategy.** The merge recommendation was discussed and set aside for Position 2. |
| 14 | 2026-09-05 | discussion -> [`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) | The human weighed the sizing and directed Position 2: a new line off `v2@origin`, Watchman as a backend on upstream's substrate, a thin adapter, a spike gate, and a fork-surface audit. Its literal mechanism proposed verbatim backend carry and synthetic path invalidation. | **Strategy retained; mechanism superseded.** `v2-readd2` keeps its carrier discipline and corrects the bridge. |
| 15 | 2026-09-05 | [`v2-reintroduction-plan0`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md) + [`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) -> [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | Source review showed the unmodified native seam cannot carry project placement or deliver initial-failure synthetic invalidation. The revision keeps upstream's public `subscribe(input, onReady?)`, introduces two isolated generic upstream candidates (generation-aware readiness and Config-local invalidation), and freshly authors an exact-root backend with fresh-clock recovery. Project consolidation waits for a measured root-hint proposal. | **Architecture decision.** Executed by `v2-readd3`'s work plan; its spike gate removed. |
| 16 | 2026-09-05, current | [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) -> [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) | The revision became an execution-ready work plan: build now, no spike or strategy-fallback gate, a W0-W10 commit graph (baseline → generation-aware readiness → owner convergence → protocol actor → exact-root backend → generation supervision → acquisition bounds → topology/cookies → server/CLI surface → live acceptance → carry audit), with per-commit files, tests, acceptance, and source references. | **Active work plan.** Implementation follows this graph from W0. |
| 17 | 2026-09-05 | workspace split + [`v2-flow0`](/.design/watchman/v2-readd/v2-flow0.glm53max.md) | The donor line was archived to `~/src/opencode-watchman-old` (bookmark `watchman-20260905`, contract0 committed) and the build started fresh in `~/src/opencode-watchman-v2-readd` directly on `v2@origin` `4306c07b`, W1 in flight. With multiple agents journaling in `.test-agent` scratch, the flow doc defines scratch-to-durable promotion: triage, `v2-` prefixed name preservation, `log.md`, coordinator-owned path-limited commits. | **Active convention.** Governs artifact placement for the whole build. |

## Status legend

| Status | Meaning |
| --- | --- |
| implemented | Documents landed, verified code |
| superseded | Replaced; retained for lineage |
| evidence | Source-level / probe / live-daemon findings |
| review | Findings over a design or the implementation |
| open proposal | Proposed, not built, no human acceptance recorded |
| reference | Vocabulary, map, or tooling material; useful without being authority |
| accepted direction | Human acceptance is recorded, even if the file remains draft |
| implementation WIP | Named code exists, but its ticket/product acceptance is incomplete |
| decision-record | Records a convention or decision state |

These labels describe current use, not whole-file maturity. A file can contain
verified evidence, superseded recommendations, and a later accepted addendum.
Later explicit authority governs; a continuation prompt does not create product
intent.

**Relevance now** is an action filter, not a quality score: **essential** means
current truth or authority; **high** means directly useful to the narrow
correction; **conditional** means useful only if its product lane continues;
**situational** means operational or specialized reference; **historical** and
**deferred** mean do not drive present implementation.

**Dependency tags** use named refs with a role prefix: `builds-on`, `evidence`,
`supersedes`, `reviews`, `contradicts`, `synthesizes`, `validates`, `feeds`,
`decides`, `implements`.

---

## Implemented line

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`draft1`](/.design/watchman/draft1.gpt56t.md) | Original accepted design: one process-global Watchman connection; roots expensive, subscriptions cheap; 15-min idle TTL. Built, then deleted after the FIFO incident. | superseded → [`draft2`](/.design/watchman/draft2.gpt56t.md) | **Historical:** rejected failure-scope lineage only. | — |
| [`draft2`](/.design/watchman/draft2.gpt56t.md) | The accepted, implemented design: per-root-intent `RootConnection`s, source-owned `WatchInterests`, admitted dispatch, 60 s deadlines; Amendments 1–3 from live validation. | implemented | **Essential:** implemented architecture and contract. | supersedes:[`draft1`](/.design/watchman/draft1.gpt56t.md) · validated-by:[`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) · evidence:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) |
| [`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) | Historical live-daemon/source validation of draft2: re-watch 2 ms, incremental `since` 7 ms, no cursor rejection, and the 32M-file `$HOME` crawl incident. Its no-`canceled` result belongs to the tested 0.7.0/source snapshot; later daemon source changed. | evidence · historical snapshot | **Historical evidence:** validates one daemon snapshot and the draft2 amendments. | validates:[`draft2`](/.design/watchman/draft2.gpt56t.md) · qualified-by:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) |
| [`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) | Implementation state of the landed stack: commit table, runtime shape, config, metrics, verification records, freshen history. | implemented | **Essential:** source of truth for what runs. | implements:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`metrics0`](/.design/watchman/metrics0.glm53.md) | Reading guide for landed telemetry. `delta.generations` + `command_timeouts` is the incident signature. `files_in - updates_out` includes ignores plus unmapped/ambiguous rows; a frozen clock is suspicious only against a known mutation that produced no PDU. | implemented · reference | **Situational:** operations and incident diagnosis. | documents:[`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) · detects:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) |

## Incident & evidence studies

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`timeout0`](/.design/watchman/timeout0.gpt56s.md) | Corrects the Aug 30 incident model: the 10 s timer starts at FIFO enqueue, so a cold crawl consumes queued callers' budgets. The record observed 9 timeout retirements across two runs and 40 fallbacks; "eight callers" was only an example. Retire only after submission. | review · evidence | **High:** authoritative incident and deadline model. | evidence-for:[`draft2`](/.design/watchman/draft2.gpt56t.md) · extended-by:[`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md) |
| [`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md) | Daemon source + two-daemon experiment: 3 physical cookie pathnames -> 74 Skill refreshes in <3 min. This is amplification, not recrawl. The sanity thread is a likely major producer; exact attribution remains open. | evidence | **Situational:** amplification and artifact-filter evidence. | builds-on:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) · informs:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) | Discovery map for the valid **acquisition cliff** and mixed-backend outcomes. Its five-round-trip, catch-all, and fatal-lifetime details were narrowed by the later failure audit; use that review for current counts and scopes. | evidence · corrected | **High:** defect map; pair with the failure-path review. | maps:[`draft2`](/.design/watchman/draft2.gpt56t.md) · corrected-by:[`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) |
| [`topic-query0`](/.design/watchman/topic-query0.glm53.md) | Proves that resume discards the daemon-computed delta. The proposed direct row publication also loses pre-attachment rows; the recorded fresh-clock/cursor-deletion destination supersedes it. The defect remains correction and regression evidence. | evidence · repair superseded | **High evidence:** retain the regression; do not implement its repair. | corrected-by:[`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) · decided-by:[`vision0`](/.design/watchman/vision0.gpt56s.md#L907-L929) |
| [`parcel0`](/.design/watchman/parcel0.glm53.md) | Parcel's Watchman client is process-global, one socket, and has no reconnect. It uses `clock`/`since` but does not preserve cursor recovery across reconnect, and it can silently fall back to inotify under the `watchman` label. Keep the root-scoped layer. | review | **High:** justifies retaining the custom root-scoped adapter. | evaluates:[`draft2`](/.design/watchman/draft2.gpt56t.md) · mutual:[`files-too0`](/.design/watchman/files-too0.glm53.md) |
| [`files-too0`](/.design/watchman/files-too0.glm53.md) | Files are the cheapest primitive and avoid the daemon failure domain. Node-only file routing is already implemented and retained; only explicit codification of the `backend.ts:18` invariant remains proposed. | evidence · implemented direction | **Essential boundary:** file watching remains Node-owned. | affirms:[`draft2`](/.design/watchman/draft2.gpt56t.md) · retained-by:[`direction0`](/.design/watchman/direction0.gpt56solmax.md) |

## Implementation reviews (2026-09-01 wave)

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`review-architecture0`](/.design/watchman/review-architecture0.gpt56s.md) | Finds fallback policy split across seven sites and the temporal acquisition cliff. Its then-safe near-term response-row replay recommendation was later superseded by B2/fresh-clock recovery; retain its architecture and exact-vs-invalidation analysis. | review · recommendation superseded | **High:** ownership and failure-shape analysis; ignore replay advice. | builds-on:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) · decided-by:[`vision0`](/.design/watchman/vision0.gpt56s.md#L883-L929) |
| [`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) | Nine probed findings (V1–V9): response loss on *every* establishment (PubSub is not replay storage); fatal gauge disagrees with behavior; Parcel EOF is silent. Corrects `fallbacks0`/`topic-query0` claims; defines test matrix M1–M6. | review | **Essential:** strongest verified correction and test matrix. | corrects:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) · corrects:[`topic-query0`](/.design/watchman/topic-query0.glm53.md) · feeds:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`review-ownership0`](/.design/watchman/review-ownership0.gpt56s.md) | All load-bearing Watchman policy is downstream-owned; freshen conflicts landed only in `routes.ts`. Names six clean seams and the missing injected-factory seam that blocks fallback unit testing. Flags bookmark debt + `AGENTS.md` contamination. | review | **High:** carryability, seams, and testability map. | audits:[`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) · feeds:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`review-simplification0`](/.design/watchman/review-simplification0.gpt56s.md) | Recommends strict Watchman selection with retry-forever availability. Its conditional analysis shows exact rows remain necessary until B2 lands; later human direction selected supervisor-before-strict and fresh-clock recovery. | review | **High:** narrow correction direction; later human decision governs. | narrows:[`draft2`](/.design/watchman/draft2.gpt56t.md) · decided-by:[`vision0`](/.design/watchman/vision0.gpt56s.md#L883-L929) |

## Historical remake design line

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`vision0`](/.design/watchman/vision0.gpt56s.md) | Revision chain: initial freeze, four-review synthesis, VCS requirement, then the human **B2 and full-current-line decisions**. The early hypotheses are deliberation history; the final decision addendum remains authority until explicitly superseded. | decision-record · proposal history | **Essential authority:** last recorded human scope decision. | synthesizes:[`review-architecture0`](/.design/watchman/review-architecture0.gpt56s.md)+3 · decides: B2/current-line scope |
| [`carrier0`](/.design/watchman/carrier0.gpt56s.md) | First clean-rebuild plan: C1-C12 final-state ladder, proof-line + parity construction, B2, metrics last. Carrier1 supersedes the plan; its collision map and deterministic test ladder remain useful evidence. | superseded by [`carrier1`](/.design/watchman/carrier1.gpt56s.md) | **Historical but useful:** collision map and test ladder. | executes:[`vision0`](/.design/watchman/vision0.gpt56s.md) · inventoried-by:[`tools0`](/.design/watchman/tools0.gpt56s.md) |
| [`carrier1`](/.design/watchman/carrier1.gpt56s.md) | The remake as architecture: owners declare what can make state stale; substrate emits exact changes while continuous, explicit invalidation when not; never silently changes backend. **Promotes B3** (contested). | open proposal | **Historical proposal:** do not implement unchanged. | supersedes:[`carrier0`](/.design/watchman/carrier0.gpt56s.md) · adopts:[`typed-watcher0`](/.design/watchman/typed-watcher0.glm53.md) · reviewed-by:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) |
| [`carrier1-review0 s`](/.design/watchman/carrier1-review0.gpt56s.md) | Bounded self-review: judges the central shape coherent but requires 7 edits (continuity invalidation, linearization, VCS sentinels, reproducible probe). It is not an acceptance record. | review | **Conditional:** correction checklist if carrier work resumes. | reviews:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |
| [`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) | Source-grounded review at pinned commit: **CB1–CB7** correctness blockers (daemon can ack a deaf root; no structured `error_code` on the wire); AA1–AA5 amendments; **SD1**: B3 promotion is a new proposal requiring explicit human acceptance. | review | **High if rebuilding:** blockers and the B3 authority correction. | reviews:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) · grounds:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`assurances0`](/.design/watchman/assurances0.gpt56sol.md) | Assurance atlas under B2: mandatory floor **F1-F9**, guarantees G1-G8, orthogonal mechanisms, profiles **R/RC/RD/RP/RS**, and G5. Its vocabulary is current reference; Profile R/RC recommendations are not human decisions. | reference · open recommendation | **Conditional reference:** only if Profile R work resumes. | builds-on:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) · mapped-into:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) |
| [`typed-watcher0`](/.design/watchman/typed-watcher0.glm53.md) | The deliberately deferred end-state: `Watcher.Update` gains `{type:"invalidation"}`; near-term B2's tag vocabulary matches the future member so migration deletes one classification site. Delivery ordering is the named prerequisite. | open proposal (deferral recorded) | **Deferred:** reopen only through a new B3 decision. | defers-from:[`vision0`](/.design/watchman/vision0.gpt56s.md) · adopted-by:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |

## Navigation, continuation, and reassessment

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`nav0 sol`](/.design/watchman/nav0.gpt56sol.md) | The assurance spine: build Profile R (G1–G4) as non-negotiable floor, land at RC via a *measured* Config audit; six legs with claim cards, fork-and-stop rules, default-worthiness gate. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | **Historical layer:** assurance destinations and claim cards. | charts:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`nav0 glm53`](/.design/watchman/nav0.glm53.md) | The chart: crossing contract first (error-code vocabulary, B2/B3 tag names), then parallel client/daemon crews; 18 named rocks, false-beacons table, "permanent fog," station for every open ledger decision. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | **Historical layer:** hazards and decision stations. | charts:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`nav0 fmax`](/.design/watchman/nav0.glm53fmax.md) | The program: position fix, seven beacons with arrival proofs, nine rudder decisions, three routes; the **no-incoherent-middle rule**; names the corpus disagreeing with itself on interim depth. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | **Historical layer:** multi-repository program mechanics. | programs:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |
| [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | **The authority-correct route under the September 3 scope.** B3 is not a departure gate. Decide G5 early; after B2, build any accepted audit in parallel with the Profile R floor; then finish the current line with VCS and rebuild the clean carrier. R/G5 remain recommendations, not accepted decisions. | open proposal · conditional route | **Conditional authority map:** governs only if the September 3 scope continues. | synthesizes:[`nav0 sol`](/.design/watchman/nav0.gpt56sol.md)+2 · authority:[`vision0`](/.design/watchman/vision0.gpt56s.md) · rests-on:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`contract0`](/.design/watchman/contract0.glm53max.md) | **The C0 draft for the broader route.** Defines error vocabulary, epochs, v1 semantics, B2 tags, ordering, ownership, queues, and shared fixtures. It remains uncommitted/unverified, conflicts with B2 wording around owner-private lifecycle facts, and leaves DS-A/DS-B/DS-C undecided. | open proposal · conditional contract | **Conditional blocker:** review only if the Profile R route continues. | builds-on:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) · corrected-by:[`direction0`](/.design/watchman/direction0.gpt56solmax.md) |
| [`direction0`](/.design/watchman/direction0.gpt56solmax.md) | **The broad owned-observation architecture.** Owner plans, process-global Node/Parcel supervision, one Watchman root supervisor, truthful daemon epochs, B2 mediation, and deterministic harnesses. It is current design input, not accepted product scope. | open proposal · architecture reference | **Conditional:** architecture reference, not accepted scope. | synthesizes:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) · corrects:[`contract0`](/.design/watchman/contract0.glm53max.md) · executes:[`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) |
| [`observation-reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md) | **The best cross-workspace status ledger under existing scope.** Separates one Core lifecycle commit, dormant daemon config, open VCS/daemon work, unbuilt Profile R, and the future carrier. Its commit-2 continuation assumes VCS remains wanted. | draft orientation · conditional continuation | **Conditional status:** use only if the expanded scope continues. | updates:[`direction0`](/.design/watchman/direction0.gpt56solmax.md) · executes: VCS contract pair |
| [`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md) | **The newest OpenCode scope assessment.** Keeps the root-scoped feature and narrow correction kernel; proposes parking VCS, daemon expansion, Profile R, carrier, B3/G5, and separate Watchment work pending human reconfirmation. | draft, unverified proposal | **Essential now:** frames the scope decision and parking recommendation. | challenges:[`observation-reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md) · does-not-supersede:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`g5-accept`](/.design/watchman/g5-accept0.glm53max.md) | Pro-lease pitch: permanent fog leaves Config-mediated staleness **unbounded** at Profile R; the owner source audit is the only mapped mechanism that bounds it; mediated G5 is additive and fails safe to R. Requests a decision record. | open proposal | **Deferred:** relevant only if assurance work resumes. | argues-from:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) · argues-from:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`g5-reject`](/.design/watchman/g5-reject0.glm53max.md) | Anti-lease pitch: R covers all *reported* failure classes; mediated G5 is a standing cost and a second correctness surface bought before the first (R's 24 gates) has passed; R->RC stays additive. | open proposal | **Deferred:** relevant only if assurance work resumes. | paired-with:[`g5-accept`](/.design/watchman/g5-accept0.glm53max.md) · argues-from:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) |
| [`position0`](/.design/watchman/position0.glm53max.md) | The light position fix: **chase, do not pin** — citations record what they read, drift goes to a dated log. Snapshots docs/upstream/daemon revisions; stale after 2026-09-18. | decision-record | **Situational:** citation and drift convention. | satisfies:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) |
| [`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md) | Upstream landed `ConfigWatch.plan` reconciliation, an `entries` watch kind, and public `onReady` **in the carrier's planned seams**. Preserve the Config-owned planner and readiness outcomes. The document recommends extracting its inline executor into generic `WatchSet` reconciliation; that module choice is not accepted authority. | evidence · design recommendation | **High if rebuilding:** preserve upstream outcomes. | assesses:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) · refreshes:[`review-ownership0`](/.design/watchman/review-ownership0.gpt56s.md) |

## Forward work and implementation records

| Doc | Says | Status | Relevance now | Dependencies |
| --- | --- | --- | --- | --- |
| [`watches`](/.design/watchman/watches.glm53.md) | Probe-backed VCS signal matrix and the durable rule that events trigger authoritative rereads. Its jj evidence remains useful; accepted alignment corrects/absorbs its Git topology, broad-root dependency, and implementation plan. | evidence · plan superseded | **Conditional evidence:** VCS topology and reread semantics. | feeds:[`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) · accepted-by:[`vision0`](/.design/watchman/vision0.gpt56s.md#L795-L929) |
| [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) | Accepted restructure of `opwatch-vcs-signals`: independently shippable OpenCode exact-interest and Watchwoman broad-root lanes join at one activation ticket. The accepted addendum records the renamed graph, unified path/type/metadata rule direction, and non-blocking P4 content-rule decision. | accepted direction | **Conditional authority:** accepted for the VCS lane if that lane continues. | restructures:[`watches`](/.design/watchman/watches.glm53.md) · absorbs:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) |
| [VCS observation spec](file:///home/rektide/src/opencode-watchman-vcs-observation/.design/watchman/vcs-observation-spec0.gpt56solmax.md) + [completion correction](file:///home/rektide/src/opencode-watchman-vcs-observation/.design/watchman/vcs-observation-completion0.gpt56solmax.md) | Joint implementation contract for prepared provider plans, exact interests, strict reads, committed/candidate ownership, health quorum, complete metadata publication, and a six-commit ladder. The correction is normative; never use the original alone. | specified · commits 2-6 open | **Conditional:** implementation contract for a continuing VCS lane. | executes:[`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) |
| [Core VCS implementation record](file:///home/rektide/src/opencode-watchman-vcs-core/.design/watchman/vcs-observation-implementation0.gpt56solmax.md) | Records a conflict-free two-parent composition and only commit 1, owner lifecycle. It is recorded green, but a later independent assessment saw one fixed-delay sibling-delivery assertion fail once and pass repeatedly; no VCS observer exists. | implementation WIP · evidence qualified | **Current WIP evidence:** not a completed observer or foundation. | implements: VCS contract pair · interpreted-by:[`reconvergence0`](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md) |
| [Watchwoman rebuild audit](file:///home/rektide/src/watchwoman-systemd/.design/rebuild-audit/rebuild-audit0.gpt56solmid.md) + [truthful-root direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md) | The audit separates the daemon, OpenCode, and Watchment lines. The direction puts bounded watcher-first acquisition, atomic tree/clock state, detected-loss repair/retirement, and subscription ordering ahead of config/filter activation. Current workspace refinements further revise failure caching and repair. | draft assessment + direction · unaccepted | **High for daemon scope:** proposed correction order, not authority. | corrects: snapshot/filter sequence · keeps: independent Core lane |
| [Watchwoman config implementation](file:///home/rektide/src/watchwoman-systemd-vcs-config/.design/opencode/config-foundation-implementation0.gpt56solmax.md) | Strict schemas, typed composition, root-policy compilation, immutable filter inputs, and harness controls are real and tested. Runtime loading, publication, SIGHUP, root snapshots, and `ViewFilter` are absent by design. | implemented · dormant | **Dormant asset:** retain, but do not treat as active runtime behavior. | implements: config-foundation slices · reviewed-by:[`rebuild-assessment0`](/.design/watchman/rebuild-assessment0.gpt56solxh.md) |
| [Watchwoman lifecycle spec](file:///home/rektide/src/watchwoman-systemd-production-lifecycle/.design/opencode/production-lifecycle-spec0.gpt56solmax.md) | Detailed fresh-carrier contract for signals, socket activation, readiness, bounded drain, generated units, and config serialization. It is documentation only and waits on config interfaces/root truth. Historical `systemd-20260903` and deployed units are behavior evidence, not this implementation. | specified · open | **Conditional:** design only after root/config prerequisites. | feeds: production/deployment lane |
| [`static-selection-handoff`](/.design/watchman/static-selection-handoff.unknown.md) | Stable implementation bearing for completing the existing root controller, pinning strict-selection tests, and deleting both Watchman-to-Parcel fallback sites in the accepted order. Its addendum retains deeper architecture behind explicit reopening triggers. | stable implementation reference | **Essential:** current execution authority. | authority:[`vision0`](/.design/watchman/vision0.gpt56s.md#L907-L923) · evidence:[`review-simplification0`](/.design/watchman/review-simplification0.gpt56s.md) |
| [`tools0`](/.design/watchman/tools0.gpt56s.md) | Provenance-tagged inventory of executed checks; **corrects the upstream-collision record** (ten intersections, not two). Use it as a recipe/reference, not a route; its seven durable tools remain proposals. | evidence · tooling reference | **Situational:** probe recipes and tooling candidates. | documents:[`carrier0`](/.design/watchman/carrier0.gpt56s.md) · automates:[`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) |
| [`v2-conflict0`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) | Measured three-way merge map of the watchman line against `v2@origin`: divergence geometry, hunk-by-hunk conflicts in `watcher.ts`/`config.ts`/`skill.ts`, the two architectures side by side (convergences and exclusive halves), and three paths forward. Orientation only — records no decision. | evidence · orientation | **Essential for the freshen:** the per-file resolution rules any merge executes. | probes: merge of ours × `v2@origin` · precedes:[`v2-readd0`](/.design/watchman/v2-readd/v2-readd0.glm53max.md) · refreshes:[`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md) |
| [`v2-readd0`](/.design/watchman/v2-readd/v2-readd0.glm53max.md) | The Position-1 plan: compose with `v2@origin` via one merge (not a 94-commit rebase), resolve per `v2-conflict0`'s table, adapt in four ordered commits, with a verification ladder and recommendations for all five forced decisions. | superseded → [`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) → [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | **Inherited pieces:** pre-flight, probe recipe, verification discipline; merge strategy set aside by human direction. | decides-between: A/B/C of [`v2-conflict0`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) · superseded-by:[`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) |
| [`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md) | The Position-2 proposal: new line off `v2@origin`, thin adapter, upstream ownership adopted whole, backend carried verbatim, failure loudness through synthetic path updates, spike gate, carry table, and fork-surface audit. Source review found its initial-failure signal cannot cross upstream's pre-attachment acquisition window and its adapter has no input from which to derive claimed project placement. | revised/superseded → [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | **Keep its discipline:** Position 2, thin adapter, spike, upstream test floor, carry table, and fork audit. Do not implement its synthetic/cursor/verbatim bridge. | supersedes:[`v2-readd0`](/.design/watchman/v2-readd/v2-readd0.glm53max.md) · corrected-by:[`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) |
| [`v2-reintroduction-plan0`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md) | Source-grounded fresh-carrier plan: preserve upstream plan/entries/readiness, re-author root supervision with fresh clocks, explicitly classify donor artifacts, and close indirect Config-owner staleness. Its proposed subscription-options/error seam is wider than the carry-first fork should own downstream. | design input → [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | **Correctness source:** donor disposition, fresh-clock recovery, owner convergence, and deterministic scenarios. | synthesizes:[`v2-conflict0`](/.design/watchman/v2-readd/v2-conflict0.glm53h.md) · narrowed-by:[`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) |
| [`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) | **Carry-first architecture decision.** Keep upstream's public API and plans, add an internal native invalidation that re-runs `onReady` (U1), add Config-local invalidation/Skill rescan (U2), and freshly author an exact-root Watchman backend with fresh clocks, bounded recovery, no fallback, and no synthetic path events. Project consolidation is evidence-gated U3 rather than hidden placement. | open proposal (plan, draft, human-requested) | **Architecture decision:** U1/U2 candidates and carry disposition stand; execution superseded by [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md). | synthesizes:[`v2-readd1`](/.design/watchman/v2-readd/v2-readd1.glm53max.md)+[`v2-reintroduction-plan0`](/.design/watchman/v2-readd/v2-reintroduction-plan0.gpt56solxh.md) · chases:`v2@origin` |
| [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) | **The execution-ready work plan (build now, no spike gate).** W0-W10 commit graph with per-commit files/tests/acceptance: generation-aware readiness (U1) and owner convergence (U2) as isolated upstream candidates at the bottom, then protocol actor, exact-root backend (plain `watch`, no `watch-project`/placement/cursor), fresh-clock generation supervision, bounded shared acquisition, symlink/cookie topology, static server/CLI selection surface, live acceptance, and the classified carry audit. | open proposal (work plan, draft) | **Active work plan:** implementation follows this graph from W0. | executes:[`v2-readd2`](/.design/watchman/v2-readd/v2-readd2.gpt56solxh.md) · authority:[`vision0`](/.design/watchman/vision0.gpt56s.md) B2/fresh-clock · donor:[`maintenance`](/.design/watchman/maintenance.glm53.md) |

---

## Immediate decisions and gates

This table is the current blocking/scope set, not the entire assurance ledger.
`nav0-syn0` also retains G6 owner leases, G7 probes, G8 structural coverage,
delivery boundedness, and measured audit/probe periods as deferred branches.

| Kind | Item | Where it stands |
| --- | --- | --- |
| active direction | **Build the carry-first Watchman backend on current upstream v2.** | [`v2-readd3`](/.design/watchman/v2-readd/v2-readd3.gpt56solxh.md) is the active work plan: build now, W0-W10 commit graph, U1/U2 upstream candidates isolated below the freshly authored exact-root backend. |
| remaining scope decision | **Does the rest of the September 3 full-current-line decision still stand?** | Static selection is active. VCS, broad filtering, fresh daemon deployment, Profile R, and carrier reconstruction remain separate decisions; the rebuild assessment recommends parking them until explicitly reopened. |
| decision | **G5 fork: bounded Config freshness (RC) or detected-loss convergence only (R)?** | Both pitches exist; `nav0-syn0` recommends G5, but no human decision is recorded. It stays off the critical path unless the broader assurance program continues. |
| deferred branch | **B3 watcher-level invalidation.** | Not a current-route blocker. B2 is recorded authority. Owner-private lifecycle control is not B3 while `Watcher.Update` stays exact-only; any shared watcher union needs a new human decision. |
| contract gate | **C0 crossing contract.** | If the broader Profile R route continues, clarify owner-private continuity versus Config's B2 invalidation, decide DS-A unreadable scans, DS-B suppression clearing, DS-C construction/availability, delivery boundedness, and legacy-v1 policy; then review and commit `contract0`. |
| architecture decision | **Profile R floor and owner claim boundary.** | Direction recommends R, but no acceptance is recorded. Freeze every included direct/mediated owner and dispose of legacy LocationWatcher before building or claiming the floor. |
| implementation gate | **Core owner-lifecycle commit disposition.** | Review B2 compatibility, terminal clearers, portability off the jj-vcs composition, and deterministic synchronization before treating commit 1 as reusable foundation. One fixed-delay assertion has already flaked once in an independent rerun. |
| daemon review gate | **Truthful roots before config/filter/lifecycle continuation.** | The config foundation is real but dormant. Review the newer Watchwoman direction and its current refinements: watcher-first bounded acquisition, atomic tree/clock, detected-loss repair/retirement, subscription ownership/order, plus the seven config/filter/compatibility issues all precede runtime activation. |
| carrier gate | **Upstream convergence and fork budget.** | Preserve `ConfigWatch.plan`, `entries`, and the public `subscribe(input, onReady?)`; keep U1/U2 independently upstreamable and every large Watchman mechanism behind the native boundary. Project consolidation waits for measured evidence and an explicit root-hint proposal. |
| compatibility decision | **Legacy daemon without `watchwoman-observation-v1`.** | Absence is unproven, not broken. It cannot satisfy Profile R; any weaker opt-in must be explicit and never a silent downgrade. |
| policy gate | **Watchman as default.** | Requires final-carrier behavior, resource envelopes and many-project cold start, v1/legacy policy, honest profile wording, deployed evidence, and rollback. Metrics are an instrument, not the whole gate. |
| tracking gap | **Observation-remake foundation graph.** | Only the VCS tracer has a Beads graph. Create the broader foundation graph only if the scope decision retains Profile R/current-line reconstruction. |

## Gotchas

- **Near-identical filenames:** `carrier1-review0.gpt56s.md` (bounded
  self-review) vs `carrier1-review0.gpt56sol.md` (source-grounded review,
  CB/AA/SD taxonomy). Cite carefully.
- **Accepted-tip alias:** `draft.gpt56t.md` is a symlink to
  `draft2.gpt56t.md`, not another wave. Use the versioned filename in lineage
  and dependency references.
- **Stale `/.design/watch/` paths:** the corpus was renamed from
  `.design/watch/` to `.design/watchman/`; an empty `.design/watch/` remains
  and a few docs (e.g. `draft1` frontmatter, `timeout0` citations) still link
  to the old prefix. Paths in this README are correct.
- **Older README descriptions are stale:** documents written before the
  2026-09-03 split call this file the maintenance log. They now land on this
  index; [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) is the
  source of record for the running stack.
- **Cross-workspace links are evidence, not ancestry:** VCS and Watchwoman
  records live in sibling jj workspaces. Their presence does not put that code
  on this feature line or make it accepted. Some records cite hidden predecessor
  hashes after DAG rewrites. Core's documented `07df76de` / `dd090d23` /
  `e94de21b` now correspond to tree-identical `3de29e03` / `1a5b9d5e` /
  `856611de`; prefer stable change IDs and current record tips.
- **Chronology uses the DAG:** generated timestamps and author time zones are
  inconsistent in several wave files. Explicit dependencies and `jj` order win;
  `direction0` and uncommitted `contract0` cannot be durably ordered further.
- **`nav0` drafts are retained, not dead:** the synthesis keeps them as named
  layers — sol = *what must be true*, glm53 = *what can wreck the passage*,
  fmax = *how the two repos and the carrier move*.
- **Response replay and fallback are no longer open forks:** the later human
  decision in [`vision0`, lines 907-925](/.design/watchman/vision0.gpt56s.md#L907-L925)
  selects supervisor-before-strict and fresh-clock recovery with cursor deletion.
  Keep the dropped-response-row scenario as a replacement regression test; do
  not implement replay as an interim destination.

## Cross-references

- [`OpenCode OTEL planning corpus`](file:///home/rektide/src/opencode-otel/.design/otel/README.md)
  — the current downstream migration plan for host-managed signals. Watchman's
  channel dumps and injectable sink are consumer evidence, not the generic API
  definition; migration is explicitly deferred until the host trace/metrics
  gates it depends on are real.
- [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) — the
  implemented stack's commit table, runtime shape, configuration, metrics,
  verification records, and freshen history. This README replaced it as the
  corpus entry point; the log remains the source of record for what runs.
- Beads epic `opwatch-vcs-signals` (`.beads/issues.jsonl`) — the ticket graph
  that [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
  originally restructured. Statuses remain useful, but current prerequisites
  are incomplete: lifecycle lacks its config-snapshot edge, Core lacks owner/
  exact-placement and composed-jj edges, and several notes still cite hidden
  hashes or pre-review authority.
- [Current reconvergence orientation](file:///home/rektide/src/opencode-watchman-observation-synthesis/.design/watchman/observation-reconvergence0.gpt56solmax.md)
  and [new scope reassessment](/.design/watchman/rebuild-assessment0.gpt56solxh.md)
  are complementary, not cumulative authority: one continues the recorded scope;
  the other asks whether to supersede it.
- [Watchwoman config implementation](file:///home/rektide/src/watchwoman-systemd-vcs-config/.design/opencode/config-foundation-implementation0.gpt56solmax.md),
  [snapshot spec](file:///home/rektide/src/watchwoman-systemd/.design/opencode/config-snapshots-spec0.gpt56solmax.md),
  [view-filter design](file:///home/rektide/src/watchwoman-systemd/.design/opencode/vcs-config2-draft0.gpt56solmax.md),
  and [lifecycle spec](file:///home/rektide/src/watchwoman-systemd-production-lifecycle/.design/opencode/production-lifecycle-spec0.gpt56solmax.md)
  describe the daemon lane's implemented, provisional, and specified material.
- [Watchwoman rebuild audit](file:///home/rektide/src/watchwoman-systemd/.design/rebuild-audit/rebuild-audit0.gpt56solmid.md)
  and [truthful-root direction](file:///home/rektide/src/watchwoman-systemd/.design/observation/direction0.gpt56t.md)
  provide the newest daemon-side ranking and proposed correction order. Both are
  drafts; the direction workspace also contains newer uncommitted refinements.
- [OpenCode patch policy](file:///home/rektide/a/doc/opencode/patches.md):
  final-state carrier, freshen, snapshot, and bookmark conventions.
- [Compfuzor Watchwoman playbook](file:///home/rektide/src/compfuzor/watchwoman.src.pb)
  is production authority for the floating daemon selector, socket/service
  pairing, legacy configuration, and restart procedure. It does not prove the
  installed binary is the `systemd-20260903` snapshot.
- [Watchwoman since-query probes](file:///home/rektide/src/watchwoman-systemd/.test-agent/since-queries/README.md)
  and `@superbfowle/fb-watchman-esm` provide external evidence and the transport surface
  behind the reconnect diagnosis and client harness work.
- [Watchment engine synthesis](file:///home/rektide/src/watchment/.design/engine1-syn.glm53x.md)
  is contemporaneous but separate filesystem-state research. It is not an
  OpenCode/Watchwoman continuation or a reason to expand this feature.
