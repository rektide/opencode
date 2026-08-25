# cache-time — location cache lifetime

Feature workspace for making the per-directory location service cache
lifetime configurable. On deck in
[`~/a/d/o/patches.md`](file:///home/rektide/a/d/o/patches.md).

## Problem

Opening the session list in a TUI attached to the background server is slow
after idle, fast when warm, then slow again "too soon". Diagnosis:

- Every request is wrapped by `LocationMiddleware`
  (`packages/server/src/location.ts`), which provides a **per-directory
  service stack** from `LocationServiceMap`.
- `LocationServiceMap` is an Effect `LayerMap` over an `RcMap`, built in
  `packages/core/src/location-services.ts`. It cached entries with a
  **hardcoded `{ idleTimeToLive: "60 minutes" }`**.
- When a directory goes unused for 60 minutes the RcMap closes that entry's
  whole scope (config, plugin hosts, MCP servers, watchers…). The next
  request — e.g. the session picker's `data.location.sync()` before
  `session.list` — pays a full cold boot.
- Cold boots are expensive: across 1,331 `location services booted` events in
  the live server log (`~/.local/share/opencode/log/opencode-local.log`),
  median **7.4s**, p90 **33s**, max **134s**.
- `session.list` itself is a plain global-DB query; all latency is the
  location stack boot. Sweeps that touch many projects (e.g. all-project
  session lists) can cold-boot ~a dozen locations within seconds.

Effect semantics worth remembering (`RcMap.release`):

- `idleTimeToLive: Duration.zero` → evict **immediately** on last release
  (not "never evict").
- `idleTimeToLive: Infinity` → never evict.
- The idle timer restarts at every release-to-zero, so any use refreshes the
  lease.

## Change

Single commit (`cache-ttl` bookmark, based on `v2@origin` `173e3b0d`):

- `buildLocationServiceMap(replacements, options?)` gains
  `LocationCacheOptions.idleTimeToLive`.
- Resolution order: explicit option → env var
  **`OPENCODE_LOCATION_CACHE_TTL`** → default `"60 minutes"` (historical
  upstream value, kept for upstreamability).
- Env value syntax: effect `Duration.Input` strings ("90 minutes",
  "2 hours", "7 days") or `Infinity` (case-insensitive). Invalid values log a
  warning and fall back to the default.
- A finalizer registered via the existing build-scope `Layer.tap` fires when
  the RcMap entry is retired after idle eviction, logging
  `location services retired` with directory + total lifetime, alongside the
  existing `location services booted` log. This makes "forgetting"
  observable and verifies deployment of the env var.

Wiring was validated with a standalone probe (LayerMap entry finalizer fires
exactly at idle eviction; re-acquire re-boots). Tests:
`packages/core/test/location-cache.test.ts` covers default / env parse /
Infinity / invalid fallback / option-over-env. `location-layer.test.ts` 19/19
pass; core typecheck clean.

## Deployment

Export in shell like the other patience vars:

```sh
export OPENCODE_LOCATION_CACHE_TTL=infinity   # never retire locations
```

The background server inherits the environment it was started under, same as
`OPENCODE_SERVICE_EVICTION_STRIKES` etc.; under systemd external mode set it
in the unit. Restart the server to apply.

## Open questions

- Should the default change locally rather than staying 60m? Kept historical
  per the manifest's upstreamability preference; revisit after living with
  `infinity`.
- Memory growth if locations are never retired: each stack holds plugin
  hosts/MCP clients; heavy multi-project sweeps would accumulate. If that
  bites, consider a capacity-bounded variant or a long finite default.

## Follow-ups

- [Prioritizing concurrent location boots](/home/rektide/src/opencode-cache-time/.design/cache-time/prioritization.md)
  — OPTIONAL, explicitly not a priority. Records what asks for which
  projects' locations (TUI tab restore is the multi-project storm), the
  observability gap (boots log directory but not the requesting
  endpoint/session), and option sketches: bounded-concurrency priority
  queue, client priority hints, staged restore, attribution logging.
