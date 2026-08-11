---
type: Design # research / mechanism survey
title: "systemd/logind mechanisms for scheduled poweroff"
description: >-
  Independent survey of Linux/systemd/logind primitives for scheduling a
  10-minute poweroff, cancel/disarm, user-visible warnings, inhibitor locks,
  one-shot watchers, and user-vs-system unit tradeoffs. Proposes architectures
  and a v0 recommendation.
tags: [systemd, logind, shutdown, power-management, design]
status: draft
generated:
  by: human:glm52
  at: 2026-08-11T00:00:00Z
verified: { by: unverified, at: 2026-08-11 }
stale_after: 2027-08-11
sources:
  - id: man-systemd-run
    title: "systemd-run(1)"
    resource: man:systemd-run(1)
  - id: man-shutdown
    title: "shutdown(8)"
    resource: man:shutdown(8)
  - id: man-systemctl
    title: "systemctl(1)"
    resource: man:systemctl(1)
  - id: man-systemd-timer
    title: "systemd.timer(5)"
    resource: man:systemd.timer(5)
  - id: man-loginctl
    title: "loginctl(1)"
    resource: man:loginctl(1)
  - id: man-systemd-inhibit
    title: "systemd-inhibit(1)"
    resource: man:systemd-inhibit(1)
  - id: man-login1-dbus
    title: "org.freedesktop.login1(5)"
    resource: man:org.freedesktop.login1(5)
  - id: man-logind-conf
    title: "logind.conf(5)"
    resource: man:logind.conf(5)
  - id: man-systemd-special
    title: "systemd.special(7)"
    resource: man:systemd.special(7)
  - id: man-systemd-service
    title: "systemd.service(5)"
    resource: man:systemd.service(5)
  - id: man-systemd-kill
    title: "systemd.kill(5)"
    resource: man:systemd.kill(5)
  - id: man-systemd-notify
    title: "systemd-notify(1)"
    resource: man:systemd-notify(1)
  - id: man-wall
    title: "wall(1)"
    resource: man:wall(1)
  - id: man-notify-send
    title: "notify-send(1)"
    resource: man:notify-send(1)
---

# systemd/logind Mechanisms for Scheduled Poweroff

## Situation

We want to power off a machine after a delay (10 minutes out), with the
ability to cancel/disarm, show user-visible warnings, respect inhibitor
locks, and optionally run a one-shot "watcher" process before bed. This
document surveys the available primitives from primary sources (local man
pages, systemd 261) and proposes several architectures with a recommended v0.

System under survey: **systemd 261** (confirmed via `systemctl --version`).

---

## 1. Mechanism Survey

### 1.1 Scheduling a Poweroff 10 Minutes Out

There are **four distinct mechanisms**, each with different semantics:

#### A. `shutdown +10 "wall message"` — logind scheduled shutdown

```sh
sudo shutdown +10 "System powering off for maintenance"
```

The `shutdown` command is a compatibility wrapper that calls logind's
`ScheduleShutdown()` D-Bus method under the hood. Key behaviors:

- Time format: `+m` (minutes from now), `hh:mm` (24h clock), or `now`
  ([`shutdown(8)`][man-shutdown]).
- A wall message is sent to all logged-in users, broadcast periodically at
  decreasing intervals as the deadline approaches.
- **5 minutes before shutdown**, `/run/nologin` is created, preventing new
  logins ([`shutdown(8)`][man-shutdown]).
- Query pending shutdown: `shutdown --show` or
  `systemctl poweroff --when=show`.
- The scheduled time is stored in logind's runtime state as the
  `ScheduledShutdown` property (a `(st)` struct: type string + usec timestamp)
  on `org.freedesktop.login1.Manager` ([`org.freedesktop.login1(5)`][man-login1-dbus]).

#### B. `systemctl poweroff --when=` — systemd 254+ native (preferred)

```sh
sudo systemctl poweroff --when=+10min
sudo systemctl poweroff --when=show      # query pending
sudo systemctl poweroff --when=cancel    # cancel pending
```

Internally equivalent to `systemctl start poweroff.target
--job-mode=replace-irreversibly --no-block` but schedules via logind when
`--when=` is given ([`systemctl(1)`][man-systemctl]). Added in version 254.
Also accepts `auto` (maintenance window or +1min) and any timestamp parsed
per `systemd.time(7)`.

This is the **cleanest CLI** for arming/canceling a scheduled shutdown.

#### C. `ScheduleShutdown()` D-Bus method — programmatic

```
org.freedesktop.login1.Manager.ScheduleShutdown(in s type, in t usec)
org.freedesktop.login1.Manager.CancelScheduledShutdown(out b cancelled)
```

`type` is one of `"poweroff"`, `"dry-poweroff"`, `"reboot"`, `"dry-reboot"`,
`"halt"`, `"dry-halt"`. The `"dry-"` variants do everything *except* execute
the action — useful for testing/rehearsal. `usec` is microseconds since UNIX
epoch; `UINT64_MAX` means "use the next maintenance window" if configured
([`org.freedesktop.login1(5)`][man-login1-dbus]).

Query at any time via the `ScheduledShutdown` property:

```sh
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager ScheduledShutdown
# (st) "poweroff" 1723360200000000
```

`CancelScheduledShutdown()` returns `true` if a shutdown was actually
scheduled (and thus cancelled), `false` otherwise.

#### D. `systemd-run --on-active=` — timer-triggered shutdown

```sh
sudo systemd-run --on-active=10min --unit=bedtime-shutdown \
  --description="Scheduled poweroff" \
  systemctl poweroff
```

This creates a **transient `.timer` + `.service` pair**. The timer fires after
10 minutes of the timer unit being active (`OnActiveSec=`), activating the
service which runs `systemctl poweroff`. This is *not* a logind scheduled
shutdown — it's a systemd timer that happens to call poweroff.

Properties ([`systemd-run(1)`][man-systemd-run], [`systemd.timer(5)`][man-timer]):
- Monotonic timer: uses `CLOCK_MONOTONIC`, pauses during suspend.
- `--timer-property=AccuracySec=1us` for precision (default 1min coalescing).
- `--collect` (`-G`) to auto-unload the unit after completion.
- `RemainAfterElapse=` defaults to `true` — meaning re-starting the timer
  while it exists is a no-op. Set `--timer-property=RemainAfterElapse=no` to
  allow re-arming.

### 1.2 Cancel / Disarm

| Mechanism | Cancel command |
|---|---|
| `shutdown +10` | `sudo shutdown -c` |
| `systemctl poweroff --when=` | `sudo systemctl poweroff --when=cancel` |
| `ScheduleShutdown()` D-Bus | `CancelScheduledShutdown()` method call |
| Transient timer | `sudo systemctl stop bedtime-shutdown.timer` |

The first three all resolve to the same logind `CancelScheduledShutdown()`
call — they are interoperable. Cancelling via any one cancels all.

For the transient timer approach, `systemctl stop` the timer unit. The
service only runs when the timer elapses, so stopping the timer prevents the
service from ever activating.

### 1.3 User-Visible Warnings / Notifications

#### Wall messages (automatic from scheduled shutdown)

When using `ScheduleShutdown()` (mechanisms A/B/C above), logind broadcasts
**periodic wall messages** to all logged-in TTY sessions. The messages
include the shutdown time and the custom wall message. These become more
frequent as the deadline approaches. This is built-in; no extra code needed.

The wall message text and enable/disable can be set programmatically:
```
org.freedesktop.login1.Manager.SetWallMessage(in s wall_message, in b enable)
```
And queried via the `WallMessage` and `EnableWallMessages` properties
([`org.freedesktop.login1(5)`][man-login1-dbus]).

#### `/run/nologin` (automatic)

Created 5 minutes before scheduled shutdown ([`shutdown(8)`][man-shutdown]).
Prevents new logins. `pam_systemd` and `login` respect this.

#### `wall` command (manual broadcast)

```sh
wall "Powering off in 10 minutes. Save your work."
```

Writes to all logged-in TTYs ([`wall(1)`][man-wall]). Only superuser can
write to users who have denied messages. Does not reach graphical sessions
without a terminal.

#### `notify-send` (desktop notification)

```sh
notify-send -u critical "System Shutdown" \
  "Powering off in 10 minutes. Click to cancel."
```

Sends via the freedesktop notification daemon (D-Bus
`org.freedesktop.Notifications`) ([`notify-send(1)`][man-notify-send]).
Requires `DBUS_SESSION_BUS_ADDRESS` and `XDG_RUNTIME_DIR` — i.e., must run
**in the user's session context**. System services cannot call this directly;
they must either run as the user or use `systemd-run --user` / `machinectl
shell` / `runuser` to reach the user bus.

`-u critical` makes the notification persistent (no auto-expiry) and typically
bypasses do-not-disturb. Actions (`-A`) can provide a "Cancel" button if the
notification daemon supports actions (libnotify's `--wait` blocks for the
response).

#### `PrepareForShutdown` D-Bus signal

```
org.freedesktop.login1.Manager.PrepareForShutdown(b start)
org.freedesktop.login1.Manager.PrepareForShutdownWithMetadata(b start, a{sv} metadata)
```

Emitted by logind **twice** per shutdown cycle ([`org.freedesktop.login1(5)`][man-login1-dbus]):
- `PrepareForShutdown(true)` — emitted *before* the operation begins, after
  delay inhibitors have been notified. This is the last chance to do
  synchronous work.
- `PrepareForShutdown(false)` — emitted after the operation completes (on
  resume from suspend; for poweroff this is never seen since the machine is
  off).

This signal is the canonical hook for "do something right before shutdown."
Services that need to run before poweroff should listen for this signal or
use `ExecStartPre=` / `Before=shutdown.target` ordering.

### 1.4 Inhibitor Locks

Inhibitor locks block or delay system poweroff/sleep/idle operations
([`systemd-inhibit(1)`][man-systemd-inhibit], [`org.freedesktop.login1(5)`][man-login1-dbus]).

#### What can be inhibited

`--what=` takes a colon-separated list:
- `shutdown` — poweroff/reboot/halt/kexec
- `sleep` — suspend/hibernate
- `idle` — automatic idle detection (prevents `IdleAction` from firing)
- `handle-power-key`, `handle-reboot-key`, `handle-suspend-key`,
  `handle-hibernate-key`, `handle-lid-switch` — low-level hardware key handling

#### Modes

| Mode | Behavior | Override |
|---|---|---|
| `block` (default) | Prohibits operation **without time limit**. Since systemd 257, enforced against **all** users including privileged. | Only `SD_LOGIND_SKIP_INHIBITORS` flag (0x10) bypasses |
| `delay` | Delays operation up to `InhibitDelayMaxSec=` (default **5s**). Then ignored. Only available for `sleep` and `shutdown`. | Time limit |
| `block-weak` | Like `block` but ignored for privileged users or the same user who owns the lock. This is the pre-257 `block` behavior. | Privileged users |

#### How locks work mechanically

The `Inhibit()` D-Bus method returns a **file descriptor** (`pipe_fd`). The
lock is held as long as this fd (and all its duplicates) remains **open**.
Closing the fd releases the lock ([`org.freedesktop.login1(5)`][man-login1-dbus]).

```sh
# Block all shutdowns/sleeps/idle while this process runs:
systemd-inhibit --what=shutdown:sleep:idle \
  --who="Backup Job" --why="Running backup" \
  --mode=block \
  /usr/local/bin/my-backup
```

Query active inhibitors:
```sh
systemd-inhibit --list
# or via D-Bus:
busctl call org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager ListInhibitors
```

Or query the aggregated properties: `BlockInhibited`, `BlockWeakInhibited`,
`DelayInhibited` on the Manager object.

#### Polkit privileges for inhibiting

`Inhibit()` requires one of:
`org.freedesktop.login1.inhibit-block-shutdown`,
`org.freedesktop.login1.inhibit-delay-shutdown`,
`org.freedesktop.login1.inhibit-block-sleep`,
`org.freedesktop.login1.inhibit-delay-sleep`,
`org.freedesktop.login1.inhibit-block-idle`, etc.
([`org.freedesktop.login1(5)`][man-login1-dbus]).

### 1.5 Running a One-Shot Watcher Before Bed

Multiple options for "run a command once, 10 minutes from now, then it's
done":

#### systemd transient timer (recommended for integration)

```sh
sudo systemd-run --on-active=10min \
  --unit=bedtime-watch \
  --description="Pre-shutdown watcher" \
  --service-type=oneshot \
  --collect \
  /usr/local/bin/my-watcher.sh
```

Creates a transient `Type=oneshot` service triggered by a transient
`OnActiveSec=10min` timer ([`systemd-run(1)`][man-systemd-run],
[`systemd.service(5)`][man-service]). `Type=oneshot` means systemd waits for
the process to finish before considering the unit "active"
([`systemd.service(5)`][man-service]). `--collect` (`-G`) unloads the unit
after completion so it doesn't linger as failed.

#### systemd transient timer with shell logic

```sh
systemd-run --on-active=10min --collect -- \
  bash -c 'notify-send -u critical "Shutting down" "10 min warning"; \
           systemctl poweroff'
```

#### `at` command (simplest, but external to systemd)

```sh
echo 'systemctl poweroff' | at now + 10 minutes
```

`at` is available on this system (`/usr/bin/at`, `atd` running). It uses
`atd` daemon and `/var/spool/at/`. Simpler than systemd timers but:
- Not integrated with systemd's lifecycle / cgroups / logging.
- No native wall messages or `/run/nologin`.
- Cancellation: `atrm <jobid>`.
- Does not survive reboot (jobs in `/var/spool/at/` do survive, but the time
  is absolute, not relative — a `now + 10min` job scheduled before reboot
  would fire immediately on next boot if the time has passed).

#### Persistent timer unit file (survives reboot)

For something that should survive reboot, create a proper `.timer` +
`.service` pair:

```ini
# /etc/systemd/system/bedtime-watch.timer
[Unit]
Description=Pre-shutdown watcher timer

[Timer]
OnActiveSec=10min
AccuracySec=1us
RemainAfterElapse=no

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/bedtime-watch.service
[Unit]
Description=Pre-shutdown watcher

[Service]
Type=oneshot
ExecStart=/usr/local/bin/my-watcher.sh
```

```sh
sudo systemctl daemon-reload
sudo systemctl start bedtime-watch.timer
```

Note: `OnActiveSec=` is relative to timer activation, so re-starting the
timer re-arms it. `Persistent=` only applies to `OnCalendar=` timers
([`systemd.timer(5)`][man-timer]).

### 1.6 User vs System Units

#### System units (default, PID 1 manager)

- Run under `system.slice`, managed by PID 1.
- **Always survive user logout.** Not affected by `KillUserProcesses=`.
- Survive user sessions ending entirely.
- Require **root or polkit** to start/stop.
- Can call `systemctl poweroff` without additional auth.
- Cannot directly send desktop notifications (no access to user's D-Bus
  session bus).

#### User units (`--user`, `user@.service` manager)

- Run under the user's per-user service manager (`user@<uid>.service`).
- `user@.service` starts on first login, **stops after last logout** unless
  lingering is enabled ([`systemd-run(1)`][man-systemd-run],
  [`loginctl(1)`][man-loginctl]).
- `loginctl enable-linger <user>` makes `user@.service` start at boot and
  persist after logout — **required for user timers that must survive
  logout** ([`loginctl(1)`][man-loginctl]).
- Can access the user's D-Bus session bus → can call `notify-send`.
- Cannot directly call `systemctl poweroff` (system operation) — needs polkit
  auth or to talk to the system manager.

#### `KillUserProcesses=` interaction

From [`logind.conf(5)`][man-logind-conf]:
- `KillUserProcesses=no` (default on most distros): session scope is
  "abandoned" on logout; processes survive.
- `KillUserProcesses=yes`: all processes in the session scope are killed on
  logout. This would kill a watcher running in the session — but **not** one
  running as a user unit under `user@.service` (which is outside the session
  scope). The man page explicitly calls this out: "Running screen as a user
  unit has the advantage that it is not part of the session scope"
  ([`systemd-run(1)`][man-systemd-run]).

#### Decision matrix

| Requirement | System unit | User unit (+linger) | User unit (no linger) |
|---|---|---|---|
| Survives logout | ✅ always | ✅ with linger | ❌ killed |
| Can `systemctl poweroff` | ✅ direct | needs polkit | needs polkit |
| Can `notify-send` | ❌ no user bus | ✅ | ✅ |
| Survives reboot | needs `enable` + `Persistent=` | needs `enable` + `Persistent=` | needs `enable` + `Persistent=` |
| Requires root to install | ✅ | ❌ (user can install) | ❌ |

### 1.7 Privilege / Polkit Summary

From [`org.freedesktop.login1(5)`][man-login1-dbus]:

| Operation | Polkit action | Notes |
|---|---|---|
| `PowerOff()` | `org.freedesktop.login1.power-off` | + `-multiple-sessions`, `-ignore-inhibit` variants depending on context |
| `ScheduleShutdown()` / `CancelScheduledShutdown()` | Same as `PowerOff()` | Explicitly stated in man page |
| `Inhibit(block, shutdown)` | `org.freedesktop.login1.inhibit-block-shutdown` | |
| `Inhibit(delay, shutdown)` | `org.freedesktop.login1.inhibit-delay-shutdown` | |
| `systemctl poweroff` (as root) | Bypasses polkit | But **honors block inhibitors** since systemd 257 |

Since systemd 257, `block` inhibitors are enforced against **all** users,
including root. Previously, root (or the inhibitor owner) could bypass them.
That old behavior is now `block-weak`. To explicitly bypass inhibitors, use
the `SD_LOGIND_SKIP_INHIBITORS` (0x10) flag with `PowerOffWithFlags()`
([`org.freedesktop.login1(5)`][man-login1-dbus]).

### 1.8 The Idle-Detection → Arm-Shutdown Race

This is the critical design tension. The scenario:

1. **Detect idle**: user has been inactive for N minutes.
2. **Arm shutdown**: schedule poweroff for 10 more minutes.
3. During those 10 minutes, user might return — must cancel.

#### logind's built-in IdleAction (option, but limited)

`IdleAction=` + `IdleActionSec=` in `logind.conf(5)` can trigger `poweroff`
after the system is idle ([`logind.conf(5)`][man-logind-conf]). Conditions:
- **All** sessions report idle (via `SetIdleHint`).
- No `idle` inhibitor lock is active.
- `IdleActionSec=` has elapsed since all conditions met.

This is **global static config**, not dynamically arm/disarm-able per session.
You can't say "arm a 10-min poweroff countdown starting now" via IdleAction;
it's "after the machine has been idle for IdleActionSec, do X." The delay
happens *after* idle detection, not before.

#### Custom idle-watch + ScheduleShutdown (flexible)

1. Watch the `IdleHint` property (or `IdleSinceHintMonotonic`) on
   `org.freedesktop.login1.Manager` via D-Bus `PropertiesChanged`.
2. When idle threshold is met, call `ScheduleShutdown("poweroff", now+10min)`.
3. When `IdleHint` transitions to `false` (user active), call
   `CancelScheduledShutdown()`.

**The race**: between detecting idle (step 1) and arming (step 2), the user
might become active again. This window is small if detection is event-driven
(D-Bus signal) rather than polling. But there's also a deeper race:

- `IdleHint` is set by session managers (GNOME, KDE, etc.) calling
  `SetIdleHint(true)`. **If no session manager is running** (e.g., headless
  server, or a WM that doesn't report idle), `IdleHint` never becomes true,
  and `IdleAction` never fires. You'd need your own idle detection (e.g.,
  `xprintidle`, `w`, `/proc/interrupts` diffing, or a D-Bus idle client).

- Between `CancelScheduledShutdown()` being called and logind processing it,
  the shutdown could theoretically fire. In practice, logind checks the
  scheduled time each loop iteration and the cancel is synchronous on the
  D-Bus interface, so this window is negligible (sub-millisecond).

#### Recommended approach to the race

Use `PrepareForShutdown(true)` as a **final safety check**: when the signal
fires, verify the system is still idle (or that no inhibitor has been taken).
If conditions aren't met, there's nothing you can do at this point (the
shutdown is imminent), but you can log it. The real mitigation is cancelling
early — as soon as `IdleHint` goes false.

### 1.9 What Survives Logout / Suspend / Reboot

| Resource | Logout (no linger) | Logout (linger) | Suspend | Reboot |
|---|---|---|---|---|
| System timer unit | ✅ survives | ✅ | ✅ (monotonic pauses; calendar catches up on resume) | ❌ (unless `enable` + `Persistent=` for calendar timers) |
| User timer unit | ❌ killed | ✅ | ✅ | ❌ (unless `enable` + `Persistent=`) |
| `ScheduleShutdown()` state | n/a (system) | n/a | ✅ (stored in logind) | ❌ (lost — logind restarts fresh) |
| Inhibitor lock (fd-based) | ❌ (if in killed session) | ✅ (if in user unit) | ✅ | ❌ |
| `/run/nologin` | ✅ | ✅ | ✅ | ❌ (tmpfs) |
| Transient unit (`systemd-run`) | depends on system vs user | depends | ✅ | ❌ |

Key insight: **`ScheduleShutdown()` does not survive reboot.** It's stored in
logind's runtime state. If the machine reboots for any reason, the scheduled
shutdown is gone. If you need reboot-surviving scheduled shutdown, use a
persistent timer unit with `OnCalendar=` and `Persistent=yes`.

For suspend: monotonic timers (`OnActiveSec=`, `OnBootSec=`) **pause** during
suspend — the clock stops. Calendar timers (`OnCalendar=`) continue against
the realtime clock and will catch up on resume
([`systemd.timer(5)`][man-timer]). `WakeSystem=yes` can make a timer wake
the system from suspend using a different clock.

---

## 2. Proposed Architectures

### Architecture A: Pure logind `ScheduleShutdown` (smallest)

```
[idle detector] → ScheduleShutdown("poweroff", now+10min)
[user activity] → CancelScheduledShutdown()
```

- Arm: call `ScheduleShutdown()` (or `shutdown +10`, or `systemctl poweroff
  --when=+10min`).
- Disarm: call `CancelScheduledShutdown()` (or `shutdown -c`).
- Warnings: **automatic** wall messages + `/run/nologin` from logind.
- Inhibitors: **automatically honored** by logind.
- One-shot watcher: run a separate `systemd-run --on-active=10min` timer for
  the pre-shutdown script, or hook `PrepareForShutdown`.

**Pros**: Smallest. Reuses all of logind's built-in warning/inhibitor/nologin
machinery. Zero custom notification code. Cancellation is atomic and
interoperable across all shutdown frontends.

**Cons**: The idle detector and the arm/cancel logic must live somewhere (a
user process or a daemon). Wall messages only reach TTY sessions, not
graphical desktop notifications. No "countdown" UI.

### Architecture B: logind `ScheduleShutdown` + desktop notifications

```
[idle detector]
  ├→ ScheduleShutdown("poweroff", now+10min)     # arm + built-in wall/nologin
  ├→ systemd-run --user notify-send -u critical …  # desktop popup
  └→ systemd-run --on-active=9min --user notify-send …  # "1 min left"
[user activity]
  ├→ CancelScheduledShutdown()
  └→ pkill -f "notify-send.*Shutdown"  (or track and close notifications)
```

Arm/disarm via logind (same as A), but add desktop notifications via
`systemd-run --user` so the notification runs in the user's session context
with access to the D-Bus session bus.

**Pros**: User actually sees the warning on a graphical desktop. Still reuses
logind's inhibitor/nologin machinery.

**Cons**: More moving parts. Must manage notification lifecycle. The
`--user` systemd-run requires the user manager to be running (logged in or
lingering).

### Architecture C: Custom timer + service (no logind scheduling)

```
[armed state]
  bedtime-shutdown.timer (OnActiveSec=10min)
    → bedtime-shutdown.service (Type=oneshot)
      ExecStart=/usr/local/bin/do-poweroff.sh
        # sends notifications, checks inhibitors, then systemctl poweroff

[disarm]
  systemctl stop bedtime-shutdown.timer bedtime-shutdown.service
```

A custom `.service` runs at T+10min, sends notifications at intervals via
`ExecStartPre=` hooks or a countdown loop, and finally calls `systemctl
poweroff`.

**Pros**: Full control over notification timing, countdown, and conditional
logic. Can implement "only poweroff if still idle" check inside the service.

**Cons**: Reinvents wall messages, `/run/nologin`, and inhibitor checks that
logind already handles. More code, more bugs. Must manually check
`BlockInhibited` / call `Inhibit()` logic.

### Architecture D: logind `IdleAction` (zero code, but rigid)

```ini
# /etc/systemd/logind.conf.d/idle-poweroff.conf
[Login]
IdleAction=poweroff
IdleActionSec=30min
```

Set logind to poweroff after 30min idle (or whatever threshold). Zero custom
code. But: static config, applies always, no per-session arm/disarm, requires
session managers to report idle (won't work headless). Can be temporarily
blocked by taking an `idle` inhibitor.

**Pros**: Zero code. Fully managed by logind.

**Cons**: Not dynamically armable. Either always on or always off. Not
suitable for a "bedtime" workflow where you want to explicitly trigger it.

---

## 3. v0 Recommendation: Architecture A (Pure logind `ScheduleShutdown`)

**Start with the smallest thing that works.** Use logind's built-in
`ScheduleShutdown` / `CancelScheduledShutdown` and let it handle wall
messages, `/run/nologin`, and inhibitor enforcement for free.

### v0 Implementation Sketch

```sh
#!/bin/bash
# bedtime.sh — arm a 10-minute poweroff countdown
set -euo pipefail

DELAY="${1:-10}"  # minutes
WALL_MSG="System powering off in ${DELAY} minutes. 'shutdown -c' to cancel."

# Arm: schedule shutdown via logind
systemctl poweroff --when="+${DELAY}min"

# Set the wall message (optional, if not using shutdown's built-in)
# SetWallMessage is called implicitly by shutdown, but for D-Bus direct:
# busctl call org.freedesktop.login1 /org/freedesktop/login1 \
#   org.freedesktop.login1.Manager SetWallMessage "sb" "$WALL_MSG" true

echo "Shutdown armed for +${DELAY}min. Cancel with: sudo shutdown -c"
```

```sh
#!/bin/bash
# bedtime-cancel.sh — disarm
shutdown -c
echo "Shutdown cancelled."
```

### Why A for v0

1. **Wall messages + `/run/nologin` + inhibitor enforcement are all free.**
   Architecture C would require reimplementing these.
2. **Cancellation is atomic and interoperable.** `shutdown -c`, `systemctl
   poweroff --when=cancel`, and `CancelScheduledShutdown()` all hit the same
   logind state. Any frontend can cancel.
3. **No timer units to manage.** The scheduled time lives in logind, not in
   transient systemd units that need cleanup.
4. **Queryable.** `shutdown --show` or the `ScheduledShutdown` D-Bus property
   gives the exact scheduled time for any UI to display.

### v0 Gaps (address in v1)

- **No desktop notifications.** Wall messages only reach TTY sessions. For
  graphical sessions, add Architecture B's `notify-send` via
  `systemd-run --user` in v1.
- **Idle detection is external.** Something must decide when to arm the
  shutdown. For v0, arm it manually (`bedtime.sh`). For v1, add an idle
  watcher (D-Bus `IdleHint` subscription or `xprintidle`).
- **No countdown UI.** Wall messages fire at logind's chosen intervals. For a
  live countdown, v1 can poll `ScheduledShutdown` and update a notification.

### Idle Detection: v1 Considerations

For automatic arming based on idle, the recommended path is:

1. Subscribe to `PropertiesChanged` on
   `org.freedesktop.login1.Manager` for the `IdleHint` and
   `IdleSinceHintMonotonic` properties.
2. When `IdleHint=true` and `now - IdleSinceHintMonotonic >= threshold`:
   call `ScheduleShutdown("poweroff", now + 10min_in_usec)`.
3. When `IdleHint` transitions to `false`: call `CancelScheduledShutdown()`.

This watcher should run as a **system service** (survives logout, can call
`ScheduleShutdown` without per-user polkit dance) but needs to reach the
user's D-Bus for notifications — use `systemd-run --user --machine=<uid>@.host`
or `runuser -u <user> -- notify-send` for that.

If no graphical session manager reports idle (headless), fall back to
`/proc/interrupts` or `w` idle column polling, or `xautolock`/`xss-lock` for
X11 sessions.

---

## 4. Key Commands Cheat Sheet

```sh
# --- Arm (10 min) ---
sudo shutdown +10 "Powering off for bedtime"
# or:
sudo systemctl poweroff --when=+10min
# or via D-Bus:
busctl call org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager ScheduleShutdown "st" \
  poweroff $(($(date +%s) * 1000000 + 10 * 60 * 1000000))

# --- Cancel ---
sudo shutdown -c
# or:
sudo systemctl poweroff --when=cancel
# or via D-Bus:
busctl call org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager CancelScheduledShutdown

# --- Query ---
shutdown --show
systemctl poweroff --when=show
busctl get-property org.freedesktop.login1 /org/freedesktop/login1 \
  org.freedesktop.login1.Manager ScheduledShutdown

# --- List active inhibitors ---
systemd-inhibit --list

# --- Take a delay inhibitor (test that shutdown waits) ---
systemd-inhibit --what=shutdown --mode=delay --why=Testing sleep 10 &

# --- Transient timer alternative (not logind-scheduled) ---
sudo systemd-run --on-active=10min --collect \
  --unit=bedtime --service-type=oneshot \
  systemctl poweroff
sudo systemctl stop bedtime.timer  # cancel

# --- Enable lingering (so user units survive logout) ---
loginctl enable-linger "$USER"
```

---

## 5. Primary Source References

| Man page | Key sections used |
|---|---|
| [`shutdown(8)`][man-shutdown] | TIME format, `-c` cancel, `--show`, `/run/nologin` at 5min |
| [`systemctl(1)`][man-systemctl] | `poweroff`/`halt`/`reboot` commands, `--when=` (v254+), `--force` |
| [`systemd-run(1)`][man-systemd-run] | `--on-active=`, `--timer-property=`, `--collect`, `--user`, `--unit=`, Example 3 (timer), Example 5 (user scope + linger) |
| [`systemd.timer(5)`][man-timer] | `OnActiveSec=`, `AccuracySec=`, `Persistent=`, `WakeSystem=`, `RemainAfterElapse=`, suspend behavior |
| [`systemd.service(5)`][man-service] | `Type=oneshot`, `RemainAfterExit=`, `ExecStart=` semantics |
| [`loginctl(1)`][man-loginctl] | `enable-linger`/`disable-linger`, session/user commands |
| [`systemd-inhibit(1)`][man-systemd-inhibit] | `--what=`, `--mode=` (block/delay/block-weak), `--list` |
| [`org.freedesktop.login1(5)`][man-login1-dbus] | `ScheduleShutdown()` / `CancelScheduledShutdown()`, `Inhibit()`, `SetWallMessage()`, `PrepareForShutdown` signal, polkit actions, `ScheduledShutdown` property, flags (`SD_LOGIND_SKIP_INHIBITORS`) |
| [`logind.conf(5)`][man-logind-conf] | `IdleAction=` / `IdleActionSec=`, `InhibitDelayMaxSec=`, `KillUserProcesses=`, `HandlePowerKey=` |
| [`systemd.special(7)`][man-systemd-special] | `shutdown.target`, `poweroff.target`, `timers.target`, `sleep.target` |
| [`systemd.kill(5)`][man-systemd-kill] | `KillMode=`, `KillSignal=` |
| [`wall(1)`][man-wall] | Broadcast to all TTYs, superuser override |
| [`notify-send(1)`][man-notify-send] | `-u urgency`, `-t expire-time`, requires user session D-Bus |

---

## Cross-references

This is an independent `init0` wave document. No other `.design/init/` files
were read, per wave research protocol. When synthesized, compare:

- **Idle detection approaches**: D-Bus `IdleHint` subscription vs. polling
  (`xprintidle`, `w`, `/proc/interrupts`) vs. `IdleAction` config — which
  other waves propose.
- **Notification strategy**: wall-only (A) vs. desktop `notify-send` (B) vs.
  custom countdown service (C) — what other waves prefer for headless vs.
  graphical.
- **Unit placement**: system service + `runuser` for notifications vs. user
  service + linger + polkit for poweroff — the privilege tradeoff other
  waves identify.
