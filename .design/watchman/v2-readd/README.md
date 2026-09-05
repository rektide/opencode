---
type: Index
title: v2 re-add carrier records
description: The durable home of the Watchman v2 re-add build — plan lineage from readd3 onward, implementation journals, and the build log. Promoted from scratch per the flow convention.
resource: /.design/watchman/v2-readd/README.md
tags: [opencode, watchman, v2-readd, carrier, index]
status: stable
generated: { by: model:glm-5.3-max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-10-05
sources:
  - id: flow-convention
    resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-flow0.glm53max.md
    title: Scratch-to-durable artifact flow
  - id: archive-corpus
    resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/README.md
    title: Watchman design corpus index (planning-era, frozen)
---

# v2 re-add carrier records

Everything about the build lives here and travels with the code commits. The
planning-era corpus — conflict map, readd0–readd2, the donor architecture and
its reviews — is frozen in the archive workspace:
[`~/src/opencode-watchman-old/.design/watchman/`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/README.md).
The in-flight scratch index (agent journals before promotion) stays at
[`~/src/opencode-watchman-old/.test-agent/watchman-v2-readd/README.md`](file:///home/rektide/src/opencode-watchman-old/.test-agent/watchman-v2-readd/README.md).

## Plan lineage (this line)

| Doc | Role |
| --- | --- |
| [`v2-readd3.gpt56solxh.md`](v2-readd3.gpt56solxh.md) | The W0–W10 work plan (committed as the W0 record) |
| [`v2-readd4.gpt56solxh.md`](v2-readd4.gpt56solxh.md) | Evidence-ranked architecture brief: explicit unknowns, investigation assignments, provisional decisions |
| [`v2-readd4-dirty.gpt56solxh.md`](v2-readd4-dirty.gpt56solxh.md) | The fully-decided variant of readd4 (no evidence wait) |
| [`v2-readd4-prompt0.gpt56solxh.md`](v2-readd4-prompt0.gpt56solxh.md) | Handoff prompt: one continuous architecture through live delivery, no spikes or test-only milestones |

## Implementation records

Promoted journals keep their names with the `v2-` prefix; append-only
discipline continues on these copies.

| Journal | Model | Topic |
| --- | --- | --- |
| [`v2-research0.glm53max.md`](v2-research0.glm53max.md) | glm-5.3-max | Round-0 audit of the plan against upstream `4306c07b` + donor dissection; plan corrections R1–R7 |
| [`v2-execution0.glm53f.md`](v2-execution0.glm53f.md) | glm-5.3-flash | Preflight and first-slice (W1) execution journal |
| [`v2-owners0.glm53max.md`](v2-owners0.glm53max.md) | glm-5.3-max | W2 design verdict: invalidation union, reload ordering, filter bypass, Skill reread hazard; review of the in-flight diff |
| [`v2-protocol0.glm53max.md`](v2-protocol0.glm53max.md) | glm-5.3-max | W3–W5 research: verified transport API, typed schema, actor design, generation state machine |
| [`v2-actor0.glm53f.md`](v2-actor0.glm53f.md) | glm-5.3-flash | Handoff record for the cancelled first actor attempt (design retained, zero mutations) |
| [`v2-actor0.gpt56solmax.md`](v2-actor0.gpt56solmax.md) | gpt-5.6-sol-max | The actor that landed: fixture-only raw client actor, sync controls, self-tests |

## Conventions

- Journal naming, append-only rounds, and `R<N>` plan-correction numbering
  are inherited from the scratch conventions (see the scratch index).
- Promotion passes follow
  [`v2-flow0`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-flow0.glm53max.md):
  freeze → triage → move → index here → one line in [`log.md`](log.md) →
  path-limited `jj commit` on `.design`.
- References to planning-era corpus docs use `file://` links into the
  archive workspace; references inside this directory stay relative or
  bundle-relative.

## Build log

[`log.md`](log.md) — dated entries, newest first.
