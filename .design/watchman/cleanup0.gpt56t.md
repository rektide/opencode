---
type: Design
title: Watchman-native ownership and cleanup
description: Source-verified watchman subscription/watch ownership model, and the design it implies: daemon census instead of per-process ledger files.
status: draft
generated: { by: llm:gpt-5.6-terra, at: 2026-08-20 }
sources:
  - id: watchman-src
    resource: file:///home/rektide/a/facebook/watchman
  - id: ledger-impl
    resource: /packages/core/src/filesystem/watchman/ledger.ts
  - id: plugin-doc
    resource: file:///home/rektide/a/d/o/plugin.md
---

# Watchman-native ownership and cleanup (cleanup0)

## What's up

The per-process ledger files (landed 2026-08-20, `npyxpmkz`) were built to
answer "which watches are ours, who else wants them, when can we delete?"
without knowing watchman's own model. User pushback: too many files; want
real refcounting; acutely aware other watchman consumers exist; want
naming/client identity; afraid of deleting watches someone else still wants.
This wave reads the watchman source (`~/a/facebook/watchman`, 2026.07-line)
and finds that the daemon itself already maintains almost all of this truth.

Research prompt: *what does watchman natively know about who owns
subscriptions and watches, what does it expose to clients, how does it GC
abandoned watches itself, and what is the minimal opencode-side bookkeeping
that remains necessary?*

## Verified: the daemon's ownership model

All citations are the watchman source checkout unless noted.

1. **Subscriptions are connection-scoped and die with the connection.**
   `ClientSubscription` holds a `weak_ptr<Client>`
   (`cmds/subscribe.cpp:26-44`); the map lives on the client
   (`subscribe.cpp:601`, `client->subscriptions[sub->name]`); `~UserClient`
   clears it (`Client.cpp:259-263`). `unsubscribe` resolves *only the calling
   client's* map (`subscribe.cpp:450-471` → `UserClient::unsubByName`) —
   you cannot unsubscribe another client's subscription, ever.

2. **The daemon knows client identity via SO_PEERCRED.** Every subscription
   registers debug info including the peer pid
   (`subscribe.cpp:497-501` `getPeerProcessID`, `subscribe.cpp:575-598`
   `info_json = {name, client, stm, is_owner, pid, query}`). This is
   kernel-truth liveness of a live socket — no pid-probing, no pid-reuse
   hazard.

3. **The census is queryable.** `debug-get-subscriptions <root>`
   (`cmds/debug.cpp:219-241`) enumerates every live subscription on a root
   across all clients — `{name, client_id, last_responses}` plus the
   publisher subscriber info with `pid`. `debug-root-status <root>`
   (`Root.h:167-190` `RootDebugStatus`) adds `queries: RootQueryInfo[]`
   where each entry carries `client_pid`, `state`, `subscription_name`
   (`Root.h:138-149`). Both are owner-only (no `CMD_ALLOW_ANY_USER`) — same
   user as the daemon here, fine. They are debug commands: capability-gate
   or degrade, don't depend.

4. **Watches are global, unowned, and `watch-del` is unconditional**
   (`cmds/watch.cpp:103-119`). No per-client refcount of watches exists
   anywhere in the daemon. The user's fear is exactly right: a blind
   `watch-del` yanks the watch for every client.

5. **The daemon self-GCs watches** (`root/reap.cpp:18-44`): a root with no
   triggers, **no subscriptions** (`!unilateralResponses->hasSubscribers()`),
   and no command activity for `idle_reap_age` is cancelled. Default
   `kDefaultReapAge = 86400 * 5` — **5 days** (`root/init.cpp:22`), settable
   per-project via `idle_reap_age_seconds` in `.watchmanconfig`, `0`
   disables. Any query against a root resets its idle clock.

6. **Watches persist across daemon restarts** via the state file
   (`website/docs/cmd/watch-del.md` — deleting removes it from the state
   file so restart won't re-establish; by implication saved otherwise).
   Consequence for the restart scenario: after a daemon restart the
   watch-list comes back, our adopted-set rebuilds, subscriptions
   re-establish with cursors (fresh-instance → blanket update). The
   unbounded-retry work stands unchanged.

So the layered truth table for "can we delete this root?":

| Signal | Source | Trust |
| --- | --- | --- |
| our subscriptions on it | in-process RootBook | exact |
| foreign subscriptions on it | `debug-get-subscriptions` census | exact, live |
| recent foreign queries | `debug-root-status` | advisory |
| minted by us vs pre-existing | adopted-snapshot per connection | exact at connect |
| abandoned by everyone | daemon `considerReap` | 5-day clock |

## What this invalidates

The per-process ledger files (`ledger.ts` claim files, `pidAlive` probing,
`planSweep` file-GC, claim migration) re-implement — worse — what
subscriptions already are: **our subscriptions ARE our claim ticket**,
maintained by the daemon, dying automatically when we die. Every live
opencode process's interest in a root is visible in the census with a pid.
The files should go.

What survives, unchanged in spirit: the in-process `RootBook` refcount +
grace delay (that's the "knowing who has requested the watch" refcounting,
within a process), the adopted-never-delete rule, the unbounded retry, the
notify knob.

## Proposed design

1. **Delete the ledger directory machinery entirely.** No per-process files,
   no pid probing, no cross-process claim migration, no stale-file sweeps.
2. **Deletion gate** for a minted root whose refcount hit zero (after
   grace): run `debug-get-subscriptions <root>`. If any live subscriber has
   a pid ≠ ours → skip deletion, log (a foreign client is streaming; the
   daemon's idle reaper handles the rest when they leave). If the census
   errors or the debug command is unavailable → **do not delete** (older
   daemon, permission boundary); rely on daemon GC. Conservative default:
   failing open = keep the watch.
3. **Naming stays** `opencode-<gen>-<id>`; optionally embed the pid
   (`opencode-<pid>-<gen>-<id>`) so humans reading the census see ownership
   at a glance. The pid in the census is authoritative regardless.
4. **Orphan residue**: accept the daemon's 5-day idle GC — see the scoped
   analysis below.

## Orphan residue: scoped down

"Orphans" are roots minted by a now-dead opencode process. Dead processes
have no connection, hence no subscriptions — subscriptions self-clean
perfectly, and the census reflects that. What lingers is only the **watch**
itself: connection-independent, holding the root's kernel watches and view
until the daemon's `considerReap` cancels it (5-day default idle clock; any
command touching the root resets it).

Scope:

- **Graceful shutdown is not an orphan case.** A cleanly exiting process
  deletes its minted roots through the normal gate (refcount → 0 → grace →
  census empty → `watch-del`). Orphans are **crash residue** only: SIGKILL,
  power loss, or dying while the daemon was unreachable.
- The residue is bounded (daemon GC), self-healing, and costs one idle
  root's kernel watches on a machine that already voluntarily holds ~320
  roots from editors.
- The alternative — one shared `watchman-minted.json` in the opencode data
  dir (append on mint; sweep `watch-list` ∩ file, delete census-empty
  entries, prune) — is permanent write-on-every-mint machinery covering a
  rare, small, already-expiring case.

**Recommendation: accept daemon GC now; add the shared file later only if
crash residue visibly accumulates in `watch-list`.**

## Open decisions

1. **Census availability**: capability-probe `debug-get-subscriptions` at
   connect and disable proactive deletion for the process when missing, vs
   attempting per-deletion and swallowing errors. Lean per-deletion +
   swallow: fewer states.
3. **Query-activity veto**: before deleting a census-empty minted root,
   also consult `debug-root-status` and skip if a *recent foreign query*
   exists (query-only users, e.g. `watchman-wait` one-shots). This is
   advisory and racy; probably skip — a query-only user already tolerates
   daemon restarts and re-`watch-project`s on demand.

## Cross-references

- [`README.md`](/README.md) — the maintenance log; "Root cleanup
  (2026-08-20)" section describes the ledger design this wave proposes to
  replace.
- [`init0.glm52.md`](/init0.glm52.md) — "Reconnection is our job" and the
  `watch-del` is-global findings that started the ownership question.
- `~/a/d/o/plugin.md` — checked for the plugin storage system: `context.storage.store`
  is TUI-plugin-context only (`context.ts:29-51`); server-side opencode
  storage is the session-domain SQLite DB (`~/a/d/o/store.md`). Neither fits
  core-owned watch metadata — the seam keeps this in
  `packages/core/src/filesystem/watchman/`.
- Watchman source: `cmds/subscribe.cpp`, `cmds/watch.cpp`, `cmds/debug.cpp`,
  `root/reap.cpp`, `root/init.cpp`, `root/Root.h`, `Client.cpp`, `PubSub.h`.
