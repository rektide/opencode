---
type: ImplementationCloseout
title: Bus-smart draft1 — implemented candidate and review closure
description: Final implementation and independent-review status, upstream carry assessment, verification provenance, and unclosed experiment graduation gates.
resource: /.design/bus-smart/closeout1.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#high", at: 2026-09-05 }
stale_after: 2026-10-05
runtime_tip: e497e886
sources:
  - resource: /.design/bus-smart/implementation-report1.gpt6a.md
  - resource: /.design/bus-smart/implementation-review-fixes3.gpt6a.md
  - resource: /.design/bus-smart/code-review4-standards.gpt6a.md
  - resource: /.design/bus-smart/code-review4-spec.gpt6a.md
---

# Implemented, reviewed, still experimental

**The runtime rebuild is committed in this workspace. All findings raised in
the independent implementation reviews have been closed through the documented
corrections and targeted rechecks.** The latest runtime/test commit is
`e497e886`; final independent review reports are `ee20d714` and `0095065f`.
This is a reasonably carryable **default-off candidate**, not experiment
graduation, blanket correctness certification, or live-workload acceptance.

## What ships in the candidate

- Negotiated `location` and `session-streaming` profiles. The latter gates five
  native fragment/progress event types by authoritative followed Session ID,
  including other Sessions in the same Location. Remaining public events,
  including RPC and attention events, stay broadly observable.
- Existing legacy interfaces and upstream SharedEvents remain intact. No new
  Core production changes were needed; the previous move `publishAll` correction
  stays in place. Protocol changes use regenerated client surfaces.
- One controlled feed/admission owner, atomic focused-recipient index, and a
  conservative no-recipient encoding check. One client connection retry owner,
  profile-aware interests, fenced fallback, and event-only toggle/retry.
- Real visible/hidden transcript-adoption barriers and local read repair, with
  optimistic creation/acknowledgment, retained historical boundaries, stale-read
  rejection, terminal repair duty/backoff, and lifetime/absence handling.

The TUI entry is **Experiments → Session-scoped streaming**, backed by
`experimental.session_streaming`. It remains off by default. Enabling it
requires a server advertising the new profile to obtain filtering; otherwise
the client visibly falls back to legacy. No live service was enabled, restarted,
or replaced during this work.

## Independent review outcome

### Standards and upstream carryability

The final [standards recheck](/.design/bus-smart/code-review4-standards.gpt6a.md)
closes the definitive-absence retry loop and finds no new material carry/cleanup
issue in that correction range. Earlier held-create and duplicated-adoption
findings remain closed. No substantive hard documented-rule violation remains
reported.

The main carry burden is the unconditional Client transcript repair, not the
Server filter or SharedEvents. Its explicit mutation classifier must follow
upstream canonical transcript changes. Exhaustive typing/tests make that burden
visible; they do not remove it. No further generic framework or history rewrite
is recommended. Supporting pre-existing acknowledgment/lifetime fixes are recorded
separately from regressions introduced during this implementation.

### Spec and correctness

The final [spec recheck](/.design/bus-smart/code-review4-spec.gpt6a.md) closes
canonical-input rollback and point-read lifetime findings and finds no direct
new blocker in the requested corrective range. It independently ran **109 tests,
zero failures or skips**, including all nine preserved reviewer cases. Earlier
review stages covered the broader runtime diff; the last recheck was deliberately
bounded to correction closure and direct regressions, not another full audit.

## Verification provenance

| Scope | Recorded result | Source / qualification |
| --- | --- | --- |
| Final Client package suite | 243 pass, 11 skip, 0 fail | Implementation correction report; selected browser-only cases exercised separately |
| Final browser Client repair/mutation/controller/connection suites | 100 pass, 0 fail | Implementer; final reviewer adds nine preserved cases for 109 passing tests |
| TUI package suite | 1,311 pass, 4 skip, 0 fail | Implementer after final localized Client fixes |
| Client/TUI typechecks | Passed | Implementer; final standards reviewer independently reran Client typecheck |
| Server / Protocol / Core selected regression | 77 / 13 / 74 pass | Earlier implementation record; their production code did not change in Client correction rounds |
| Broader browser-data suite | Two known baseline Solid-proxy assertions still fail | Baseline-confirmed; explicitly not claimed green |

Exact commands, red/green fixtures, commit maps and repair read costs are in
the [execution report](/.design/bus-smart/implementation-report1.gpt6a.md) and
[correction reports](/.design/bus-smart/implementation-review-fixes3.gpt6a.md).
The parent did not duplicate all package executions; verification is attributed
to the implementation agent and independent reviewers above.

## Performance evidence and remaining gates

The earlier isolated eight-process / 32-Session benchmark measured exactly
**1/32 of each gated event type per focused client**. Three runs recorded
**12.19–12.86 aggregate CPU seconds with legacy transport versus 2.70–2.93
focused**, with broad RPC/terminal arrivals retained. See the
[measurement record](/.design/bus-smart/implementation-report1.gpt6a.md#isolated-many-process-measurement-indexed-before-encode-precheck)
for workload, counts and limitations.

That benchmark used the then-current client projection, not pristine upstream,
and predates later read-repair corrections. It deliberately omitted measured
Session-create, terminal-execution and failure traffic, so it does not measure
the final metadata/repair workload or establish the user's live CPU reduction.
Later real HTTP/Core fixtures verify canonical repair, with their additional
page reads/boundary lookups reported rather than hidden by the streaming result.

Still required before graduation: representative metadata/repair and chatty-RPC
loads, larger/mixed-client stress, the remaining move/reconnect/failure matrix,
and an explicitly arranged live-user foreground/CPU trial. No historical live
prefix replay, exact snapshot/live merge, or notification replay is promised.
Keep the experiment off until those acceptance decisions are made.

## Navigation and preservation

- [Index](/.design/bus-smart/index.md): complete architecture, research, execution,
  correction and review history.
- [draft1](/.design/bus-smart/draft1.gpt6a.md): architectural choice and scope.
- [Implementation1](/.design/bus-smart/implementation1.gpt6a.md): original
  implementation plan; execution/correction reports record the actual refinements.

All work was committed incrementally with explicit paths. No history was
rewritten, remote pushed, user work discarded, or live service changed. Commit
restructuring remains the user's later choice; no accepted-tip symlink is created.
