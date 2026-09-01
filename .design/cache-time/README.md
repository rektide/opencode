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

`Infinity` makes activity entries never expire — never-evict for locations
the sweep sees. Every construction site, `LocationActivity.node` in the
server graph included, inherits the env configurability; no call sites
change and defaults are unchanged (upstreamability preference).

Duration strings are parsed by Effect's own `Duration.fromInput` — the same
parser behind the `Duration.Input` option type, also used upstream in
`pty/ticket.ts`. Bare numbers are not accepted.

## Verification

From `packages/core`: `bun test test/location-activity-ttl.test.ts` — 5
pass (default / env / Infinity any case / invalid fallback /
option-over-env); the suite snapshots and restores
`OPENCODE_LOCATION_CACHE_TTL` because this host exports it live.
`bun typecheck` — clean.

## Deployment

`export OPENCODE_LOCATION_CACHE_TTL=infinity` in `~/.zshenv` pins activity
entries to never-expire on builds carrying this patch; without it,
upstream's activity-based 60-minute window applies.

History — the superseded flat-RcMap line, the diagnosis, and the
prioritization sketches — lives under snapshot `cache-ttl-20260825` and in
the patches manifest.

## Refresh onto `43d09b9d` (2026-09-01)

Mechanical freshen of the 2-commit line from base `e70d667a9fe3` to
`v2@origin` `43d09b9d75ad` ("fix(server): await plugin activation when
checking updates"), 115 upstream commits, via duplicate-then-rebase. The
pre-freshen originals and snapshot `cache-ttl-20260829` are untouched.

- **Collision check (mandated)**: no commit in `e70d667a9fe3..43d09b9d75ad`
  touches `location-activity.ts`, `location-services.ts`, or the TTL option
  surface — upstream landed no competing configurability of the activity TTL.
  The rebase was conflict-free and required no adaptations.
- **Diffstat**: the freshened line's own diff is byte-identical to the
  previous line's — 3 files, 123 insertions, 2 deletions
  (`.design/cache-time/README.md`, `packages/core/src/location-activity.ts`,
  `packages/core/test/location-activity-ttl.test.ts`). No file the old line
  did not touch; no diff creep.
- **Verification**: `bun install` left `bun.lock` unchanged.
  `bun test test/location-activity-ttl.test.ts` — 5 pass, 0 fail.
  `bun typecheck` from `packages/core` — clean.
  `bun test test/location-layer.test.ts` with `OPENCODE_LOCATION_CACHE_TTL`
  unset — 19 pass; the remaining failures in combined runs are the upstream
  plugin-activation family timing out at their 5s deadline, which reproduces
  identically on bare upstream `43d09b9d75ad` under the same host load
  (load average ~32 during the freshen; alternating bare/feature pairs fail
  together, and a passing run of the slowest case takes ~6.5s wall). With the
  live `OPENCODE_LOCATION_CACHE_TTL="8 hours"` export set, the two
  lifetime-refresh tests see the deployed 8h TTL instead of the 60-minute
  default — expected behavior of this feature on this host, matching the
  deployment note in the patches manifest.
- **Bookmarks**: `cache-ttl` + `cache-ttl-20260901` at this docs commit.
- **Confidence**: high. Zero conflicts, byte-identical feature diff, and the
  only test anomalies are proven load/environment-sensitive or documented
  deployment interactions.
