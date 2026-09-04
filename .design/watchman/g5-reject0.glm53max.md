---
type: Design
title: Pitch — land at Profile R without the G5 lease
description: The opposing case for the G5 fork; argues Profile R already covers the dominant failure classes, that the mediated G5 lease is a standing cost and a new correctness surface, and that deferral with explicit revisit triggers is the lower-risk commitment.
resource: /.design/watchman/g5-reject0.glm53max.md
tags: [opencode, watchman, watchwoman, assurance, g5, profile-r, decision-pitch]
status: draft
decision_state: G5 is proposed, NOT accepted, pending human decision
generated: { by: model:zai/glm-5.3-max, at: 2026-09-04T03:10:00Z }
verified: { by: none, at: never }
stale_after: 2026-10-04
sources:
  - id: nav-synthesis
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
    title: Watchman assurance navigation synthesis
  - id: assurance-map
    resource: /.design/watchman/assurances0.gpt56sol.md
    title: Filesystem observation assurance
  - id: direction
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision and human direction decisions
  - id: metrics
    resource: /.design/watchman/metrics0.glm53.md
    title: Watchman channel metrics reading guide
---

# Pitch: land at Profile R, reject (or defer) the G5 lease

## Decision status

G5 is **proposed, not accepted**. The synthesis recommends taking the G5 fork
([`nav0-syn0:71-73`](/.design/watchman/nav0-syn0.gpt56sol.md#L71-L73)), but no
human acceptance is recorded, and the corpus is explicit that this is a
recommendation pending a human ruling
([`nav0-syn0:95`](/.design/watchman/nav0-syn0.gpt56sol.md#L95),
[`assurances0:134-138`](/.design/watchman/assurances0.gpt56sol.md#L134-L138)).
After this pitch lands, the recorded status of the G5 fork remains **"proposed,
not accepted"** until the human rules. This document argues the opposing case:
land at Profile R and do not adopt a standing Config freshness lease now.

## The question on the table

Leg 5 poses it directly:

> Is indefinite Config-mediated staleness after completely silent observer loss
> acceptable?
> ([`nav0-syn0:418-420`](/.design/watchman/nav0-syn0.gpt56sol.md#L418-L420))

The synthesis answers *no*. This pitch answers: **not yet proven worth its
standing cost** — and the corpus itself already contains the honest landfall for
that answer: "G5 rejected → Profile R: detected-loss convergence, hidden loss
unbounded" ([`nav0-syn0:435-439`](/.design/watchman/nav0-syn0.gpt56sol.md#L435-L439)),
with a matching stop rule: "G5 is rejected or audit economics fail → land
honestly at R; do not publish a lease"
([`nav0-syn0:523`](/.design/watchman/nav0-syn0.gpt56sol.md#L523)).

## 1. Profile R already covers the dominant failure classes

Profile R — tested Watchwoman root-epoch floor AND tested OpenCode
delivery/owner floor ([`nav0-syn0:53-59`](/.design/watchman/nav0-syn0.gpt56sol.md#L53-L59))
— delivers G4, detected-loss convergence: every continuity loss *detected by or
reported to* Watchwoman or OpenCode ends the correct root or delivery epoch, and
each participating owner re-reads authoritative state after fresh attachment
([`assurances0:1032-1039`](/.design/watchman/assurances0.gpt56sol.md#L1032-L1039)).

That is not a small residual. The failure classes an operator actually
encounters are almost all *reported* somewhere in the chain:

| Real-world failure class | Signal at Profile R | Covered by |
| --- | --- | --- |
| Daemon restart / process replacement | socket end, generation churn, fresh-instance PDU | G4 delivery epoch + G1 startup source truth |
| Visible connection loss | `Recovering`→ reconnect, `canceled` PDUs | G4 delivery epoch, fresh attachment + reread |
| Queue overflow | pathless `Rescan` treated as root loss | G2/G3 root epoch rules |
| Watcher-task death, callback-channel close | task exit / channel close | G2 root acknowledgement abort |
| Reconnect-after-damage | remove-before-cancel, fresh clock | G4 (no half-cursor recovery) |

Twelve daemon gates and twelve client gates pass together at R
([`nav0-syn0:242`](/.design/watchman/nav0-syn0.gpt56sol.md#L242)). What escapes R
is exactly one class: **completely silent** loss — hidden kernel loss, suppressed
descriptor-installation failure, unreported suspend windows
([`nav0-syn0:292-297`](/.design/watchman/nav0-syn0.gpt56sol.md#L292-L297)). The
burden of the accept case is to show that this narrow class justifies a standing
mechanism on every host, forever — not merely that it exists.

## 2. G5 is a standing cost and a new correctness surface

The mediated G5 product — the one the synthesis recommends — is not "a timer that
re-reads Config." Per the owner/claim gate, every successful audit must emit a B2
invalidation, and the lease bound must include **successful completion of every
named downstream reload** across Config documents, Agent, Command, and Plugin
Source ([`nav0-syn0:168-188`](/.design/watchman/nav0-syn0.gpt56sol.md#L168-L188)).
That means:

- A **standing periodic full Config discovery + decode** on every host that runs
  the product, forever, whether or not anything changed — chosen from measured
  cost, with "no intuitive round numbers" for the period
  ([`nav0-syn0:508`](/.design/watchman/nav0-syn0.gpt56sol.md#L508)).
- A **downstream reload of every named owner** per successful audit — registry
  rebuilds and plugin activation paths that today run only on evidence.
- A **completion/acknowledgement contract** across every named owner: queues,
  ordering, failure semantics, per-owner gates. The corpus is blunt that
  publication alone is insufficient — "publication mistaken for downstream
  completion" is a named rock
  ([`nav0-syn0:243`](/.design/watchman/nav0-syn0.gpt56sol.md#L243)), and the stop
  rule demands acknowledgement or narrowing
  ([`nav0-syn0:524`](/.design/watchman/nav0-syn0.gpt56sol.md#L524)).
- **New test surface**: fake-clock suppressed-event tests for *every* named
  owner, plus failed-read last-good tests
  ([`nav0-syn0:243`](/.design/watchman/nav0-syn0.gpt56sol.md#L243)).

Every item above is a place to be wrong. The completion contract is a
distributed acknowledgement protocol bolted onto the B2 seam — precisely the
kind of ordering/failure-semantics machinery the floor tracks (Fabricated Event
Reef, Audit Mirage) exist to guard. Adopting G5 adds a *second* correctness
surface before the first one (R, 24 gates) has even passed end to end. There is
also a middle-row trap in the landfall table: "G5 accepted but audit period or
downstream contract unfinished" lands at **Profile R plus an unclaimed periodic
refresh mechanism** ([`nav0-syn0:435-439`](/.design/watchman/nav0-syn0.gpt56sol.md#L435-L439))
— a mechanism that exists, costs, and tempts false claims, but proves nothing.
Rejecting is the clean shore; accepting without finishing is the worst of the
three rows.

## 3. Fog honesty: the lease buys bounded exposure, not detection

The corpus is already uncompromising here: an owner audit "bounds the age of
domain state, but says nothing about watcher health"
([`assurances0:121-123`](/.design/watchman/assurances0.gpt56sol.md#L121-L123)),
and the no-incoherent-middle rule keeps "Config audit reported as watcher
health" on the forbidden list
([`nav0-syn0:489`](/.design/watchman/nav0-syn0.gpt56sol.md#L489)).

Two consequences sharpen the cost/benefit:

1. **Permanent fog escapes audits within each `R_config` window.** An audit at
   time T proves mediated state matched source at T. A silent mutation at T+ε
   stays undetected until the next *successful* audit — up to a full period
   later, and longer when reads fail, since failed reads retain last-good state
   and do not renew leases
   ([`nav0-syn0:274`](/.design/watchman/nav0-syn0.gpt56sol.md#L274)). The lease
   bounds state **AGE**, not observation health, and not even staleness
   *detection* — within the window you are exactly as blind as Profile R.
2. **The honest claim is narrow.** What G5 actually buys is: after reads
   succeed, silent staleness lasts at most `R_config` + scan/publication latency
   ([`assurances0:1041-1047`](/.design/watchman/assurances0.gpt56sol.md#L1041-L1047)).
   That is *bounded exposure plus eventual repair of mediated state* — a real
   property, but a much smaller marketing surface than "freshness assurance,"
   and the corpus already forbids the broader wording.

So the decision is not "bounded staleness vs unbounded blindness." It is
"possibly-stale-until-next-detected-signal vs possibly-stale-for-at-most-one-
period." Whether that delta is worth a permanent mechanism is a product
judgment about exposure tolerance — and exposure tolerance is exactly the thing
best decided from an observed incident or measured cost, not in advance.

## 4. Deferral is cheap because R → RC is additive by design

Nothing in the R floor needs redesign if G5 is adopted later. The synthesis
already allows audit work to be built in parallel after B2 while the profile
name waits for integrated R ([`nav0-syn0:226-228`](/.design/watchman/nav0-syn0.gpt56sol.md#L226-L228));
the fork is additive, not structural. The precedent is B3: deferred, not
rejected, with explicit revisit triggers recorded in the human decision log
([`vision0:900-905`](/.design/watchman/vision0.gpt56s.md#L900-L905)).

The reject side should commit to the same discipline — defer with named
triggers, for example:

| Revisit trigger | Evidence it would supply |
| --- | --- |
| An observed silent-staleness incident (stale agent/command/plugin state with no detected-loss signal in the metrics) | Converts the hypothetical into a product requirement |
| Loaded-host measurement showing audit + downstream reload cost is negligible at candidate `R_config` | Retires the economics objection |
| Upstream movement that lands an audit-shaped mechanism anyway | Changes the marginal cost to ~zero |

Deferring on triggers is a **lower-risk commitment than a standing lease now**:
it keeps the option open, prices it on evidence, and — critically — keeps the
route's remaining capacity focused on the main line (two harnesses, 24 gates,
full current-line composite, carrier re-author) rather than splitting it onto a
parallel audit track whose value is speculative until an incident exists.

## 5. Suspicion is already available without a correctness claim

The metrics guide shows operators can already *suspect* delivery trouble
without anyone publishing a freshness bound: frozen `subs[].clock` with zero
PDU deltas while the tree is known to have changed, `canceled_pdus`,
`fresh_instances`, generation churn with command timeouts, stuck `recovering`,
latched `fatal`
([`metrics0:143-154`](/.design/watchman/metrics0.glm53.md#L143-L154),
[`metrics0:79-93`](/.design/watchman/metrics0.glm53.md#L79-L93)). The Leg 7
observability set exposes root epoch, delivery attachment, last loss, terminal
suppression, and environment circuit **separately** at R
([`nav0-syn0:472-476`](/.design/watchman/nav0-syn0.gpt56sol.md#L472-L476)).

That is the honest intermediate: diagnostics surface suspicion; "counters ...
never decide correctness policy" ([`metrics0` cadence/wording,
`nav0-syn0:476`](/.design/watchman/nav0-syn0.gpt56sol.md#L472-L476)). If the
worry is "an operator will not notice silent staleness," the cheap first answer
is operator-facing degradation states and an incident report — not a lease whose
existence implies a bound the system cannot fully justify without the completion
contract of §2.

## 6. What the human gives up by rejecting — stated plainly

Rejection is not free, and this pitch should not make it comfortable:

- **The silent-staleness window for Config-mediated state becomes unbounded.**
  After completely silent observer loss, Config documents and the Agent,
  Command, and Plugin Source registries can stay stale indefinitely — until a
  detected loss, a process restart, or a manual reload. The landfall table's own
  words: "hidden loss unbounded"
  ([`nav0-syn0:437`](/.design/watchman/nav0-syn0.gpt56sol.md#L437)).
- **No repair path exists for permanent fog on mediated state.** At R, if the
  observer silently dies forever, mediated state never converges on its own.
  The audit is the only mapped mechanism that bypasses the broken watcher and
  works during daemon outage
  ([`nav0-syn0:421-424`](/.design/watchman/nav0-syn0.gpt56sol.md#L421-L424),
  [`assurances0:1355-1363`](/.design/watchman/assurances0.gpt56sol.md#L1355-L1363)).
  Rejecting G5 means relying on eventual *detected* failure, restart, or a human.
- **The product cannot claim a freshness bound, ever, in this profile.** The
  user-facing wording is "detected-loss convergence" only.

The accept case will rightly press on the second bullet. The counter is §3: the
lease converts "unbounded" into "one period," it does not detect the fault, and
the period itself waits on measurements nobody has taken yet
([`assurances0:1347-1348`](/.design/watchman/assurances0.gpt56sol.md#L1347-L1348)).

## Recommendation

Land at Profile R. Do not adopt the G5 lease now; record the fork as **deferred
with explicit revisit triggers** (§4), mirroring the B3 precedent, rather than
closed forever. If a trigger fires — an observed silent-staleness incident, or
measured audit economics that make the lease cheap — the additive path to RC
remains exactly as the synthesis charted it. Until then, "G5 is rejected or
audit economics fail → land honestly at R; do not publish a lease"
([`nav0-syn0:523`](/.design/watchman/nav0-syn0.gpt56sol.md#L523)) is not a
fallback; it is a first-class destination in the route.

## Cross-references

- [`nav0-syn0.gpt56sol.md`](/.design/watchman/nav0-syn0.gpt56sol.md) — Leg 5
  ([L414-L439](/.design/watchman/nav0-syn0.gpt56sol.md#L414-L439)) poses the
  fork this pitch opposes; the landfall table, stop rules
  ([L514-L531](/.design/watchman/nav0-syn0.gpt56sol.md#L514-L531)), and
  owner/claim gate ([L153-L188](/.design/watchman/nav0-syn0.gpt56sol.md#L153-L188))
  supply the costs and honest wordings used above.
- [`assurances0.gpt56sol.md`](/.design/watchman/assurances0.gpt56sol.md) — G4/G5
  definitions ([L1032-L1054](/.design/watchman/assurances0.gpt56sol.md#L1032-L1054)),
  the orthogonal-mechanisms rule
  ([L121-L132](/.design/watchman/assurances0.gpt56sol.md#L121-L132)), the open
  ledger ([L1306-L1348](/.design/watchman/assurances0.gpt56sol.md#L1306-L1348))
  keeping G5 undecided, and the current-synthesis recommendation
  ([L1350-L1377](/.design/watchman/assurances0.gpt56sol.md#L1350-L1377)) this
  pitch answers.
- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) — recorded human
  authority: B2, full-current-line scope
  ([L883-L929](/.design/watchman/vision0.gpt56s.md#L883-L929)), and the B3
  defer-with-triggers precedent
  ([L900-L905](/.design/watchman/vision0.gpt56s.md#L900-L905)) mirrored in §4.
- [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) — the diagnostic
  alternative: symptom→field table
  ([L143-L154](/.design/watchman/metrics0.glm53.md#L143-L154)) and health gauges
  ([L79-L93](/.design/watchman/metrics0.glm53.md#L79-L93)) that surface
  suspicion without a lease claim.
- [`topic-query0.glm53.md`](/.design/watchman/topic-query0.glm53.md) and
  [`fallbacks0.glm53.md`](/.design/watchman/fallbacks0.glm53.md) — adjacent
  context on daemon races and acquisition ordering that R's gates retire
  without any audit machinery.
