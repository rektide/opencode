---
type: Index
title: Watchman design corpus
description: What the 32 design documents say, their status, and their dependency graph — the entry point for the root-scoped Watchman backend and its unbuilt remake.
resource: /.design/watchman/README.md
tags: [opencode, watchman, watchwoman, filesystem, index]
status: stable
generated: { by: model:glm-5.3-flash, at: 2026-09-03T23:59:00Z }
verified: { by: model:glm-5.3-flash, at: 2026-09-03T23:59:00Z }
stale_after: 2026-10-15
sources:
  - id: maintenance-log
    resource: /.design/watchman/maintenance.glm53.md
  - id: current-route
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
  - id: corpus-read
    resource: /.design/watchman/tools0.gpt56s.md
---

# Watchman design corpus

> **Current state:** the root-scoped backend is **built and instrumented** (see
> [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md)). The
> **remake** — a clean re-authoring that fixes its known defects — is designed
> but not started. [`nav0-syn0.gpt56sol.md`](/.design/watchman/nav0-syn0.gpt56sol.md)
> is the authority-correct route. One decision fork (**G5**) and one contested
> promotion (**B3**) await explicit human acceptance.

## What the corpus is trying to say

1. **A root-scoped Watchman backend replaced a deleted process-global one.**
   [`draft1`](/.design/watchman/draft1.gpt56t.md) built one shared connection;
   it was deleted after its shared FIFO turned one slow root into a fleet-wide
   outage. [`draft2`](/.design/watchman/draft2.gpt56t.md) is the accepted
   replacement — one `RootConnection` per route intent, source-owned interests
   — and it is implemented, tested, and tuned (25+ commits).
2. **A live daemon reshaped the design before it landed.**
   [`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) validated draft2
   against watchwoman 0.7.0 and produced its three governing amendments (plain
   `watch`, never `watch-project`; best-effort `unsubscribe`; stale cursors
   return full state) plus the 29.2 GB `$HOME` crawl incident.
3. **The August 30 incident is understood to source level.**
   [`timeout0`](/.design/watchman/timeout0.gpt56s.md) +
   [`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md): queue-residence
   timeouts on one serialized FIFO, and 3 cookie pathnames amplifying into 74
   skill refreshes — application amplification, not corruption. This justified
   admitted dispatch, per-root failure domains, and Skill-boundary cookie
   filtering.
4. **The implemented result has two sharp known defects.**
   [`fallbacks0`](/.design/watchman/fallbacks0.glm53.md): the *acquisition
   cliff* — the same failure is permanent Parcel pre-ack but retry-forever
   post-ack. [`topic-query0`](/.design/watchman/topic-query0.glm53.md): the
   resume path discards the daemon-computed disconnect delta, violating
   draft2's own Amendment 3. The four September 1 reviews add the full defect
   and test-gap list.
5. **The watch-surface boundary is settled.** Directories earn the daemon
   layer; files stay on `node:fs.watch` unconditionally
   ([`files-too0`](/.design/watchman/files-too0.glm53.md)), and Parcel's own
   watchman client is documented as the incident class this layer eliminates
   ([`parcel0`](/.design/watchman/parcel0.glm53.md)).
6. **Everything after `vision0` is one question: how to honestly rebuild.**
   [`vision0`](/.design/watchman/vision0.gpt56s.md) records the human **B2
   decision** (Config-local typed invalidation now; watcher-level B3 later).
   [`carrier1`](/.design/watchman/carrier1.gpt56s.md) proposes the remake
   architecture but *promotes B3* — ruled by
   [`carrier1-review0.gpt56sol`](/.design/watchman/carrier1-review0.gpt56sol.md)
   (SD1) to still require explicit human acceptance, and carrying 7 correctness
   blockers (CB1–CB7). Upstream then landed in the carrier's planned seams
   ([`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md)): the
   rebuild must *generalize* upstream's `ConfigWatch`/`onReady`, not bypass it.
7. **The current route is `nav0-syn0`.** Authority before architecture:
   crossing contract → two deterministic harnesses → **Profile R** floor
   (detected-loss convergence) → the open **G5 fork** (bounded Config
   freshness lease, or not) → complete the current line including VCS signals →
   re-author the carrier from final state on pinned upstream.
8. **Forward product direction: VCS-internal watch signals** (git refs, jj
   `op_heads/heads`, hg branch) as invalidation-not-data
   ([`watches`](/.design/watchman/watches.glm53.md)), restructured by
   [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
   into two independently shippable lanes, with
   [`tools0`](/.design/watchman/tools0.gpt56s.md) specifying the harnesses
   that make it provable.

**Read only three:** [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md)
(the route) · [`assurances0`](/.design/watchman/assurances0.gpt56sol.md) (the
map it navigates) · [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md)
(what already runs).

## Status legend

| Status | Meaning |
| --- | --- |
| implemented | Documents landed, verified code |
| superseded | Replaced; retained for lineage |
| evidence | Source-level / probe / live-daemon findings |
| review | Findings over a design or the implementation |
| open proposal | Proposed, not built, no human acceptance recorded |
| decision-record | Records a convention or decision state |

**Dependency tags** use named refs with a role prefix: `builds-on`, `evidence`,
`supersedes`, `reviews`, `contradicts`, `synthesizes`, `validates`, `feeds`,
`decides`, `implements`.

---

## Implemented line

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`draft1`](/.design/watchman/draft1.gpt56t.md) | Original accepted design: one process-global Watchman connection; roots expensive, subscriptions cheap; 15-min idle TTL. Built, then deleted after the FIFO incident. | superseded → [`draft2`](/.design/watchman/draft2.gpt56t.md) | — |
| [`draft2`](/.design/watchman/draft2.gpt56t.md) | The accepted, implemented design: per-root-intent `RootConnection`s, source-owned `WatchInterests`, admitted dispatch, 60 s deadlines; Amendments 1–3 from live validation. | implemented | supersedes:[`draft1`](/.design/watchman/draft1.gpt56t.md) · validated-by:[`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) · evidence:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) |
| [`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) | Live-daemon + source validation of draft2's six assumptions: re-watch 2 ms, incremental `since` 7 ms; no `canceled` PDU, no cursor rejection; the 32M-file `$HOME` crawl incident. | evidence | validates:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) | Implementation state of the landed stack: commit table, runtime shape, config, metrics, verification records, freshen history. | implemented | implements:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`metrics0`](/.design/watchman/metrics0.glm53.md) | Reading guide for the landed channel telemetry: `delta.generations` + `command_timeouts` = incident signature; `files_in − updates_out` = ignore-drop rate; frozen `subs[].clock` = delivery stopped. | implemented | documents:[`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) · detects:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) |

## Incident & evidence studies

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`timeout0`](/.design/watchman/timeout0.gpt56s.md) | Aug 30 incident, corrected: the 10 s timer starts at FIFO *enqueue*, so a 9.46 s cold crawl made 8 callers "time out"; 20 s `clock` calls are the daemon sanity thread, not us. Retire only for post-submission deadlines. | review | evidence-for:[`draft2`](/.design/watchman/draft2.gpt56t.md) · extended-by:[`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md) |
| [`cookie-clash0`](/.design/watchman/cookie-clash0.gpt56s.md) | Cookie semantics from daemon source + two-daemon experiment: 3 physical cookie pathnames → 74 skill refreshes in <3 min. Amplification, not recrawl. Sanity thread is the dominant cookie producer. | evidence | builds-on:[`timeout0`](/.design/watchman/timeout0.gpt56s.md) · informs:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) | Static map of every Parcel-degradation path. The **acquisition cliff**: one-shot five-round-trip acquisition with catch-all catch pre-ack vs retry-forever post-ack; terminal per-interest fallback; uncleared `fatal` latch; mixed-backend states. | evidence | maps:[`draft2`](/.design/watchman/draft2.gpt56t.md) · dissected-by:[`review-architecture0`](/.design/watchman/review-architecture0.gpt56s.md) · instrumented-by:[`metrics0`](/.design/watchman/metrics0.glm53.md) |
| [`topic-query0`](/.design/watchman/topic-query0.glm53.md) | Live streaming aligns; **resume discards the daemon-computed delta** (decoded schema drops `files`), violating Amendment 3; tombstone GC (~60 s) bounds disconnect recovery; fix is small and designed. | open proposal | contradicts:[`draft2`](/.design/watchman/draft2.gpt56t.md) · instrumented-by:[`metrics0`](/.design/watchman/metrics0.glm53.md) |
| [`parcel0`](/.design/watchman/parcel0.glm53.md) | Parcel's built-in watchman client is process-global, one socket, no timeouts/reconnect/cursor, silently falls back to inotify under the `watchman` label — the incident class minus the visible timers. Keep the root-scoped layer. | review | evaluates:[`draft2`](/.design/watchman/draft2.gpt56t.md) · mutual:[`files-too0`](/.design/watchman/files-too0.glm53.md) |
| [`files-too0`](/.design/watchman/files-too0.glm53.md) | The daemon cannot watch a file; files are the cheapest primitive with a zero-sized failure domain. Keep files on `node:fs.watch` unconditionally; codify the `backend.ts:18` bypass as a documented invariant. | open proposal | affirms:[`draft2`](/.design/watchman/draft2.gpt56t.md) · mutual:[`parcel0`](/.design/watchman/parcel0.glm53.md) |

## Implementation reviews (2026-09-01 wave)

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`review-architecture0`](/.design/watchman/review-architecture0.gpt56s.md) | Fallback policy is split across seven sites, producing the temporal acquisition cliff. Keep the delivery fork explicit: exact response-row replay is the safe near-term correction; cursorless invalidation is blocked until Config has first-class subtree invalidation. | review | builds-on:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) · reopens:[`draft2`](/.design/watchman/draft2.gpt56t.md) · feeds:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) | Nine probed findings (V1–V9): response loss on *every* establishment (PubSub is not replay storage); fatal gauge disagrees with behavior; Parcel EOF is silent. Corrects `fallbacks0`/`topic-query0` claims; defines test matrix M1–M6. | review | corrects:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) · corrects:[`topic-query0`](/.design/watchman/topic-query0.glm53.md) · feeds:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`review-ownership0`](/.design/watchman/review-ownership0.gpt56s.md) | All load-bearing Watchman policy is downstream-owned; freshen conflicts landed only in `routes.ts`. Names six clean seams and the missing injected-factory seam that blocks fallback unit testing. Flags bookmark debt + `AGENTS.md` contamination. | review | audits:[`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) · feeds:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`review-simplification0`](/.design/watchman/review-simplification0.gpt56s.md) | Decision: strict Watchman selection with retry-forever async availability — configured interests never invoke Parcel. Two-tier deletion list; conditional-deletion analysis shows exact rows are "correctness, not optional detail"; metrics trim sequenced after rewrite. | review | narrows:[`draft2`](/.design/watchman/draft2.gpt56t.md) · builds-on:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) |

## Remake line (designed, not built)

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`vision0`](/.design/watchman/vision0.gpt56s.md) | Freeze-frame of the implemented stack + six consolidation hypotheses (H1–H6); verifies the reconnect-delta gap and the exact-path consumer caveat; addenda synthesize the four reviews, add VCS watching, and record the human **B2 decision**. Founding doc of the remake. | open proposal · decision-record | synthesizes:[`review-architecture0`](/.design/watchman/review-architecture0.gpt56s.md)+3 · decides: B2 · evidence:[`fallbacks0`](/.design/watchman/fallbacks0.glm53.md) |
| [`carrier0`](/.design/watchman/carrier0.gpt56s.md) | Execution plan for the clean rebuild: C1–C12 final-state commit ladder authored on pinned upstream, two-pass proof-line + parity construction, B2 kept, metrics trimmed last. | superseded → [`carrier1`](/.design/watchman/carrier1.gpt56s.md) | executes:[`vision0`](/.design/watchman/vision0.gpt56s.md) |
| [`carrier1`](/.design/watchman/carrier1.gpt56s.md) | The remake as architecture: owners declare what can make state stale; substrate emits exact changes while continuous, explicit invalidation when not; never silently changes backend. **Promotes B3** (contested). | open proposal | supersedes:[`carrier0`](/.design/watchman/carrier0.gpt56s.md) · adopts:[`typed-watcher0`](/.design/watchman/typed-watcher0.glm53.md) · reviewed-by:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) |
| [`carrier1-review0 s`](/.design/watchman/carrier1-review0.gpt56s.md) | Bounded self-review: architecture settled, 7 findings each with a prescribed edit (invalidation rows on continuity loss, linearization rule, VCS sentinels, reproducible probe). Also recommends this README become an index. | review | reviews:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |
| [`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) | Source-grounded review at pinned commit: **CB1–CB7** correctness blockers (daemon can ack a deaf root; no structured `error_code` on the wire); AA1–AA5 amendments; **SD1**: B3 promotion is a new proposal requiring explicit human acceptance. | review | reviews:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) · grounds:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`assurances0`](/.design/watchman/assurances0.gpt56sol.md) | What a watcher can honestly promise under B2: mandatory floor **F1–F9** (fenced acquisition, observation epochs, complete loss handling), guarantees G1–G8, orthogonal assurance mechanisms, profiles **R/RC/RD/RP/RS**; frames the **G5 fork**. | open proposal | builds-on:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) · maps:[`watchwoman0`](/.design/watchman/watchwoman0.unknown.md) |
| [`typed-watcher0`](/.design/watchman/typed-watcher0.glm53.md) | The deliberately deferred end-state: `Watcher.Update` gains `{type:"invalidation"}`; near-term B2's tag vocabulary matches the future member so migration deletes one classification site. Delivery ordering is the named prerequisite. | open proposal (deferral recorded) | defers-from:[`vision0`](/.design/watchman/vision0.gpt56s.md) · adopted-by:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |

## Navigation (current route)

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`nav0 sol`](/.design/watchman/nav0.gpt56sol.md) | The assurance spine: build Profile R (G1–G4) as non-negotiable floor, land at RC via a *measured* Config audit; six legs with claim cards, fork-and-stop rules, default-worthiness gate. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | charts:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`nav0 glm53`](/.design/watchman/nav0.glm53.md) | The chart: crossing contract first (error-code vocabulary, B2/B3 tag names), then parallel client/daemon crews; 18 named rocks, false-beacons table, "permanent fog," station for every open ledger decision. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | charts:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`nav0 fmax`](/.design/watchman/nav0.glm53fmax.md) | The program: position fix, seven beacons with arrival proofs, nine rudder decisions, three routes; the **no-incoherent-middle rule**; names the corpus disagreeing with itself on interim depth. | superseded → [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | programs:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) |
| [`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) | **The current authority-correct route.** "Authority before architecture": recorded human decisions outrank model proposals; B3 is not a departure gate; Profile R floor → G5 fork (recommends accept; no human record) → full current line incl. required reactive VCS → re-author carrier on pinned upstream. | open proposal — the route | synthesizes:[`nav0 sol`](/.design/watchman/nav0.gpt56sol.md)+2 · authority:[`vision0`](/.design/watchman/vision0.gpt56s.md) · rests-on:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`g5-accept`](/.design/watchman/g5-accept0.glm53max.md) | Pro-lease pitch: permanent fog leaves Config-mediated staleness **unbounded** at Profile R; the owner source audit is the only mapped mechanism that bounds it; mediated G5 is additive and fails safe to R. Requests a decision record. | open proposal | argues-from:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) · argues-from:[`assurances0`](/.design/watchman/assurances0.gpt56sol.md) |
| [`g5-reject`](/.design/watchman/g5-reject0.glm53max.md) | Anti-lease pitch: R covers all *reported* failure classes; mediated G5 is a standing cost and a second correctness surface bought before the first (R's 24 gates) has passed; R→RC stays additive — defer with revisit triggers. | open proposal | answers:[`g5-accept`](/.design/watchman/g5-accept0.glm53max.md) · argues-from:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) |
| [`position0`](/.design/watchman/position0.glm53max.md) | The light position fix: **chase, do not pin** — citations record what they read, drift goes to a dated log. Snapshots docs/upstream/daemon revisions; stale after 2026-09-18. | decision-record | satisfies:[`nav0-syn0`](/.design/watchman/nav0-syn0.gpt56sol.md) |
| [`upstream-delta0`](/.design/watchman/upstream-delta0.glm53h.md) | Upstream landed `ConfigWatch.plan` reconcile, an `entries` watch kind, and public `onReady` **in the carrier's planned seams**. The rebuild must generalize `ConfigWatch` into a generic `WatchSet` and replace `onReady` with typed invalidation, preserving its test outcomes. | evidence | assesses:[`carrier1`](/.design/watchman/carrier1.gpt56s.md) · refreshes:[`review-ownership0`](/.design/watchman/review-ownership0.gpt56s.md) |

## Forward direction: VCS signals & tooling

| Doc | Says | Status | Dependencies |
| --- | --- | --- | --- |
| [`watches`](/.design/watchman/watches.glm53.md) | Probe-backed VCS signal matrix: git `HEAD`/`refs/heads`/`packed-refs`, jj `op_heads/heads` (resolves via the `.jj/repo` pointer; repo-global from any workspace), hg `.hg/branch`. Watching is an invalidation signal, not data. | open proposal | feeds:[`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) · rides-on:[`draft2`](/.design/watchman/draft2.gpt56t.md) |
| [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md) | Accepted restructure of `opwatch-vcs-signals`: independently shippable OpenCode exact-interest and Watchwoman broad-root lanes join at one activation ticket. The accepted addendum records the renamed graph, unified path/type/metadata rule direction, and non-blocking P4 content-rule decision. | accepted direction | restructures:[`watches`](/.design/watchman/watches.glm53.md) · absorbs:[`carrier1-review0 sol`](/.design/watchman/carrier1-review0.gpt56sol.md) |
| [`tools0`](/.design/watchman/tools0.gpt56s.md) | Provenance-tagged inventory of the carrier's executed checks; **corrects the upstream-collision record** (ten intersections, not two). Proposes seven durable tools, scripted protocol harness first. | evidence | documents:[`carrier0`](/.design/watchman/carrier0.gpt56s.md) · automates:[`review-failure-paths0`](/.design/watchman/review-failure-paths0.gpt56s.md) |

---

## Open decisions

| # | Decision | Where it stands |
| --- | --- | --- |
| 1 | **G5 fork** — does Config get a bounded freshness lease after silent observer loss (Profile RC), or stop at detected-loss convergence (Profile R)? | Two pitches exist ([`g5-accept`](/.design/watchman/g5-accept0.glm53max.md), [`g5-reject`](/.design/watchman/g5-reject0.glm53max.md)); `nav0-syn0` recommends accept; **no human decision recorded**. |
| 2 | **B3 promotion** — watcher-level typed invalidation in the remake's generic foundation, vs B2-at-Config only. | `carrier1` promotes it; `carrier1-review0 sol` SD1 rules it needs explicit human acceptance. `vision0`'s recorded decision was B2. |
| 3 | **carrier1 corrections** — CB1–CB7 blockers, AA1–AA5 amendments, plus `upstream-delta0`'s eight adaptations (generalize `ConfigWatch`, replace `onReady`). | Required before construction; an addendum for carrier1 is drafted in the review. |
| 4 | **Resume-delta fix** — publish the subscribe response's `files` on resume. | Small, designed ([`topic-query0`](/.design/watchman/topic-query0.glm53.md)), not implemented; would land on the current line. |
| 5 | **Fallback policy choice** — Candidate A (centralized phase-and-scope fallback) vs Candidate B (strict selection). | `review-failure-paths0` deliberately refuses to pick; all four reviews lean strict. |
| 6 | **Watchman as default** — make watchman the default directory backend. | Gated on many-project cold-start measurement ([`maintenance.glm53`](/.design/watchman/maintenance.glm53.md) follow-ups); channel metrics are the instrument. |

## Gotchas

- **Near-identical filenames:** `carrier1-review0.gpt56s.md` (bounded
  self-review) vs `carrier1-review0.gpt56sol.md` (source-grounded review,
  CB/AA/SD taxonomy). Cite carefully.
- **Stale `/.design/watch/` paths:** the corpus was renamed from
  `.design/watch/` to `.design/watchman/`; an empty `.design/watch/` remains
  and a few docs (e.g. `draft1` frontmatter, `timeout0` citations) still link
  to the old prefix. Paths in this README are correct.
- **`nav0` drafts are retained, not dead:** the synthesis keeps them as named
  layers — sol = *what must be true*, glm53 = *what can wreck the passage*,
  fmax = *how the two repos and the carrier move*.

## Cross-references

- [`maintenance.glm53.md`](/.design/watchman/maintenance.glm53.md) — the
  implemented stack's commit table, runtime shape, configuration, metrics,
  verification records, and freshen history. This README replaced it as the
  corpus entry point; the log remains the source of record for what runs.
- Beads epic `opwatch-vcs-signals` (`.beads/issues.jsonl`) — the ticket graph
  that [`alignment0`](/.design/watchman/opwatch-vcs-signals-alignment0.gpt56solmax.md)
  restructures; its retained IDs and dependency edges now match the accepted
  addendum.
- External, load-bearing: `~/a/doc/opencode/patches.md` (patch/freshen/bookmark
  policy), watchwoman-systemd source + since-query probes, `@superbfowle/fb-watchman-esm`
  transport fork.
