---
type: Prompt
title: Execute the Watchman v2 re-add as one continuous architecture
description: Handoff prompt for resolving the remaining architecture decisions and carrying one final Watchman implementation through live delivery without spikes, rewrites, or test-only milestones.
resource: /.design/watchman/v2-readd/v2-readd4-prompt0.gpt56solxh.md
tags: [opencode, watchman, v2, prompt, implementation, handoff]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - id: architecture
    resource: /.design/watchman/v2-readd/v2-readd4.gpt56solxh.md
    title: Watchman v2 re-add architecture and evidence brief
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
  - id: prior-plan
    resource: /.design/watchman/v2-readd/v2-readd3.gpt56solxh.md
    title: Watchman v2 carry-first build work plan
    author: model:openai/gpt-5.6-sol-xhigh
    last_modified: 2026-09-05
---

# Execute the Watchman v2 re-add as one continuous architecture

Use this document as the prompt for the next session.

## Mission

Deliver the final opt-in Watchman directory backend on current OpenCode v2.
Do not build a spike, temporary backend, or first implementation intended to be
replaced. The first production Watchman modules must have the final module
boundaries from
[`v2-readd4`](/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md); later work
completes those same modules with recovery, topology, and operational behavior.

The goal is not to complete W1, W2, or a collection of tests. The goal is:

> Selecting Watchman gives OpenCode recursive directory observation through the
> intended daemon, survives connection loss with authoritative owner
> convergence, filters and maps paths correctly, bounds daemon acquisition, and
> releases without leaked work. Node still handles file and entries watches;
> Parcel remains the default.

Do not report test counts or internal plumbing as product completion.

## Workspaces and authority

- **Active carrier:** `/home/rektide/src/opencode-watchman-v2-readd`
- **Design corpus and agent journals:** `/home/rektide/src/opencode-watchman-old`
- **Carrier base:** upstream v2 `4306c07b340b9a0504e65785f366d2793cd1b169`
- **Architecture and evidence index:**
  `/home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md`
- **Earlier plan:** `v2-readd3.gpt56solxh.md`; use it as lineage, not as an
  unquestioned execution script.

Current source and primary protocol evidence outrank every plan or journal.
Read `v2-readd4` first. Do not ingest the full historical Watchman corpus unless
a specific unresolved claim requires one cited source.

## Starting state

The carrier has one small committed generic change, `620fc620`: Native can send
a private invalidation signal that reruns subscribers' `onReady` effects before
later exact updates. It is prerequisite plumbing, not a delivered feature.

The working copy currently contains:

- an incomplete W2 owner-convergence experiment with known broken/missing tests;
- a deterministic Watchman actor and actor tests reported green by its SX
  author; and
- no production Watchman backend.

Treat live `jj status` and `jj diff --git` as authoritative. Before editing:

1. inventory every working-copy hunk;
2. preserve the existing diff as an evidence patch under the old repo's
   `.test-agent/watchman-v2-readd/` directory;
3. retain the actor only if it matches the final production `RawClient` seam;
4. remove or rewrite broken W2 work rather than committing it wholesale; and
5. do not disturb unrelated user work.

Do not call the carrier clean or green until you have checked it yourself.

## Operating rules

1. **One architecture, one implementation.** Do not implement a simplified
   Watchman backend and later restart with a resilient one.
2. **No test-only milestones.** A fixture or test belongs with the production
   capability it proves. The existing actor becomes valuable only when it drives
   the real protocol/controller seam.
3. **No broad design waves.** Resolve only questions that can change the
   architecture in `v2-readd4`.
4. **One active subagent at most.** Do not create parallel research or
   implementation swarms.
5. **Model routing:** use SX only for factor-5 concurrency/architecture asks;
   use GX for every narrower evidence ask. Do not use F for design or preflight.
6. **Subagents investigate; the primary session integrates.** Unless explicitly
   told otherwise, subagents do not edit production code or commit.
7. **Agent records live only in the old repo.** Write concise append-only
   evidence under `.test-agent/watchman-v2-readd/evidence/`; do not put agent
   journals in the active carrier.
8. **Every evidence ask must terminate in a decision.** Ask one question,
   cite primary evidence, state the answer and confidence, identify the exact
   v4 paragraph affected, and stop. No adjacent redesign.
9. **Do not push.** Commit coherent carrier changes locally with explicit paths.
10. Run Core tests and `bun typecheck` from `packages/core`, never repository
    root.

## Architecture closure

Before production Watchman code, close the factor-5 design gates from v4:

- E03: subscribe acknowledgement/PDU/fresh-instance/cancellation semantics;
- E04: controller and generation interleavings;
- E05: permanent failure behavior under Native's current boundary;
- E11: acquisition circuit and per-root connection topology; and
- E12: scope, release, shutdown, and command-admission ownership.

Do this as one bounded SX review of the concrete v4 state machine, not five
open-ended essays. The review must return:

1. one transition table;
2. one resource-ownership table;
3. one failure-disposition table;
4. explicit decisions for all five evidence IDs; and
5. exact amendments needed in v4.

Use GX only for a missing protocol fact the SX review names. Incorporate the
answers into `v2-readd4`; do not create another competing architecture document.
Ask the user only when the remaining choice is a real product policy, especially
permanent failure behavior, rather than something source evidence can answer.

Once those gates close, freeze the architecture. Later implementation findings
may correct factual details, but they must not trigger a second backend design
unless a demonstrated contradiction makes the accepted architecture impossible.

## Continuous implementation arc

The following are review and commit boundaries in one implementation. They are
not prototypes and they do not replace one another.

### Arc 1 — establish the final Watchman path end to end

Create the final modules:

```text
packages/core/src/filesystem/watcher/watchman/
  schema.ts
  client.ts
  acquisition.ts
  directory.ts
  backend.ts
```

Implement their accepted interfaces immediately, even where later arcs fill in
additional transitions. Do not create temporary module names or an alternate
happy-path controller.

This arc includes:

- transport dependency and typed schemas;
- validated raw-client factory and generation command admission;
- listener registration before commands;
- exact `version → watch → clock → subscribe` transcript;
- fresh clock and generation-stamped subscription name;
- daemon/canonical/logical root mapping and containment;
- directory-row and cookie suppression;
- exact create/update/delete publication;
- backend composite that always delegates `file` and `entries` to Node;
- static options and lazy selection so the feature can actually be run; and
- the deterministic actor driving the real production seam.

Then run the selected backend against the named intended daemon and demonstrate
live create/update/delete. Do not stop at actor tests. Do not call this arc done
if Watchman cannot be selected and exercised through OpenCode.

The production modules from this arc remain the production modules for every
later arc.

### Arc 2 — complete the same controller's recovery semantics

Extend—not replace—the Arc 1 generation/controller:

- socket error/end coalescing;
- submitted-command timeout;
- cancellation and fresh-instance behavior chosen during architecture closure;
- replacement through the same fresh attach operation;
- buffering around acknowledgement;
- invalidation before exact recovery delivery;
- target/generation fencing for late callbacks and PDUs; and
- final release from every held state.

Force live connection loss and demonstrate that the same selected backend
reattaches from a fresh clock without falling back or fabricating a path update.

### Arc 3 — connect recovery to authoritative owners

Only now finish owner convergence, because a real controller can invoke it.

- Config emits its own invalidation and requests its existing reload.
- Agent, Command, and Plugin Source bypass exact path predicates for that
  invalidation.
- Direct configured-plugin watches notify their existing activation queue.
- Skill suppresses initial readiness publication but refreshes on later
  invalidation without looping.
- `ConfigDiscovery`, `ConfigWatch.plan`, and owner topology remain upstream's.

Demonstrate recovery through owner state, not merely callback counts:

- change Config/Agent/Command/Plugin/Skill state while delivery is unavailable;
- reattach;
- observe authoritative state converge without relying on an exact missed file
  event; and
- prove Skill reload activity settles rather than cycling.

### Arc 4 — complete production topology and outage control

Complete the same backend with:

- shared bounded acquisition and the accepted circuit transitions;
- root-local watch/subscription/decode failure;
- symlink sentinel, retarget, deletion, and recreation behavior;
- full literal and micromatch glob semantics;
- ancestor daemon-root negative filtering;
- interruption and shutdown cleanup; and
- structured diagnostics.

Measure exact roots and connections on a representative OpenCode session. The
measurement validates the accepted per-root design; it does not introduce
project-root consolidation into this feature.

### Arc 5 — prove and document the delivered feature

Run the complete deterministic matrix and the intended-daemon live matrix from
v4. Record exact daemon identity and command behavior. Audit the carrier diff
for forbidden donor mechanisms and unexplained files.

Document:

- backend selection;
- binary/socket discovery;
- command timeout and acquisition limit;
- availability and retry semantics;
- exact-root cost;
- diagnostic logs; and
- the named daemon revisions actually tested.

## Value gates

Progress is stated only in these terms:

| Gate | Product evidence |
| --- | --- |
| **Selectable** | OpenCode can select Watchman while Parcel remains default and Node retains file/entries. |
| **Observing** | Intended daemon delivers live recursive create/update/delete through production code. |
| **Recovering** | Forced loss causes fresh attachment and private invalidation before exact delivery. |
| **Converging** | Config and Skill reach correct state after events were unavailable. |
| **Isolated** | Ancestor/sibling noise, directories, cookies, and ignores do not become file updates. |
| **Bounded** | Multi-root outage respects admission/circuit limits and root-local failures. |
| **Released** | No client, route, sentinel, waiter, timer, or retry survives final demand. |
| **Operable** | Options, logs, docs, live identity, and audit are complete. |

Tests are evidence for these gates. A passing test count, actor, mock, helper,
interface, or generic watcher change is never itself a value gate.

## Non-negotiable exclusions

Do not introduce:

- `watch-project`;
- `watch-del` or automatic pruning;
- `relative_root` routing;
- cursor persistence or compatibility branches;
- synthetic file updates;
- Watchman-to-Parcel fallback;
- project-root hints, placement metadata, or `WatchInterests`;
- custom metrics infrastructure;
- VCS observation scope; or
- owner/planner rewrites.

## Verification discipline

- Prefer named barriers and `TestClock`; do not use fixed sleeps when a state is
  observable.
- Test production modules, not duplicated test logic.
- Keep one exact `llm`-irrelevant principle here: do not count tests as product
  progress; tie every new test to a value gate and invariant in v4.
- Run focused checks after the capability they prove, package typechecks before
  each commit, and the full affected suites before the final audit.
- Live behavior on the intended daemon is mandatory. A structurally complete
  fake protocol is not a substitute.

## Completion condition

Do not end the session merely because architecture was discussed, a fixture was
built, W1/W2 tests passed, or a happy-path mock succeeded. Continue until either:

1. all eight value gates are demonstrated and the feature branch is ready for
   human review; or
2. one concrete external blocker prevents continuation, in which case report
   the exact missing input, command, observed failure, preserved working state,
   and the single decision or resource needed from the user.

The implementation should grow continuously from one accepted architecture.
There is no planned restart after the first live Watchman event.
