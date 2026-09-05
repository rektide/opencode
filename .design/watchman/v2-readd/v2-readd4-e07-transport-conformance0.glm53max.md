---
type: Evidence
title: "N1 / E07+E15: @superbfowle/fb-watchman-esm@3.0.0 transport conformance under the carrier Bun runtime, Watchwoman command-response classifier coverage, and actor fidelity"
description: Scratch-package import/runtime matrix, binary/socket precedence, complete Watchwoman response-surface classification, controlled error/end/post-end observations, and the scripted actor's structural and behavioral match; research only.
resource: file:///home/rektide/src/opencode-watchman-old/.design/watchman/v2-readd/v2-readd4-e07-transport-conformance0.glm53max.md
tags: [watchman, watchwoman, e07, e15, transport, fb-watchman-esm, bun, evidence]
status: draft
generated: { by: agent:glm53max, at: 2026-09-05 }
verified: { by: none, at: never }
stale_after: 2026-12-05
sources:
  - id: watchman-esm
    resource: file:///home/rektide/src/watchman-esm
    title: "@superbfowle/fb-watchman-esm JS client fork (workspace)"
    revision: jj kqrmnntsqmlm / commit 8ed9bbf44fec, content parent 3a463955acf6; npm dist 3.0.0 index.js sha256-equal to workspace
  - id: npm-dist
    resource: https://registry.npmjs.org/@superbfowle/fb-watchman-esm/-/fb-watchman-esm-3.0.0.tgz
    title: published npm artifact used for all experiments
  - id: watchwoman
    resource: file:///home/rektide/a/radiosilence/watchwoman
    title: radiosilence/watchwoman checkout (deployed source)
    revision: a1e16cbf35b6bb1e4b429af53d65e738f955c32b
  - id: stock-watchman
    resource: file:///home/rektide/a/facebook/watchman
    title: facebook/watchman checkout (stock source, log/get-log shapes only)
    revision: 923b0935155590be54c0fc052fdca0201f8ebc4b
  - id: opencode-carrier
    resource: file:///home/rektide/a/a/opencode
    title: carrier runtime pins (v2@origin)
    revision: 4306c07b340b9a0504e65785f366d2793cd1b169
  - id: carrier-actor
    resource: file:///home/rektide/src/opencode-watchman-v2-readd/packages/core/test/filesystem
    title: uncommitted W2 actor fixture + self-tests (working copy e77301b4, parent W1 620fc620)
  - id: private-daemon
    resource: unix:///home/rektide/tmp-opencode/v4-n1-transport/daemon/sock
    title: scratch private Watchwoman daemon (auto-spawned, shut down after runs; live systemd daemon untouched)
    revision: binary /usr/local/bin/watchwoman @ a1e16cbf
---

# N1 — E07 transport conformance + E15 actor fidelity

Research only. No architecture selection, no production edits, no commits. All
experiments ran in `/home/rektide/tmp-opencode/v4-n1-transport/` against a
private Watchwoman daemon; the active systemd service and its socket were never
modified (verified `active` before and after; socket mtime unchanged).

## One-sentence answer

The exact published package imports, installs, and runs identically under the
carrier's Bun (1.4.1 host; 1.4.2 carrier pin) and Node 26.6.0 against the
deployed Watchwoman a1e16cbf over BSER v1 — but the fork's key-presence
classifier misroutes two command responses on the full deployed surface
(`unsubscribe`, whose ack carries a top-level `subscription` key, and `get-log`,
whose response carries a top-level `log` key — the latter also misrouted against
stock Watchman), both stalls head-of-line-blocking every later command, while
end/error/post-end semantics (unsettled callbacks on socket error and spawn
failure, synchronous cancel on local `end()`, reconnection after `end()`, and a
leaked live socket when `end()` races discovery) all reproduce deterministically
— and the scripted actor passes its three self-tests and matches the transport
on FIFO, cancellation-string, and event-order semantics but is not structurally
type-compatible (closed event union on `on`; zero-argument `RawClientFactory`
vs v4's binary argument) and does not model discovery, spawn failure, or
post-`end()` reconnection.

## Source/version/environment matrix

| Source | Path | Pin | Role |
| --- | --- | --- | --- |
| JS transport (npm dist) | `node_modules/@superbfowle/fb-watchman-esm` in scratch | `3.0.0`; `index.js` sha256 `4221933d…751a` == workspace | import/runtime matrix target |
| JS transport (workspace) | `/home/rektide/src/watchman-esm/watchman/node` | jj `kqrmnntsqmlm` (8ed9bbf44fec), content `3a463955acf6` | declarations (`index.d.ts`) absent from npm dist |
| BSER codec | `@superbfowle/bser-esm` | `3.0.0` (dep `^3.0.0`); sha256-equal | round-trip suite |
| Deployed daemon source | `/home/rektide/a/radiosilence/watchwoman` | `a1e16cbf…c32b` | command-response enumeration |
| Stock daemon source | `/home/rektide/a/facebook/watchman` | `923b0935…bc4b` | `log`/`get-log` ack shapes |
| Carrier | `/home/rektide/a/a/opencode` | `v2@origin` `4306c07b…b169`, `packageManager: bun@1.4.2` | runtime pin |
| Actor (uncommitted W2) | `packages/core/test/filesystem/fixture/watchman/client.ts` + `watchman-actor.test.ts` | working copy `e77301b4` | E15 target |
| Runtimes | host | bun 1.4.1 (mise), node v26.6.0 | matrix |
| Private daemon | scratch sock, `--sockname` under tmp | pid observed per run; shut down cleanly | live traffic |

## Package facts (E07)

- `@superbfowle/fb-watchman-esm@3.0.0`: `"type": "module"`, `exports {".": "./index.js", "./package.json"}`, `main index.js`, `engines.node >=20.19`, sole dependency `@superbfowle/bser-esm@^3.0.0` (same engine floor). No `bin`, no install scripts, no postinstall — installs are side-effect-free.
- **The published tarball omits `index.d.ts`** (contents: `README.md`, `index.js`, `package.json`) even though `package.json` declares `"types": "./index.d.ts"` and lists it in `files`. npm/bun consumers get TS7016 implicit-`any` (observed with tsgo). The vendored d.ts exists only in the repo at `watchman/node/index.d.ts` (vendored from `@types/fb-watchman@2.0.6` at content commit `3a463955`). The published `index.js` is byte-identical to the repo file.
- bun 1.4.1 installs without engine complaint; node v26.6.0 satisfies the floor. The carrier pins `bun@1.4.2` (`packageManager`); the host's 1.4.1 is the closest available executor.

## Import / constructor / runtime matrix (E07)

All probes: `/home/rektide/tmp-opencode/v4-n1-transport/pkg/01-import-ctor.mjs`, run under `bun 1.4.1` and `node v26.6.0`, both exit 0 with identical results.

| Check | bun 1.4.1 | node 26.6.0 | Source |
| --- | --- | --- | --- |
| ESM named import `Client` | PASS | PASS | `index.js:393` |
| `new Client()` default binary `watchman` | PASS | PASS | `index.js:65-68` |
| `instanceof EventEmitter` | PASS | PASS | `index.js:54` |
| `{watchmanBinaryPath}` trimmed | PASS | PASS | `index.js:66-67` (`.trim()` observed) |
| Empty-string binary falls back to `watchman` | PASS | PASS | falsy check `index.js:66` |
| `end()` before any connect is safe/void | PASS | PASS | `index.js:354-361` |
| Nonexistent binary → `error` event, ENOENT message rewritten to "not found in PATH" | PASS | PASS | `index.js:205-216` |
| Spawn failure **leaves command callback unsettled and command queued** | PASS (queue len 1, cb null) | PASS | `spawnError` never calls `cancelCommands` (`index.js:196-217`) |

BSER round-trip suite (`bser/test/bser.js`, scratch copy): "bser tests passed"
under both runtimes. `dumpToBuffer` emits BSER v1 (`0x00 0x01`,
`bser/index.js:577-599`); the daemon sniffs v1/v2/JSON from the first PDU
(`server.rs:110-117`) and replies in kind — all live traffic below is BSER v1.

## Discovery precedence (E07)

| Probe | Result | Source |
| --- | --- | --- |
| `WATCHMAN_SOCK` set + binary option `/nonexistent` | connect succeeds via env; binary never spawned | `index.js:179-182` short-circuit |
| Binary override = executable shim printing `{"sockname": …}` | spawn → JSON parse → `makeSock` → commands resolve (both runtimes) | `index.js:243-272` |
| Binary override = real `/usr/local/bin/watchwoman`, env `WATCHMAN_SOCK` inherited pointing at private sock | works; `--no-pretty get-sockname` prints private path (watchwoman honors env in sockname resolution) | `cli.rs` sockname fallback |
| `WATCHMAN_SOCK` bogus path | `error` event (ENOENT), callback unsettled, command queued | `index.js:158-161` |

## Watchwoman command-response surface vs the classifier

Classifier rule: a decoded object is unilateral iff it contains a top-level
`subscription` or `log` key (`unilateralTags`, `index.js:17`, check `tag in obj`
at `:123-129`); the `unilateral` wire flag is ignored. Unilateral →
`emit(tag, obj)` and **`currentCommand` is not consumed**; otherwise the pending
command settles (error iff `'error' in obj`).

Complete enumeration of the deployed dispatch table (`commands.rs:74-137`,
a1e16cbf; every handler inspected):

| Command(s) | Response top-level keys (beyond `version`) | Classifier action |
| --- | --- | --- |
| `subscribe` | `subscribe, clock, is_fresh_instance, root, files` (merged ack) | resolves command (no tag key) |
| **`unsubscribe`** | **`unsubscribed, subscription`** (`subscribe.rs:176-180`) | **misrouted: emits `subscription` event; command never settles; FIFO head-of-line block** |
| **`get-log`** | **`log` (empty array)** (`info.rs:236-240`) | **misrouted: emits `log` event; command never settles** |
| `log` | `logged: true` (`info.rs:246-258`) | resolves (exact key `logged`) |
| `log-level` / `global-log-level` | `log_level: "warn"` (`info.rs:242-244`) | resolves (`log_level` ≠ `log`) |
| `flush-subscriptions` | `synced: [names]` (`subscribe.rs:182-197`) | resolves |
| `state-enter` / `state-leave` | `state-enter`/`state-leave` (`state.rs:9-19`) | resolves |
| `watch`, `watch-project`, `watch-list`, `watch-del`, `watch-del-all` | `watch(+relative_path)/watcher`, `roots`, `watch-del`, `roots` (`watch.rs`) | resolves |
| `clock` | `clock` (`clock.rs:22`) | resolves |
| `query`, `find`, `since` | `files`/etc. (`query.rs`) | resolves |
| `trigger`, `trigger-list`, `trigger-del` | `trigger`, `triggers`, `trigger` (`trigger.rs:33-53`) | resolves |
| `debug-get-subscriptions` | `subscriptions: [ {name, query} ]` (`debug.rs:64-82`) | resolves (plural key) |
| `status` | nested `roots[].subscriptions` counts (`info.rs:302-322`) | resolves (`in` is top-level only) |
| other `debug-*`, `get-sockname`, `get-pid`, `version`, `list-capabilities`, `get-config`, `shutdown-server` | various (`commands.rs:100-135`, `info.rs:127-208`) | resolves |
| any error | `error: <msg>` (`commands.rs:47-51`) | settles as `WatchmanError` with `watchmanResponse` |
| unilateral push PDU | `subscription, clock, is_fresh_instance:false, unilateral, root, files` (`subscribe.rs:141`) | correctly routed to `subscription` |

Live confirmation (private daemon, both runtimes, `03-live.mjs`):

- `unsubscribe` after live PDU flow: `subscription` listener received
  `{"version","unsubscribed":true,"subscription":"opencode-1"}`; callback did
  not settle in 1.5 s; a following `get-pid` never settled (head-of-line).
  Unknown-name `unsubscribe` behaves identically (`unsubscribed:false` still
  carries the key). Re-confirms E03 K7 under bun and node.
- `get-log`: `log` listener received `{"version","log":[]}`; callback did not
  settle; the stalled PDU sits in `currentCommand` (queue length 0). **New
  finding.** Stock Watchman `cmds/log.cpp:111` (`resp.set("log", …)`) has the
  same shape: this misroute is an upstream fb-watchman-family client defect,
  not Watchwoman-specific. Stock `log`→`logged` (`log.cpp:74`) and
  `log-level`→`log_level` (`log.cpp:51`) are safe on both daemons.

## Controlled callback / FIFO / error / end / post-end observations

From `03-live.mjs` (six runs: {bun,node} × {envsock,shim,realbin} — all
identical), `04-precedence-late.mjs`, `05*/05b-remote-end.mjs`,
`fin-probe.mjs`:

1. **FIFO**: one `currentCommand`; three rapid commands resolve in submission
   order; queue drains strictly one-at-a-time (`index.js:72-93, 119-147`).
2. **Daemon error response** (`clock` on unknown root): callback receives
   `WatchmanError` with `watchmanResponse`; `currentCommand` cleared; the next
   command resolves normally.
3. **Local `end()`** with a stalled command: the callback fires synchronously
   with `The client was ended` (`index.js:355`); no client `end` event is
   emitted by the call itself.
4. **Late client `end` after local `end()` depends on the daemon**: with a bare
   connection (no live subscription) the daemon FINs back in ~1 ms and the
   client `end` event does fire (socket handler `index.js:167-172`). With any
   live push loop — including one whose subscription was already
   `unsubscribe`d, since the loop never consults the registry
   (`subscribe.rs:99-109`) — the daemon's writer task keeps the write half
   open (`server.rs:139` drops only the reader's `Session`; push loops hold
   clones, `session.rs:43-51`), so no FIN arrives and **no client `end` ever
   fires** (observed ≥1.5 s; mechanism code-proven). A controller cannot rely
   on `end` delivery after local close.
5. **Remote shutdown** (`shutdown-server` from a second connection, stalled
   command pending): the daemon drains ~2 s, then delivers the pending error
   response, then closes; observed order `cb:<error>` strictly before
   `end` (matches `cancelCommands`-then-`emit('end')`, `index.js:167-172`).
6. **Socket `error`** (bogus `WATCHMAN_SOCK`): `error` event only; the queued
   command's callback is never settled and stays queued — matches E04.
7. **Spawn failure**: same non-settlement (see matrix table).
8. **Post-`end()` submission reconnects**: a command after local `end()`
   reconnects (second `connect` event, command resolves). `end()` is not a
   terminal state (`index.js:275-291`).
9. **`end()` during discovery** (700 ms-delayed shim): the pending callback is
   canceled with `The client was ended`, then the shim completes ~700 ms later,
   `makeSock` runs, and a **live socket is created and left open on the ended
   client** (`connect` fires after `end()`). Discovery is neither canceled nor
   joined — confirms E04/E12 physically, now under both runtimes.
10. `currentCommand` quirk: after queue drain it is `undefined`
    (`commands.shift()` on empty, `index.js:79-81`), while cancel paths set
    `null`; `!== null` checks are a trap for consumers.

## Actor-vs-real behavior table (E15)

Actor: `fixture/watchman/client.ts` (W2, uncommitted). Re-run independently:
`bun test test/filesystem/watchman-actor.test.ts` → **3 pass, 0 fail, 32
expect() calls** (bun 1.4.1), matching the actor record's claim.

| Behavior | Real transport | Actor | Verdict |
| --- | --- | --- | --- |
| FIFO one command in flight | `currentCommand` + queue | `active` + queue, dispatch on submit/settle | match |
| `capabilityCheck` → `["version",{optional,required}]` through queue | `index.js:324-331` | same mapping (`client.ts:399-409`) | match |
| daemon error → `cb(err)`, queue advances | observed (S5) | `fail` control | match |
| `error` event without listener throws | EventEmitter semantics | throws (`client.ts:372-373`) | match |
| socket `error` does not cancel commands | observed (P2) | `emitError` sets disruption only, no cancel | match |
| remote end cancels before `end` listeners, message `The watchman connection was closed` | `index.js:167-172`, observed (S10) | `emitEnd` (`client.ts:445-449`) | match (exact string) |
| local `end()` cancels with `The client was ended`, no `end` emit | `index.js:353-361`, observed (S8) | `end()` (`client.ts:379-385`) | match (exact string); real may emit a *late* `end` on bare connections (obs #4) — actor cannot express this except via manual `emitEnd` |
| `on` returns receiver for chaining | EventEmitter | returns client | match |
| callback invoked at most once on normal paths | removal-before-invoke (`index.js:133-142`) | same | match |
| `lateRespond` re-invokes a settled callback | never | deliberate fault injection (`client.ts:306-317`) | **non-faithful by design** (documented as such) |
| connect/discovery modeling | `connecting`, spawn, `WATCHMAN_SOCK`, late connect, spawn failure | none (factory returns ready client) | **gap** |
| post-`end()` resubmission | reconnects and resolves (obs #8) | accepted, no reconnection semantics | partial |
| callback optionality | `done = () => {}` default (`index.js:275`) | required parameter | trivial |
| payload snapshot | serialized at write time | `structuredClone` at submit | nuance only |

## Type-level conformance (E15)

Strict tsgo against the npm install with the repo's vendored `index.d.ts`
grafted in (scratch only):

- `Client` **is not assignable** to the fixture's `RawClient`: the fork's d.ts
  declares `on` with a closed event union
  (`"connect" | "subscription" | "error" | "end" | "log"`) and event-specific
  listener payloads; the fixture requires `(event: string, listener:
  (value?: unknown) => void) => unknown`. Parameter contravariance fails on
  `event: string`. `end`, `command`, and `capabilityCheck` are compatible.
- The fixture's `RawClientFactory = () => RawClient` (`client.ts:21`) takes no
  binary argument, while v4 proposes `(binary?: string) => RawClient`
  (v4 line 263): a v4-shaped factory does not satisfy the fixture type, and the
  fixture factory drops any configured binary (E07's `watchmanBinaryPath`
  plumbing would be silently ignored by the actor seam).
- With the npm artifact as published (no d.ts), any such check is `any`-typed
  (TS7016) unless the consumer vendors declarations.

## E07 / E15 fact disposition

| Gate | Disposition |
| --- | --- |
| E07 (install/run under carrier Bun matrix) | **Closed affirmatively for runtime**: imports, installs, constructs, discovers, and converses with deployed Watchwoman a1e16cbf identically under bun 1.4.1 and node 26.6.0. Two packaging facts: published tarball omits `index.d.ts`; `engines` `node>=20.19` unenforced by bun and satisfied by host node. |
| E15 (actor matches production RawClient; faithful controls) | **Partially closed**: behaviorally faithful on FIFO, cancellation strings, event order, and error semantics (self-tests independently green); structurally incompatible at the type level (`on` union; zero-arg factory) and behaviorally silent on discovery/spawn-failure/late-connect/reconnection, all of which the transport really exhibits. |

## Confidence and gaps

- **High**: everything above cites pinned source lines and was reproduced under
  both runtimes against the hash-pinned daemon; the two misroutes and the
  end/post-end behaviors are deterministic across six live runs.
- **Medium**: the ~2 s shutdown drain window and FIN timing are daemon-side
  behaviors observed on this host only; the no-FIN-while-pushed claim is
  code-proven (`server.rs:139` + `session.rs:43-51`) and observed, but the
  exact reap horizon was not measured.
- **Gaps left open**: stock-binary live confirmation of `get-log` misrouting
  (no stock daemon on host; source-cited only, `cmds/log.cpp:111`); bun 1.4.2
  (carrier pin) not executed — 1.4.1 is the nearest host runtime; no Windows
  spawn-path coverage (E17 territory); actor-vs-v4 `RawClientFactory` arity
  resolution is a design decision, not researched further here.

## Transcript artifacts

`/home/rektide/tmp-opencode/v4-n1-transport/`:
`run-envsock-{bun,node}.log`, `run-shim-{bun,node}.log`,
`run-realbin-{bun,node}.log`, `run-precedence-{bun,node}.log`,
`run-remoteend-node.log`, `run-remoteend2-node.log`, probes
`pkg/01-import-ctor.mjs`, `pkg/03-live.mjs`, `pkg/04-precedence-late.mjs`,
`pkg/05-remote-end.mjs`, `pkg/05b-remote-end.mjs` (in-run), `pkg/fin-probe.mjs`,
shims `shim-getsockname.mjs`, `shim-delayed.mjs`, bser suite copy, and type
checks `pkg/e15-compat.ts`, `pkg/e15-members.ts`. One caveat: the first
(buggy) draft of probe 01 briefly connected to the ambient live socket via the
inherited `WATCHMAN_SOCK` and issued one read-only `version` command before the
probe was made hermetic; no daemon state changed (service `active`, socket
mtime unchanged throughout).

## Cross-references

- [`v2-readd4-validation0.gpt56solxh.md`](v2-readd4-validation0.gpt56solxh.md) — assignment N1/E07+E15 and the correction context this closes.
- [`v2-readd4-e03-protocol-ordering0.glm53max.md`](v2-readd4-e03-protocol-ordering0.glm53max.md) — K7 unsubscribe stall (re-confirmed here under bun/node) and the Watchwoman response-shape tables extended by the full command-surface enumeration above.
- [`v2-readd4-e04-interleavings0.gpt56solmax.md`](v2-readd4-e04-interleavings0.gpt56solmax.md) — transport callback/order claims (socket-error non-settlement, end()-during-discovery, non-terminal end) now empirically reproduced in both runtimes.
- [`v2-readd4-e12-lifecycle0.gpt56solmax.md`](v2-readd4-e12-lifecycle0.gpt56solmax.md) — raw-transport lifecycle ownership; the leaked late-connect socket (obs #9) is the concrete unjoined-survivor instance.
- v4 design doc `v2-readd4.gpt56solxh.md` (carrier workspace) — E07 row (line 703), E15 row (line 709), `RawClientFactory` seam (line 263).
