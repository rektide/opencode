---
type: ResearchBrief
title: Bus-smart draft1 — reduce useful-work amplification
description: Scope and evidence standard for reassessing the rebased controlled event feed against many-client CPU amplification.
resource: /.design/bus-smart/init1.gpt6a.md
tags: [events, performance, architecture, client, server]
status: draft
generated: { by: "openai/gpt-6-astra#high", at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - resource: /.design/bus-smart/draft0.gpt56s.md
    title: Previous directional architecture
  - resource: /.design/bus-smart/port0.glm53h.md
    title: Rebase adaptations and recorded verification
  - resource: /.design/bus-smart/verification0.gpt56s.md
    title: Prior verification and unclosed release gates
---

# Bus-smart draft1 research brief

## Situation and requested outcome

The user experienced excessive CPU with many OpenCode clients attached to one
busy global server. Every client receiving every event is the suspected
amplifier. Neither the old nor the rebased bus-smart implementation has been
used to establish an actual performance improvement. Recorded automated test
success is compatibility evidence, not proof that the original CPU problem is
fixed.

The requested deliverable is a new `draft1` architecture, informed by independent
GX research and direct synthesis. Preserve useful earlier reasoning, but do not
preserve complexity merely because it already exists. Work in this repository
rather than create a proxy unless evidence establishes a compelling advantage.
This pass changes documentation, not production behavior or the live service.

Starting working copy was clean at parent `53b7539a` on 2026-09-05. The local
upstream source is `/home/rektide/archive/anomalyco/opencode` (also available at
the user's `~/a/a/opencode`); `~/src/opencode-bus-smart-old` is historical input,
not the current behavioral oracle.

## Research questions

1. **Connection ownership:** SharedEvents now shares and reconnects the legacy
   transport. Does controlled fallback still have the physical connection and
   generation ownership assumed by draft0? Compare a dedicated one-attempt
   fallback with a unified shared-interest manager. Name concrete failures,
   not just the existence of multiple layers.
2. **Move guarantees:** Translate draft0's publication guarantee into the new
   immediate-idle, active/deferred, queued/steered, and recovery paths. Separate
   move request admission from committed placement and live observation.
3. **Filtering leverage:** Which work disappears before queueing, serialization,
   parsing, projection, and hydration? Which remains proportional to all clients?
   Include many Sessions sharing one Location, not only separate projects.
4. **Product interest:** What do routes, tabs, Session families, attention,
   notifications, and discovery actually need? Do not silently exchange lower
   CPU for missed user-visible state.

Reusable research prompt: *Trace the current rebased implementation and its
closest upstream precedent. Distinguish implemented facts, prior claims, and
new recommendations; identify the smallest coherent change that removes work
while preserving explicit observation and lifecycle contracts.*

## Synthesis standard

- Prefer filtering at the authoritative server routing seam over content-aware
  inference elsewhere.
- Treat connection sharing within one client object and filtering across many
  independent client processes as different optimizations.
- Preserve one owner for each physical stream's reconnection policy; bounded
  queues at different necessary seams are not inherently bugs.
- Require a same-Location workload and an older-server fallback workload in
  addition to the original cross-project reproduction.
- Make notification policy explicit. The user has not approved losing global
  notifications.
- State what ships first, what is conditional on measurements, and what is
  deliberately not being rebuilt. No claimed speedup without measurements.

## Cross-references

- [draft0](/.design/bus-smart/draft0.gpt56s.md) is the prior normative baseline:
  full replacement, generation fencing, private move coverage, and one selected
  FIFO. The older revisioned-control draft is not the implementation baseline.
- [Port report](/.design/bus-smart/port0.glm53h.md) identifies the two rebased
  seams that motivate this reassessment.
- [Verification report](/.design/bus-smart/verification0.gpt56s.md) records
  existing tests and the still-open notification and live-performance gates.
- [Earlier patch-carry review](/.design/bus-smart/review0.gpt56s.md) is useful
  counterpressure against overbuilding: projection work and actual causality
  deserve measurement even when transport filtering is structurally appealing.
