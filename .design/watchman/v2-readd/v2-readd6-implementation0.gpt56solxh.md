---
type: ImplementationRecord
title: Watchman v2 re-add round 6 implementation
description: Implemented and verified record of the lean stock-Watchman directory adapter, owner reconciliation, startup plumbing, review corrections, private-daemon recovery, and distribution builds.
resource: /.design/watchman/v2-readd/v2-readd6-implementation0.gpt56solxh.md
tags: [opencode, watchman, v2, implementation, core, cli, server, verification]
status: stable
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-16 }
verified: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-16 }
stale_after: 2026-10-16
sources:
  - { id: design, resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd6-draft0.glm53max.md, title: Lean upstreamable round-6 design }
  - { id: evidence, resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md, title: Final research validation }
  - { id: read-feedback, resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd5-e20-read-feedback0.gpt56solxh.md, title: Watchwoman read-feedback proof }
  - { id: parity, resource: file:///home/rektide/src/watchwoman-systemd/.design/watchman-parity/watchman-parity0.glm53max.md, title: Watchwoman parity work forked from the client }
---

# Watchman v2 re-add round 6 implementation

## Result

The lean round-6 adapter is implemented on the v2 carrier atop W1. Recursive
directory watches can select an explicit Watchman socket; file and immediate-
entry watches remain Node-owned and Parcel remains the default. The adapter
uses one terminal JSON-line session and one generation-fenced controller per
watch key, fresh clocks for every attachment, invalidate-on-every-install,
traffic-independent heartbeat, per-canonical-root attachment serialization,
and pure logical-namespace mapping with exact Parcel ignore normalization.

The build targets stock Watchman semantics. Deployed Watchwoman remains blocked
by E20 and its corrections remain in the Watchwoman repository. No client-side
filter attempts to hide read-triggered daemon rows.

## Implemented shape

```text
packages/core/src/filesystem/
  watcher.ts
  watcher/watchman/
    directory.ts
    mapping.ts
    protocol.ts
    session.ts

packages/core/src/config.ts
packages/core/src/config/plugin/{agent,command,skill,source}.ts
packages/server/src/{options,routes}.ts
packages/cli/src/server-process.ts
```

### Watcher and owners

- W1's native invalidation signal and per-subscriber ordered `onReady` replay
  remain the external continuity seam.
- Config publishes typed invalidation changes so Agent, Command, and Plugin
  Source bypass exact-path filtering after reacquisition.
- Configured plugin-directory readiness reaches Plugin Supervisor without a
  fabricated file event.
- Skill reconciles desired watch keys instead of clearing every fiber. Stable
  refresh and readiness preserve subscriptions; retargeting adds the new key
  and removes stale keys after a successful scan.

### Session

- Compact newline-delimited UTF-8 JSON, array command envelopes, 16 MiB frame
  limit, one typed FIFO, deadline from write, and typed reply/push association.
- Unilateral and cancellation frames never consume the command slot.
- Submitted-request interruption destroys the session so no later request can
  consume an orphaned response.
- EOF, error, timeout, malformed UTF-8/JSON, blank/oversize frame, and explicit
  close converge on one terminal latch.
- Release uses a send-only unsubscribe, then destructive joined local close;
  it does not wait for or claim daemon-side cleanup.

### Controller

- `Native.subscribe` returns immediately. The upstream subscriber runs its
  first readiness scan before physical attachment; every completed attachment
  emits invalidation and therefore another authoritative scan.
- Each generation performs `version → watch → clock → subscribe` with a fresh
  clock and unique run-nonce name. Pre-install rows are discarded, but loss and
  matching cancellation remain terminal and force retry.
- Explicit release/generation state is checked after asynchronous attachment
  boundaries and before invalidation/publication.
- Missing targets retry after one second. Other failures use per-key bounded
  backoff; there is no shared circuit or global attachment budget.
- A canonical-root semaphore serializes complete attachment sequences for
  different keys that resolve to the same root.
- An independent scoped producer enqueues heartbeat every 30 seconds, so event
  traffic cannot postpone root-identity checks.

### Mapping

- Successful plain watch roots must equal the canonical requested root.
- Rows publish under the logical spelling as `update` or `delete`; directory
  rows remain visible and no create/inode history is constructed.
- Invalid absolute, empty, NUL, or root-escaping names terminate a generation.
- Cookie basenames are removed at every depth.
- Literal and glob ignores use the exact installed Parcel wrapper
  normalization. The production bundle uses the statically bundled wrapper
  rather than runtime `createRequire`, so no dependency was added and SEA
  packaging is self-contained.

### Static options

Core's Watchman option schema owns the absolute/NUL-free socket and bounded
command timeout. Server mirrors it under `fs.watchman`; CLI decodes unknown
environment input through `ServerOptions`:

```text
OPENCODE_WATCHER_BACKEND=watchman
OPENCODE_WATCHMAN_SOCKET=/absolute/socket   # otherwise WATCHMAN_SOCK
OPENCODE_WATCHMAN_COMMAND_TIMEOUT_MS=10000  # optional
```

Selection is explicit. Ambient `WATCHMAN_SOCK` alone does not change the
backend. A binary option is rejected because the client never locates, spawns,
or unlinks daemon resources. Protocol, Server `HttpApi`, OpenAPI, and generated
clients are unchanged.

## Commit record after W1

| Commit | Purpose |
| --- | --- |
| `560bb4fb` | Preserve the pre-review owner experiment before revision. |
| `23500e37` | Preserve the superseded actor fixture before deletion. |
| `ac6e0b86`, `544efa70` | Repair and share the plugin-readiness test layer. |
| `2e8fa394` | Retain Skill watches across refreshes. |
| `59bb555a` | Add logical path and ignore mapping. |
| `fa9322ab` | Add owned JSON protocol/session. |
| `ab325af0` | Add immediate-return directory controller. |
| `7e2cc773`, `7e7e7c48` | Add Server and CLI startup options. |
| `3fdc05c7`, `b95ff4f4` | Add live update/delete and restart recovery tests. |
| `cec7e6d4` | Make heartbeat independent of event traffic. |
| `cb9a9061` | Remove the now-preserved actor fixture. |
| `b0367c13` | Close release, generation, pre-install, and blank-frame gaps found by review. |
| `84ec13ad`, `e99beef3`, `20678cd5`, `aae99740` | Centralize validation/invalidation and stabilize owner tests. |
| `8399f2df` | Remove redundant typed-option validation and throwable UTF-8 decoding. |
| `96d1c7a2` | Fix SEA packaging by bundling Parcel normalization statically. |

The detailed history intentionally preserves failed/obsolete experiments as
separate commits; the active tree contains only the production Session seam.

## Verification

### Deterministic and package-wide

- Focused owner/Watchman battery: 66 passed, 2 env-skipped, 0 failed after
  review corrections.
- Core full suite: **5,208 passed, 33 skipped, 0 failed**; Core typecheck passed.
- Server full suite: **57 passed, 3 skipped, 0 failed**; Server typecheck passed.
- CLI full suite: **260 passed, 0 failed**; CLI typecheck passed.
- Targeted oxlint over Watchman production/tests: 0 warnings, 0 errors.
- Effect simplification lint passed. The repository-wide Effect-pattern scan
  still reports 26 pre-existing findings outside this feature's files.

### Private stock Watchman

[`run-stock-live.sh`](/packages/core/test/filesystem/watchman/run-stock-live.sh)
owns a private daemon/socket/state directory and process restart. Against
`/usr/local/bin/watchman-facebook` it passes all eight controller tests,
including real create/delete delivery and daemon restart → reconnect →
invalidation → post-restart delivery. Private PIDs and sockets are absent after
the run; the ambient Watchwoman service was not contacted.

### Distribution

- Core distribution build passed.
- Server distribution build passed.
- CLI Node multi-platform build passed under exact Bun 1.4.2 with
  `OPENCODE_CHANNEL=local`. The first build exposed the runtime transitive-
  dependency resolution error that `96d1c7a2` fixes.
- The exact Bun archive and hashes used for this check are under
  `/home/rektide/tmp-opencode/bun-1.4.2/`.

## Review closure

Parallel standards and v6-spec reviews were run from W1 to the restart-tested
tip. The spec review initially found missing unsubscribe, absent explicit
generation fencing, incorrect target retry delay, undocumented restart
orchestration, unused expression support, terminal-dropping pre-install drain,
and blank-frame acceptance. All were corrected; its focused re-review found no
residual spec issue.

The standards review drove deletion of the actor fake, shared option decoding,
explicit `.ts` test imports, helper extraction, centralized invalidation
matching, and control-flow cleanup. Its actionable re-review findings were also
closed. The remaining option-path branding idea was treated as a judgement
call: the schema preserves the concept at the unknown boundary while the
resolved internal Session option remains a small structural value.

## Deliberate non-goals and remaining work

The active implementation does not add topology sentinels, root inode
witnesses, a global circuit/admission limit, inbox bounds, daemon-side ignore
pushdown, BSER, watch-project, cursors, watch deletion, spawn, fallback, or a
platform allowlist. Re-entry triggers remain those in the round-6 design.

Remaining release work is documentation/composition rather than missing client
behavior:

1. choose the carryable deployment default and exact stock/corrected-Watchwoman
   daemon pin;
2. add user-facing opt-in operations documentation;
3. compose the reviewed commit line under the repository's dated bookmark and
   upstream review policy;
4. keep Watchwoman parity work separate until E20 and its owner quietness gates
   pass.

## Cross-references

- [`v2-readd6-draft0.glm53max.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd6-draft0.glm53max.md) — active design implemented here.
- [`v2-readd5-e20-read-feedback0.gpt56solxh.md`](file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd5-e20-read-feedback0.gpt56solxh.md) — why Watchwoman remains a separate daemon concern.
- [`watchman-parity0.glm53max.md`](file:///home/rektide/src/watchwoman-systemd/.design/watchman-parity/watchman-parity0.glm53max.md) — daemon-side follow-up list.
