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

Refreshed 2026-08-29 onto `e70d667a` ("fix(ai): preserve Anthropic finish across
usage deltas", #46171, the `v2@origin` tip at that fetch); previously built on
`044d04df` (and before that `b0c3a16e`):

| Commit | Change ID | Subject |
| --- | --- | --- |
| `a8b2e43f` | `uqxrqvxm` | feat(core): list recoverable subagent sessions |
| `3b623e2d` | `krporssy` | fix(core): report active subagent sessions |
| `933eeacc` | `vqspzuon` | test(core): register subagent list in focused tests |

The 2026-08-29 refresh used duplicate-then-rebase (the dated bookmarks
`-20260813/-20260817/-20260818` pin the original line and are immutable), so
this refresh also minted fresh change IDs. Bookmarks `subagent-recovery` and
`subagent-recovery-20260829` both point at `933eeacc`.

### 2026-08-18 refresh onto `044d04df`

The 9-commit upstream gap (`b0c3a16e..044d04df`, through `02f3f3cb`,
`56e66656`, `97265f8a`, `ff9452bf`, `cb39ea11`, `511b4556`, `5ff6bb87`,
`4b9d89e9`) touches `session/model-request.ts`, `session/inbox.ts`,
`plugin/hooks.ts`, and `plugin/internal.ts`, but only `plugin/internal.ts`
intersects this feature. The rebase was conflict-free: the feature's
`SubagentListTool` import/registration and upstream's
`AppProcess`/`ConfigFormatterPlugin`/`ConfigImagePlugin` additions live in
non-overlapping regions and both shapes are preserved in the merged file.
`tool-subagent.test.ts` and `subagent-list.ts` carried over byte-identical
to the pre-refresh stack (the gap touches neither), and
`packages/core/src/tool/plugin/subagent.ts` remains byte-identical to
upstream `044d04df`.

Adaptations made while dropping the guards:

- `job.get` on the plugin runtime (needed by `subagent_list` for job
  status) was originally added by the guards commit; it is absorbed into
  `7f56f46d`.
- `subagent_list` model-facing guidance no longer tells the agent to avoid
  continuing running children or to reuse the same agent; it describes
  upstream semantics (steering, agent switching).
- No kept commit enforces rejection of continuation under any condition.

## Verification

Re-verified on `e70d667a` after the 2026-08-29 refresh:

- `bun test test/tool-subagent.test.ts` from `packages/core`: 12 pass,
  0 fail — 10 upstream tests byte-identical (the 9 continuation tests
  plus upstream's new "admits one durable completion across live delivery
  and restart replay") plus 2 `subagent_list` tests: "lists only direct
  children with durable prompts and honest statuses", "reports when
  a session has no direct subagent children".
- `bun typecheck` from `packages/core`: clean.
- `packages/core/src/tool/plugin/subagent.ts` on this line is
  byte-identical to upstream `e70d667a`.

### 2026-08-29 refresh onto `e70d667a`

The upstream gap (`044d04df..e70d667a9fe3`, ~850 commits) intersects this
feature in `plugin/runtime.ts` and `test/tool-subagent.test.ts`.
`fa5ccac7` ("refactor(core): share subagent completion delivery", #46054)
added the `completionIt` layer and its "admits one durable completion"
test, and upstream grew `job.completeBackground`, `persistentPty.read`,
and `session.context` on the plugin runtime. Obsolescence check: upstream
landed no subagent-listing or visibility tool, so all three feature
commits were kept.

Conflicts and resolutions (duplicate-then-rebase; each resolution folded
back with `jj new` + `jj squash`):

- `0e0b07e8` → `a8b2e43f` (feat): `plugin/runtime.ts` — merged the
  feature's `job` Pick addition (`"get"`) into upstream's
  `completeBackground` + `persistentPty` lines.
  `test/tool-subagent.test.ts` — kept both insertions inside
  `describe("SubagentTool")`: upstream's new completion test followed by
  the two `subagent_list` tests.
- `d8f4e477` → `3b623e2d` (fix): `plugin/runtime.ts` — kept upstream's
  `session.context` entries and appended the feature's `"active"` (Pick
  and facade). `tool-subagent.test.ts` — merged the feature's
  `active: Effect.sync(() => new Set(activeSessions))` mock with
  upstream's new `isActive: () => Effect.succeed(false)`.
- `423ffcd4` → `933eeacc` (test): no manual conflict — resolving the
  parents cleared the inherited conflict automatically.

The upstream gap also touched `session.ts` (`Session.Interface.active`
still exposes the active-ID set the fix commit reports from) and
`session/execution.ts` (`active` + `isActive` both present), so the
feature's API usage carried over unchanged.

## Continuation semantics

Continuation semantics are upstream's (`7188d42b`): steering running
children, agent switching, and background continuation are all allowed.
This line adds no continuation policy of its own.
