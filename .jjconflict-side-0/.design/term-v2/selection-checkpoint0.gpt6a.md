# Ordered epilogue selection: executable checkpoint

Date: 2026-09-06  
Model: OpenAI GPT-6 Astra xhigh (`gpt6a`)  
Capability: `rekon-session-mementos-display-selection`  
Status: pure kernel implemented; display wiring and parent acceptance remain gated

## Changed direction and bounded outcome

The human chose **current + visible tabs**, **sequential narrowing**, and **keep current**. Visited-this-process remains wanted, but needs its own record and capability. This supersedes the locally-visited default recommended in [the preceding evidence report](/.design/term-v2/multi-session-evidence0.gpt6a.md). The human also requires per-filter termination authority and modular session lookers, including last activity; the earlier mandatory `Active` lane is precedent, not an accepted restriction on the future looker model.

This checkpoint implements **only the pure selection kernel and tests**, in [the epilogue domain](/packages/tui/src/epilogue/selection.ts). It does not discover visible tabs, record visits, change configuration, gather snippets, register lookers, retain batches, or alter shutdown/output. The eventual inventory is current + visible tabs, but **there is intentionally no inventory integration or implicit membership rule in this kernel**.

Authoritative refinement: [Rekon session checkpoint](file:///home/rektide/src/rekon/design/session-mementos/checkpoint0.gpt6a.md#ordered-selection-contract-for-the-first-kernel), following [the original brief](file:///home/rektide/src/rekon/design/session-mementos/brief0.gpt6a.md). The [broader ordered-pipeline memento](file:///home/rektide/src/rekon/design/ordered-pipelines/memento0.gpt6a.md#termination-is-a-request-plus-a-grant) preserves the general inquiry without commissioning a shared runtime.

## Actual interface

```ts
type EpilogueSession = {
  readonly sessionID: string
  readonly activity: {
    readonly status: "idle" | "running"
    readonly updated: number
    readonly idle?: number
  }
}

// Eager metadata preparation; no IO or clock reads.
orderEpilogueSessions({ sessions, currentID? })
// → { order: "activity-desc", current?, additional: Iterable<EpilogueSession> }

// Lazy, synchronous selection; now is supplied explicitly.
selectEpilogueSessions({ source, now, rules? })
// → Generator<EpilogueSession>
```

Each `EpilogueSelectionRule` has a **host-supplied `terminating: boolean` grant**, independently from the result:

| Rule | Parameters and ordinary decision | Termination request |
| --- | --- | --- |
| `membership` | `sessionIDs: ReadonlySet<string>`; keep only members. | Never requests a stop: non-membership does not prove anything about the tail. |
| `activity-within` | `within_ms`; keep running Sessions and idle Sessions whose recorded last activity meets the inclusive cutoff. | Requests stop on the first too-old idle Session, justified by the source order. |
| `limit` | `count`; keep the first `count` inputs reaching **this stage**, drop subsequent inputs. | Requests stop once its quota is reached. A denied grant still drops excess inputs while consuming upstream. |
| `filter` | A synchronous host-owned `evaluate(session, { index, now }) → { keep, terminate? }`; index is local to this stage. | Whatever the callback requests, subject to the separately supplied grant. |

`filter` is a narrow internal predicate seam for epilogue composition and executable authority tests. It is not a public plugin registration, JSON callback configuration, shared pipeline package, transform, reorder, async operation, or universal interpreter. Existing plugin callback interfaces are untouched.

Example composition (not a currently supported `cli.json` shape):

```ts
const source = orderEpilogueSessions({ sessions: suppliedMetadata, currentID })
const selected = selectEpilogueSessions({
  source,
  now,
  rules: [
    { type: "membership", sessionIDs: visibleTabIDs, terminating: false },
    { type: "activity-within", within_ms: 172800000, terminating: true },
  ],
})
```

## Semantics and edge cases

- **Current is pinned outside all stages**, yielded first, and removed from the additional stream before counting or filtering. It survives old age, missing membership, and a zero limit. Duplicate supplied IDs use the first available metadata entry; current appears once.
- Missing metadata entries (`undefined`) are omitted. A `currentID` without supplied metadata creates no placeholder, fetch, or synthetic Session. Empty input yields nothing. With no current, all known supplied entries remain eligible for the explicit rule list.
- Additional Sessions sort **running first**, then descending `max(updated, idle ?? updated)`, then ascending lexical Session ID. The ID comparison is locale-independent. The input array itself is not sorted in place.
- Source preparation advertises the single supported `activity-desc` order. Iterable wrappers may instrument it, but must preserve distinct IDs, current exclusion, and order. Callers must keep the read-only metadata facts stable while consuming selection. Immutable retained output is a separate capability, not a promise this kernel makes about caller-owned objects.
- All stages are lazy and run in their **written order**. They only narrow; none can reorder or reinsert Sessions. A downstream stage sees only items yielded by its predecessor. No optimizer moves membership, age, or limits around.
- `{ keep: true, terminate: true }` with authority yields the final item and then closes upstream when the generator is continued/drained. `{ keep: false, terminate: true }` with authority closes without yielding that item. Without authority, only the hint is ignored: keep/drop still applies.
- A granted zero limit returns without opening its upstream iterator. A denied zero limit drops everything but continues enumeration. No hidden total-output limit exists: a stage limit counts neither pinned current nor inputs removed by previous stages.
- Exactly two days old is **included** for `within_ms: 172800000`; one millisecond older is excluded. Future recorded activity qualifies. A zero window is valid and inclusive of `now`.
- Running eligibility is not a fabricated timestamp. A running Session may have an old recorded last activity; its `updated` and `idle` facts are never rewritten to `now`. Visit time is a third, absent fact. Presentation of last activity belongs to the separately authorized lookers.
- `now` and windows must be finite; windows nonnegative; limits nonnegative integers. Invalid numeric parameters fail on first iteration, before yielding even pinned current. Session metadata itself is already typed boundary data and is not repeatedly schema-validated here.
- Age stopping is safe because all running Sessions precede idle Sessions and all idle Sessions descend by the exact historical quantity used by the cutoff. Preceding narrowing stages preserve this proof. Raw tab or visit order does not qualify as an ordered source.

## Cost honesty

`orderEpilogueSessions` consumes **all supplied metadata** to deduplicate and sort: O(n) scan/storage plus O(n log n) sorting. Early termination cannot undo that work. It saves subsequent iterator/filter evaluation and, after future integration, looker work. Selection uses a chain of generators rather than materializing an array after each stage. There are no effects, timers, requests, server cursors, global clock reads, new dependencies, or generated-client changes.

## Verification and saved evolution

[The focused tests](/packages/tui/test/epilogue/selection.test.ts) cover the actual exported preparation/selection seam, with instrumented iterables and literal expected outputs:

- Source order, stable ties in running/idle groups, current and ordinary-ID deduplication, missing metadata, and empty/no-current input.
- Lazy iteration and stage-local indices; unauthorized stop ignored for both kept and dropped items; authorized keep/drop stop closes upstream without visiting the tail.
- Membership before age, inclusive 2d cutoff, running-first ordering, and granted versus denied age termination.
- `filter → limit` versus `limit → filter`; non-terminating positive/zero limits; granted zero limit does not open upstream; current does not consume a limit.
- Eager metadata sorting cost versus lazy traversal, yielding only pinned current, explicit clock changes, future activity, and invalid numeric parameters.

Commands run from `packages/tui`:

```sh
bun test --timeout 30000 test/epilogue/selection.test.ts test/context/epilogue.test.ts test/util/presentation.test.ts
bun typecheck
```

Result before independent review: **44 tests passed across three files** (26 new selector tests, 6 existing retained-row tests, 12 existing presentation tests), 92 assertions. Typecheck reports only the existing error in untouched [`process-lock-ffi.bun.ts:49`](/packages/core/src/util/process-lock-ffi.bun.ts#L49): `bigint | Pointer` is not assignable to `Pointer`. Selector/test typing errors encountered during development were corrected; the package check is still **blocked**, not green. No full suites or process matrix were rerun for this unwired kernel.

`aef3a916` saved the 24-test predecessor before applying the newly explicit non-terminating-limiter policy. The follow-up makes the grant uniform across all stages and adds the denied-limiter tests. Review baseline is the parent's jj navigation commit `d78bdbf39eee`; `.git/HEAD` is a separate stale repository and must not be used to review this source lineage.

## Next gate

Review this executable selection contract before authorizing inventory/config, retained-batch, looker, or excerpt integration. In particular, agree that the custom predicate is host-internal, the source contract requires stable read-only facts, and the current pin is outside every narrowing stage. The selector alone does not make multi-session epilogues visible. The current + visible-tabs inventory remains the next independent capability; visited-this-process recording is not a prerequisite and is not implemented here.

# Review addendum

The complete executable revision is saved at **`1b1ff39bb787`** (`fix(tui): separate selection authority from filter decisions`), following **`aef3a916a5c6`**. Both code commit bodies reference `rekon-session-mementos-display-selection`. The latest focused run remains **44 passed / 0 failed / 92 assertions**. All seven local/cross-repository Markdown link targets in this checkpoint resolve. A jj comparison confirms the reported core FFI error's source file is unchanged against the review baseline.

The required independent Standards/Spec review was attempted, but both background reviewer calls were rejected because this session is already at the configured subagent-depth limit. No configuration was changed to bypass that limit. The notes below are therefore **author self-review**, not independent review or parent acceptance.

Review range: `jj diff --from d78bdbf39eee --to 1b1ff39bb787 --git packages/tui/src/epilogue/selection.ts packages/tui/test/epilogue/selection.test.ts`.

## Standards

No documented-standard violation or actionable heuristic smell identified in the bounded diff. The implementation is domain-grouped, has no runtime imports/dependencies, validates its numeric policy boundary once, and uses generators only for real lazy traversal. The tests exercise exported behavior without mocks or duplicated selection logic. Tool-enforced formatting/type diagnostics are not reclassified as manual standards findings.

## Spec

No outstanding functional requirement identified within the authorized pure-kernel slice. In particular, all stages now have a separate composition grant; denied limiter termination preserves its ordinary keep/drop behavior; source order justifies age stopping; current is excluded before stage-local counting; metadata scan/sort cost is explicit. Inventory and modular last-activity/content lookers remain intentionally unimplemented capabilities, not silently wired defaults.

Self-review summary: **Standards 0 findings; Spec 0 findings. Independent review remains unavailable here and parent architectural review remains the next gate.** Package typecheck is still blocked by the untouched core error described above.
