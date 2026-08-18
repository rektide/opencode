# subagent-recovery

## What this feature is now

Discovery and visibility for subagent sessions only. The maintained line adds:

- `subagent_list` — lists every direct child of the current session with
  durable prompt history and conservative status, so a parent that lost
  earlier tool results can recover child sessionIDs for continuation.
- Active-execution visibility — children with active session execution are
  reported as `running` even when no process-local job state survives.
- Registration coverage — the focused test layer registers both
  `SubagentTool` and `SubagentListTool` plugins.

## 2026-08-18 decision: adopt upstream continuation semantics

Upstream `7188d42b` ("feat(core): resume subagent sessions", #43172) landed
the continuation input with permissive semantics: it steers running
children, allows agent switching, and allows background continuation. The
same-day refresh had kept the local guard policy instead
(`4d7ed9d1` guards-only continuation, `a78acc2e` reject-active); the
decision recorded in `/home/rektide/a/doc/opencode/patches.md` reverses
that — both guard commits were dropped and continuation reverts to pure
upstream behavior. Upstream's `tool-subagent.test.ts` continuation tests
ship byte-identical on this line.

## Commit shape

Rebuilt directly on `b0c3a16e` (upstream):

| Commit | Change ID | Subject |
| --- | --- | --- |
| `7f56f46d` | `rsmkkkku` | feat(core): list recoverable subagent sessions |
| `98e9ad7d` | `urowystk` | fix(core): report active subagent sessions |
| `e9e4c880` | `squkrnnm` | test(core): register subagent list in focused tests |

Bookmarks `subagent-recovery` and `subagent-recovery-20260818` both point
at `e9e4c880`.

Adaptations made while dropping the guards:

- `job.get` on the plugin runtime (needed by `subagent_list` for job
  status) was originally added by the guards commit; it is absorbed into
  `7f56f46d`.
- `subagent_list` model-facing guidance no longer tells the agent to avoid
  continuing running children or to reuse the same agent; it describes
  upstream semantics (steering, agent switching).
- No kept commit enforces rejection of continuation under any condition.

## Verification

- `bun test test/tool-subagent.test.ts` from `packages/core`: 11 pass,
  0 fail (9 upstream tests unmodified — including "steers a running child
  session in the background" and "rejects unrelated children and switches
  agents on continuation" — plus 2 `subagent_list` tests).
- `bun typecheck` from `packages/core`: clean (also verified at each
  intermediate commit).
- `packages/core/src/tool/plugin/subagent.ts` on this line is
  byte-identical to upstream `b0c3a16e`.

## Continuation semantics

Continuation semantics are upstream's (`7188d42b`): steering running
children, agent switching, and background continuation are all allowed.
This line adds no continuation policy of its own.
