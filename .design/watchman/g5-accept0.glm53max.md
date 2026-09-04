---
type: Design
title: The case for accepting G5 - Config freshness audit to Profile RC
description: A decision pitch arguing that the human should accept G5 (Config-mediated freshness audit) so the route lands at Profile RC, not Profile R alone.
resource: /.design/watchman/g5-accept0.glm53max.md
tags: [opencode, watchman, watchwoman, assurance, g5, freshness, audit, decision]
status: draft
generated: { by: model:zai/glm-5.3-max, at: 2026-09-04T03:40:00Z }
verified: { by: none, at: never }
stale_after: 2026-10-04
sources:
  - id: nav-syn
    resource: /.design/watchman/nav0-syn0.gpt56sol.md
    title: Watchman assurance navigation synthesis
  - id: assurance-map
    resource: /.design/watchman/assurances0.gpt56sol.md
    title: Filesystem observation assurance
  - id: direction
    resource: /.design/watchman/vision0.gpt56s.md
    title: Watchman consolidation vision and human direction decisions
  - id: channel-metrics
    resource: /.design/watchman/metrics0.glm53.md
    title: Watchman channel metrics reading guide
---

# The case for accepting G5

## The question on the table

The synthesis route arrives at one genuine fork
([nav0-syn0:414-424](/.design/watchman/nav0-syn0.gpt56sol.md#L414-L424)):

> Is indefinite Config-mediated staleness after completely silent observer loss
> acceptable?

The synthesis recommends **no** — accept G5, land at Profile RC — but records
that no human acceptance exists
([nav0-syn0:71-73](/.design/watchman/nav0-syn0.gpt56sol.md#L71-L73),
[authority table, rows 7-8](/.design/watchman/nav0-syn0.gpt56sol.md#L88-L96)).
This document is the case for saying no. It argues the exposure is real and
unbounded under Profile R, that the owner audit is the only mapped mechanism
that bounds it, that the Config-mediated audit product is the honest and most
valuable form, and that accepting it is strictly additive: nothing already
promised weakens, and the route still fails safe into R.

Profiles under discussion
([nav0-syn0:53-59](/.design/watchman/nav0-syn0.gpt56sol.md#L53-L59)):

```text
Profile R  = tested Watchwoman root-epoch floor
             AND tested OpenCode delivery/owner floor

Profile RC = Profile R
             AND an accepted, measured Config freshness audit (G5)
```

## 1. The exposure: permanent fog leaves R's clock unstopped

Profile R's guarantee is **conditional on a signal arriving**. Every R
mechanism — root epoch end, stream failure, B2 invalidation, fresh
re-attachment, owner reread — is triggered by *reported* loss. The atlas names
what R cannot see: hidden kernel loss, suppressed descriptor installation
failure, an unreported suspend window, a live-but-hung observer task. These are
fog: failure classes with no reactive evidence
([nav0-syn0:292-310](/.design/watchman/nav0-syn0.gpt56sol.md#L292-L310)). The
Profile R entry says it plainly: hidden observer loss has no staleness bound,
and manual refresh or process restart may be the first repair
([assurances0:913-928](/.design/watchman/assurances0.gpt56sol.md#L913-L928)).

Concretize the fog world:

1. A user edits `agents/foo.md`, a command file, or a plugin source under a
   Config directory.
2. The kernel drops the event (queue overflow surfaced nowhere), or `notify`
   silently skipped a subtree descriptor, or the daemon event task hung without
   dying. Nothing reports. The metrics read clean: zero errors, zero canceled
   PDUs, a plausible idle clock.
3. The OpenCode session keeps running — hours, days. Agent definitions, command
   definitions, and plugin entrypoints stay silently wrong.
4. No error exists to debug. The first "signal" is a human noticing the system
   behaves according to a config that no longer exists on disk.

Note what does **not** close this hole elsewhere in the accepted plan:

- **B2 fixes routing, not arrival.** B2 types the invalidation at
  `Config.changes` and switches Agent/Command/Plugin Source off path-shape
  guessing
  ([vision0:888-899](/.design/watchman/vision0.gpt56s.md#L888-L899)). It
  governs invalidations that *reach* Config. An event that never arrives
  carries no tag to switch on.
- **Scheduled Config reload is not a bound either.** Current discovery stores
  directory sources as opaque entries; a scheduled reload can find the same
  entries, publish nothing, and leave downstream owners stale
  ([nav0-syn0:155-164](/.design/watchman/nav0-syn0.gpt56sol.md#L155-L164)).

So under R the staleness bound is "until the human restarts something," and
the discovery mechanism for the bug is wrong product behavior. That is the
worst available failure mode: silent wrongness with a healthy-looking system.
The decision ledger keeps this open as item 1 — G4 only, or also G5
([assurances0:1334-1335](/.design/watchman/assurances0.gpt56sol.md#L1334-L1335)).
Accepting G5 closes it with a number; declining leaves it at infinity.

## 2. Why the owner audit is the only mapped mechanism that bounds it

Four candidate mechanisms could theoretically bound staleness. Only one is
mapped, affordable, and correctly independent:

| Mechanism | Bounds Config staleness? | Independent of the broken watcher? | Cost shape | Verdict |
| --- | --- | --- | --- | --- |
| **Owner source audit (G5)** | Yes — re-derives state from source | Yes — bypasses the event path entirely | Recurring work over the small Config source extent | **The mechanism** |
| Active path probe (G7) | No — proves one path liveness, not convergence | No — exercises the possibly-broken watcher | Writes, waiter/timeout state, writable-root constraints | RP branch, off main route |
| Structural coverage (G8) | No — descriptors ≠ queue drain ≠ owner state | Partially | `notify` fork or upstream change | RS branch, off main route |
| Periodic daemon recrawl | Indirectly, at daemon-index level only | No — same daemon, and still needs owner reread | Full generic-root crawl per root, per interval | Disproportionate |

([assurances0:121-127](/.design/watchman/assurances0.gpt56sol.md#L121-L127)
for the orthogonality claim,
[assurances0:660-693](/.design/watchman/assurances0.gpt56sol.md#L660-L693) for
probe limits,
[assurances0:695-710](/.design/watchman/assurances0.gpt56sol.md#L695-L710) for
structural limits,
[assurances0:712-727](/.design/watchman/assurances0.gpt56sol.md#L712-L727) for
why full recrawl is disproportionate.)

Three properties make the audit uniquely correct here:

1. **Evidence independence.** Evidence produced by the possibly-broken
   mechanism catches fewer fault classes; an owner source scan is independent
   of the watcher ([assurances0:811-818](/.design/watchman/assurances0.gpt56sol.md#L811-L818)).
   The audit does not ask the watcher anything. It reads the filesystem the
   way startup does — the one code path we already trust.
2. **It works when everything else is down.** Audits are owner-side and run
   while the daemon is unavailable
   ([assurances0:656-658](/.design/watchman/assurances0.gpt56sol.md#L656-L658)).
   During a daemon outage, R has legitimately parked; the audit still
   converges Config state, because source truth was never the daemon's to own.
3. **The source extent is tiny.** An audit scans domain sources — the config
   directories — not generic Watchwoman roots
   ([assurances0:1355-1363](/.design/watchman/assurances0.gpt56sol.md#L1355-L1363)).
   The deployment snapshot shows what the alternative costs: 127,154 indexed
   files across 66 roots
   ([assurances0:1087-1105](/.design/watchman/assurances0.gpt56sol.md#L1087-L1105)).
   The audit's recurring cost scales with a handful of files, and it is
   cause-agnostic: whatever made state stale — kernel loss, client queue
   weirdness, a consumer bug — a successful audit re-converges it.

The synthesis already states the conclusion: owner audit is the only mapped
mechanism that bounds hidden-loss state age
([nav0-syn0:122-123](/.design/watchman/nav0-syn0.gpt56sol.md#L122-L123)).
Leg 5 adds the supporting reasons: bypasses the possibly-broken watcher, works
during daemon outage, small source extent versus a generic root
([nav0-syn0:421-424](/.design/watchman/nav0-syn0.gpt56sol.md#L421-L424)).

## 3. The product choice: recommend Config-mediated G5

Two honest G5 products exist
([nav0-syn0:178-188](/.design/watchman/nav0-syn0.gpt56sol.md#L178-L188)):

| | Narrow G5 | **Config-mediated G5 (recommended)** |
| --- | --- | --- |
| Lease covers | Config documents and topology only | Config documents **and** every named downstream reload |
| Audit action | Successful scan renews | Successful scan **emits a B2 invalidation**; lease renews only after Agent, Command, and Plugin Source complete their reloads |
| Value | Config file state fresh; users still see stale agents/commands | One audit bounds what users actually touch |
| Risk | Under-sells the mechanism | Must prove completion, or narrow |

**Recommend the mediated product.** The atlas's own value argument is that "one
audit covers Config, Agent, Command, and Plugin Source"
([assurances0:1355-1363](/.design/watchman/assurances0.gpt56sol.md#L1355-L1363)),
and the reason it can is that B2 already concentrates all three consumers at
the Config seam
([assurances0:943-944](/.design/watchman/assurances0.gpt56sol.md#L943-L944)).
Narrow G5 bounds the layer nobody directly experiences; the mediated product
bounds the user-visible one — stale agent definitions and stale commands are
the failure users notice in section 1. And the mediated audit rides the
already-accepted B2 contract rather than inventing a channel: audits "are
naturally B2-compatible because they terminate at the owner"
([assurances0:656-658](/.design/watchman/assurances0.gpt56sol.md#L656-L658)).

### Defending against the mirage: publication is not convergence

The mediated product is only honest if it refuses the two rocks named for
exactly this leg — **Audit Mirage / Empty Snapshot**: keep observation health
separate; failed reads retain last-good state and do not renew leases
([nav0-syn0:274](/.design/watchman/nav0-syn0.gpt56sol.md#L274)). The failure
shapes:

- **The mirage.** "Config scan succeeded, entry list unchanged, lease renewed"
  proves nothing about downstream owners. A successful scan that neither
  invalidates nor observes named downstream completion must not renew their
  leases ([nav0-syn0:429-431](/.design/watchman/nav0-syn0.gpt56sol.md#L429-L431)).
  Renewal for owner `O` requires: audit read succeeded, B2 invalidation
  emitted, **and** `O`'s reload completed. Publication alone never suffices.
- **The empty snapshot.** A permission, mount, or parse failure must retain
  last-good state and degraded health — never become "no agents found"
  stamped with a fresh lease. An audit that converts read failure into an
  empty result is worse than no audit: it upgrades silent staleness into
  silent wrongness with freshly renewed credentials
  ([assurances0:651-654](/.design/watchman/assurances0.gpt56sol.md#L651-L654)).
- **The health overreach.** A successful audit bounds domain state age, never
  watcher health; it must not clear an observation-health error
  ([assurances0:641-644](/.design/watchman/assurances0.gpt56sol.md#L641-L644)).

If the completion acknowledgement or queue contract cannot be bounded, the
stop rule is pre-written and the recommendation survives it: narrow the
advertised claim to Config documents rather than assume publication equals
convergence
([nav0-syn0:187-188](/.design/watchman/nav0-syn0.gpt56sol.md#L187-L188),
[nav0-syn0:524](/.design/watchman/nav0-syn0.gpt56sol.md#L524)). Accepting the
mediated product with a mandated narrowing fallback cannot end in a lie.

## 4. Cost discipline: R_config comes from measurement

G5's acceptance must not smuggle in a period. Ledger item 9 and the decision
stations agree: audit periods are chosen from measured cost and acceptable
staleness, **no intuitive round numbers**
([assurances0:1347-1348](/.design/watchman/assurances0.gpt56sol.md#L1347-L1348),
[nav0-syn0:508](/.design/watchman/nav0-syn0.gpt56sol.md#L508)).

The selection procedure:

1. **Measure the audit.** Experiment 5 (recovery economics) measures Config
   audit and downstream reload tail latency on representative roots
   ([assurances0:1297-1300](/.design/watchman/assurances0.gpt56sol.md#L1297-L1300)).
   The metrics corpus supplies the seams: `command_ms` / `command_max_ms` /
   `command_avg_ms` give loaded-host round-trip distributions
   ([metrics0:119-121](/.design/watchman/metrics0.glm53.md#L119-L121),
   [metrics0:186-188](/.design/watchman/metrics0.glm53.md#L186-L188)); the
   delta-window pattern (window cost versus cumulative audit trail) is the
   accounting shape a recurring audit should copy
   ([metrics0:59-75](/.design/watchman/metrics0.glm53.md#L59-L75)); and the
   existing interval machinery — configurable cadence, injectable sink, final
   dump at close — demonstrates the jitterable-scheduler form the audit timer
   takes ([metrics0:212-231](/.design/watchman/metrics0.glm53.md#L212-L231)).
2. **Set the product input.** Tolerated staleness after quiescence is a
   product decision — the human states what exposure is acceptable.
3. **Choose R_config between them.** The bound must clear measured p99
   audit-plus-downstream-completion cost with headroom, fit under tolerated
   exposure, and carry jitter so concurrent sessions do not stampede
   (Profile RC specifies a jittered, low-rate audit,
   [assurances0:930-938](/.design/watchman/assurances0.gpt56sol.md#L930-L938)).
4. **Record the number with its evidence.** A period without a measurement
   record behind it is exactly the intuitive round number the ledger forbids.

One boundary matters: metrics size the audit and diagnose the system; they are
never correctness inputs, and no lease renewal decision reads a counter
([assurances0:866-868](/.design/watchman/assurances0.gpt56sol.md#L866-L868)).
If measured cost makes the desired bound uneconomical, that is the audit
economics stop rule — land at R and publish no lease
([nav0-syn0:523](/.design/watchman/nav0-syn0.gpt56sol.md#L523)).

## 5. Strict additivity: R is not weakened, and failure degrades to R

- **The R floor is untouched.** G5 adds an owner-side timer, a scheduled
  source read, and completion plumbing. It changes no watcher internals, no
  daemon epoch machinery, no crossing contract, and no R gate. R's tests
  remain R's tests.
- **No B3 creep.** The audit terminates at the owner and reuses the accepted
  B2 invalidation vocabulary; `Watcher.Update` stays exact-only
  ([vision0:888-899](/.design/watchman/vision0.gpt56s.md#L888-L899)).
- **Fails safe.** The landfall table is explicit: G5 accepted but period or
  downstream contract unfinished yields "Profile R plus an unclaimed periodic
  refresh mechanism" — useful, honestly named, never a false RC; only
  measured-and-gated acceptance yields RC
  ([nav0-syn0:433-439](/.design/watchman/nav0-syn0.gpt56sol.md#L433-L439)).
  An audit without the reactive floor is a periodic refresh, not a profile
  ([nav0-syn0:226-227](/.design/watchman/nav0-syn0.gpt56sol.md#L226-L227)).
- **It answers exactly one ledger row.** Accepting G5 does not grant G6 leases
  to Skill or VCS (those are RD decisions, and G6 "cannot be inferred from
  G5", [assurances0:1049-1054](/.design/watchman/assurances0.gpt56sol.md#L1049-L1054)),
  does not select probes (RP), and does not claim structural coverage (RS).
- **The name is earned, not granted.** RC applies only once R also passes
  ([nav0-syn0:71-73](/.design/watchman/nav0-syn0.gpt56sol.md#L71-L73)).

There is no incoherent middle here: the audit keeps freshness and observation
state separate forever, which is the coherent shore the synthesis requires
([nav0-syn0:489](/.design/watchman/nav0-syn0.gpt56sol.md#L489)).

## 6. What acceptance concretely buys and requires

The human is not buying a mood; the purchase is this gate list, adapted from
the G5 beacon and profile-specific gates
([nav0-syn0:243](/.design/watchman/nav0-syn0.gpt56sol.md#L243),
[assurances0:1269-1274](/.design/watchman/assurances0.gpt56sol.md#L1269-L1274)):

| Deliverable | Proof |
| --- | --- |
| Suppressed-event convergence, per named owner | Fake-clock test per owner (Agent, Command, Plugin Source): mutate source with no event delivered, advance fake time to immediately before and then through `R_config`, prove convergence only after the scheduled successful scan |
| Failed-read last-good | Permission/mount/parse failures retain last-good state and degraded health; no lease renewal; never an empty snapshot |
| Completion contract | Lease renews only on observed successful completion of every named downstream reload; audit success or publication alone does not renew |
| Health separation | A successful audit never clears observation-health errors; last successful audit, lease expiry, and source-read degradation are exposed separately ([nav0-syn0:472-475](/.design/watchman/nav0-syn0.gpt56sol.md#L472-L475)) |
| Measured period | `R_config` backed by a recorded measurement, jittered, low-rate |

What that buys, stated as the guarantee
([assurances0:1041-1047](/.design/watchman/assurances0.gpt56sol.md#L1041-L1047)):

> After relevant source mutation quiesces and an authoritative Config audit
> succeeds, Config-mediated derived state converges within `R_config` plus
> scan and publication latency — **regardless of how silently the observer
> failed.**

That is the entire difference between R and RC: the worst case stops being
"indefinitely, until a human notices wrong behavior" and becomes a published
number with a test behind it.

## Honest counter-considerations

- **"R is required anyway; ship R first and decide later."** True and
  compatible: G5 work may proceed in parallel after B2, and the RC name waits
  for R regardless
  ([nav0-syn0:71-73](/.design/watchman/nav0-syn0.gpt56sol.md#L71-L73)). But
  the synthesis deliberately asks the question **at departure, not after R**
  ([nav0-syn0:416-418](/.design/watchman/nav0-syn0.gpt56sol.md#L416-L418)),
  because the audit shapes the owner seams being built now. Deferring the
  decision defers retrofit cost, not the decision.
- **"Recurring cost for a rare event."** The cost is real but small by design:
  domain source extent, low rate, jittered. The exposure it bounds is rare but
  unbounded and silent — the asymmetry favors bounding it.
- **"The audit itself can mislead."** Only if it over-claims; the mirage rules
  in section 3 exist to prevent exactly that, and the narrowing fallback means
  the mediated claim degrades honestly rather than falsely.

## The decision record requested

Accepting G5 should record: (1) indefinite silent Config-mediated staleness is
not acceptable; (2) G5 is accepted in the Config-mediated form, with the
mandated fallback to narrow G5 if the downstream completion contract cannot be
bounded; (3) `R_config` is deferred to measurement with no intuitive round
number admitted; (4) Profile RC is claimed only after Profile R passes.

## Cross-references

- [`nav0-syn0.gpt56sol.md`](/.design/watchman/nav0-syn0.gpt56sol.md) — the
  synthesis this pitch argues from: the owner/claim gate and two G5 products
  (L153-188), Leg 5 fork (L414-439), Audit Mirage rock (L274), decision
  stations and stop rules (L496-531).
- [`assurances0.gpt56sol.md`](/.design/watchman/assurances0.gpt56sol.md) — the
  assurance atlas: owner-side audit mechanism (L634-658), mechanism
  orthogonality (L121-127), Profile R/RC definitions (L913-944), G5 catalog
  entry (L1041-1047), profile-specific gates (L1269-1274), open ledger
  (L1306-1348).
- [`vision0.gpt56s.md`](/.design/watchman/vision0.gpt56s.md) — recorded human
  authority: B2 typed invalidation at Config.changes and B3 deferral
  (L883-929), the contract the mediated audit reuses.
- [`metrics0.glm53.md`](/.design/watchman/metrics0.glm53.md) — channel-metrics
  reading guide: cost measurement seams for sizing `R_config`
  (L119-121, L186-188, L212-231), with metrics as diagnostics only.
- [`fallbacks0.glm53.md`](/.design/watchman/fallbacks0.glm53.md) — adjacent
  context on the acquisition cliff and supervisor ordering that Profile R
  supplies beneath any G5 audit.
