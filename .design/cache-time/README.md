# cache-time — location activity TTL from `OPENCODE_LOCATION_CACHE_TTL`

Upstream's `LocationActivity` service owns location cache expiry: session
events touch active locations, and a sweep expires them after an activity
TTL (`layer({ timeToLive })`, default "60 minutes"). The TTL is only
settable programmatically — this patch gives it runtime configurability.

## What

`packages/core/src/location-activity.ts` resolves the TTL via the exported
`resolveTimeToLive`, used by `layer()` whenever `timeToLive` is not passed:

- an explicit `timeToLive` option wins;
- else `OPENCODE_LOCATION_CACHE_TTL` — Duration syntax ("90 minutes",
  "2 hours", "7 days") or `Infinity`, case-insensitive;
- else the upstream 60-minute default;
- invalid values log a warning and fall back to the default.

Every resolution emits one info breadcrumb naming the winning source
(`option` / `env` / `default`) and the resolved duration, so a deployment
shell's env override is visible at layer build instead of diagnosable only
through eviction timing.

`Infinity` makes activity entries never expire — never-evict for locations
the sweep sees. Every construction site, `LocationActivity.node` in the
server graph included, inherits the env configurability; no call sites
change and defaults are unchanged (upstreamability preference).

Duration strings are parsed by Effect's own `Duration.fromInput` — the same
parser behind the `Duration.Input` option type, also used upstream in
`pty/ticket.ts`. Bare numbers are not accepted.

## Hermetic tests

The eviction tests in `test/location-layer.test.ts` replace
`LocationActivity.node` with a pinned node — same service tag, same deps,
`layer({ timeToLive: "60 minutes" })` — because the node resolves the env
var at build time and this host's deployment shell exports
`OPENCODE_LOCATION_CACHE_TTL="8 hours"` live. Without the pin, the two
lifetime-refresh tests observe the deployed 8-hour TTL; with it, the suite
is hermetic regardless of ambient environment. Unit tests for the
resolution itself live in `test/location-activity-ttl.test.ts` and
snapshot/restore the env var.

## Verification

From `packages/core`:

- `bun test test/location-activity-ttl.test.ts` — 5 pass (default / env /
  Infinity any case / invalid fallback / option-over-env).
- `bun test test/location-layer.test.ts` — 12 pass with
  `OPENCODE_LOCATION_CACHE_TTL` unset **and** with the live
  `"8 hours"` export set (the hermeticity claim, proven both ways).
- `bun typecheck` — clean.

## Deployment

`export OPENCODE_LOCATION_CACHE_TTL=infinity` in `~/.zshenv` pins activity
entries to never-expire on builds carrying this patch; without it,
upstream's activity-based 60-minute window applies.

## Rebuild onto `4772b6a3` (2026-09-02)

Rebuilt from scratch atop `v2@origin` `4772b6a3e8c2` ("refactor: rename
State drafts to editors"), 87 commits past the previous base
`43d09b9d75ad`. Motivation: the 2026-09-02 compose friction report
(`~/src/opencode-working/.design/compose-20260902/`) asked that the
hermetic-test fix live in this feature line rather than only as compose
rider `174bd670`, and flagged the source breadcrumb as an open ease. Both
are now first-class commits instead of riders, sequenced so each state of
the line is coherent:

1. `feat(core): configure location activity TTL via OPENCODE_LOCATION_CACHE_TTL`
   — the feature and its unit tests, matching the previous line's proven
   implementation.
2. `test(core): pin location activity TTL in location-layer tests` — the
   compose rider ported verbatim; eviction tests hermetic from here on.
3. `feat(core): log resolved location activity TTL source` — the
   breadcrumb; a self-contained commit, trivially droppable if upstream
   dislikes it.
4. this docs commit.

- **Collision check (mandated)**: `location-activity.ts` is untouched in
  `43d09b9d75ad..4772b6a3e8c2` — the TTL default is still hardcoded
  upstream, no competing configurability. `location-services.ts` was
  refactored (canonical-ref normalization moved to
  `LocationServiceMap.canonical`, instance bindings rebuilt) and
  `location-layer.test.ts` was slimmed (the `itWithSdk` plugin-activation
  family moved out — also the end of the load-flaky tests in this file);
  neither interacts with the feature, and the pin ports cleanly onto the
  slimmed suite.
- **Verification**: `bun install` left `bun.lock` unchanged; both test
  files pass with and without the live export (see above); typecheck
  clean.
- **Skipped**: the `test/env.ts` `OPENCODE_*` scrub helper from the
  friction report remains gated on "if more appear" — one env-sensitive
  default exists, and the pin plus breadcrumb cover it.
- **Bookmarks**: `cache-ttl` + `cache-ttl-20260902` at this commit; the
  pre-rebuild line survives at `cache-ttl-20260901`.

## Refresh onto `7ba5f3e5b220` (2026-09-03)

Freshened the 4-commit line onto `v2@origin` `7ba5f3e5b220` via
duplicate-then-rebase: 94-commit upstream delta, **0 conflicts**,
carried diff byte-identical. Collision check clean (`location-activity.ts`
untouched upstream); rider `174bd670` remains covered by line commit 2.
Verification: ttl 5/5, location-layer 24/24 (12 pre-existing + 12 new
upstream retry tests), typecheck clean, all with
`OPENCODE_LOCATION_CACHE_TTL` unset. Bookmarks `cache-ttl` +
`cache-ttl-20260903` at the refresh docs commit. Details:
[`refresh-20260903.glm53f.md`](refresh-20260903.glm53f.md).

## Refresh onto `23f3f8b6ca61` (2026-09-04)

Freshened the 5-commit line onto locked baseline `v2@origin`
`23f3f8b6ca61` via duplicate-then-rebase: 67-commit upstream delta,
**0 conflicts** — in fact the delta touches none of the line's five
files, so the slide is a pure re-parent of a byte-identical diff
(+343/−2 carried). Collision check clean (`location-activity.ts`
untouched upstream; no new `OPENCODE_*` vars in the delta at all).
Verification: ttl 5/5, location-layer 24/24, typecheck clean, all with
`OPENCODE_LOCATION_CACHE_TTL` unset. Bookmarks `cache-ttl` +
`cache-ttl-20260904` at the refresh docs commit. Details:
[`refresh-20260904.glm53h.md`](refresh-20260904.glm53h.md).

## History

The superseded flat-RcMap line, the diagnosis, and the prioritization
sketches live under snapshot `cache-ttl-20260825` and in the patches
manifest. The re-aim onto `LocationActivity` and the first refresh onto
`43d09b9d` are recorded at `cache-ttl-20260901`.
