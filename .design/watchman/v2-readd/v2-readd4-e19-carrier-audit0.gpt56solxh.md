---
type: Evidence
title: Watchman v2 re-add E19 carrier disposition audit
description: Read-only file-and-hunk disposition of committed W1 and the uncommitted W2 owner, protocol-actor, and documentation layers against the validated v4 evidence corpus.
resource: /.design/watchman/v2-readd/v2-readd4-e19-carrier-audit0.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, carrier, disposition, preservation]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
stale_after: 2026-10-05
sources:
  - id: upstream-base
    resource: https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169
    title: OpenCode v2 carrier base
  - id: carrier
    resource: file:///home/rektide/src/opencode-watchman-v2-readd
    title: Dirty v2 re-add carrier audited exactly as found
  - id: validation0
    resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md
    title: First-wave evidence validation
  - id: validation1
    resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md
    title: Daemon and transport evidence validation
  - id: validation2
    resource: /.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md
    title: Path, owner, and release evidence validation
  - id: scratch
    resource: file:///home/rektide/tmp-opencode/v4-o4-carrier-audit/README.md
    title: Preserved diffs, before and after status, and focused test transcripts
---

# Watchman v2 re-add E19 carrier disposition audit

## Result

**Disposition: preserve the carrier, but do not treat its current working copy as
green or promotion-ready.** The useful material separates cleanly:

1. **Committed W1 is independently reusable as-is.** Its private Native
   invalidation channel and per-logical-subscriber readiness replay are generic,
   deterministic, and directly relied on by the validated Skill first-call-gate
   proof. Its named five-suite check passes 64/64 in the carrier as found.
2. **The uncommitted W2 production hunks contain reusable owner-convergence
   pieces, but W2 as a slice is incomplete.** Config invalidation, indirect
   consumer filter bypass, and configured Plugin Source readiness are not
   contradicted by the evidence. The required Skill first-`onReady` gate and its
   anti-loop test are absent, Config-side end-to-end coalescing remains untested,
   and the new Plugin Supervisor test is broken. W2's named command is 55 pass /
   1 timeout.
3. **The actor is useful test infrastructure, not a transport-conformance
   oracle.** Its three self-tests pass. It models callback-level FIFO,
   cancellation, events, and deliberate late callbacks, but its types do not
   structurally match the proposed production seam and it omits the selected
   transport's key-classifier stall, discovery/spawn lifecycle, late socket
   creation, and post-`end()` reconnection.
4. **The uncommitted documents are a mixed historical payload, not one accepted
   design.** Several retain valuable source maps or chronology, but the older
   protocol/design/prompt claims are superseded or contradicted by validation0–2.
   In particular they cannot be promoted as an execution authority without
   revising transport, path, row, Skill, circuit, sentinel, and release claims.
5. **No production Watchman backend exists in the carrier.** Consequently none
   of the daemon incompatibilities have entered production code, but neither
   have they been solved. Classification below is an audit result, never
   authorization to edit, split, revert, commit, or delete user work.

## Classification key

| Code | Required classification | Meaning in this audit |
| --- | --- | --- |
| **A** | Independently reusable as-is | The hunk can be carried unchanged into an evidence-grounded implementation. Dependencies still have to be integrated and tested. |
| **B** | Useful but contradicted/rewrite | Keep its intent or source map, but do not carry the artifact unchanged. |
| **C** | Evidence/test fixture only | Retain as proof, chronology, or test infrastructure; it is not production or an accepted design. |
| **D** | Discard/superseded | A later record or validated fact has replaced its operative role. This is disposition only, not deletion authority. |

## Revision and worktree state

The carrier is a jj workspace without a `.git` directory; an attempted
`git status --short` therefore returned “not a git repository.” All successful
VCS observations were read-only `jj` commands. `jj help -k revsets` and
`jj help -k templates` were consulted before revision/template queries.

| Layer | Identity | State and provenance |
| --- | --- | --- |
| Base | `4306c07b340b9a0504e65785f366d2793cd1b169` (`qtrmrown`) | Fixed upstream `v2@origin` base requested for this audit. |
| W0 plan | `15d24e00ce250d8292a326e707e13bb6feb97f1f` (`pxuvrknr`) | `docs(watchman): record v2 rebuild plan`; adds only `v2-readd3.gpt56solxh.md` (937 lines). |
| W1 | `620fc620b67f774579835006846f53c55cead235` (`ornkqwlk`) | `refactor(core): make watcher readiness generation-aware`; 2 files, 116 insertions, 4 deletions. |
| Working copy | `e77301b4418895e27c1baf23a95dcda4a5e2f472` (`tlpyywtx`) | No description; parent W1. Twenty-two uncommitted paths: 8 W2 owner/test paths, 2 actor paths, and 12 documentation paths. |

Fresh `jj diff --git` output reproduced GX's inherited scratch captures
byte-for-byte:

| Captured layer | SHA-256 |
| --- | --- |
| W1 commit diff | `6b01a4ad27f81afa352f198da4a02448b804fc6f4acc195920e0a100899999ed` |
| Current uncommitted production/test diff | `43d284797a0129813cb80a31d7daa30a9e45a0edc8376f9b05dfc799b70d8fad` |
| Current uncommitted design diff | `24e3c3de08809dca31eddfa7eea4bbf56fc8711d3baedf946df6f70b3f9b9be2` |

## Committed W1: complete hunk disposition

W1 is one coherent generic-watcher commit. The test is classified **C** because
it is test evidence; the production mechanism it proves is **A**.

| File and commit hunk | Provenance and role | Named proof | Class | Disposition |
| --- | --- | --- | --- | --- |
| `packages/core/src/filesystem/watcher.ts`, `@@ -53,10 +53,14` (current lines 54–62) | W1; adds optional Native `invalidate` input and private `NativeSignal` union. Keeps public `WatchInput`, `Update`, and `Service.subscribe` unchanged. | `Watcher lifecycle > reruns readiness for every shared subscriber before delivering later updates` | **A** | Keep unchanged. This is the narrow private control/data separation validated by E14. |
| Same file, `@@ -94,11 +98,14` (current lines 99–135) | W1; changes each physical RcMap channel to ordered `NativeSignal` and wraps exact updates versus invalidations. | Same test; also all pre-existing sharing/release tests in `watcher.test.ts`. | **A** | Keep unchanged. It gives one FIFO signal channel per physical watch. |
| Same file, `@@ -141,7 +148,15` (current lines 147–163) | W1; initial readiness remains direct, later invalidations sequentially rerun each logical subscriber's `onReady`, are filtered, then exact updates continue. | Same test; 64/64 named W1 suite rerun. | **A** | Keep unchanged. E14's first-call gate depends on `PubSub.subscribe → initial onReady → queued invalidation as later onReady`. |
| `packages/core/test/filesystem/watcher.test.ts`, `@@ -202,6 +202,103` (current lines 205–300) | W1; Deferred-controlled two-subscriber ordering and final-release test. | `reruns readiness for every shared subscriber before delivering later updates` | **C** | Retain as the regression proof for the A-class source hunks. |

### W1 boundary

W1 proves logical ordering, not physical Native ownership. It does **not** make a
Native finalizer callable before `Native.subscribe` returns, cancel/join a
locator child, await socket close, define permanent failure, or make raw
`Client.end()` terminal. Those validated E04/E05/E12 gaps remain obligations of
any future backend; they do not require rewriting W1's generic signal seam.

## Uncommitted W2 owner layer: complete hunk disposition

The classifications below are per hunk. The current W2 aggregate remains **B**
because required Skill work is absent and one named test is red.

| File and working-copy hunk | Provenance and role | Named test / evidence | Class | Disposition |
| --- | --- | --- | --- | --- |
| `packages/core/src/config/plugin/agent.ts`, `@@ -67,7 +67,13` (lines 69–79) | Mechanical W2; bypasses exact source filtering for Config invalidation. | Agent `rebuilds on reacquisition readiness even when no path matches a source` passes. | **A** | Reusable unchanged with the Config `Change` union. |
| `packages/core/src/config/plugin/command.ts`, `@@ -53,7 +53,13` (lines 55–65) | Mechanical W2; same bypass for command sources. | Command test with the same name passes. | **A** | Reusable unchanged with the Config `Change` union. |
| `packages/core/src/config/plugin/source.ts`, `@@ -57,10 +57,12` (lines 60–72) | Mechanical W2; direct configured plugin file/directory watch publishes `configuredChanges` from readiness as well as exact events. | New supervisor reacquisition scenario is conceptually targeted but its test implementation times out. Existing initial-activation tests passed on this rerun. | **A** | Source hunk is evidence-compatible; do not infer integration proof from the broken test. Retained `watched` keys prevent a readiness self-loop. |
| Same file, `@@ -81,8 +83,12` (lines 83–96) | Mechanical W2; Config invalidation bypass in the merged Plugin Source feed. | Agent/command analogues pass; Plugin Supervisor named suite exercises this feed. | **A** | Reusable unchanged with the Config union. |
| `packages/core/src/config.ts`, `@@ -32,15 +32,22` (lines 35–50) | Mechanical W2; exported Core-local `Change = Watcher.Update | invalidation` and widened `changes()`. | Agent and command invalidation tests pass. | **A** | Reusable. It changes no Protocol or Server `HttpApi`, so no generated-client action is implicated. |
| Same file, `@@ -58,8 +65,8` (lines 65–70) | Mechanical W2 test surface; widens `Config.Test.emitChange`. | Agent and command tests directly inject invalidations. | **C** | Retain as test support for the Config union. |
| Same file, `@@ -69,12 +76,12` (lines 74–88) | Mechanical W2 test layer; stores and publishes `Change`. | Same two passing tests. | **C** | Retain as test support. |
| Same file, `@@ -235,7 +242,7` (line 245) | Mechanical W2 production channel widening. | Covered indirectly by named reload/owner suites; no dedicated end-to-end Config invalidation test exists. | **A** | Reusable with the surrounding Config hunks. |
| Same file, `@@ -246,14 +253,18` (lines 250–269) | Mechanical W2; each existing `ConfigWatch.plan` key supplies onReady that publishes root invalidation before requesting reload. | Existing `ConfigWatch.plan` tests pass; missing proposed Config-side repeated-readiness/coalescing test. | **A** | Reusable, but add the missing end-to-end proof before calling the owner slice complete. Logical root `target.path` is compatible with validated namespace semantics. |
| `packages/core/src/filesystem/watcher.ts`, `@@ -79,6 +79,8` (lines 79–85) | W2 test-only API; exposes `Watcher.Test.invalidate()`. | New supervisor test calls it. | **C** | Keep only as generic test infrastructure. |
| Same file, `@@ -170,6 +172,7` (lines 173–176) | W2 test-only state; stores active invalidation callbacks. | New supervisor test. | **C** | Retain with the other test-layer hunks. |
| Same file, `@@ -192,9 +195,11` (lines 198–205) | W2 test-only lifecycle; register callback and remove it on unsubscribe. | New supervisor test; W1 release suite remains green. | **C** | Retain; registration/removal is correctly scoped to active test watches. |
| Same file, `@@ -210,6 +215,10` (lines 218–221) | W2 test-only control; invokes every active physical watch's invalidation callback. | New supervisor test. | **C** | Retain as broad test control; it is intentionally not per-target and uses a new `for…of` despite the repository preference for functional iteration. |
| `packages/core/test/config/agent.test.ts`, `@@ -558,6 +558,45` (lines 562–599) | Mechanical W2 test; writes an unseen source then injects mismatching-root invalidation; checks reload and burst coalescing. | `ConfigAgentPlugin.Plugin > rebuilds on reacquisition readiness even when no path matches a source` passes. | **C** | Retain. It proves consumer bypass/coalescing, not Native→Config wiring. |
| `packages/core/test/config/command.test.ts`, `@@ -323,6 +323,48` (lines 327–367) | Mechanical W2 mirror test for commands. | Corresponding ConfigCommand test passes. | **C** | Retain with the command bypass. |
| `packages/core/test/plugin/supervisor-reload.test.ts`, `@@ -165,6 +165,47` (lines 168–207) | Mechanical W2 integration test for configured-directory readiness. | `reloads a configured plugin directory on reacquisition readiness` times out at 15 seconds. | **B** | Rewrite. `it.effect` uses TestClock, but lines 194–200 retry on scheduled sleeps without advancing it; line 201 also incorrectly expects stale `greet-v1` to remain defined after replacement. |

### Missing W2 work is part of the disposition

- `packages/core/src/config/plugin/skill.ts` is byte-identical to base/W1. No
  Skill invalidation consumer exists.
- `packages/core/test/config/skill.test.ts` has no recovery-without-path-event or
  anti-loop test.
- The required implementation is a **per-watch first-`onReady`-call gate whose
  boolean flips inside that first invocation**. The owner journal's suggested
  flag set after `watcher.subscribe` returns is unsound because the returned
  `Stream.unwrap` has not started its initial readiness yet; E14 reproduced the
  resulting loop.
- No owner latch can recover a signal published while no logical subscriber is
  attached. The authoritative scan bounds, but does not eliminate, that gap.

## Uncommitted actor layer: complete hunk disposition

| File and hunk | Provenance and role | Named tests | Class | Disposition |
| --- | --- | --- | --- | --- |
| `packages/core/test/filesystem/fixture/watchman/client.ts`, new-file hunk `@@ -0,0 +1,499` | SX W3; scripted raw-client actor with construction/listener/command/termination barriers, strict payload plans, FIFO dispatch, events, cancellation, and late-response injection. | All three actor self-tests below pass. | **C** | Preserve as controller test infrastructure, but do not use unchanged as proof of selected transport conformance. |
| `packages/core/test/filesystem/watchman-actor.test.ts`, new-file hunk `@@ -0,0 +1,192` | SX W3; actor self-tests. | `serializes complete command payloads and sends capability checks through the command queue`; `controls callback failure, unilateral PDUs, socket loss, held late replies, and termination`; `fails mismatched, duplicate, and missing command scripts with diagnostics`. | **C** | Retain as fixture self-tests. They passed 3/3 and 32 assertions. |

The actor's bounded fidelity is now directly known:

- **Matches:** one callback command in flight, FIFO advance, capabilityCheck as
  a version command, callback errors, socket-error non-cancellation, remote-end
  cancellation before the `end` listener, local-end cancellation string, and
  deliberate event ordering.
- **Type mismatch:** its `on(event: string, ...)` is wider than the transport's
  closed event union, and its factory is zero-argument while v4 proposed a
  binary-taking factory. The npm artifact also omits its declared `.d.ts`, so
  an unguarded consumer would hide this mismatch behind implicit `any`.
- **Behavioral gaps:** actor `respond()` can settle an arbitrary object, while
  the real transport steals any top-level `subscription` or `log` object as a
  unilateral event. It therefore does not reproduce Watchwoman's
  `unsubscribe` acknowledgement stall or `get-log` stall. It also has no
  locator child, spawn failure, delayed connect/socket leak, real close join,
  daemon session retention, or post-`end()` reconnect model.
- **Consequent limit:** it can deterministically test a controller's own
  callback/PDU fencing only after the production seam is fixed. It cannot prove
  transport compatibility or the E04/E12 physical no-survivor property.

## Uncommitted documentation layer: complete file/hunk disposition

Eleven files are whole-file additions; the twelfth entry is 21 link-only hunks
over committed W0 `v2-readd3`. None is an independently accepted current
architecture.

| File / hunk | Provenance and role | Class | Disposition |
| --- | --- | --- | --- |
| `.design/watchman/v2-readd/README.md`, new 66-line file | GX promotion index for the carrier payload. | **B** | Rebuild after artifact selection. It currently labels mixed, uncommitted, and contradicted records as the durable stable home. |
| `.design/watchman/v2-readd/log.md`, new 34-line file | GX chronology of W0/W1, promotion, W2, and actor state. | **C** | Preserve as historical evidence; update only if it is intentionally adopted as the carrier log. |
| `v2-actor0.glm53f.md`, new 236-line file | Cancelled F actor handoff; explicitly made no carrier code and was superseded by the SX actor. | **D** | Superseded by the implementation and `v2-actor0.gpt56solmax.md`. |
| `v2-actor0.gpt56solmax.md`, new 200-line file | SX actor implementation journal and original test claims. | **C** | Preserve with the fixture, but qualify its “matching seam” claim using E07's type/behavior gaps. The focused self-test claim was reproduced. |
| `v2-execution0.glm53f.md`, new 401-line file | F W0/W1/W2 implementation chronology, including exact earlier red/green runs. | **C** | Preserve as chronology. Its 54/2 W2 result is historical; the current exact rerun is 55/1, and it is not an acceptance record. |
| `v2-owners0.glm53max.md`, new 355-line file | GX W2 design/review, reusable Config/source analysis, and broken-test diagnosis. | **B** | Rewrite before reuse. Its proposed post-subscribe `attached` latch is specifically disproved by E14; its W2 “80% conditional GO” remains incomplete. |
| `v2-protocol0.glm53max.md`, new 678-line file | GX transport/controller source map and actor design. | **B** | Retain source maps, rewrite protocol policy. It invents ancestor `D`/`relative_path` handling for plain watch, assumes a usable unsubscribe callback/shape, predates the full key-classifier mismatch, and cannot prove release ownership. |
| `v2-readd3.gpt56solxh.md`, 21 link-only hunks (`@@ -10` through `@@ -912`) | Coordinator promotion edits replace bundle-relative historical references with absolute `file:///home/rektide/src/opencode-watchman-old/...` links. | **B** | Link intent is useful, but absolute host paths are nonportable. The committed W0 plan's substantive protocol/cookie/row/circuit/release directions are also superseded by validation0–2. |
| `v2-readd4-dirty.gpt56solxh.md`, new 866-line file | Fully decided pre-validation architecture; contains the correct Skill first-call gate. | **B** | Mine the gate and fixed exclusions, but rewrite the rest against validation. Its `D`, cookie expression, canonical literal ignores, `new` mapping, unconditional directory-row suppression, circuit fencing, sentinel coverage, and release bound are not valid as written. |
| `v2-readd4-prompt0.gpt56solxh.md`, new 306-line file | Pre-validation implementation handoff prompt. | **D** | Superseded as an execution prompt. It directs the next session to build from v4 before the now-known contradictions are incorporated. |
| `v2-readd4.gpt56solxh.md`, new 867-line file | Evidence-ranked draft and research assignment map. | **D** | Its research-gate role is fulfilled by validation0–2; its provisional architecture must not be treated as current. Retain only as lineage if desired. |
| `v2-research0.glm53max.md`, new 1,085-line file | GX base/donor audit and source map. | **B** | Source inventory remains useful, but architecture recommendations about ancestor roots, canonical ignores, row mapping, circuit, and lifecycle need validation-era corrections. |

## Validated evidence reconciliation

| Validated fact | Carrier code/test disposition | Documentation consequence |
| --- | --- | --- |
| **Selected transport vs intended daemon:** top-level `subscription` and `log` are always classified unilateral; Watchwoman unsubscribe and both daemons' `get-log` responses can stall the current and all later FIFO commands. Watchwoman also merges subscribe acknowledgement and initial rows. | No production client exists, so the defect is absent but unresolved. Actor is C-only because arbitrary `respond()` bypasses this classifier. | Protocol0, readd3, v4, and dirty release/command transcripts require rewrite; “best-effort unsubscribe” cannot be modeled as an ordinary settling callback through the selected transport. |
| **Raw lifecycle:** `Client.end()` returns before socket close, is not terminal, can reconnect, cannot cancel/join a locator child, and can be followed by a late live socket. Socket error and spawn failure can strand callbacks. Watchwoman can retain disconnected subscription sessions until later matching ticks/root drop. | W1 has only logical finalization; actor has only synthetic termination. No production hunk closes E04/E12. | Any claim of one-timeout physical release or no survivors is unsupported. Current-command plus joined unsubscribe can approach two deadlines; detached unsubscribe violates join semantics. |
| **Plain watch gives `D = C`:** every successful plain `watch C` returns `realpath(C)`; no `relative_path`. Ancestor adoption belongs to excluded `watch-project`. | No production path mapper exists. Config invalidation uses logical `target.path`, which is compatible. | Delete the three-root ancestor-routing machinery and optional `relative_path` claims from protocol0/v4/dirty. Readd3's plain exact-watch direction survives. |
| **Cookie expression:** `['name', '.watchman-cookie-*']` is literal, not a basename glob. Watchwoman strips cookie names before expression evaluation; stock requires a glob-capable expression for daemon-side selection. | No expression code exists. Actor does not cover expression behavior. | Readd3/v4/dirty basename-`name` assertions require rewrite; authoritative client-side basename filtering may remain a separate defense. |
| **Literal ignores are logical:** Parcel resolves literals against `L` and applies lexical equal-or-component-below matching in the logical event namespace; canonical-only enforcement changes behavior when `L != C`. | W2 leaves `ConfigWatch.plan` and ignore construction unchanged. No Watchman filter exists. | Canonical literal mapping in v4/dirty/research0 is not reusable as written. |
| **`new` is not portable creation truth:** deployed Watchwoman commonly emits ordinary creates as `new:false`; create and update rows can be indistinguishable without remembered baseline/inode state. | No row mapper exists. Actor's sample PDU is data only and asserts no mapping. | Dirty's `existing+new → create` rule and readd3's promised create/update mapping are contradicted. Owners currently use path changes as invalidations, so exact creation identity is not required for most of them. |
| **Missing child rows:** Watchwoman omits descendants for directory rename/recursive delete; suppressing every directory row can erase the only subtree invalidation signal. | No mapping/suppression hunk exists. | V4/dirty unconditional directory suppression cannot be accepted until real Config/Skill/Plugin/Location consumers' self-healing is resolved. O5 owns that separate same-wave question and was not read here. |
| **Bun sentinel constraints:** a direct parent-entry sentinel sees final-component churn, but not ancestor-symlink retarget; parent deletion kills it; on Bun 1.4.1 the stale watcher must close before re-arm or the replacement can be permanently deaf. | No sentinel exists. Named carrier tests ran under Bun 1.4.1, not pinned 1.4.2. | Readd3/v4/dirty “one sentinel” claims are incomplete. Exact Bun 1.4.2 remains unexecuted. |
| **Skill first-call gate:** the gate must flip inside the first `onReady`; setting a flag after `watcher.subscribe` returns but before stream consumption loops. No latch covers detached gaps. | Skill source/test are untouched. W1 ordering is the valid prerequisite. | Owners0 and evidence-brief v4 latch text are contradicted; dirty's first-call gate is the reusable design fragment. |
| **Donor circuit races:** older ordinary success/non-connect failure can close a newer open/half-open donor circuit; an interrupted probe can discard success or return failure without expected observation. Donor behavior is not blanket stale-result fencing. | No acquisition/circuit production code or test exists. Actor self-tests do not exercise multi-root admission epochs. | Readd3/research0/dirty stale-result assertions are desired-policy proposals, not donor-proven behavior. They require a new executable design, not verbatim carry. |

## Exclusion and forbidden-file scan

The scan covered both the committed W1 diff and current uncommitted
production/test diff, not merely current source text.

| Search | Result in added/removed production/test lines |
| --- | --- |
| `watch-project`, `watch-del`, `relative_root`, `cursor`, `WatchInterests`, `placement`, `synthetic`, `metrics`, `fallback` | **No matches.** |
| Forbidden `packages/core/src/config/discovery.ts` changes | Empty diff (`e3b0c442…b855`). |
| Forbidden `packages/core/src/config/watch.ts` planning changes | Empty diff (`e3b0c442…b855`). |
| `ConfigDiscovery` / discovery and planning words | Two hits were unchanged context in `config.ts`; no added or removed discovery/planning logic. |
| Plain `watch`, `clock`, `name`, `exists` | Appear only in the test actor's scripted payload/PDU examples. There is no production daemon protocol or row mapping. |
| Protocol/Server `HttpApi`, client generation, dependency manifests | No changed paths. No generated client or package dependency is present in the carrier diff. |

## Focused test reruns

Only test commands explicitly recorded by W1, W2, or the landed actor record
were run, always from `packages/core`. No formatter, install, snapshot update,
generator, lint, broad suite, live daemon test, or typecheck was run. The host
resolved `bun` to **1.4.1**, so these runs do not close the Bun 1.4.2 residual.

| Record | Exact command | Result |
| --- | --- | --- |
| W1 full named baseline | `bun test test/filesystem/watcher.test.ts test/config/watch.test.ts test/config/reload.test.ts test/config/skill.test.ts test/location-layer.test.ts` | **64 pass, 0 fail, 207 assertions, 10.71 s.** Includes the W1 readiness test. |
| W2 named owner command | `bun test test/config/agent.test.ts test/config/command.test.ts test/config/reload.test.ts test/config/skill.test.ts test/config/watch.test.ts test/plugin/supervisor-reload.test.ts` | **55 pass, 1 fail, 144 assertions, 23.97 s.** The sole failure is `PluginSupervisor reload > reloads a configured plugin directory on reacquisition readiness`, timed out at 15 s. |
| Landed actor record | `bun test test/filesystem/watchman-actor.test.ts` | **3 pass, 0 fail, 32 assertions, 122 ms.** |

The earlier W2 journal recorded 54/2 because `retains a discovered plugin
change during initial activation` also failed on that run. It passed now; this
does not make W2 green and suggests that earlier regression was ordering-
sensitive rather than a stable second failure. The still-red new test has a
source-proven TestClock deadlock and an unreachable inverted stale-command
assertion.

The timed-out W2 test left two fixture artifacts outside the carrier:
`/tmp/opencode-core-test-GDRT7R/` and
`/tmp/opencode-core-test-UbzDEI/`. They were inventoried and deliberately not
removed or modified.

## Preservation proof

The approved scratch directory is documented at
[`/home/rektide/tmp-opencode/v4-o4-carrier-audit/README.md`](file:///home/rektide/tmp-opencode/v4-o4-carrier-audit/README.md).

1. The seven files inherited from GX under `status/` were never overwritten;
   their SHA-256 values are recorded in the scratch README.
2. Fresh W1, code, and documentation diffs matched the inherited captures by
   SHA-256 before tests and again after tests.
3. [`status/before-jj.txt`](file:///home/rektide/tmp-opencode/v4-o4-carrier-audit/status/before-jj.txt)
   and [`status/after-jj.txt`](file:///home/rektide/tmp-opencode/v4-o4-carrier-audit/status/after-jj.txt)
   have the same 22 changed carrier paths, working-copy identity, parent, and
   diff hashes.
4. An mtime scan over the test interval found no carrier file written by the
   reruns. Post-test `jj status` gained no test artifact. The two surviving
   fixture tempdirs are reported above and remain outside the carrier.
5. This audit added only scratch `README.md`, `status/after-jj.txt`, three
   `tests/*.txt` transcripts, and this new report. It did not edit, revert,
   clean, generate, format, commit, or delete anything in the carrier.

## Limits and confidence

- **High confidence** in revision identity, file/hunk completeness, exclusions,
  test results, and preservation: all were checked directly against the carrier
  and hash-matched snapshots.
- **High confidence** in W1 and Skill-gate disposition: W1 passes and E14's
  source-pinned executable matrix depends on its exact ordering.
- **High confidence** that the actor is only partial transport evidence: E07
  directly compared it to the exact package and daemon.
- **Medium-high confidence** in individual A-class W2 production hunks. Their
  behavior is locally coherent and their direct consumer tests pass, but the
  complete owner arc is absent and the configured-source integration test is
  broken.
- No same-wave O1/O2/O3/O5 report was read. This audit uses validation0–2 and
  their earlier-wave source reports; the unresolved owner-directory signal is
  deliberately not preempted.
- No live daemon, stock binary, exact Bun 1.4.2, typecheck, formatter, linter,
  generated client, or full Core suite was run. No claim here closes those
  boundaries.

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — validates target/transport mismatch, missing pre-return and physical-shutdown ownership, donor circuit races, and release-bound limits used in disposition.
- [`v2-readd4-validation1.gpt56solxh.md`](v2-readd4-validation1.gpt56solxh.md) — validates classifier stalls, lifecycle behavior, cookie expression, nonportable `new`, missing child rows, and pressure/release accumulation.
- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md) — validates `D=C`, logical ignores, sentinel limits, Skill first-call ordering, and daemon-side release.
- [`v2-readd4-e07-transport-conformance0.glm53max.md`](v2-readd4-e07-transport-conformance0.glm53max.md) — exact actor-versus-transport behavioral and type-level comparison; independently reproduced actor self-test count.
- [`v2-readd4-e14-skill-lifecycle0.glm53max.md`](v2-readd4-e14-skill-lifecycle0.glm53max.md) — executable first-call-gate and detached-gap proof against W1.
- [`v2-readd4-e11-circuit-races0.glm53max.md`](v2-readd4-e11-circuit-races0.glm53max.md) — executable donor circuit counterexamples that prevent treating stale-result fencing as inherited behavior.
- [`v2-readd4-e12-transport-lifecycle0.glm53max.md`](v2-readd4-e12-transport-lifecycle0.glm53max.md) and [`v2-readd4-e12-daemon-session-release0.glm53max.md`](v2-readd4-e12-daemon-session-release0.glm53max.md) — raw-client and daemon-side release boundaries the actor does not model.
