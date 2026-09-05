# Bus-smart documentation

Architecture and research for reducing OpenCode's many-client event fanout.
Documents are proposals and historical evidence unless explicitly accepted.
A default-off runtime candidate and synthetic measurements are recorded in the
execution report. The experiment is not graduated or verified against live-user CPU.

## Current entry points

- [Independent-review corrections — Astra](/.design/bus-smart/implementation-review-fixes1.gpt6a.md)
  — four P2 repairs, one TUI adoption operation, exact read/pagination bounds,
  regression proofs and verification; awaiting reviewer recheck, still default off.
- [Runtime execution report — Astra](/.design/bus-smart/implementation-report1.gpt6a.md)
  — implementation progress, commits, exact verification, carry cost and limits.
- [draft1 — scope streaming, preserve observation](/.design/bus-smart/draft1.gpt6a.md)
  — current architectural recommendation: gate five native streaming/progress
  types by followed Session, retain broad non-streaming observation, preserve
  SharedEvents, and require measured rollout.
- [Implementation1 — concrete implementation assessment and plan](/.design/bus-smart/implementation1.gpt6a.md)
  — keep/change/defer map, state ownership, Session indexing, client lifecycle,
  actual TUI read barriers, snapshot repair, and logical commit dependencies.
- [draft1 research brief](/.design/bus-smart/init1.gpt6a.md)
  — user's problem, research questions, source baseline, and evidence standard.

## Implementation assessment

- [Server/Core/Protocol — GX](/.design/bus-smart/implementation-research1-server.glm53.md)
  — focused recipient index, activation/cleanup invariants, and conservative
  zero-recipient precheck. Implementation1 corrects duplicated profile storage
  and per-client versus union-of-clients encoding estimates.
- [Client/TUI — GX research, Astra synthesis](/.design/bus-smart/implementation-research1-client.gpt6a.md)
  — controller targets/errors, connection pause, provider-safe policy binding,
  visible/hidden read sites, retention, and stale-snapshot counterexamples.
  This is the corrective source for earlier unconditional convergence claims.

## draft1 architecture reviews

- [Contract review — GX](/.design/bus-smart/review1-contract.glm53.md)
  — capability handling, broad RPC/byte-volume gates, indexing limits, and
  acceptance windows. Use draft1's refined publication-cohort measurement rule.
- [Observation review — GX](/.design/bus-smart/review1-observation.glm53.md)
  — durable-row residuals, adoption and notification defaults. **Read with the
  later client implementation assessment:** its route-metadata-only gate,
  four-transcript assumption, and unconditional convergence proof were corrected.

## Post-rebase research

### Client transport

- [Client ownership — Astra reconciliation](/.design/bus-smart/research1-client-ownership.gpt6a.md)
  — primary source for one-attempt/shared-attachment semantics and no competing
  reconnect loop; credits GX's research.
- [Client ownership — recovered GX artifact](/.design/bus-smart/research1-client-ownership.glm53.md)
  — original consumer census and hypotheses. Its abort-to-flush diagnosis is
  superseded by the generated-transport analysis above.

### Movement and recovery

- [Move guarantees — Astra reconciliation](/.design/bus-smart/research1-move-guarantees.gpt6a.md)
  — complete immediate/deferred/runner/restart/reconnect matrix and qualified
  publish-return guarantee; credits GX's research.
- [Move guarantees — recovered GX artifact](/.design/bus-smart/research1-move-guarantees.glm53.md)
  — earlier source investigation, retained for provenance rather than counted
  as an independent corroborating review.

### Filtering and product policy

- [Filtering cost — GX](/.design/bus-smart/research1-filtering-cost.glm53.md)
  — same-Location gap and cost inventory. The review and implementation synthesis
  correct its RPC classification, scaling, and unsupported CPU estimates.
- [Interest policy — GX](/.design/bus-smart/research1-interest-policy.glm53.md)
  — TUI consumer/family/notification census. Later work corrects its retention
  bound, cheap-no-op assumptions and proposed Location notification default.

## Previous architecture and implementation record

- [draft0](/.design/bus-smart/draft0.gpt56s.md) — detailed implemented Location
  profile, full replacement, activation cut and private move holds; predecessor
  to draft1, not the older revisioned-control proposal.
- [Implementation-plan0](/.design/bus-smart/implementation-plan0.gpt56s.md)
  — closeout sequence for the original controlled feed.
- [Verification0](/.design/bus-smart/verification0.gpt56s.md) — historical test
  results and unresolved live-performance/notification release gates.
- [Port0](/.design/bus-smart/port0.glm53h.md) — rebased upstream seams and recorded
  test reruns; passing port tests alone do not prove new architecture claims.
- [Review0](/.design/bus-smart/review0.gpt56s.md) — patch-carry and measurement
  critique that motivates the narrower projection and performance work.

## Earlier design options and supporting research

- [Original bus-smart proposal](/.design/bus-smart/bus-smart.glm53.md)
  — Location-scoping starting point.
- [Controlled-feed what-if](/.design/bus-smart/whatif-controlled-feed0.glm53.md)
  and [controlled-draft0](/.design/bus-smart/controlled-draft0.gpt56s.md)
  — broader control-plane alternatives later simplified by directional draft0.
- [Location streams](/.design/bus-smart/location-streams0.gpt56s.md),
  [Location SSE research](/.design/bus-smart/research-location-sse0.gpt56s.md),
  [union handoff](/.design/bus-smart/research-union-handoff0.gpt56s.md)
  — separate-stream/union tradeoffs and ordering costs.
- [Controlled SSE research](/.design/bus-smart/research-controlled-sse0.gpt56s.md)
  and [event sequencing](/.design/bus-smart/research-event-sequencing0.gpt56s.md)
  — control transport alternatives and original live ordering requirements.
- [Durable streams](/.design/bus-smart/research-durable-streams0.gpt56s.md)
  — larger replay architecture, explicitly not a prerequisite for draft1.
- [Bus audience](/.design/bus-smart/research-bus-audience0.glm53.md),
  [EventFeed Effect architecture](/.design/bus-smart/research-eventfeed-effect0.glm53.md),
  [client compatibility](/.design/bus-smart/research-client-compat0.glm53.md),
  [TUI interest](/.design/bus-smart/research-tui-interest0.glm53.md)
  — original seam research; consult post-rebase reports for current semantics.
