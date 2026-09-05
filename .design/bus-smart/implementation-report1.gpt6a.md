---
type: ImplementationReport
title: Bus-smart draft1 runtime implementation
description: Astra execution record, verification, patch-carry decisions, and remaining limits.
resource: /.design/bus-smart/implementation-report1.gpt6a.md
status: draft
generated: { by: "openai/gpt-6-astra#xhigh", at: 2026-09-05 }
sources:
  - resource: /.design/bus-smart/draft1.gpt6a.md
  - resource: /.design/bus-smart/implementation1.gpt6a.md
---

# Bus-smart draft1 runtime implementation

## Baseline and scope

- Author: GPT-6 Astra, xhigh. Runtime implementation explicitly authorized.
- Workspace: `/home/rektide/src/opencode-bus-smart`; clean starting change
  `ktylozxt / f8807433`, parent `wvvklnqz / d37d1b99`.
- Local upstream archive checked first: `/home/rektide/archive/anomalyco/opencode`,
  HEAD `4306c07b340b9a0504e65785f366d2793cd1b169`; older than the supplied rebased
  base `2960c61f9c5c86f23059d9da73e632951650edc7`. Historical worktree is not a base.
- Preserve upstream SharedEvents/public legacy behavior, Core move `publishAll`,
  one feed module/two operations, existing retry owner, and notification eligibility.
- Implement exact five-type Session filtering, negotiated compatibility, lifecycle
  repairs, default-off TUI experiment and read barriers, bounded snapshot repair.
- No proxy, general filtering/replay framework, Location reverse index, derived-key
  cache, live elected service operations, history cleanup, or push.
- Independent final review is reserved for the parent session; this agent self-reviews.

## Execution and verification

Implementation in progress. Commands and measured outcomes will be recorded here;
historical design test counts are not counted as this implementation's evidence.

## Limits and graduation

The experiment stays default off. No CPU improvement or canonical convergence is
claimed before fixtures and measurements establish it. Public RPC and other broad
residual traffic remain eligible server-wide. No historical live-prefix replay.

## Cross-references

- [Implementation plan](/.design/bus-smart/implementation1.gpt6a.md): scope and proof boundaries.
- [Client assessment](/.design/bus-smart/implementation-research1-client.gpt6a.md):
  corrected snapshot, retention and actual transcript-read seams.
- [Server assessment](/.design/bus-smart/implementation-research1-server.glm53.md):
  index lifecycle; use synthesis corrections for duplicated state/encoding estimates.
