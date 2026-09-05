---
type: EvidenceAudit
title: E04 generation and controller interleaving audit
description: Primary-source audit of the v2-readd4 generation/controller race claims.
resource: /.design/watchman/v2-readd/v2-readd4-e04-interleavings0.gpt56solmax.md
tags: [opencode, watchman, v2, concurrency, evidence]
status: draft
generated: { by: model:openai/gpt-5.6-sol-max, at: 2026-09-05 }
verified: { by: unassigned, at: never }
stale_after: 2026-10-05
sources:
  - { id: v4, resource: "file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md" }
  - { id: opencode, resource: "https://github.com/anomalyco/opencode/commit/4306c07b340b9a0504e65785f366d2793cd1b169" }
  - { id: effect, resource: "https://github.com/Effect-TS/effect/tree/2600f62f4532026928454dcea8d1c48557b3f942" }
  - { id: transport, resource: "https://github.com/rektide/watchman-esm/tree/3a463955acf6843301ceae387f7a1a0f187e4a65" }
---

# E04 generation and controller interleaving audit

## One-sentence result

**Primary source proves only the local primitives—FIFO single-in-flight transport commands, synchronous transport cancellation callbacks, Effect at-most-once callback continuation and race-loser cleanup, and OpenCode's post-acquisition release hook—contradicts the claim that the donor close clears routes before `client.end()` and the claim that one fresh per-command timeout can also bound a joined unsubscribe queued behind another command to that same single timeout, and cannot prove end-to-end race safety because no production controller exists and v4 leaves clean-end callback-before-fence handling, callback-error disposition, pre-return interruption cleanup, stale-result disposal, PDU serialization, close ownership, and final unsubscribe/close/join ordering unstated.**

## Evidence boundary and source state

| Material | Exact state used | Authority in this audit |
| --- | --- | --- |
| v4 candidate | [`v2-readd4.gpt56solxh.md` lines 231–305, 338–456, 499–516, 617–634](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L231-L305) | Proposed algorithm and claims only. |
| OpenCode | `4306c07b340b9a0504e65785f366d2793cd1b169` | Revision-pinned production lifecycle. Its catalog and lock both pin `effect@4.0.0-rc.112` ([catalog](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/package.json#L40-L44), [lock](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/bun.lock#L3852)). |
| Effect | tag `effect@4.0.0-rc.112` = `2600f62f4532026928454dcea8d1c48557b3f942`; its package declares that version ([package](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/package.json#L1-L12)) | Exact cancellation, race, semaphore, scope, and finalizer semantics. |
| JS transport fork | clean commit `3a463955acf6843301ceae387f7a1a0f187e4a65`, package `@superbfowle/fb-watchman-esm@3.0.0` | Actual callback/event order, not the test actor's approximation. |
| Donor | committed files as present at `cb7cba92e23d496d83390f388ce3afb22cf49c10`; working-copy changes were confined to three design documents | Concrete mechanism evidence only, never v4 policy. |
| Carrier W1 | committed `620fc620b67f`; generic `invalidate` plumbing and readiness ordering only | It adds no Watchman controller. The carrier has no production `packages/core/src/filesystem/watcher/watchman/` directory. |
| Carrier actor | two **uncommitted** test files in working copy `e77301b4`; no production imports | Evidence that the planned interleavings can be scripted, not evidence that any controller handles them. Its `lateRespond` deliberately exceeds normal transport behavior. |

No daemon transcript is needed to establish the callback/event facts below. Subscribe-PDU content and daemon acknowledgement semantics remain E03, outside this audit.

## Verdicts against the algorithm as written

| Claim in v4 | Verdict | Primary-source finding |
| --- | --- | --- |
| A completed or interrupted `Effect.callback` continuation ignores later `resume` calls. | **Proven, primitive only.** | rc.112 sets `resumed` before evaluation/cancellation and returns from every later resume ([internal `callbackOptions`](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L1102-L1141)). This does not prevent the raw callback function or statements before `resume` from running. |
| Waiting for the command permit is interruptible and consumes no response timeout. | **Proven for the donor mechanism; unproven for v4 production.** | `Semaphore.withPermits` restores interruptibility while waiting and starts the body only after incrementing `taken` ([Semaphore](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Semaphore.ts#L287-L306)); the donor places `timeoutOrElse` inside the admitted body ([donor `client.ts` lines 102–149](https://github.com/rektide/opencode/blob/cb7cba92e23d496d83390f388ce3afb22cf49c10/packages/core/src/filesystem/watcher/watchman/client.ts#L102-L149)). No corresponding carrier implementation exists. |
| Once raw-submitted, caller interruption cannot release the Effect permit early. | **Possible and concretely donor-proven; not established by the proposed API.** | `withPermit` restores the body's normal interruptibility, so it does **not** supply this property alone. The donor explicitly forks the response wait and joins it under `Effect.uninterruptible` before wrapping it with `withPermit` ([donor `client.ts` lines 142–149](https://github.com/rektide/opencode/blob/cb7cba92e23d496d83390f388ce3afb22cf49c10/packages/core/src/filesystem/watcher/watchman/client.ts#L142-L149)). v4 gives a signature, not this body. |
| Socket `error` and `end` can converge on one idempotent close. | **Mechanically possible; end-to-end order unproven.** | A socket `error` only emits `error`; it does not cancel commands ([transport lines 158–161](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L158-L161)). A clean socket `end` cancels command callbacks **before** emitting `end` ([lines 167–172](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L167-L172)). Therefore an `end` listener is not the first observer on the clean-end-with-command path. |
| Close clears subscription routes before ending the raw client. | **Contradicted as donor-derived evidence.** | v4 says route clear precedes end ([v4 lines 357–360](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L357-L360)); the donor completes `closed`, calls `generation.client.end()`, and only then clears `generation.subscriptions` ([donor `root.ts` lines 134–142](https://github.com/rektide/opencode/blob/cb7cba92e23d496d83390f388ce3afb22cf49c10/packages/core/src/filesystem/watcher/watchman/root.ts#L134-L142)). The transport's [`cancelCommands`](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L95-L112) is called synchronously by [`end()`](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L353-L361). |
| A generation-stamped route plus `generation.closed`, target epoch, and `Released` can reject stale effects. | **Sound as a set of predicates; unprovable as a composed algorithm.** | v4 states the predicates but no event mailbox, atomic transition, route callback body, or stale-result disposer. Neither primary production source contains those fields. |
| One configured command timeout bounds release that waits behind a submitted command and joins unsubscribe. | **Contradicted as a joint claim.** | v4 starts each deadline only after admission ([lines 350–353](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L350-L353)) and says unsubscribe may first wait for an already-submitted command yet the same timeout bounds total release ([lines 630–634](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L630-L634)). If both commands use that rule and release joins unsubscribe, the first can consume nearly `T` and the admitted unsubscribe another nearly `T`; if unsubscribe is detached, the stated final join/no-survivor property is not established. |
| Release is final from Pending, Acquiring, Attaching, and Attached. | **Unprovable.** | OpenCode's interruptible native acquisition registers its release only after `native.subscribe` returns. Interruption before return gives the upstream layer no `Subscription.unsubscribe` to call; v4 does not name an internal pre-return finalizer or owning scope. |

## Exact Effect rc.112 cancellation and finalizer semantics

1. **Callback registration and late resume.** `Effect.callback` documents at-most-once resume and an optional interruption cleanup effect ([public API lines 1194–1236](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L1194-L1236)). Internally, first resume sets `resumed = true`; interruption also sets it, aborts the supplied signal, and runs the returned cleanup ([internal lines 1102–1160](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L1102-L1160)). The async cleanup is made uninterruptible at its continuation boundary. rc.112 tests explicitly prove that a delayed callback cannot resume an interrupted fiber and that callback cleanup runs ([tests lines 1680–1728](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/test/Effect.test.ts#L1680-L1728)).
2. **Race settlement.** `raceFirst`, unlike `race`, settles on the first success **or failure** ([public API lines 4730–4912](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Effect.ts#L4730-L4912)). Its implementation interrupts all losing fibers under an uninterruptible effect before returning the winner ([internal lines 1535–1579](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L1535-L1579)); `fiberInterruptAll` requests interruption and awaits every exit ([lines 888–899](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L888-L899)). A failing `generation.closed` fence therefore requires `raceFirst`-equivalent semantics; plain `race` ignores the first failure while another branch can still succeed.
3. **Timeout.** `Effect.timeoutOrElse` is exactly `raceFirst(self, sleep(duration) *> orElse)` ([internal lines 3677–3727](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L3677-L3727)). A timeout cancels and awaits the response branch, but it cannot cancel the external Watchman operation because the transport exposes no per-command cancellation.
4. **Semaphore admission.** `withPermits` masks only its accounting, restores the permit wait and body, and releases on every body exit ([Semaphore lines 287–306](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Semaphore.ts#L287-L306)). Thus waiting is interruptible; an ordinarily interruptible submitted body releases on interruption. `Effect.uninterruptible` defers a pending interrupt until the masked region ends ([internal lines 4302–4352](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L4302-L4352), [test lines 1730–1769](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/test/Effect.test.ts#L1730-L1769)).
5. **Acquisition/release registration.** `Effect.acquireRelease` masks acquisition by default, optionally restores it when `interruptible: true`, and adds the release finalizer only after acquisition succeeds ([internal lines 3971–3987](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L3971-L3987)). OpenCode explicitly passes `{ interruptible: true }` around `native.subscribe` ([OpenCode watcher lines 93–113](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L93-L113)). This proves that pre-return interruption has no upstream native release callback.
6. **Scope and fiber completion.** A scope first transitions to `Closed`, then runs its registered finalizers; the default sequential strategy runs them in reverse registration order ([scope internals lines 3775–3827](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L3775-L3827)). Adding a finalizer to an already closed scope runs it immediately ([lines 3847–3857](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L3847-L3857)). `Fiber.interrupt` waits for fiber completion and cleanup, but cooperative interruption can wait behind uninterruptible work ([Fiber lines 315–354](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Fiber.ts#L315-L354)). `forkIn` registers a scope finalizer that interrupts and awaits the fiber ([internal lines 5337–5378](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L5337-L5378)); `forkDetach` deliberately has no such scope owner ([lines 5287–5312](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/internal/effect.ts#L5287-L5312)).

These semantics establish what a concrete implementation could guarantee. They do not instantiate v4's missing controller fiber, close function, or event serialization.

## Actual transport callback and event facts

| Fact | Exact source consequence |
| --- | --- |
| One `currentCommand`; later commands remain in `commands`. | `sendNextCommand` returns while a current command exists and writes only the shifted head ([lines 72–93](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L72-L93)). Raw wire dispatch is FIFO with at most one response-bearing command active. |
| Ordinary daemon response or daemon command error clears `currentCommand`, invokes its callback, then advances the queue. | [Lines 119–147](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L119-L147). A callback error is not a socket event and does not close the client. |
| Unilateral `subscription` and `log` values bypass `currentCommand`. | They are emitted directly at lines 123–133, so a PDU can arrive while a command callback is held. |
| Socket `error` does not settle commands. | It only clears `connecting` and emits `error` ([lines 158–161](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L158-L161)). A controller close is the only stated route to command settlement if no later `end` arrives. |
| Remote socket `end` settles commands before notifying the controller's `end` listener. | It nulls socket/bunser, invokes every pending callback through [`cancelCommands`](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L95-L112), and only then emits `end` ([lines 167–172](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L167-L172)). This is the decisive callback-before-generation-fence interleaving. |
| Local `client.end()` synchronously cancels callbacks before closing/nulling the socket and emits no local `end`. | [Lines 353–361](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L353-L361). Completing `generation.closed` before calling it can fence resumed Effect work; calling it first permits synchronous callback re-entry. |
| `end()` is not a permanent-ended state. | A later `command` can initiate connection again ([lines 275–291](https://github.com/rektide/watchman-esm/blob/3a463955acf6843301ceae387f7a1a0f187e4a65/watchman/node/index.js#L275-L291)). A close during `get-sockname` does not cancel the spawned child; a later socket can still be created. v4's late-`connect` listener can call `end()` then, but the raw API exposes neither process cancellation nor a termination join. |
| Normal transport paths do not deliberately invoke one command callback twice. | Current command/queue entries are removed before invocation. The carrier actor's uncommitted `lateRespond` is explicit fault injection, not transport fidelity ([actor record lines 110–133](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-actor0.gpt56solmax.md#L110-L133)). |

## Complete finite transition table: generation/command product

This table is complete for the E04 input alphabet named by v4. `O` means generation open, `X` closed, `W` a command waiting for the Effect permit but not submitted, and `S` raw-submitted with the permit and response timer retained. `U` means v4 has no transition or owner; it does not denote a proposed behavior.

| From | Input | Transition/action stated by v4 | To | Audit |
| --- | --- | --- | --- | --- |
| `O` | issue command | Race permit admission with `closed`; no response deadline while waiting. | `W`, or `X` if already closed | Donor mechanism and Effect semantics prove this is implementable; production absent. |
| `W` | caller interruption | Cancel permit wait; do not submit. | `O` for generation; caller exits | Proven Effect semaphore behavior. |
| `W` | permit granted while open | Submit exactly once, retain permit, start command deadline. | `S` | Retention requires the unstated mask body; donor has it. |
| `W` | generation close | Closed race wins; no raw submission. | `X` | Requires `raceFirst`-equivalent close failure. |
| `S` | callback success + valid decode | Resume once, settle command, release permit. | `O` | Local primitive proven. Controller installation remains separately epoch-fenced. |
| `S` | callback error | Resume typed failure and release permit. | **`U`** | No v4 row classifies ordinary daemon error versus transport cancellation or assigns close/retry ownership. The raw client remains open after an ordinary callback error. |
| `S` | callback success + malformed response | Decoder fails. v4's loss table says close/retry. | Intended `X → retry`; operational transition **`U`** | Decoder belongs to `client.ts`, recovery to `directory.ts`, but no close method or handoff appears in the proposed APIs. |
| `S` | submitted timeout | Timeout invokes idempotent close; command fails; controller reattaches fresh. | `X` | Donor demonstrates the local mechanism. Production owner/order absent. |
| `S` | caller interruption | Command remains admitted until callback, generation close, or timeout; pending interrupt is then delivered. | `S`, then caller exits | Supported by donor mask plus Effect; not derivable from v4's signature. |
| `S` | socket `error` | Error listener invokes close; close settles the command through `closed`/`client.end`. | `X` | Transport does not cancel it. Listener-to-close scheduling and fence order are unstated. |
| `S` | socket `end` | Transport callback error occurs first; later `end` listener invokes close. | callback-error transition, then `X` | Contradicts any reading in which the `end` listener is the earliest fence. Callback-error transition is `U`. |
| `O` or `S` | first close/retire | Complete the closed fence, remove all routes, and end raw client; exact fence-versus-route order is not stated, only route-before-end. | `X` | No exported/idempotent close operation appears in `Generation` or proposed `client.ts` API. Donor route/end order is opposite. |
| `X` | repeated `error`, `end`, timeout, retarget, or release close | Idempotent no-op. | `X` | Intended; production absent. |
| `X` | late raw callback | Raw callback body still runs; interrupted callback continuation ignores `resume`. | `X` | Proven only if the response fiber has first been interrupted/settled. Statements before `resume` can still occur. |
| `O` | matching PDU and route present | Global subscription listener finds route and invokes its handler. | `O` | Transport dispatch proven; handler serialization/check point absent. |
| `O` | unmatched PDU or route absent | Ignore. | `O` | Map lookup semantics stated. |
| `X` | PDU | Route map is empty; ignore. | `X` | Depends on route clear having happened before the PDU lookup. |
| `X` | late `connect` | Immediately call raw `end()` again. | `X` | Stated by v4; raw transport permits this late connect. No join signal exists. |

## Complete finite transition table: controller

The written state machine is `P` Pending, `Q` Acquiring, `Tᵢ` initial Attaching, `Tᵣ` replacement Attaching, `A` Attached, and absorbing `R` Released. `Tᵢ/Tᵣ` are the single written `Attaching` phase plus its prescribed initial-discard/replacement-buffer mode. `e` is target epoch. The cells cover every named controller input; `U` is an explicit missing transition/order.

| Input | `P` | `Q` | `Tᵢ` | `Tᵣ` | `A` | `R` |
| --- | --- | --- | --- | --- | --- | --- |
| Start/current retry | Resolve `L→C`, install sentinel if needed, enter admission: `→Q`. | — | — | — | — | Drop. |
| Admission/client construction succeeds | — | Register listeners and begin protocol: `→Tᵢ` or `→Tᵣ`. | — | — | — | Stale result is rejected; disposal owner is `U`. |
| Current version/watch/clock success | — | — | Stay `Tᵢ`; issue next stage. | Stay `Tᵣ`; issue next stage. | — | Drop completion. |
| Current subscribe acknowledgement | — | — | Discard pre-ack exact rows, `→A`, return `Subscription`, then upstream initial `onReady`. | Enqueue invalidation, then drain buffer, `→A`. | — | Reject installation; result disposal is `U`. |
| Matching ordinary PDU | No route/drop. | No route/drop. | Discard. | Buffer. | Filter/map then exact publish. | Drop. |
| Matching cancellation PDU | No route/drop. | No route/drop. | Retire generation and retry fresh: phase destination/backoff boundary `U`. | Same. | Same. | Drop. |
| `is_fresh_instance: true` | No route/drop. | No route/drop. | `U` (E03 also owns pre-ack semantics). | `U` (buffer versus immediate invalidation unstated). | Invalidate and retain subscription: stay `A` (provisional). | Drop. |
| Ordinary command callback error | `U` | `U` if construction/acquisition can callback | `U` | `U` | Only release unsubscribe can be active; best-effort disposition `U`. | Ignore logically; callback body may still run. |
| Malformed response or matching PDU | — | — | Stated close/retry, but handoff/order `U`. | Same. | Same. | Drop/ignore. |
| Generation timeout, socket error, or socket end | Stay/retry if no generation. | If a generation exists, retire; exact boundary `U`. | Coalesce close and fresh reattach: diagram returns to `P`; retry wake later `→Q`. | Same. | Same. | Drop. |
| Sentinel says canonical target unchanged | Stay. | Stay. | Stay. | Stay. | Stay. | Drop. |
| Sentinel retarget | Increment `e` before retirement; `→P` replacement cycle. | Same; cancellation/disposal of admitted work `U`. | Same. | Same. | Same. | Drop. |
| Symlink deletion | Increment `e`, retire, keep sentinel, invalidate owner, `→P` (provisional). | Same. | Same. | Same. | Same. | Drop. |
| Retry timer wakes for current `e` and demand | `→Q`. | No applicable current timer. | No applicable current timer. | No applicable current timer. | No applicable current timer. | Drop. |
| Stale callback, attachment completion, PDU, retry, or sentinel event | Drop by generation/demand/target checks. | Drop. | Drop. | Drop. | Drop. | Drop. |
| Native acquisition caller interrupted before return | Intended release arrow says `→R`; pre-return cleanup owner/order `U`. | Same. | Same. | Not an initial caller state. | Not an initial caller state. | Stay `R`. |
| Release request (returned `unsubscribe` after `A`; internal/caller cancellation before `A`) | Mark `R` first; stop retry/sentinel and join; no route normally. | Mark `R` first; cancel/join acquisition ownership `U`. | Mark `R` first; remove route, best-effort unsubscribe, close/join; exact order `U`. | Same. | Same. | Idempotent stay `R`. |
| Unsubscribe callback/timeout after release | — | — | — | — | — | Stay `R`; whether release waits and whether generation closes are `U`. |

The table exposes three places where v4 uses a transition result without defining its transition: ordinary callback error, stale acquisition/attachment disposal, and the cleanup sequence that reaches `R`. Those are specification absences, not policy questions answered here.

## Adversarial interleavings

| Interleaving | Primary-source order | Earliest available fence | Possible late effect | Verdict |
| --- | --- | --- | --- | --- |
| Daemon callback error with healthy socket | Transport clears current, calls callback, then dispatches next raw queued command; no socket event occurs. | None unless the callback handler or controller explicitly closes/advances an epoch. | Failure handling can run while the same generation remains open. | **Unprovable:** v4 gives no error-class transition. |
| Clean socket end during submitted command | Socket handler nulls socket/bunser → `cancelCommands` invokes callback error → emits `end`. | The callback handler is the first possible generation fence; the declared `end` listener is later. | Callback failure can settle, release the permit, and enter controller handling before the `end` close runs. | **Ordering gap proven.** |
| Socket error during submitted command | Transport emits `error` but leaves command pending. | First synchronous mutation performed by the controller's error listener; merely scheduling an Effect is not itself the fence. | Response/PDU/end can occur before an asynchronously scheduled close mutates `closed`. | **Unprovable:** listener execution strategy absent. |
| Socket error followed by end | Error listener and later end listener both request close. | First successful idempotent `closed` completion. | Second event and transport cancellation callbacks still execute but can be logically ignored. | Primitive is sufficient; production composition absent. |
| Timeout races a normal response | `timeoutOrElse` and callback are a `raceFirst`; first settlement interrupts and awaits loser. | Timeout branch's generation close, or callback settlement if it wins first. | After timeout, raw `client.end()` invokes callback and a later daemon response may invoke transport code, but `resume` cannot reactivate the canceled continuation. | **Effect proof; production close body absent.** |
| Close calls local `client.end()` with callbacks pending | `end()` synchronously invokes callbacks before it nulls the socket. | `generation.closed` must already be completed to stop Effect re-entry; route removal only fences PDUs. | If close calls `end()` before its fence, a callback can resume synchronously inside close. | v4 does not state fence-versus-end order; donor happens to fence first. |
| Caller interrupted while waiting permit | Semaphore's restored wait is interrupted and unregisters its waiter. | Fiber interruption. | No raw callback, timer, or command exists. | **Proven primitive.** |
| Caller interrupted after raw submission | `withPermit` alone would interrupt body and release; donor's explicit uninterruptible join defers that interruption. | Submitted-command mask, then callback/closed/timeout settlement. | Raw command and deadline continue after caller cancellation; caller receives interruption only after retained work settles. | **Donor-proven, production-unprovable.** |
| Retarget while waiting for acquisition admission | Sentinel increments target epoch before retiring old work. | New target epoch `e+1`. | An admitted operation may later construct/connect a stale client; epoch check can block installation, but v4 names no disposer/join owner for that result. | **Publication fence stated; resource finality unproven.** |
| Retarget during submitted attach command | Increment `e` → retire/close old generation → fresh attach. | Target epoch increment is earlier than generation close. | Old raw callback still runs; its continuation may fail closed, and any completion must fail epoch check. | **Algorithmically plausible; no executable composition.** |
| Subscribe acknowledgement races retarget | If ack runs first it may install old `A` before retarget retires it; if epoch increments first, ack is stale. | Whichever synchronous state mutation occurs first; final install needs current `e/g` check. | Brief old attachment is possible only when ack precedes observed retarget; post-fence installation is forbidden by prose but untested. | **Unprovable without transition serialization.** |
| Replacement PDU precedes subscribe acknowledgement | Transport may emit unilateral PDU while a command is current. | Generation-stamped route plus `Tᵣ` mode. | PDU is buffered; after ack, invalidation enqueue precedes drain. | State rule is explicit; route-install timing and callback body are absent. |
| Route removal races a PDU already dispatched to its handler | A map delete prevents a later lookup, not a handler already fetched/invoked by the EventEmitter listener. | Demand/target/generation check at the eventual publish point. | Already queued PDU work can survive route deletion and must be dropped by the later state check. | **Second fence stated, placement unproven.** |
| Release during Pending/Acquiring/initial Attaching | OpenCode can interrupt `native.subscribe` before it returns and therefore before its `acquireRelease` registers unsubscribe. | Controller's own `Released` mutation, if an interruption finalizer performs it. | Acquisition, timer, or raw connection can continue because upstream has no handle. | **No owner in v4.** |
| Release while Attached and another command owns permit | Mark `Released`, remove route, then unsubscribe waits for the permit under the written story. | `Released` blocks publication; route delete blocks new PDU dispatch. | Existing command can consume nearly `T`; a subsequently submitted unsubscribe can consume another nearly `T`. | **Logical finality plausible; one-`T` latency contradicted.** |
| Release versus retry wake or sentinel callback | v4 says set `Released` before stopping either source. | `Released`. | A callback already queued still executes and reaches its demand check; timer/sentinel resource termination and join are unspecified. | **No late publish if implemented; no no-survivor proof.** |
| Close during transport `get-sockname` discovery | `client.end()` sees no socket and cannot cancel the spawned process; successful discovery can later call `makeSock`, then emit `connect`. | Generation `closed`; late-connect listener ends the eventual socket. | Child process/socket construction can occur after logical release; raw `end()` has no completion signal. | **Logical fence possible; physical final release unproven.** |
| Malformed PDU races release/retarget | Global listener dispatches unknown value; schema decode belongs to a later Effect path. | `Released`/target epoch for publication; generation close for recovery. | Decode failure may schedule close/retry after release unless it rechecks demand; v4 says callbacks check but gives no mailbox/body. | **Unprovable.** |

## Ownership audit

“Written owner” means the module named by v4, not implemented code.

| Object/action | Written owner in v4 | Current concrete owner/evidence | Finding |
| --- | --- | --- | --- |
| Generation ID, raw client, command semaphore, `closed`, route map | `client.ts` / `Generation` | Donor splits construction in `root.ts` and storage in `client.ts`; carrier has none. | Proposed ownership only. |
| One idempotent generation close operation | Implicitly `client.ts`, but timeout, socket listeners, and `directory.ts` all need it | Not present in proposed `Generation` fields or exported API. Donor `root.ts` closure owns it. | **No named v4 owner/interface.** |
| Completing `generation.closed` and waking command/attachment waiters | Close operation | Effect `Deferred.doneUnsafe` is first-wins and resumes all current waiters ([Deferred lines 856–869](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/Deferred.ts#L856-L869)). | Primitive owner known; v4 caller absent. |
| Calling raw `client.end()` | Close operation | Transport method is synchronous and returns no termination handle. | Exact place/order relative to fence and route clear is missing. |
| Socket `connect`, `error`, `end`, `log`, `subscription` callbacks | `client.ts`, registered before first command | Transport emits them; donor registers in `root.ts` lines 169–180. | v4 module table and donor placement disagree; no carrier owner. |
| Command callback and response decode | `client.ts` | Donor `admitted`; Effect callback continuation. | Callback error-to-close/retry handoff missing. |
| Per-command response timer | `client.ts`, starts after admission | Donor `timeoutOrElse`; Effect clock/race. | Concrete donor mechanism, proposed production only. |
| Command permit release | Effect semaphore finalizer inside `client.ts` | rc.112 `withPermits` releases on body exit. | Submitted retention depends on explicit masking not shown by v4 API. |
| Route installation before subscribe acknowledgement | `directory.ts` mutates `Generation.subscriptions` owned by `client.ts` | Donor installs immediately before sending subscribe. | Exact v4 install point and initial/replacement mode capture absent. |
| Exact route removal on retarget/cancel/release | `directory.ts` | Donor `detach`. | Proposed only. |
| All-route removal on generation close | `client.ts` close by prose | Donor close does it after `client.end()`. | Written/donor ordering contradiction. |
| Target epoch and absorbing `Released` fence | `directory.ts` | No production field. | Proposed only; atomic mutation site absent. |
| Recovery/backoff timer and wake-up | `directory.ts` attach/recover loop | Donor `acquireRoot` recursively sleeps; v4 production absent. | No timer fiber handle, stale-wake body, stop, or join owner specified. |
| Shared acquisition circuit timer/wake | `acquisition.ts` | Concrete donor coordinator exists. | E11 owns correctness; E04 records only that this is a different timer owner. |
| Parent-entry sentinel subscription, callback, and close | `directory.ts`, using inherited Node `entries` backend | No v4 code. | Callback serialization with controller state and pre-return cleanup absent. |
| PDU bytes/decoding into JS object | Transport | `BunserBuf` and transport `value` listener. | Concrete. |
| PDU name dispatch | `client.ts` global subscription listener | Proposed `Generation.subscriptions`; donor map lookup. | Concrete mechanism only in donor. |
| PDU buffering, schema validation, epoch checks, path mapping | `directory.ts` | No carrier implementation. | Proposed only; no serialization owner. |
| `input.invalidate()` / `input.publish()` invocation | `directory.ts` | Carrier W1 provides synchronous `PubSub.publishUnsafe` callbacks at committed `620fc620` ([carrier watcher lines 99–121](file:///home/rektide/src/opencode-watchman-v2-readd/packages/core/src/filesystem/watcher.ts#L99-L121)). | Downstream enqueue exists; controller ordering does not. |
| Per-subscriber `onReady` after invalidation | Watcher W1 | Committed carrier stream handles signals sequentially before filtering updates ([lines 138–163](file:///home/rektide/src/opencode-watchman-v2-readd/packages/core/src/filesystem/watcher.ts#L138-L163)). | W1 ordering proven independently of Watchman. |
| Initial pre-return cancellation | `directory.subscribe` necessarily, because no `Subscription` exists yet | Upstream OpenCode acquisition is interruptible and has no release value before success. | **No v4 cleanup owner/finalizer.** |
| Final release invocation after successful acquisition | OpenCode Watcher `RcMap` entry scope | Revision-pinned Watcher calls returned `Subscription.unsubscribe` from its release finalizer ([watcher lines 93–113](https://github.com/anomalyco/opencode/blob/4306c07b340b9a0504e65785f366d2793cd1b169/packages/core/src/filesystem/watcher.ts#L93-L113)); Effect `RcMap` closes the entry on last reference ([RcMap lines 341–381, 452–466](https://github.com/Effect-TS/effect/blob/2600f62f4532026928454dcea8d1c48557b3f942/packages/effect/src/RcMap.ts#L341-L381)). | Upstream owner exists only after return. |
| Release's unsubscribe command | `directory.ts`, local route first, best effort | No production body; donor launches it with detached `Effect.runFork` and does not join it ([donor `root.ts` lines 275–290](https://github.com/rektide/opencode/blob/cb7cba92e23d496d83390f388ce3afb22cf49c10/packages/core/src/filesystem/watcher/watchman/root.ts#L275-L290)). | Donor cannot prove v4 final join. |
| Controller fiber stop and join | `directory.ts` returned `Subscription.unsubscribe` | No proposed field/API names the fiber or stop signal. | **No concrete owner.** |

## Explicit owner and ordering gaps

The audit finds these omissions in the written v4 algorithm; it does not select amendments:

1. `Generation` exposes `closed` but no close operation, although five sites need one: socket `error`, socket `end`, timeout, directory retirement, and release.
2. Close states route-before-raw-end but not closed-fence-before-route-before-end. The donor does closed-fence-before-end-before-route-clear.
3. Clean socket end invokes the command callback before the `end` listener. No owner is assigned to distinguish that transport cancellation callback from an ordinary daemon command error or to fence it before resume.
4. Ordinary callback error and malformed response cross the `client.ts`/`directory.ts` seam without a finite transition or close handoff in the proposed API.
5. The route callback's execution model is absent: direct synchronous handling, queue offer, fork, and serialized controller mailbox have different check-to-publish interleavings.
6. A stale acquisition or attachment result is forbidden from installation, but no owner closes the newly constructed stale client or joins the stale attempt.
7. Initial Native acquisition interruption occurs before upstream owns `Subscription.unsubscribe`; no internal interruption finalizer, scope, stop signal, or join handle is stated.
8. Final release states `Released` first, route removal, best-effort unsubscribe, generation/sentinel/retry stop, and controller join, but does not order unsubscribe against generation close or say whether its callback/timer is joined.
9. The one-command-timeout release bound and joined queued unsubscribe cannot both follow the stated fresh-deadline-after-admission rule.
10. The raw transport cannot cancel or join `get-sockname` discovery and does not become permanently ended; v4's late-connect guard gives a logical fence but no physical termination owner.

## E04 disposition and invariant pointers

| v4 paragraph/invariant | Audit result |
| --- | --- |
| Transport generation, [lines 338–364](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L338-L364) | FIFO, callback continuation, timeout race, and late-connect facts are source-supported; close ownership/order and clean-end callback ordering are not. The donor route-before-end attribution is false. |
| Controller state/replacement/loss, [lines 395–456](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L395-L456) | The finite state intent is coherent, but callback-error, pre-return interruption, stale disposal, and event serialization transitions are absent. |
| Symlink topology, [lines 499–516](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L499-L516) | Epoch-before-retire is the earliest logical retarget fence; sentinel callback/close/join ownership is unimplemented and unspecified. |
| Lifecycle/release, [lines 617–634](file:///home/rektide/src/opencode-watchman-v2-readd/.design/watchman/v2-readd/v2-readd4.gpt56solxh.md#L617-L634) | Upstream post-return release is proven; pre-return release, physical transport quiescence, and the single-timeout bound are not. |
| Invariant 6 (listeners before commands) | Transport construction permits it and the uncommitted actor can assert it; no production generation proves it. |
| Invariant 8 (no retired callback/PDU/retry/sentinel publication) | Necessary fences are named; their placement and serialization are unproven. |
| Invariant 12 (invalidate before exact delivery) | W1 proves downstream queue ordering after calls occur; no controller proves call order. |
| Invariant 13 (`error` + `end` at most one replacement) | Idempotent close is sufficient locally, but clean-end callback-before-event and controller wake ownership leave the composition unproven. |
| Invariant 15 (release final from every state) | Unproven, with no owner before `native.subscribe` returns and no stated final join ordering afterward. |

**E04 remains open: primary source disproves two supporting claims and proves the needed runtime primitives, but there is no production state machine on which to establish the composition.**

## Confidence and caveats

- **High confidence** in Effect rc.112 semantics: OpenCode's pin and the exact matching Effect tag/commit were verified, and claims above cite implementation plus focused upstream tests.
- **High confidence** in transport order: findings cite the actual clean fork source at a clean revision, including synchronous callback and event order.
- **High confidence** that production proof is unavailable: W1 is generic committed plumbing, the actor is uncommitted fixture code, and the carrier contains no production Watchman modules.
- **Medium confidence** in consequences whose final step depends on omitted controller code; these are labeled `U` or conditional rather than treated as defects in code that does not exist.
- This audit does not decide permanent failure policy (E05), acquisition-circuit correctness (E11), daemon PDU semantics (E03), or the broader resource-latency contract (E12). It uses their boundaries only where the E04 release/interruption claim directly depends on them.
