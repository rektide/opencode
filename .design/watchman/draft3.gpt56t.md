---
type: Design
title: Minimal Watchman resilience pass
description: Hardens the existing retained Watchman backend against observed timeout cascades and synchronization-cookie rescans without changing its architecture.
resource: /.design/watchman/draft3.gpt56t.md
tags: [opencode, watchman, filesystem, resilience, timeouts]
status: draft
generated: { by: model:gpt-5.6-terra, at: 2026-08-30T14:35:35-04:00 }
stale_after: 2026-10-30
sources:
  - id: maintenance-log
    resource: /.design/watchman/README.md
  - id: timeout-review
    resource: /.design/watchman/timeout0.gpt56s.md
  - id: retained-recommendation
    resource: /.design/watchman/rec0.gpt56s.md
  - id: rejected-replacement
    resource: /.design/watchman/draft2.gpt56t.md
  - id: value-reassessment
    resource: /.design/watchman/reassess0.gpt56s.md
  - id: local-log
    resource: file:///home/rektide/.local/share/opencode/log/opencode-local.log
---

# Minimal Watchman resilience pass

## Decision

Keep the current Watchman architecture and make it slightly harder to knock
over. Do not replace the process-global manager, introduce source-owned watch
plans, split connections by root, or rebuild the feature stack.

The design objective is:

> Normal cold-root latency and a completed error for one path must not retire a
> healthy Watchman connection or force unrelated interests onto Parcel.

This is a narrow reliability repair for the existing opt-in backend. It is not
a redesign, a proof that Watchman should become the default, or a solution to
the separate model-readiness investigation.

## Concrete Problems

| Problem | Evidence | Small response |
| --- | --- | --- |
| The ten-second Watchman deadline is too close to normal cold-root work | One observed crawl took 9.46 seconds and its `watch` response took 9.55 seconds | Raise the bounded deadline to 30 seconds |
| Every caller's deadline starts while it waits in the transport's hidden FIFO | One slow command can make queued commands expire without having run | Put one permit before the transport and start the deadline after admission |
| Any establishment error retires the shared generation | An `enforce_root_files` rejection for one path canceled healthy sibling acquisitions | Stop blanket retirement after completed command errors |
| Parcel can observe Watchman synchronization cookies | Cookie events triggered repeated full Skill rescans after fallback | Drop exact cookie-shaped events at the Skill boundary |
| Parcel directory acquisition has also reached its ten-second limit under load | A timed-out Parcel acquisition leaves the interest unwatched | Raise the existing generic subscription deadline to 30 seconds |

These are the observed pitfalls this pass addresses. The root-scoped proposal in
[`draft2.gpt56t.md`](draft2.gpt56t.md) solves a much larger hypothetical problem:
complete failure-domain isolation between roots. Current evidence does not
justify paying for that architecture.

## Changes

### 1. Use a forgiving acquisition deadline

Change both existing ten-second acquisition limits to 30 seconds:

- `COMMAND_TIMEOUT` in
  [`client.ts`](/packages/core/src/filesystem/watchman/client.ts) for an active
  Watchman command or capability check;
- `SUBSCRIBE_TIMEOUT_MS` in
  [`watcher.ts`](/packages/core/src/filesystem/watcher.ts) for Parcel directory
  acquisition.

Thirty seconds is more than three times the observed 9.55-second cold-root
response while still bounding a genuinely stuck operation. Keep these internal
constants. Do not add configuration, stage-specific budgets, or a timeout
policy module.

Increasing the Watchman deadline alone is insufficient because queued callers
would still consume it before dispatch. The next change makes the increased
budget mean what its name implies.

### 2. Admit one Watchman command at a time

Add one `Semaphore` permit to the existing `Generation`. Wrap
`Manager.command` with that permit:

1. Wait for the permit without a separate admission deadline.
2. After admission, fail without submission if the generation is already
   closed.
3. Submit exactly one command to the raw client.
4. Start the 30-second response deadline.
5. Release the permit when the callback, timeout, or interruption completes.

The transport already serializes commands. This change merely makes that fact
visible to OpenCode so time spent behind another command is not mislabeled as
execution time. It leaves the transport's hidden FIFO empty except for the
active command.

If an active command really exceeds 30 seconds, retain the current behavior:
retire that generation. Watchman's FIFO protocol has no request IDs or
per-command cancellation, so the response position is unknown after a local
timeout.

Do not add an admission timeout. Each admitted holder is bounded and waiting
callers remain interruptible, but a caller can still wait behind several valid
commands. Add another policy only if later evidence shows that queue wait itself
is harmful.

### 3. Do not retire on every establishment error

Remove the blanket `Effect.tapError(...manager.retire...)` around `establish` in
[`native.ts`](/packages/core/src/filesystem/watchman/native.ts).

Keep the existing explicit retirement paths:

| Condition | Action |
| --- | --- |
| Socket `error` or `end` | Retire the generation |
| Capability check failure before publication | Close the candidate generation |
| Active command response timeout | Retire the generation |
| Subscription-canceled PDU | Preserve the current generation restart behavior |
| Completed daemon error response | Fail only that operation; keep the generation |
| Decoded response does not match the expected schema | Fail only that operation; keep the generation |
| Generation closed before command admission | Fail without submitting to the raw client |

A completed daemon response has consumed the expected FIFO position. It may say
that one root is forbidden or one request is invalid, but it does not imply
that the socket is desynchronized. During initial acquisition, the existing
catch boundary falls back only that interest to Parcel. Existing acknowledged
subscriptions keep their current reconnect behavior.

This does not require a new error hierarchy. The code already knows where
socket closure, capability failure, and active timeout occur. Removing one
over-broad retirement hook is enough.

### 4. Ignore Watchman cookies before Skill refresh

In `ConfigSkillPlugin.watch`, filter updates before publishing into the sliding
`changes` queue. Ignore an update only when `path.basename(update.path)` matches
the complete Watchman cookie shape:

```regex
^\.watchman-cookie-.+-\d+-\d+$
```

Keep this rule in the Skill consumer, not generic `Watcher` behavior and not a
Watchman expression. The observed events came through Parcel after a Watchman
fallback, and a synchronization artifact cannot add, remove, or modify a Skill.

Do not broaden the rule to all dotfiles, `.watchmanconfig`, or arbitrary files
outside `SKILL.md`. Missing ancestors, directory changes, and symlinks still
matter to Skill discovery.

## Resulting Failure Semantics

| Event | Result |
| --- | --- |
| Cold root completes within 30 seconds | It succeeds; queued interests wait with their full response budgets intact |
| One root is rejected by daemon policy | That initial interest uses Parcel; siblings keep using the same generation |
| Watchman is unavailable during initial connection | Existing immediate failure and Parcel fallback remain |
| Active command does not respond for 30 seconds | The generation closes; acknowledged subscriptions reconnect as they do today |
| Initial acquisitions were waiting on a generation that closes | They may fall back to Parcel; this pass does not add collateral retry |
| Daemon restarts after subscriptions acknowledge | Existing unbounded reconnect and cursor resume remain |
| Parcel observes a Watchman cookie in a Skill tree | The event is ignored before it can evict a real pending change or trigger a rescan |

## Accepted Limitations

This pass deliberately leaves a few blunt edges:

- One truly slow active command still delays all other roots on the shared
  process connection. It no longer consumes their response deadlines.
- One truly stuck command still closes the shared generation after 30 seconds.
- Initial interests waiting on that failed generation can still choose Parcel
  rather than retrying on a replacement generation.
- A subscription-canceled PDU still restarts the generation rather than only
  that subscription.
- Timeout and retirement logs remain basic.

These are reasonable follow-ups only if they remain visible after the small
repair. Root-scoped sockets, typed collateral-retry errors, stage-specific
deadlines, and subscription-local cancellation recovery should not be built in
anticipation of evidence.

## Unchanged

- One process-global manager and one active Watchman generation.
- Generation-local route coalescing.
- Project and exact routing hints.
- One Watchman subscription per retained logical interest.
- Fifteen-minute `RcMap` retention.
- Parcel fallback before initial Watchman acknowledgement.
- Cursor resume and conservative invalidation after acknowledgement.
- Unbounded reconnect with capped backoff.
- Subscription-level unsubscribe and no `watch-del`.
- Existing backend and warning configuration.
- Watchman remains opt-in.

## Verification

Add three focused regression groups:

1. A slow active command does not consume a waiting command's response budget;
   a command admitted after generation closure is never submitted.
2. A completed route-policy error falls back one interest without retiring the
   generation, and a sibling interest succeeds on that generation.
3. A cookie-shaped update causes no Skill reload while an ordinary Skill update
   retains the existing behavior.

Use an injected scripted raw client and Effect's test clock for deadline tests.
The timeout and client-factory seams remain internal and are not configuration.
Run the existing routing, cursor, daemon-restart, fallback, interruption, and
no-`watch-del` tests unchanged.

One live check is sufficient: acquire the previously observed cold root plus a
few sibling roots. Confirm that the cold command may run beyond ten seconds,
siblings subsequently subscribe on the same generation, and cookie activity
does not produce `skills rescanned` entries.

## Carrier

Do not recut the architecture or rewrite the historical feature stack. Land the
repair as two reviewable code changes above the current line:

1. `fix(core): harden watcher acquisition`
   - 30-second internal deadlines;
   - one command-admission permit;
   - closed-generation check;
   - removal of blanket establishment retirement;
   - focused Watchman and Parcel acquisition tests.
2. `fix(core): ignore Watchman skill cookies`
   - narrow Skill-boundary filter and regression test.

Keep this design update separate from the runtime changes.

## Cross-References

- [`timeout0.gpt56s.md`](timeout0.gpt56s.md) contains the incident evidence and
  protocol analysis behind timeout-after-admission and path-local errors.
- [`rec0.gpt56s.md`](rec0.gpt56s.md) provides the broader resilience backlog;
  this draft intentionally selects only its smallest high-confidence subset.
- [`reassess0.gpt56s.md`](reassess0.gpt56s.md) separately argues that the custom
  backend has not earned a place in the accepted patch stack. This draft does
  not dispute that value gate; it defines the minimal repair if the backend is
  retained for use or further testing.
- [`README.md`](README.md) records the implemented backend, settled retention,
  reconnect, fallback, and no-`watch-del` behavior preserved here.
- [`draft2.gpt56t.md`](draft2.gpt56t.md) is the rejected root-scoped replacement;
  it remains useful only if shared-connection isolation becomes a measured
  requirement.
