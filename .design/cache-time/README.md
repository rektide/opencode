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
