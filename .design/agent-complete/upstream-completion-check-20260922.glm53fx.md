# Upstream completion-notice check — 2026-09-22

- **Model**: GLM 5.3 Flash Max (`glm53fx`)
- **Question**: do subagent completion-notice clicks work in current upstream, did anything weaken them, and why are the deployed build's clicks inert?
- **Repo**: `~/archive/anomalyco/v2`, all reads via `JJ_IGNORE_WORKING_COPY=1` (read-only)
- **Revs**: deployed candidate `0b26d085265e` (committer 2026-09-11 21:30), its upstream base `23f3f8b6ca61` (2026-09-04 20:43), upstream fix `735556eab8e0` (#49675, authored 2026-09-17 22:42 / committed 09-18 05:42), tip `dcfe1ec7bd49` (2026-09-22 15:20)

## Verdict

**Works at tip; the deployed build is not broken — it predates the feature entirely.** The operator premise that `735556eab8e0` (#49675) "should be in that lineage" is **false**:

- `735556eab8e0 & ::0b26d085265e` → **empty** (not an ancestor)
- `0b26d085265e & ::735556eab8e0` → **empty** (divergent lines; neither contains the other)
- `heads(::0b26d085265e & ::735556eab8e0)` → `23f3f8b6ca61` — the common ancestor is the 09-04 upstream base itself

The deployed candidate line is a rider/patch line forked directly from `23f3f8b6ca61`; upstream merged #49675 two weeks later on the separate main line. Formally: **works-at-tip-but-deployed-build-lacks-the-feature — the navigation code, not the metadata.** Nothing weakened at tip.

## Evidence

### 1. Deployed tree handler (`0b26d085265e`, `packages/tui/src/routes/session/index.tsx`)

`SessionNoticeMessageV2` at **:2065**. The click path is *not* what the operator remembered — there is no `navigate` and no `childID()` anywhere in this version:

- **:2072-2076** — the `target()` memo: `if (source() !== "shell") return`, then `shellID`/`jobID` from metadata. **Shell-only.** For `source === "subagent"`, `target()` is `undefined`.
- **:2108-2125** — the rendered box for `completion()` rows (subagent **or** shell), with `onMouseOver` gated `if (target())` (:2111-2113) and `onMouseUp` (:2115-2119):
  ```tsx
  onMouseUp={() => {
    const item = target()
    if (!item || renderer.getSelection()?.getSelectedText()) return
    ctx.jumpToBackgroundTool(item, props.message.id)
  }}
  ```
- **:682-697** — `jumpToBackgroundTool`: scrolls *within the current session* to the background tool's row. It never navigates to another session.

So on the deployed build, a subagent completion row **looks like** part of the same clickable family but: no hover highlight (gated on `target()`), and clicks hit the `if (!item) return` guard — a **silent no-op by construction**. This shape is inherited verbatim from the base `23f3f8b6ca61` (handler at :2057 there); no candidate-line commit between base and deployed commit touched the notice handler (the only three touching the file are export-dialog / transcript-export / signal-termination work).

Robustness to the binary-stamp ambiguity: `v0.0.0-local-202609051106` (stamp 09-05 11:06) predates `0b26d085265e`'s committer date (09-11), so the binary likely came from an earlier candidate commit such as `e2db22327eab` (09-05, the deployed commit's parent). Checked: at `e2db22327eab` the file has `jumpToBackgroundTool` ×4 and `childID` ×0 — **identical inert shape**. The verdict does not depend on which exact commit was built.

### 2. Tip handler (`dcfe1ec7bd49`, :2016-2064) — works

- `childID()` memo (subagent-only): `source() === "subagent" ? stringValue(metadata()?.childID) : undefined`
- Hover gated on `childID()`; `onMouseUp` → `const id = childID(); if (id) navigate({ type: "session", sessionID: id })`
- When `childID` is absent: **silent no-op** (and no hover affordance) — by design.

Function-body diff `735556eab8e0` → `dcfe1ec7bd49`: **theme-token renames only** (`feedback.error.default`→`.base`, `text.default`→`text.base`, `subdued`→`muted`; #49655/#49661/#49820/#49837). Logic byte-equivalent. `735556eab8e0`'s own diff shows it adding exactly this behavior (childID memo, hover signal, navigate on mouseUp). **No revert, no gate addition, no weakening at tip.**

Related history on tip's line: `8d1a9799f4ef` "fix(tui): remove completion notice links" (#47426, committed 09-04 22:46 — ~2h after the deployed base) *removed* even the shell in-session scroll; `735556eab8e0` re-added click behavior for **subagent** rows only. Consequence: shell notice clicks work on the deployed build but are no-ops at tip.

### 3. Metadata producers — present in the deployed build all along

- `packages/core/src/session/subagent-completion.ts`: **zero commits** in `23f3f8b6ca61..dcfe1ec7bd49` — byte-identical deployed↔tip. Its `deliver()` persists, for *every* terminal state (completed / error / cancelled):
  `metadata: { source: "subagent", childID: recovery.childSessionID, agent, state }`
- `childID` emission is ancient: the module's creating commit `fa5ccac7073f` (2026-08-28, #46054) already carried it, and the pre-refactor `notifyWhenDone` path in `subagent.ts` emitted it too — present since at least `8db7487c894b` (2026-07-26). **The "synthetic messages persisted before the metadata landed" class is effectively empty** for anyone who ran the deployed (09-05) binary.
- Foreground-failed chain — identical at deployed rev and tip (deployed line refs / tip line refs):
  - `subagent.ts` progress emission: `context.progress({ sessionID: child.id, status: "running" })` — :167 / :202
  - `publish-llm-event.ts`: `failureSnapshot` (:86-89 both) merges `tool.progress` into published metadata; `failTool` (:325-341 / :327-341) enriches aborted-subagent errors with `(sessionID: …)` from `tool.progress.sessionID`
  - `message-updater.ts`: `session.tool.failed` persists `event.data.metadata` into `ToolStateError` — :340-353 / :359-374
  - Deployed→tip diffs of all three files: **zero relevant hunks** (only npm-scope rename, TPS latency, permissions, compaction-usage, subagent-model work). No behavior change in the failure-metadata path.

## Per-class user experience on the deployed build

| Notice class | Deployed build experience | At tip |
|---|---|---|
| Completed background subagent | Row renders; **click silently no-ops** (handler reads only shellID/jobID) | Click navigates to child session (`childID` metadata is there and consumed) |
| Errored / cancelled background subagent | Same **inert click** (`deliver()` persists `childID` for all terminal states) | Navigates |
| Foreground failed subagent | Tool error part *carries* the child sessionID in metadata (and in the abort error text), but **no click consumer exists** in this build (details dialog #49259 landed 09-16; notice nav #49675 on 09-18) | Metadata still persisted; click consumers elsewhere |
| Old persisted sessions | Not a factor — `childID` emitted since ≥ 2026-07-26 | Same |
| Shell notices | **Work** — in-session scroll to the shell tool row (`jumpToBackgroundTool`) | **No-op** — upstream deliberately removed scroll links (#47426) and restored navigation for subagents only (#49675) |

## Bottom line

Fix = rebase/deploy a build containing `735556eab8e0` (already in `dcfe1ec7bd49`'s ancestry; handler unchanged since). No metadata backfill is needed for any session completed after ~2026-07-26. If shell-notice scrolling matters to anyone, note it is gone at tip by upstream decision, not an accident to patch back.

## Probe anomaly

One broad-revset query (`heads(::…)` over all visible commits) failed with `Object ac7013a581de722726855085318510972827b6eb of type commit not found` — consistent with the known gc/CIFS race on the shared store. All targeted `jj file show` / bounded-revset reads succeeded; no targeted read hit zlib/inflate corruption. Noted per protocol; investigation was not blocked.
