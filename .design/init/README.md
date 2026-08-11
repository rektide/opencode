# OpenCode All-Clear Poweroff: Init Wave

Initial assessment of a TypeScript bedtime watcher that waits for OpenCode work
to finish, applies a default ten-minute holdoff, remains disarmable, and powers
off through systemd/logind.

## Start Here

- [`init0-syn.gpt5.md`](./init0-syn.gpt5.md): synthesis, recommendation,
  safety boundary, state machine, and delivery sequence.

## Independent Assessments

- [`init0-opencode.explore.md`](./init0-opencode.explore.md): current V2 API and
  source coverage, visibility gaps, best-effort reconciliation, and the
  server-side quiescence barrier required for certainty.
- [`init0-systemd.glm52.md`](./init0-systemd.glm52.md): logind scheduled
  shutdown, cancellation, warnings, D-Bus, inhibitors, timers, and user versus
  system units.
- [`init0-product.general.md`](./init0-product.general.md): independent v0 CLI
  state machine, observability contract, safety hazards, and test strategy.

## Current Conclusion

systemd already has the desired ten-minute scheduled-poweroff mechanism. The
limiting factor is OpenCode observability: no public endpoint includes the
process-local Job registry or provides an atomic global admission fence. A v0
can be useful if it says “observed quiescent” and fails closed; certainty needs
new V2 server support.
