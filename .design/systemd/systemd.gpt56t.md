---
type: Design
title: Systemd-managed OpenCode service
description: Replace client eviction and external-mode patches with socket activation, supervisor-owned lifecycle, and explicit readiness.
resource: /.design/systemd/systemd.gpt56t.md
tags: [opencode, systemd, service, socket-activation, lifecycle]
status: draft
generated: { by: model:gpt-5.6-terra, at: 2026-08-30T16:01:37Z }
sources:
  - id: opencode-v2
    resource: https://github.com/anomalyco/opencode/tree/v2
    title: OpenCode V2 source
    author: org:anomalyco
  - id: local-service-forensics
    resource: file:///home/rektide/.local/share/opencode/log/opencode-local.log
    title: Local OpenCode structured log
    author: system:opencode
  - id: patch-manifest
    resource: file:///home/rektide/archive/doc/opencode/patches.md
    title: OpenCode patches and ideas
    author: human:rektide
---

# Systemd-managed OpenCode service

## Summary

OpenCode's client-managed service and systemd both try to own the same process
lifecycle. The client discovers a registration, probes health, terminates an
incumbent it considers unhealthy or version-incompatible, and spawns a
replacement. Systemd starts a configured process, restarts it after failure,
and expects to be the sole lifecycle authority. Combining those models without
changing the election protocol produced repeated displacement, interrupted
requests, and restart cascades.

The target design makes ownership explicit and singular:

- systemd owns the listening socket, process start, restart, stop escalation,
  and liveness policy;
- OpenCode consumes the inherited socket, reports readiness and watchdog
  heartbeats through `sd_notify`, and never self-displaces because another
  process rewrote a registration file;
- clients in systemd mode connect to a configured endpoint and never spawn,
  signal, evict, or directly restart a service process;
- OpenCode service commands delegate lifecycle operations to systemd instead
  of refusing them;
- desired configuration and observed runtime status are separate artifacts;
- the existing client-managed mode remains available and unchanged by default.

This replaces the accepted `noreap` and `explicit-port` patch stacks rather
than stacking another exception on top of them. The `terminate` shutdown
deadline remains independently useful for client-managed mode; systemd's stop
deadline supersedes it only for the systemd-managed path.

## Status and scope

This document is the standard design for the new
`~/src/opencode-systemd` workspace, based directly on `v2@origin`
`e70d667a9fe3`. It is not yet an implementation plan accepted into `working`.

The design covers:

- the incident evidence that motivates the rework;
- the port and version interactions that made the incident confusing;
- the ownership and configuration model;
- socket activation, `sd_notify`, and `serve --service` semantics;
- migration from the current local patch stack and user unit;
- Watchman as a supervised but non-fatal dependency;
- verification and unresolved decisions.

It does not redesign general remote OpenCode deployment, clustered Session
execution, or Watchman's own daemon implementation.

## Forensic baseline

### The ports did not migrate upstream

Current V2 source intentionally assigns different defaults by build channel in
[`packages/cli/src/services/service-config.ts`](/packages/cli/src/services/service-config.ts):

| Channel | Decimal | Hex | Introduced | Meaning |
| --- | ---: | ---: | --- | --- |
| `latest`, `dev`, `beta`, `next` | 49374 | `0xc0de` | existing installed-channel convention | shared installed service |
| `local` | 49375 | `0xc0df` | 2026-07-17, commit `6ea8247e` | isolated local-development service |
| other channels | hashed | n/a | 2026-07-17, commit `6ea8247e` | channel-isolated service |

The 2026-08-15 release-channel alignment changed which release channels share
`service.json` and 49374, but preserved the local-channel 49375 default.
There was no recent upstream migration from 49374 to 49375.

The local deployment created the split:

- unflagged local contenders ran `serve --service` and selected the local
  default, 49375;
- the user systemd unit forced `--port 49374` and `--hostname 0.0.0.0`;
- both processes used the same local-channel registration file,
  `~/.local/state/opencode/service-local.json`;
- `~/.config/opencode/service-local.json` was not pinned to port 49374 until
  2026-08-30 01:49 local time, after the first observed fight.

The critical invariant is therefore not "which port is correct." It is that
one service identity must have one configured endpoint and one lifecycle
owner. A port flag that disagrees with the channel config must not create a
second server that writes the same registration namespace.

### Confirmed Aug 30 failure chain

The strongest captured incident window is 2026-08-30 05:20-05:41 UTC.

1. Long-lived clients from build `0.0.0-local-202608192315` remained active
   while build `0.0.0-local-202608192353` was installed.
2. The default TUI and mini handlers explicitly call
   `ServerConnection.resolve({ mismatch: "replace" })` in
   [`packages/cli/src/commands/handlers/default.ts`](/packages/cli/src/commands/handlers/default.ts)
   and [`packages/cli/src/commands/handlers/mini.ts`](/packages/cli/src/commands/handlers/mini.ts).
3. Newly launched default/mini clients use exact-version replacement. Reconnect
   drops the version check but retains the running client's own command path,
   so an old TUI can repopulate a missing service with its old build after the
   symlink on disk changes. New clients then replace that old server.
4. Old local contenders selected 49375. The new systemd service selected its
   forced 49374. Both wrote `service-local.json`.
5. The server-side ownership poll in
   [`packages/cli/src/services/service-registration.ts`](/packages/cli/src/services/service-registration.ts)
   saw the foreign registration and opened its shutdown latch after five
   seconds.
6. Shutdown interrupted in-flight `/api/provider`, `/api/model`, `/api/config`,
   and location requests. The TUI rendered the resulting empty data as "no
   models or providers."
7. Teardown exposed an Effect `Deferred` failure (`X.resumes.indexOf`) after
   interruption. This was a shutdown symptom, not evidence of provider
   discovery failure.
8. systemd interpreted exit 130 as failure and restarted the new build;
   client replacement and registration displacement repeated.

The pinned log replay records 46 unflagged old-build `serve --service`
launches, 12 flagged new-build systemd launches, three explicit registration
replacements that observed the old server at `127.0.0.1:49375`, and 32,878
provider/model 5xx responses.

The systemd unit amplified the problem, but mixed-version replacement existed
before systemd. Rebuilding a binary while old TUIs remain open is sufficient
to create version ping-pong in client-managed mode.

### Older pre-systemd failure mechanism

The existing
[`terminate` postmortem](file:///home/rektide/src/opencode-working/.design/terminate/README.md)
records four elected winners on 2026-08-17 that were displaced by the
registration ownership poll, released their ports, and then hung indefinitely
inside teardown finalizers. New contenders bound the released port and repeated
the cycle. That mechanism predates the opencode systemd unit and explains why
the service could become badly wedged with only locally built OpenCode actors.

Approximately 1,050 zero-length `service-local.json.<uuid>.tmp` files from
2026-08-14 remain in the state directory. They are consistent with interrupted
registration attempts, but their exact writer path has not yet been proven
against the Aug 10 build. They are historical evidence, not proof that 1,050
Aug 30 contenders ran.

### Watchman is real but distinct

The Watchman supervisor has independent failures:

| Date | Evidence |
| --- | --- |
| 2026-08-13 | healthcheck restarted the daemon |
| 2026-08-14 23:20 | Watchman exited and then segfaulted; healthcheck reacted |
| 2026-08-17 16:59 | poisoned root: `opendir(.../.git) -> Too many open files` |
| 2026-08-19 | pidfile-lock restart loop plus repeated Watchman segfaults |
| 2026-08-25 | healthcheck stopped the daemon; takeover failed before systemd recovered it |

On 2026-08-30 the standalone `watch-list` healthchecks passed throughout the
observed OpenCode failure window until the healthcheck timer was manually
stopped at 01:44 local time. `watchman-main.service` did not restart during that
window. That signal was incomplete: OpenCode's retained Watchman client was
repeatedly ending connections while the daemon still answered `watch-list`.

One ready OpenCode server connected Watchman generations 1, 2, 4, and 5 and
logged 40 `watchman acquisition failed; using parcel watcher` warnings over
eight minutes. The following server connected generations 1 through 6 and
logged 37 acquisition failures. Many failures arrived in bursts when one ended
generation invalidated concurrent acquisitions. The manager's `"end"` event
currently retires a generation without a cause, so the root transport event is
silent even though all affected acquisitions log `The client was ended`.

These failures are not merely teardown fallout: they occurred after the server
reported ready and while it continued serving and reconnecting. They can
lengthen location work, multiply fallback subscriptions, retain teardown
resources, and create substantial retry pressure. They still do not explain
the initial Aug 30 election failure: new-build systemd servers reported ready
in 543-630 ms before old-version registrations displaced them, and the
provider/model failures align directly with service interruption. The design
therefore treats Watchman as a concurrent destabilizer and requires isolation
rather than claiming it was healthy or making it the sole root cause.

### Confidence table

| Claim | Confidence | Evidence |
| --- | --- | --- |
| 49374/49375 are channel defaults, not a recent port migration | confirmed | source history and annotation |
| mixed builds intentionally replaced one another | confirmed | handler source plus build-tagged logs |
| two endpoints wrote one registration namespace | confirmed | registration replacement logs |
| provider/model absence was caused by interrupted/failed HTTP reads | confirmed | `/api/provider` and `/api/model` 503/500 responses |
| systemd created the original instability | rejected | pre-systemd postmortem and state artifacts |
| Watchman was the primary Aug 30 election trigger | unsupported | election failure precedes/operates independently of client reconnect bursts |
| Watchman materially destabilized Aug 30 servers | confirmed | 40 and 37 acquisition-failure bursts plus repeated generations |
| standalone `watch-list` health represented client transport health | rejected | healthcheck passed while OpenCode clients repeatedly ended |
| Watchman contributed to older teardown/startup problems | plausible | poison, segfaults, failed subscription and retained-watch history |
| zero-byte Aug 14 temp files each represent one contender | unresolved | writer behavior for the Aug 10 build still needs reconstruction |

## Design goals

1. Exactly one actor owns spawn, restart, stop, kill escalation, and the
   listening endpoint in each mode.
2. Systemd-managed clients cannot evict the service, including on exact build
   version mismatch.
3. Socket activation keeps the endpoint reserved across process restarts and
   queues initial connections while the service starts.
4. Readiness means the real HTTP application is installed, not merely that a
   process exists or a port is bound.
5. Liveness failure is detected independently of ordinary HTTP request load.
6. Desired endpoint and credentials are stable before process activation.
7. Configuration has one source of truth; generated systemd artifacts are
   derived outputs.
8. A Watchman restart degrades file watching but does not make the OpenCode
   service unready or trigger a process restart.
9. Client-managed mode remains the default for users who do not opt in.
10. Migration fails safely when old, manager-unaware clients remain alive.

## Non-goals

- Automatic transparent compatibility with arbitrary old clients. An old
  client may fail to attach after migration, but it must not kill the
  supervisor-owned process.
- Giving OpenCode unrestricted authority to install system units without an
  explicit user command.
- Making the HTTP server available before schema migration and core route
  construction are safe.
- Treating a Watchman outage as an OpenCode process-health failure.

## Ownership model

OpenCode gains a service manager concept separate from its process mode.

| Manager | Socket owner | Process owner | Client action | Registration role |
| --- | --- | --- | --- | --- |
| `client` | OpenCode process | `Service.ensure` clients | discover, spawn, replace, stop | election lease |
| `systemd` | `opencode.socket` | `opencode.service` | connect; delegate lifecycle commands | optional observed status |

`serve --service` continues to mean "run the shared background service
protocol." It no longer implies that the service self-binds or participates in
client election. Ownership is selected independently:

1. inherited `LISTEN_FDS` always selects supervised socket mode;
2. configured manager `systemd` without a valid inherited socket fails startup
   instead of silently binding a competing port;
3. otherwise the current client-managed path remains active.

The inherited socket is an authoritative safety signal even if config is
temporarily stale. The configured manager is authoritative for clients before
the process exists.

## Configuration model

The current flat service file is persisted data and needs a real migration.
The target schema groups lifecycle, listen, authentication, and environment
domains:

```jsonc
{
  "manager": {
    "type": "systemd",
    "service_unit": "opencode-local.service",
    "socket_unit": "opencode-local.socket"
  },
  "listen": {
    "hostname": "127.0.0.1",
    "port": 49374
  },
  "auth": {
    "password": "<stable private credential>"
  },
  "cors": [],
  "environment": {
    "OPENCODE_WATCHER_BACKEND": "watchman"
  }
}
```

The migration maps existing `hostname`, `port`, `password`, `cors`, `env`, and
`external` fields. `external: true` becomes `manager.type: "systemd"` only
when the systemd units are installed successfully; schema normalization alone
must not switch lifecycle ownership.

`listen.port` remains 49374 on this host during migration to avoid an unrelated
endpoint change. A new local setup with no explicit port may continue to use
the upstream local default, 49375.

### Materialized systemd artifacts

`opencode service systemd install` reads the service config and atomically
materializes:

- `~/.config/systemd/user/opencode-local.socket` with `ListenStream` derived
  from `listen`;
- `~/.config/systemd/user/opencode-local.service` with no hostname or port
  flags in `ExecStart`;
- an optional generated environment file derived from `environment`;
- a systemd credential or private environment artifact for `auth.password`.

The command runs `systemd-analyze --user verify`, `systemctl --user
daemon-reload`, and enables the socket before committing the manager change to
config. Units are derived artifacts, not a second editable source of truth.
Changing `listen` or `environment` while systemd-managed re-renders and reloads
the units transactionally.

## Socket activation

The socket unit binds the configured TCP endpoint and remains active while the
service process starts, stops, or restarts. `Accept=no` gives one listening
socket to one long-lived OpenCode service.

systemd passes descriptors beginning at fd 3 with `LISTEN_PID`, `LISTEN_FDS`,
and optionally `LISTEN_FDNAMES`. OpenCode must validate the pid, require exactly
one descriptor named `http`, clear the activation environment after parsing,
and pass `{ fd }` to the Node HTTP listener.

This is a small adaptation at the existing seam. OpenCode creates a Node
`http.Server` and calls Effect's `NodeHttpServer.make`; the Effect constructor
already accepts Node `Net.ListenOptions`, whose standard `fd` form adopts a
pre-bound descriptor. The server's actual address remains available after
listen for status reporting.

Socket activation guarantees endpoint exclusivity, but it does not by itself
prevent an old same-user client from sending SIGTERM to a pid found in the old
registration file. The migration must therefore also isolate the registration
protocol.

## Registration and status

The current registration combines desired connection information, credential,
election lease, process identity, and ownership watchdog input. Those roles
split in systemd mode:

- desired endpoint, manager, and credential live in service config;
- systemd owns socket and process identity;
- an optional state file reports observed pid, version, readiness, and start
  generation for diagnostics;
- no process polls the status file to decide whether it should die;
- clients do not resolve the endpoint through that state file.

The systemd status file must use a new path, such as
`service-systemd-local.json`, rather than the legacy election file
`service-local.json`. During migration the legacy file is removed only after
its recorded process is proven stopped.

This deliberate path split protects the new service from manager-unaware old
clients. An old client sees no election registration, attempts to spawn a
contender, and loses the port bind to the systemd socket. It may fail with a
clear port-in-use error, but it has no supervisor-owned pid to signal. New
clients resolve the configured endpoint directly, and their first connection
activates the socket.

Do not publish a fake pid or pid 0 in a compatibility registration. Signal 0
has process-group semantics and would make old-client eviction dangerous.

## Version policy

Exact build-version replacement caused the Aug 30 ping-pong. Systemd mode uses
this policy:

- build mismatch never grants a client lifecycle authority;
- protocol-compatible clients connect with a warning;
- protocol-incompatible clients fail with the server and client versions plus
  `opencode service restart` guidance;
- upgrade and rollback occur through the supervisor/deployer, not through
  whichever TUI probes first.

Longer term, health should expose a protocol compatibility version distinct
from the exact build version. Client-managed mode also needs a monotonic or
protocol-aware replacement policy so old and new long-lived TUIs cannot each
declare themselves the rightful winner. That fix is useful even if systemd mode
ships first.

## `serve --service` revision

The shared-service process path becomes manager-aware:

```text
serve --service
  -> read config and activation environment
  -> choose client-owned or supervisor-owned lifecycle
  -> adopt inherited fd or bind normally
  -> install health dispatcher in waiting state
  -> build routes and recover durable work
  -> install the application
  -> mark HTTP health ready
  -> sd_notify READY=1 in systemd mode
  -> await supervisor signal or client-owned shutdown latch
```

Specific changes in systemd mode:

- skip `Service.incumbent` and all port-election logic;
- skip registration ownership polling and displacement shutdown;
- skip client contender/updater ownership behavior;
- exit nonzero if route boot fails instead of holding a failed listener forever
  in `Effect.never`; systemd's restart policy owns recovery;
- send `STOPPING=1` before scoped teardown;
- exit 0 after a requested clean stop;
- let systemd enforce the final kill deadline.

An explicit test-only `--service-manager client|systemd` override may be useful,
but normal units should rely on socket activation plus config rather than a
hard-coded `--systemd` flag.

## `sd_notify` integration

The systemd service uses `Type=notify` and `NotifyAccess=main`.

OpenCode emits:

| Notification | Point |
| --- | --- |
| `STATUS=Starting HTTP service` | after activation environment validation |
| `STATUS=Building application routes` | before route-layer construction |
| `READY=1` | immediately after HTTP status changes to ready |
| `WATCHDOG=1` | periodically after ready, at half `WATCHDOG_USEC` |
| `STATUS=Watchman unavailable; reconnecting` | degraded dependency state, without clearing readiness |
| `STOPPING=1` | before shutdown finalizers begin |

The watchdog heartbeat runs on the main event loop. If synchronous work, GC,
or a runtime wedge prevents scheduling, heartbeats stop and systemd acts. This
distinguishes process liveness from per-client HTTP timeout policy without a
second OpenCode process trying to elect a replacement.

Known long database migrations may send `EXTEND_TIMEOUT_USEC`; ordinary
location initialization should instead move out of the global readiness path.
The notification transport can use a small sd-notify library or the
`systemd-notify` executable initially; the implementation must preserve
`NOTIFY_SOCKET` abstract-socket semantics.

## Draft units

These units show the target semantics. The install command should generate
channel/profile-specific names and the configured address.

```systemd
# ~/.config/systemd/user/opencode-local.socket
[Unit]
Description=OpenCode local API socket
Documentation=https://opencode.ai/docs/

[Socket]
ListenStream=127.0.0.1:49374
Accept=no
NoDelay=true
Service=opencode-local.service
FileDescriptorName=http

[Install]
WantedBy=sockets.target
```

```systemd
# ~/.config/systemd/user/opencode-local.service
[Unit]
Description=OpenCode local background service
Documentation=https://opencode.ai/docs/
Wants=network-online.target
After=network-online.target
Requires=opencode-local.socket
After=opencode-local.socket
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=notify
NotifyAccess=main
ExecStart=/usr/local/bin/opencode2 serve --service
EnvironmentFile=-%h/.config/opencode/service-local.env
Restart=on-failure
RestartSec=2
WatchdogSec=60
TimeoutStartSec=180
TimeoutStopSec=90
KillSignal=SIGTERM
FinalKillSignal=SIGKILL
KillMode=mixed
UMask=0077
StandardOutput=journal
StandardError=journal
SyslogIdentifier=opencode-local
```

`KillMode=mixed` gives the main process a chance to suspend Sessions and close
persistent PTYs before systemd kills the remaining cgroup at the deadline.
More aggressive sandboxing must be evaluated carefully because server-spawned
tools inherit the unit's filesystem, privilege, and syscall restrictions.
`DynamicUser`, `ProtectHome=read-only`, and broad syscall filters are not safe
defaults for an agent that intentionally works in user projects.

The `Requires`/`After` socket relationship and descriptor delivery should be
verified against the host systemd version with generated-unit integration
tests; the socket's `Service=` association is the primary activation edge.

## Service commands

The current `explicit-port` patch makes `service start|stop|restart` refuse in
external mode. The revised UX delegates instead:

| Command | Client-managed | Systemd-managed |
| --- | --- | --- |
| `service start` | `Service.ensure` | start socket; optionally start service eagerly |
| `service stop` | graceful client stop | stop service and socket so it stays stopped |
| `service restart` | client stop plus ensure | `systemctl --user restart <service>` |
| `service status` | registration plus health | unit, socket, configured endpoint, status file, health |
| `service set` | update config; restart if needed | render units, verify, reload, restart transactionally |

Stopping only the service while leaving the socket active is a "sleep" action:
the next connection starts it again. A distinct `service stop --socket-active`
or `service sleep` can expose that behavior later; plain `stop` should meet the
user expectation that it stays stopped.

The CLI should invoke `systemctl --user` only when the configured manager is
systemd and provide the exact failed command and unit name on error. It must not
silently fall back to client ownership.

## Health and startup

The current server binds and serves `/api/health` before the application route
layer is ready. Waiting returns 503, failed boot returns 500, and ready returns
2xx. This is compatible with socket activation if clients interpret those
states without spawning or evicting.

Systemd readiness maps to the same internal status transition as HTTP health.
There must not be two definitions of ready.

Location-specific service stacks, Watchman subscriptions, and restoration of
noncritical tabs should not block global readiness. Durable restart recovery
that must precede user work remains part of boot, but it needs bounded
concurrency and explicit startup spans so one slow repository cannot leave the
whole process in waiting state indefinitely.

## Observability

The existing
[`otel.md`](file:///home/rektide/archive/doc/opencode/otel.md) runbook remains
the monitoring baseline for logs, traces, authenticated health, cgroup
resources, pressure, OOM events, and restart counts. This design changes its
current lifecycle constraints:

- `Type=simple` becomes `Type=notify` once OpenCode emits `READY=1`;
- direct process binding becomes a systemd-owned listening socket;
- health remains the application-readiness signal and gains an identical
  systemd readiness transition;
- the systemd watchdog adds main-event-loop liveness but does not replace HTTP
  readiness, OTLP traces/logs, or cgroup metrics;
- `OPENCODE_PRINT_LOGS=1` keeps the journal and OpenCode log independently
  useful;
- the systemd invocation ID, OpenCode `run` ID, HTTP health pid, and Watchman
  generation should be logged together for incident correlation.

Add low-cardinality counters for supervisor activation, clean/failed exits,
watchdog misses, Watchman generation retirements, fallback acquisitions, and
time spent in starting/ready/stopping states. Paths and Session IDs remain
trace/log fields, not metric labels.

## Watchman boundary

OpenCode and Watchman are independently supervised services.

- OpenCode may `Wants=` Watchman where convenient, but must not `Requires=` or
  `BindsTo=` it.
- OpenCode readiness does not wait for Watchman health.
- The Watchman backend reconnects with bounded concurrency, jitter, and clear
  degraded-status logging after daemon replacement.
- Every generation retirement logs its event kind, connected duration, live
  subscription count, and the command stage that caused retirement. A bare
  transport `"end"` must no longer be silent.
- Inotify/Parcel fallback remains available when Watchman is absent.
- A Watchman healthcheck restart must not cause OpenCode to exit or become
  globally unready.
- Shutdown finalizers for Watchman subscriptions remain bounded; systemd's stop
  deadline is the final backstop.

The current Watchman healthcheck is destructive after one failed five-second
`watch-list`: it requests shutdown, stops the unit, removes daemon state, and
starts again. It also misses the observed client-transport failure mode because
`watch-list` can succeed while established clients repeatedly receive `end`.
Its own redesign should add failure thresholds, compare a fresh probe with
long-lived client/generation telemetry, capture daemon resource state, and
avoid colliding restart jobs. That is a separate workspace, but
systemd-managed OpenCode must tolerate its present behavior.

Initial systemd verification should run first with the upstream/default watcher
backend, then repeat with Watchman. This changes one failure domain at a time.

## Security and exposure

The current unit binds `0.0.0.0` while service config says `127.0.0.1`. The
generated socket defaults to loopback. LAN exposure requires an explicit
config change and a matching CORS/auth review.

The stable service credential must exist before socket activation. Options in
preference order:

1. a mode-0600 service config readable only by the user;
2. a generated systemd credential consumed through `LoadCredential=`;
3. a mode-0600 generated environment file.

The observed status file does not need to repeat the password because
systemd-aware clients read desired config directly. Remote explicit-server
clients continue using `OPENCODE_PASSWORD` or another deliberate credential
input.

## Migration from current patches

### `noreap`

The systemd path supersedes patient client eviction because it performs no
client eviction at all. Do not carry the patience env vars into the new manager
implementation. The parameterized client options may remain useful upstream or
for client-managed mode, but they are not a prerequisite of systemd ownership.

The graceful-stop-first idea becomes supervisor delegation: `service stop`
asks systemd, OpenCode receives SIGTERM, sends `STOPPING=1`, and runs normal
shutdown. SIGKILL escalation belongs to `TimeoutStopSec` and `FinalKillSignal`.

### `explicit-port`

Replace boolean `external` with the manager domain. Preserve the useful
discover-only invariant, but resolve through configured static endpoint/socket
activation rather than a registration file. Replace command refusal with
systemd delegation. Keep readiness and contender timing logs where they remain
generally useful, but contender events are irrelevant in systemd mode.

### `terminate`

Keep this stack independent while client-managed service mode exists. In
systemd mode, the process may use a shorter internal diagnostic deadline, but
systemd is the authority that guarantees eventual death. Do not let two kill
deadlines race without documenting their order.

### Current local deployment

The transition should be explicit and reversible:

1. stop and inventory all old TUI and service processes;
2. stop/disable the current `opencode.service` unit;
3. verify the legacy registration's pid and remove the file only after that
   process is stopped;
4. preserve the current configured endpoint `127.0.0.1:49374`;
5. install and verify the socket/service units;
6. enable and start the socket;
7. write `manager.type: "systemd"` last;
8. connect with the matching new client, triggering activation;
9. verify one inherited listening fd, `READY=1`, health, providers/models, and
   Session access;
10. keep the Watchman backend disabled for the first pass, then enable it and
    restart only through systemd;
11. remove `noreap` and `explicit-port` from `working` only after the new stack
    passes mixed-version and supervisor-restart tests.

Rollback writes manager `client` only after stopping/disabling the systemd
socket and service, then lets `Service.ensure` create a fresh legacy
registration. It must not leave the socket holding the client-managed port.

## Implementation slices

Each slice is independently testable and should be committed separately.

1. Add grouped service config and migration without changing runtime behavior.
2. Parse and validate systemd activation descriptors; add an inherited-fd
   listener option to the server.
3. Split election registration from supervisor status and disable displacement
   in supervised mode.
4. Add the `sd_notify` lifecycle service and map readiness to existing HTTP
   status.
5. Add systemd-aware client resolution with static endpoint and no process
   authority.
6. Add systemd lifecycle command delegation.
7. Add unit rendering, verification, install, transition, and rollback.
8. Add mixed-version isolation and stale-registration migration tests.
9. Verify default watcher behavior, then Watchman restart tolerance.
10. Update the patch manifest to supersede `noreap` and `explicit-port`.

## Verification matrix

### Source-level tests

- local default remains 49375 and explicit configured 49374 remains stable;
- inherited fd is accepted only when `LISTEN_PID` matches and exactly one
  named HTTP descriptor exists;
- systemd mode never calls contender spawn, `process.kill`, registration
  displacement, or client stop escalation;
- systemd mode without activation fd fails before binding;
- client mode preserves current behavior;
- waiting health maps to no spawn/evict in systemd clients;
- failed route boot exits nonzero in supervised mode;
- clean systemd stop exits zero and emits `STOPPING=1`;
- readiness emits once after application installation;
- watchdog heartbeat stops when its scheduling fiber is deliberately stalled;
- config migration does not activate systemd implicitly.

### Unit verification

Run `systemd-analyze --user verify` on generated units and assert:

- one socket owns the configured endpoint while the service is stopped;
- connecting starts exactly one service;
- the service receives fd 3 named `http`;
- a crash restarts the service without releasing the endpoint;
- a clean stop does not restart until the socket is explicitly re-enabled or
  receives the chosen sleep semantics;
- start-rate limiting produces a clear CLI status instead of silent provider
  absence.

### Incident regressions

- keep an old TUI open, replace the binary, launch a new TUI: neither client
  signals the systemd process;
- run an old manager-unaware client after migration: it fails without learning
  or signaling the supervisor pid;
- make `/api/health` wait longer than the historical ~9-second eviction window:
  no contender or signal occurs;
- rewrite the supervisor status file: the server remains running;
- restart Watchman while several locations are subscribed: OpenCode remains
  ready, reports degraded watcher state, and reconnects without process restart;
- force a teardown hang: systemd reaches `FinalKillSignal` and the next socket
  connection starts one clean process;
- provider/model reads remain available or return an explicit service-starting
  error; the TUI never turns transport failure into a misleading empty catalog.

## Open decisions

1. Should the grouped service config remain a separate per-channel file or
   become a `service` section in the primary OpenCode config?
2. Should `opencode service stop` disable the socket, while a new `sleep`
   command stops only the process?
3. Which notification transport is acceptable: a small dependency, FFI, or
   invoking `systemd-notify`?
4. Should systemd mode use a separate observed status file or no status file at
   all beyond `/api/health` and `systemctl show`?
5. What protocol compatibility identifier replaces exact build-version
   replacement?
6. Should unit installation be an OpenCode command, a compfuzor integration,
   or both using one rendered artifact format?
7. Is loopback-only the durable default, with LAN exposure a named profile?
8. Should the Watchman healthcheck redesign join this workspace only as an
   integration fixture, or remain entirely separate?

## Cross-references

- [`noreap` design](file:///home/rektide/src/opencode-working/.design/noreap/README.md)
  documents the historical client eviction thresholds and why busy health
  probes were unsafe.
- [`explicit-port` design](file:///home/rektide/src/opencode-working/.design/explicit-port/README.md)
  provides the discover-only invariant and current external-mode UX that this
  design supersedes.
- [`terminate` postmortem](file:///home/rektide/src/opencode-working/.design/terminate/README.md)
  records the pre-systemd displacement and immortal-finalizer cascade.
- [`watchman` design](file:///home/rektide/src/opencode-working/.design/watchman/README.md)
  records retained daemon transport, reconnect, and cleanup decisions relevant
  to dependency degradation.
- [`patches.md`](file:///home/rektide/archive/doc/opencode/patches.md) is the
  accepted-stack manifest that must eventually replace `noreap` and
  `explicit-port` with this workspace.
- [`otel.md`](file:///home/rektide/archive/doc/opencode/otel.md) supplies the
  current health semantics and systemd/cgroup monitoring runbook; this design
  implements several lifecycle additions it identifies as missing.
- [systemd socket units](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html),
  [`sd_listen_fds`](https://www.freedesktop.org/software/systemd/man/latest/sd_listen_fds.html),
  [`sd_notify`](https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html),
  and [systemd service units](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
  define the supervisor contracts used here.
