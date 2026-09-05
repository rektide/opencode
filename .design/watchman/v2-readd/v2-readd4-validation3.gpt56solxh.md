---
type: EvidenceValidation
title: Watchman v2 re-add final research validation and design challenge brief
description: Cross-validation of safe-loss, platform, server-option, carrier, and directory-owner evidence; declares the research corpus sufficient for parallel Astra and GX design synthesis.
resource: /.design/watchman/v2-readd/v2-readd4-validation3.gpt56solxh.md
tags: [opencode, watchman, watchwoman, v2, validation, operations, design-gate]
status: draft
generated: { by: model:openai/gpt-5.6-sol-xhigh, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: validation0, resource: /.design/watchman/v2-readd/v2-readd4-validation0.gpt56solxh.md, title: Initial architecture evidence validation }
  - { id: validation1, resource: /.design/watchman/v2-readd/v2-readd4-validation1.gpt56solxh.md, title: Daemon and transport evidence validation }
  - { id: validation2, resource: /.design/watchman/v2-readd/v2-readd4-validation2.gpt56solxh.md, title: Path owner and release evidence validation }
  - { id: safe-loss, resource: /.design/watchman/v2-readd/v2-readd4-e16-safe-loss0.gpt56solxh.md, title: Reversible connection-loss apparatus }
  - { id: platforms, resource: /.design/watchman/v2-readd/v2-readd4-e17-platform0.gpt56solxh.md, title: Platform package and Bun evidence }
  - { id: options, resource: /.design/watchman/v2-readd/v2-readd4-e18-server-options0.gpt56solxh.md, title: Server option and generated-client ownership }
  - { id: carrier, resource: /.design/watchman/v2-readd/v2-readd4-e19-carrier-audit0.gpt56solxh.md, title: Dirty carrier disposition audit }
  - { id: directory-signal, resource: /.design/watchman/v2-readd/v2-readd4-owner-directory-signal0.gpt56solxh.md, title: Owner-visible directory signal }
---

# Watchman v2 re-add final research validation and design challenge brief

## Result

The research corpus is now sufficiently broad and deep for design synthesis.
Target identity, daemon protocol, transport behavior, Effect cancellation,
controller/circuit races, pressure, path and ignore semantics, row shapes,
create evidence, symlink topology, owner convergence, daemon release, safe loss,
platform support, startup/API plumbing, and dirty-carrier disposition all have
source-pinned or executable records with explicit limits.

No further research wave is required before the requested design challenge.
Remaining questions—supported-daemon policy, supported-platform policy,
transport disposition, permanent-failure behavior, topology/circuit semantics,
directory event representation, symlink coverage, and exact option shape—are
choices that the designers must make from the evidence, not factual gaps to
paper over with more broad investigation.

This validation does not itself select those choices, revise v4, rewrite the
execution prompt, or authorize production implementation.

## Final-wave findings

### Safe connection-loss evidence

1. A single client's private Unix relay can be FIN-closed without signaling the
   daemon or altering daemon-global root state. On both installed daemons the
   direct control client, unrelated root, and same-root control subscription
   continued receiving events while the relayed JS client observed `end`.
2. The selected JS transport canceled every current/queued callback before
   emitting `end`; no established-socket `error` was produced by the successful
   FIN apparatus. The same `Client` later reconnected through a replacement
   relay, confirming its nonterminal post-`end()` behavior.
3. Stock removed the disconnected unique subscription promptly. Deployed
   Watchwoman retained it until a matching result caused EPIPE and a subsequent
   tick allowed the push loop to observe closure; reusing the subscription name
   before that boundary risks duplicate delivery.
4. Terminating and restarting a retained private-daemon process is a valid
   incarnation-loss fixture but is never shared-daemon-safe: every control
   connection, root, and subscription disappears. Successor `watch-list` was
   empty on both daemons.
5. Stock correctly reported a cross-incarnation old clock as fresh. Watchwoman
   returned the complete successor snapshot while incorrectly reporting
   `is_fresh_instance:false`, reconfirming that its freshness bit is not a
   reliable incarnation signal.

### Platform, package, and exact-runtime evidence

1. The only end-to-end live-verified combination is Linux x86-64/glibc with
   deployed Watchwoman `a1e16cbf`, the exact ESM transport and BSER 3.0.0
   artifacts, and Bun 1.4.2; accepted records separately cover Node 26.6.0 and
   Bun 1.4.1 on the same host class.
2. Exact Bun 1.4.2 passes ESM import, Client construction, BSER round trip,
   binary override, and `WATCHMAN_SOCK` discovery against private Watchwoman.
   This closes the runtime-version residual but does not cure package protocol
   or lifecycle defects.
3. Bun 1.4.2 reproduces the parent-watch re-arm defect: close-before-rearm
   delivered 30/30, while leaving the stale watcher open delivered 0/30. The
   behavior is not confined to Bun 1.4.1.
4. Adjacent Watchwoman v0.7.0 CI/releases cover macOS and Linux, x86-64/arm64,
   and Linux glibc/musl. The exact deployed post-release pin has no equivalent
   public matrix or release artifacts and was live-tested only on Linux
   x86-64/glibc. Watchwoman has no Windows implementation or artifact.
5. Stock Watchman source targets Linux, macOS, and 64-bit Windows, but the exact
   inspected pin's platform checks failed and recent releases lacked the
   expected assets. Only the older installed Linux fallback was exercised.
6. The ESM packages are architecture-neutral JavaScript with no `os`/`cpu`
   restrictions, but they have no package-specific off-host CI and the
   transport tarball omits its declaration file. Metadata admission is not
   cross-platform conformance.
7. OpenCode `4306c07b` builds a broad Bun platform matrix but does not yet carry
   either ESM package; its green builds establish carrier capacity, not the
   proposed daemon path.

### Server option and generated-client boundary

1. Static selection can flow from CLI-owned environment decoding or a
   programmatic `ServerOptions.fs` value through Server route construction to
   the existing `Watcher.node.replace(Watcher.configured(...))` seam without
   entering Protocol, Server `HttpApi`, OpenAPI, or generated clients.
2. “Off wire” is not “private.” `ServerOptions` is an exported Server package
   type, and SDK create options inherit most of it; adding fields changes public
   programmatic TypeScript APIs even when HTTP remains unchanged.
3. No endpoint currently exposes watcher backend, binary, timeout, acquisition,
   or `ServerOptions` values. `/api/server` returns only URLs; `/api/config`
   exposes location Config, not host startup state.
4. Client generation is unnecessary for Core Native composition, Server startup
   fields, route-layer forwarding, CLI environment variables, or CLI-only flags.
   It becomes required when the public Protocol/Server `HttpApi` changes—for
   example, widening `/api/server` or making backend selection part of the
   public Config schema returned by `/api/config`.
5. Production startup accepts typed `ServerOptions` directly and does not decode
   the schema. Merely declaring numeric/string constraints does not validate
   environment strings or arbitrary JavaScript callers; a real owning decode
   boundary must be identified by the design.
6. The documented runtime dependency direction can remain intact: Core owns
   watcher behavior, Server maps host options into Core, Protocol remains
   independent, Client remains Schema/Protocol-only, and SDK composes them.

### Carrier disposition

1. The carrier contains no production Watchman backend. Validated daemon,
   transport, path, mapping, circuit, and release problems are therefore
   unresolved rather than accidentally shipped.
2. Committed W1 `620fc620` is independently reusable: its private Native
   invalidation signal and per-subscriber ordered readiness replay pass the
   named five-suite run, 64/64, and are the ordering prerequisite exercised by
   the Skill lifecycle evidence.
3. Uncommitted W2 has reusable individual Config, Agent, Command, Plugin Source,
   and test-layer hunks, but the slice is incomplete: Skill work is absent,
   Config end-to-end coverage is missing, and the named W2 run is 55 pass plus
   one timeout caused by the new Plugin Supervisor test's TestClock/assertion
   defects.
4. The actor's three self-tests pass, but it remains test infrastructure rather
   than a transport oracle. Its types and factory shape do not match the
   proposed seam, and it omits classifier stalls, locator/spawn behavior,
   physical joining, daemon retention, and post-end resource behavior.
5. Existing v4, dirty-v4, prompt0, and research journals are historical input,
   not accepted execution authority. Their useful source maps and exclusions
   must be separated from contradicted path, cookie, event, Skill, circuit, and
   release claims.
6. The carrier's 22 changed paths and all three diff hashes remained identical
   before and after the audit. Test-created `/tmp/opencode-core-test-GDRT7R/`
   and `/tmp/opencode-core-test-UbzDEI/` were reported and deliberately left
   untouched.

### Directory events and owner convergence

1. Current `Watcher.Update` is Parcel's type-agnostic `{path,type}` event, and
   Parcel publicly emits directory create, update, and delete rows. OpenCode
   forwards them without an entry-kind filter. The current contract cannot be
   described as file-only.
2. Config publishes every recursive update and requests reload. Agent and
   Command deliberately use directory-inclusive containment predicates—their
   source comments cite directory-level renames with no child paths. Skill and
   both Plugin Source paths likewise use any matching path as a broad rescan or
   activation trigger.
3. Deployed Watchwoman has reachable populated-subtree rename,
   rename-then-delete, empty replacement, ignored-boundary move, Skill, and
   configured-source cases where directory rows are the only immediate signal.
   Its tree updates exact notified paths and does not recursively synthesize
   missing child tombstones.
4. V4's unconditional pre-mapping `type === "d"` drop erases those signals.
   Agent/Command definitions, Skill sets, and plugin generations can then remain
   stale until another delivered matching file row, a meaningful Config update,
   periodic Plugin Supervisor activation, owner/backend rebuild, or daemon-root
   rebuild. Agent, Command, and Skill have no unconditional periodic repair.
5. LocationWatcher, VCS, review, and the app file tree are not downstream of
   recursive directory watches at this pin. Their event-type branches neither
   create this staleness nor repair it.
6. A baseline-plus-inode map can retain old-path ghosts and omit new children
   after Watchwoman directory-only operations. Owner rescans do not repair this
   backend-private state, and same-root rewatch/resubscribe does not force a
   Watchwoman recrawl; only later exact-path events or actual root rebuild
   reliably change those entries.

## Cross-report corrections and qualifications

| Statement | Validated qualification |
| --- | --- |
| E16's shared cleanup procedure says Watchwoman needs two matching ticks. | The procedure is safe as written, but E12 proves only the first tick must yield a matching result and attempt the failed write; the later tick may be any root tick because closure is checked before querying. |
| The relay FIN apparatus is “shared-daemon-safe.” | It does not disrupt controls or roots, but it still leaves deployed Watchwoman's test subscription retained until the two-stage tick boundary. Safety depends on unique test names/roots and explicit post-loss cleanup assertions. |
| Exact Bun 1.4.2 passes the package probes. | This proves runtime loading/discovery on one host, not correctness of the key-based response classifier, terminal `end()`, callback settlement on `error`, or locator ownership; E07/E12 remain controlling evidence. |
| Watchwoman supports six release targets. | That evidence belongs to adjacent v0.7.0. Exact deployed `a1e16cbf` is live-proven only on Linux x86-64/glibc and has no public artifact matrix. |
| E18's minimal option path is internal. | It is off-wire but expands exported Server and inherited SDK option types if implemented through `ServerOptions`. |
| E19 marks individual W2 owner hunks reusable as-is. | Their local mechanics are compatible, but the aggregate is not green or complete. O5 additionally requires the eventual backend to preserve a directory-level owner signal; W2 alone cannot provide it. |
| A new prior-state classifier would recover exact create/update events. | It can classify delivered same-path inode transitions, but Watchwoman directory omissions leave ghosts/missing descendants that owner rescans and same-root resubscription do not repair. |

## Research sufficiency by domain

| Domain | Evidence state entering design |
| --- | --- |
| Target identity and deployment | Exact deployed Watchwoman pin/process/binary known; installed stock fallback distinguished. |
| Wire protocol and expressions | Ack/PDU ordering, freshness, cancellation, unsubscribe, cookie, and expression differences source- and live-proven. |
| JS transport | Exact npm artifact tested under Node, Bun 1.4.1, and Bun 1.4.2; classifier and lifecycle failures reproduced. |
| Controller/circuit concurrency | V4 transition ownership audited; donor stale-completion/probe/backoff behavior executed under Effect rc.112. |
| Scale and daemon resources | Shared/distinct root pressure through 34 clients plus same-root construction race and queue behavior measured. |
| Paths and ignores | Successful plain-watch `D=C`, logical Parcel namespace, ignore algebra, lexical/canonical behavior, and containment facts established. |
| Event rows and identity | Exact row shapes, directory omissions, nonportable `new`, clocks, coalescing, and bounded inode inference established. |
| Symlink topology | Real recursive owners inventoried; direct sentinel, ancestor blindness, parent death, coalescing, and Bun re-arm defect measured. |
| Owner convergence | Config/Agent/Command/Plugin/Skill behavior traced; Skill gate tested; directory-only staleness and repair bounds executed. |
| Release and recovery | Raw-client survivors, daemon two-tick release, GC/root drop, slow-reader behavior, relay loss, and private restart measured. |
| Platforms and packaging | Layered exact/adjacent support matrix complete; unavailable-host compositions explicitly remain unknown. |
| Server/API perimeter | CLI/Server/Core/SDK flow, validation boundary, dependency direction, and code-generation triggers traced. |
| Carrier reuse | W1/W2/actor/docs inventoried per hunk/file with focused tests and preservation hashes. |

The unavailable macOS, Windows, arm64, and musl live compositions do not require
another pre-design wave: the evidence is sufficient to choose a conservative
support policy and explicit future verification obligations. Likewise, no
amount of further source reading can choose permanent-failure semantics or
whether stock Watchman is a formal product target; those require design and
eventual human acceptance.

## Decisions the parallel designers must resolve

Each first draft must make one coherent, implementable choice for every item
below and tie it to specific evidence rather than inheriting v4 defaults:

1. formal daemon and platform compatibility scope;
2. transport disposition—wrap, patch/fork, or replace—and physical ownership;
3. startup validation and permanent-failure behavior under the infallible
   Scope-free Native surface;
4. raw-client topology, acquisition bound, circuit mutation/freshness rules,
   backoff, and stale-result fencing;
5. controller generations, ack buffering, Watchwoman freshness mismatch,
   cancellation, reconnect, and absorbing release;
6. public `Watcher.Update` event semantics, especially directory signals and
   whether exact create/update classification is necessary at all;
7. L/C path publication and Parcel-compatible literal/glob filtering;
8. direct and ancestor symlink behavior, parent loss, and close-before-rearm;
9. Config, Agent, Command, Plugin Source, and Skill readiness/rescan ordering;
10. CLI/Server/Core/SDK option shape, runtime decode owner, off-wire/public-type
    consequences, and client-generation boundary;
11. W1/W2/actor material to retain, rewrite, or leave as evidence; and
12. deterministic, live, resource-release, platform, and carrier verification
    needed before implementation can be accepted.

The design may reject complexity that is not justified by current consumers,
but it must say which behavior is intentionally unsupported. It must distinguish
observed fact, selected policy, and future executable proof.

## Parallel first-draft protocol

Astra xhigh and GX receive this validation, validation0–2, every accepted report
in this corpus, both existing v4 candidate documents, the dirty-carrier audit,
and primary-source paths. They work in parallel and do not read one another's
first draft.

Each writes a new first draft under this directory as:

```text
v2-readd5-draft0.<actual-model-suffix>.md
```

Each draft must be a complete architecture, not a report summary or patch to an
older document. It must include decisions, module/API boundaries, state and
ownership transitions, event/path semantics, owner convergence, platform and
option surfaces, carrier disposition, implementation ordering, and verification
obligations. No agent edits production, existing designs, or the deferred
execution prompt, and neither commits.

## Cross-informed second-draft protocol

Only after both first drafts exist will each agent receive the other draft and
resume. Each writes a new file:

```text
v2-readd5-draft1.<actual-model-suffix>.md
```

The second draft must compare the two first drafts directly, identify common
ground and tensions, incorporate stronger ideas it accepts, explain important
rejections, and present its independently revised best design. First drafts are
never overwritten. The coordinator validates and commits all four records before
any accepted synthesis or prompt revision.

## Cross-references

- [`v2-readd4-validation2.gpt56solxh.md`](v2-readd4-validation2.gpt56solxh.md) — path/owner/release validation and final-wave assignments.
- [`v2-readd4-e16-safe-loss0.gpt56solxh.md`](v2-readd4-e16-safe-loss0.gpt56solxh.md) and [`v2-readd4-e12-daemon-session-release0.glm53max.md`](v2-readd4-e12-daemon-session-release0.glm53max.md) — client-isolated loss and daemon release boundaries.
- [`v2-readd4-e17-platform0.gpt56solxh.md`](v2-readd4-e17-platform0.gpt56solxh.md) — exact Bun 1.4.2 and layered platform evidence.
- [`v2-readd4-e18-server-options0.gpt56solxh.md`](v2-readd4-e18-server-options0.gpt56solxh.md) — startup, public-type, wire, dependency, and generator boundaries.
- [`v2-readd4-e19-carrier-audit0.gpt56solxh.md`](v2-readd4-e19-carrier-audit0.gpt56solxh.md) — tested per-hunk carrier disposition.
- [`v2-readd4-owner-directory-signal0.gpt56solxh.md`](v2-readd4-owner-directory-signal0.gpt56solxh.md) — directory-row contract and exact owner staleness consequences.
