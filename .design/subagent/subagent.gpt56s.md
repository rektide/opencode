---
type: Design research
title: Subagent host read surface — research, discovery, assessment
description: Groundwork for carryable v2 changes exposing the session reads the subagent-control plugin needs (list/messages/inbox/active), with interface options and commit sequencing.
resource: /opencode-subagent-patch/.design/subagent/subagent.gpt56s.md
tags: [opencode, v2, subagent, plugin, session, plugin-api]
status: draft
generated: { by: llm:gpt56s, at: 2026-08-30T20:00:00Z }
sources:
  - id: v2-e70d667a
    resource: https://github.com/anomalyco/opencode
    title: OpenCode v2 checkout at v2@origin e70d667a9fe3 (this workspace's base)
    author: org:anomalyco
    last_modified: 2026-08-29
  - id: subagent-control-plugin
    resource: file:///home/rektide/src/opencode-subagent-control
    title: opencode-subagent-control plugin repository and .design/port0.glm53.md
    author: human:rektide
    last_modified: 2026-08-30
  - id: patches-manifest
    resource: file:///home/rektide/archive/doc/opencode/patches.md
    title: OpenCode patches and ideas manifest
    author: human:rektide
    last_modified: 2026-08-30
  - id: subagents-guide
    resource: file:///home/rektide/archive/doc/opencode/subagents.md
    title: OpenCode subagents, prompts, and result return
    author: llm:opencode
    last_modified: 2026-08-11
---

# Subagent host read surface — research, discovery, assessment

> Model note: `gpt56s` inferred from the host's recent session rows (all
> `gpt-5.6-sol#high` on 2026-08-30); this conversation's own row was not found
> in `opencode-local.db`, so the suffix is best-effort.

## What was up

The plugin [`opencode-subagent-control`](https://github.com/rektide/opencode-subagent-control)
(`~/src/opencode-subagent-control`) gives the main agent a durable
`subagent_list` tool: every direct subagent child of the current session,
recovered from the store rather than context or process-local job state, so a
compacted parent can find child `sessionID`s and continue/steer them through
the built-in `subagent` tool. Tool registration through the public plugin API
works; the reads do not — `Plugin.Context["session"]` forwards no enumeration,
history, inbox, or active-execution members. The plugin probes the host at
runtime and fails each call with a precise message until a host grows them
([`.design/port0.glm53.md`](file:///home/rektide/src/opencode-subagent-control/.design/port0.glm53.md)).

This workspace (`~/src/opencode-subagent-patch`, jj working copy clean on
`v2@origin` `e70d667a9fe3`, the `working-20260829` baseline) is the feature
branch where the **carryable, well-sequenced host changes** will live — freshen
friendly, upstreamable in shape, no riders. We are explicitly free to design
the interface as we see wise; the plugin's currently-specified contracts
(`SessionReads` in its `src/index.ts`) are a probe of one possible shape, not
a requirement.

Research prompt for the topic, if one were needed later:

> Verify on current `v2@origin` exactly which session read operations exist at
> each layer (core `Session.Interface`, `PluginRuntime`, generated
> `SessionApi`, protocol endpoints) but are absent from the public plugin
> session domain and plugin host; enumerate the shape mismatches a host
> adapter must reconcile; and assess commit sequences that expose a
> read-only surface without wire/protocol changes.

## Research — what exists at each layer (verified on `e70d667a9fe3`)

### Core has every fact the plugin needs

`Session.Interface` (`packages/core/src/session.ts:124-233`) exposes:

| Member | Signature sketch | Line |
| --- | --- | ---: |
| `list` | `(input?: ListInput) => Effect<{data: Session.Info[]}>` | `:125` |
| `messages` | `(input: MessagesInput) => Effect<SessionMessage.Info[], ...>` | `:139` |
| `inbox` | `(sessionID) => Effect<SessionInbox.Info[], NotFoundError>` — durable admitted-but-undelivered work | `:157` |
| `cancelInbox` / `steerInbox` / `queueInbox` | `(input: InboxItemRef) => Effect<void, ...>` where `InboxItemRef = {sessionID, inboxID}` | `:158-160`, `:107` |
| `log` | durable ordered session event stream, replay-then-follow | `:168` |
| `active` | `Effect<ReadonlySet<Session.ID>>` — process-global execution membership | `:215` |

`list` filters by `parentID` at the store level
(`packages/core/src/session/store.ts:111`, indexed `session_v2_parent_idx` at
`packages/core/src/session/sql.ts:72`); the store `ListInput` union
(`store.ts:16-34`) carries `workspaceID/search/limit/order/parentID/anchor`
plus a `directory`, `project`, or bare all-variant.

`Session.Info` carries `parentID`, `agent`, `title`, `fork`, `time` — the
plugin filters `fork === undefined` to exclude forks, which are copied history,
not spawned children (see [`subagents.md`
vocabulary](file:///home/rektide/archive/doc/opencode/subagents.md)).

### The subagent tool already depends on one of these reads

Upstream's `subagent` tool (`packages/core/src/tool/plugin/subagent.ts`) is
continuation-native since `7188d42b`: optional `sessionID` input (`:31-34`),
spawn-policy guards (depth `:117-132`, agent resolution / non-primary
`:133-136`, permission assert `:137-150`), own-child check (`:152-166`),
agent-switch-on-continue (`:167-181`), admission then `job.start` with
`resume` + `latestAssistantText` (`:205-234`), background notification via
`SubagentCompletion.deliver` (`packages/core/src/session/subagent-completion.ts:7-29`,
synthetic `<subagent sessionID=... state=...>` message into the parent).
`latestAssistantText` reads `runtime.session.messages({sessionID, order:
"desc", limit: 20})` (`subagent.ts:69-81`) — **`messages` is already a
`PluginRuntime` member in upstream core**, consumed by the built-in tool.

### The plugin plumbing stack

- **`PluginRuntime`** (`packages/core/src/plugin/runtime.ts:13-46`): the
  internal runtime pick of `Session.Interface` — currently
  `get/create/messages/prompt/generate/command/rename/move/resume/switchAgent/switchModel/interrupt/synthetic/wait/context`,
  wired member-by-member through a replaceable cell (`:69-85`). `job` is
  picked as `start/wait/block/background/cancel/completeBackground` — notably
  **without `get`**, even though `Job.Interface.get` exists
  (`packages/core/src/job.ts:126`).
- **Effect domain type** (`packages/plugin/src/effect/session.ts:76-93`):
  `SessionDomain = Pick<SessionApi<unknown>, "create" | "get" | ...13 members>
  & { hook }`. The promise flavor (`packages/plugin/src/promise/session.ts:76-93`)
  is the same pick against the promise client `SessionApi`.
- **Effect host** (`packages/core/src/plugin/host.ts:408-433`): builds the
  context's `session` block from `runtime.session`, adapting shapes where core
  and client differ (`generate` → `{text}`, `interrupt` → `{interrupted}`,
  `create` defaulting `location` to the plugin's location).
- **Promise adapter** (`packages/plugin/src/promise/adapter.ts:393-411`): the
  promise context's `session` members are each
  `adaptApiMethod(SessionEndpoints["session.x"], host.session.x)` — generic
  decode/encode driven by the **protocol endpoint schemas** (`:113-125`). A
  promise-flavor member therefore needs an existing endpoint with the right
  wire shape.
- **Plugin package rule** (`packages/plugin/AGENTS.md`): every Effect domain
  extends the corresponding client API interface; do not redefine functions
  that already exist there; domains only add functions that make sense in the
  plugin context. Nested picks are idiomatic — `Context.experimental.terminal`
  is `Pick<ExperimentalApi["persistentPty"], "read">`
  (`packages/plugin/src/effect/plugin.ts:40-42`).

### The client/wire surfaces already publish these reads

`SessionApi` (`packages/client/src/effect/api/api.ts:1065-1113`) includes:

- `list` — input `{workspace?, limit?, order?, search?, parentID?, directory?,
  project?, subpath?, cursor?}` (`:95-105`), output `{data, cursor}`.
- `active` — `() => Effect<{[Session.ID]: {type: "running"}}>` (`:203-204`) —
  a record, not core's `ReadonlySet`.
- `inbox` — subdomain `{list, cancel, steer, queue}` (`inbox.list` at
  `:338-342` takes `{sessionID}` and returns `ReadonlyArray<SessionInbox.Info>`.
- `message` — single-message get. Bulk history is **not** on `SessionApi`;
  it is `MessageApi.list` (`:1116-1128`), generated from the separate
  `server.message` group whose `session.messages` endpoint
  (`packages/protocol/src/groups/message.ts:26-35`, `GET
  /api/session/:sessionID/message`) returns `{data, cursor}`.

Protocol endpoints all exist: `session.list`
(`packages/protocol/src/groups/session.ts:131`), `session.active` (`:220`),
`session.inbox.list` (`:527`), `session.message` (`:703`). The wire↔store
translation is ordinary handler work — `session.list` maps `workspace →
workspaceID`, parses cursors into store anchors, defaults the limit, and
manufactures cursors from first/last rows
(`packages/server/src/handlers/session.ts:48-85`).

### Test infrastructure ready to use

`packages/core/test/plugin.test.ts:29+` exercises hosts through the
runtime-cell replacement pattern (`PluginRuntime.makeCell()`, then
`cell.runtime = {...runtime, session: {...stubs}}`) and asserts adapter
shapes (`host.session.interrupt(...)` → `{interrupted: true}`, `:188`).
`packages/core/test/plugin-session.types.ts` is a compile-time contract test
for both flavors' domains (including `@ts-expect-error` negative cases).
Nothing locks the session domain's key set, so widening it breaks no test
mechanically.

## Discovery — the precise gap and what reconciling it costs

### Updated gap matrix (this is narrower than port0 recorded)

| needed | `PluginRuntime` | `SessionApi` (client) | plugin `SessionDomain` | Effect host / promise adapter |
| --- | --- | --- | --- | --- |
| `list({parentID})` | ✘ (add to pick) | ✔ | ✘ | ✘ |
| `messages({sessionID, order, limit})` | ✔ already | via `MessageApi.list` (`server.message` group) | ✘ | ✘ |
| `inbox(sessionID)` | ✘ (add) | ✔ `inbox.list` | ✘ | ✘ |
| `active` | ✘ (add) | ✔ (record shape) | ✘ | ✘ |
| `job.get(sessionID)` | ✘ (not picked) | ✘ no `JobApi` exists | ✘ no job domain | ✘ |

Only `list`, `inbox`, `active` need runtime-pick additions; `messages` needs
only domain + host exposure. The `job.get` refinement the core original used
has no client counterpart at all.

### Shape mismatches a host adapter must reconcile

| member | core shape | client/wire shape | adapter cost |
| --- | --- | --- | --- |
| `list` | `{data}` no cursor; input is store union | `{data, cursor}`; input has `parentID/directory/project/...cursor` | wrap output, map `workspace→workspaceID`, translate or omit cursor |
| `active` | `Effect<ReadonlySet<Session.ID>>` | `() => Effect<{[id]: {type:"running"}}>` | set→record one-liner; becomes a called function, not an Effect property |
| `inbox` | direct `(sessionID) => Effect<Info[]>` + separate `cancelInbox/steerInbox/queueInbox` | `{list, cancel, steer, queue}` | member renaming only; `InboxItemRef` already matches wire input |
| `messages` | array out; cursor `{id, direction}` | `{data, cursor}` string cursor | wrap output; cursor translation mirrors the message handler |

None are blocking; all are exactly the kind of shaping `host.ts` already does
for `generate`/`interrupt`.

### Structural facts that constrain sequencing

1. **The `satisfies` coupling**: `host.ts`'s context `satisfies
   Plugin.Context`, and the promise adapter feeds `host.session.*` — widening
   either domain type forces the corresponding host side to move **in the same
   commit** or the package stops typechecking. Domain type and host
   implementation per flavor are one atomic unit.
2. **Promise members need protocol endpoints** — all required endpoints exist
   (`session.list`, `session.active`, `session.inbox.list`, and
   `session.messages` in the `server.message` group), so the promise adapter
   additions are mechanical `adaptApiMethod` lines. This is a strong argument
   for **client-shaped** additions over inventing a core-shaped member: the
   promise flavor gets decode/encode for free and both flavors stay
   structurally identical to what SDK consumers already know.
3. **No wire change** is needed anywhere: no `HttpApi`/protocol edits, hence
   no `bun run generate` from `packages/client`, hence a small diff — the
   ideal carryable-patch shape per the repo's root `AGENTS.md`.
4. **The plugin's current probe contract is core-shaped** and would stay dark
   against a client-shaped host: `readCapabilities` expects
   `inbox === function` and `active?.pipe` (an Effect property), and consumes
   `messages` as a bare array. A client-shaped surface means a small
   companion update in the plugin repo (probe `inbox.list`, call `active()`,
   unwrap `.data`). We are free to revise that contract; the probe should be
   kept afterwards as a version guard for older hosts, per port0's own
   follow-up note.
5. **Reads are strictly weaker than what plugins already hold**: the domain
   already forwards `prompt`, `interrupt`, `move`, `synthetic` — mutations on
   arbitrary session IDs. Exposing `list`/`messages`/`inbox`/`active` adds no
   capability an in-process plugin lacks; it removes the need for
   transcript-scraping workarounds. No new permission gate is warranted
   (and none exists on the wire API these shapes mirror).
6. **The `inbox` pick is all-or-nothing at the top level**: `Pick<SessionApi,
   "inbox">` drags in `cancel/steer/queue` — admission-affecting mutations.
   The nested-pick precedent (`experimental.terminal`) allows
   `inbox: Pick<SessionApi["inbox"], "list">` to keep the surface read-only
   initially.

## Assessment — directions, recommendation, sequencing

### Interface directions

**A. Client-shaped, read-only pick (recommended).** Widen both flavors'
`SessionDomain` with `list`, `active`,
`inbox: Pick<SessionApi["inbox"], "list">` (nested pick, read-only), and an
additional function `messages: MessageListOperation`-shaped (the one genuinely
new member, justified under the "additional functions that make sense in the
plugin context" clause — bulk history is the real need and it lives one group
over on the wire). Host adapters translate core→client shapes; promise adapter
reuses the four endpoints. Policy (status derivation, preamble stripping,
fork filtering, continuation guidance) stays in the plugin where it belongs —
the host stays an honest data plane.

**B. Core-shaped additions matching the plugin's `SessionReads`.** Rejected:
the promise adapter cannot reuse endpoint decode/encode for non-wire shapes,
the two flavors would diverge from every other domain's convention, and the
package rule pushes toward client interfaces.

**C. Curated `subagent`/`children` domain** (`ctx.subagent.list()` returning
enriched children). Deferred: no client interface to extend (rule friction),
moves plugin policy into core, and the wire-API addition it would require is a
bigger, less upstreamable step. This is the right shape only if upstream ever
wants first-class child enumeration — noted as the long-term cotail seam, not
this patch.

**D. `job.get` / a job domain.** Defer: process-local (the whole patch's
philosophy is durable reads), no client `JobApi` to extend, and the durable
path already surfaces terminal outcomes except job-cancelled-without-history
children reading `idle`. Revisit only if that distinction proves costly.

### Recommended commit sequence (for draft0 to refine)

Each commit independently carryable; the `satisfies` coupling is respected by
keeping domain type + host per flavor together:

1. `feat(core): expose session list/inbox/active reads on PluginRuntime` —
   widen the pick in `runtime.ts` (`list`, `inbox`, `active`) plus the cell
   pass-throughs. Nothing consumes yet; zero behavior change.
2. `feat(plugin): add session read members to plugin session domains` +
   `feat(core): forward session reads through the plugin host` — as one change
   per flavor (effect domain+host together; promise domain+adapter together),
   or one commit covering both flavors. Adapter decisions embedded here:
   `list` cursor handling, `active` set→record, `inbox.list` rename, `messages`
   wrap; optionally accept `limit/order` pass-through and skip cursors
   (document reads as unpaginated-by-default with `limit`).
3. `test(core): cover plugin session reads` — extend `plugin.test.ts` with
   cell-stubbed tests (each member's shaping, `parentID` filter reaching the
   store input, `fork` passthrough) and add positive/negative cases to
   `plugin-session.types.ts`.

Companion (plugin repo, not this branch): update `readCapabilities` to the
client shapes and unwrap `.data`; keep the probe as an old-host guard.

### Verification plan

- `bun test test/plugin.test.ts` and `bun run typecheck` from `packages/core`;
  typecheck `packages/plugin`.
- Live confirmation: with the patched host running, the plugin's load log
  flips to `subagent-control: session read surface available` and a real
  `subagent_list` call returns children (including pre-restart ones — the
  durability point of the exercise).

### Risks and tensions

- **Upstream semantic collision**: upstream could land its own plugin session
  reads with different shapes; the freshen guardrails (semantic-collision
  bail-out) apply. The exposure here is deliberately minimal and additive to
  make either adoption or supersession cheap.
- **Cursor fidelity**: skipping cursor translation in `list`/`messages`
  adapters is simpler but quietly diverges from wire semantics; drafts should
  decide explicitly (recommend: v1 honors `limit`/`order` and returns empty
  cursors, with a comment).
- **`messages` as a non-client member** is the one rule-adjacent call; it is
  defensible (the wire operation exists, just in another group) but should be
  called out in the commit message for reviewers.
- **Scope creep pressure**: `log` (durable event stream), `stats`, `fork`,
  inbox mutations are all one pick away. Each has a real future consumer
  (cotail wants `log`); hold the line at the four reads this feature needs.

## Open questions for the drafts

1. Cursor handling: empty cursors + `limit`/`order` (recommended v1), or full
   anchor↔cursor translation shared with/factorable from the server handlers?
2. Read-only `inbox.list` nested pick now, or the full inbox subdomain
   (`cancel/steer/queue`) in the same change if inbox steering proves useful
   to plugins?
3. Should `message` (single) come along for free with `messages`, or wait for
   a consumer?
4. Does the effect host's `list` default `directory` to the plugin's location
   when no filter is given (mirroring `create`'s location defaulting), or pass
   through untouched so a bare `list()` means all sessions, as on the wire?
5. When implementation starts, add `.design/subagent/README.md` per the
   workspace-notes convention in the patches manifest, and a reciprocal
   pointer from the manifest's `opencode-subagent-control` entry.
6. Keep the plugin's capability probe permanently as a version guard, or drop
   it once `working` carries the surface?

## Cross-references

- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) —
  manifest entries: *Subagent control plugin* (the gap this doc addresses),
  *Subagent continuation and durable recovery* (the core-tool lineage and the
  "expose existing operations, not new registries" preference this design
  follows), idea #8 *TUI child-session interaction* (the user-driven
  counterpart), and the cotail plugin-seam notes.
- [`subagents.md`](file:///home/rektide/archive/doc/opencode/subagents.md) —
  child-Session vs subagent-Job lifetimes, prompt/steer timing, return-channel
  semantics; the vocabulary this doc's status model leans on.
- [`port0.glm53.md`](file:///home/rektide/src/opencode-subagent-control/.design/port0.glm53.md)
  — the plugin-side port notes: the original gap table (now partially stale —
  `messages` is upstream on `PluginRuntime`), the empty-struct JSON-Schema
  bug (fixed plugin-side; still open core-side on the subagent-recovery line,
  and irrelevant to a plugin-carried tool), and the probe design.
- [`README.md`](file:///home/rektide/src/opencode-subagent-control/README.md)
  — the plugin's user-facing contract that the companion repo update will
  revise.
- `~/src/opencode-subagent-recovery/.design/subagent-recovery/README.md` —
  the maintained core-lineage workspace notes; the eventual home of any
  core-side `subagent_list` schema fix, kept separate from this branch.

# Addendum — existing design material (2026-08-30, follow-up Q)

Confirmed in checkout: **no part of the recommended surface is invented
de-novo.** Every member leans on already-generated, already-published
interfaces, and the plugin package rules mandate exactly this reuse:

| recommended member | design material (already exists) |
| --- | --- |
| `list` | protocol `session.list` (`packages/protocol/src/groups/session.ts:131`) → generated `SessionListInput/Output/Operation` (`packages/client/src/effect/api/api.ts:95-113`); server translation reference at `packages/server/src/handlers/session.ts:48-85` (cursor↔anchor, `workspace→workspaceID`, default limit) |
| `active` | protocol `session.active` (`groups/session.ts:220`) → `SessionActiveOutput/Operation` (`api.ts:203-204`, record shape) |
| `inbox.list` | protocol `session.inbox.list` (`groups/session.ts:527`) → `SessionInboxList*` (`api.ts:338-342`); nested-pick precedent `Context.experimental.terminal` (`packages/plugin/src/effect/plugin.ts:40-42`) |
| `messages` | protocol `session.messages` in the sibling `server.message` group (`groups/message.ts:26-35`) → generated `MessageListInput/Output/Operation` + `MessageApi` (`api.ts:1116-1128`), reused **verbatim** as the domain addition |

Supporting facts: `api.ts` is codegen (`// Generated by
@opencode-ai/httpapi-codegen. Do not edit.`) from the protocol, so protocol is
the single source of truth; the promise client re-exports the same members
(`packages/client/src/promise/api.ts:16`, `SessionApi = Client["session"]`);
these shapes are public npm surface consumed in production by the TUI/mini;
and the current 13-member domain is itself `Pick<SessionApi<unknown>, …>` —
our change is the same move, not a new pattern.

Power-vs-curation, made concrete (user discussion 2026-08-30): the maximal
"re-expose what's available" shape — a flat `Pick<SessionApi, "list" |
"active" | "inbox" | "message" | "messages">` handing plugins inbox
`cancel/steer/queue` too — is one line and defensible for simplicity. The
read-only recommendation stands because a full sweep would also reach
`remove` (destructive) and the plugin context is a deliberately curated
surface; the nested pick costs one expression. This is a one-line decision at
draft time, not an architectural fork.
