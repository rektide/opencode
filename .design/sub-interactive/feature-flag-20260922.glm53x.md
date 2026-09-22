---
type: Decision
title: sub-interactive feature flag — session.interactive_children
description: Self-disable flag for the TUI child-session composer feature (operator direction 2026-09-22, de-risk-by-feature-flags), reversing the 2026-09-11 global-disarm decision; documents the seam, gated sites, tests, the bookmark repair found on arrival, and the reusable flag pattern.
resource: /.design/sub-interactive/feature-flag-20260922.glm53x.md
tags: [opencode, v2, sub-interactive, tui, feature-flag, config]
status: stable
generated: { by: llm:glm53x, at: 2026-09-22 }
sources:
  - id: patches-manifest
    resource: file:///home/rektide/ado/patches.md
    title: OpenCode patches and ideas — on-deck entry, Standards seed, bookmark convention
    author: human:rektide
    last_modified: 2026-09-22
  - id: refresh-20260922
    resource: file:///home/rektide/src/opencode-sub-interactive/.design/sub-interactive/refresh-20260922.glm53fx.md
    title: Sub-interactive freshen onto dcfe1ec7
    author: llm:glm53fx
    last_modified: 2026-09-22
---

# sub-interactive feature flag — `session.interactive_children`

## What was up

Operator direction 2026-09-22 ("Feature flags on promoted lines", seeded the
same day in `/home/rektide/ado/patches.md` Standards): an on-deck feature that
changes live UX must carry a self-disable option so promotion into `working` is
reversible at runtime without recomposing. First example: this feature. The
mission deliberately **reverses the 2026-09-11 decision** ("disarm is global —
no `session.interactive_children` config, no keybind gate").

## Bookmark repair found on arrival (pre-existing damage, fixed first)

The refresh agent's 2026-09-22 report commit (`swqqwlyk`, "docs(sub-interactive):
record freshen onto dcfe1ec7") had been created on the **old** line — its parent
was `9c304e40` (the `sub-interactive-20260911` snapshot on base `312651f6`) —
and both `sub-interactive` and `sub-interactive-20260922` bookmarks followed it
there, while the actually-freshened line (`07dbedc4` unmask → `c45f25d3` parent
nav → `17e420ea` docs on `dcfe1ec7bd49`) sat unbookmarked. The refresh doc's
own Result section describes the intended state (bookmarks at the report commit
on the freshened line), so this was a mis-placement, not a decision.

Fixed per the manifest's Bookmark convention ("finishing same-day placement
while that day's rebuild is still in progress … is completion, not moving":
both bookmarks were created this same day, nothing was composed from them):
`jj rebase -r d3323e00 -d 17e420ea` moved the report commit onto the freshened
tip (new id `b0fd91a1`, bookmarks auto-followed), leaving `sub-interactive-20260911`
untouched at `9c304e40` with nothing stray above it. The flag work then landed
on top of `b0fd91a1`.

## The flag

- **Name**: `session.interactive_children` — exactly the key the 2026-09-11
  decision named when rejecting it; when reversing a decision, use the key the
  decision itself contemplated. It also matches the TUI config taxonomy: the
  `session` struct in `packages/tui/src/config/index.tsx` already holds
  child/transcript booleans in snake_case (`scrollbar`, `image_preview`,
  `terminal`, `tps`).
- **Default**: **active** (feature on) — implemented as a read-site
  `?? true`, the same pattern as `animations ?? true`. Unset = current feature
  behavior; `false` = exact upstream behavior.
- **Where it lives**: `packages/tui/src/config/index.tsx`, one
  `Schema.optional(Schema.Boolean)` line in the `session` struct. Nothing else
  in the config surface changes — `Resolved` spreads the session struct, so the
  optional key flows through `resolve()` untouched, and the optional-boolean
  default stays at the read site rather than `resolve()`.
- **How it's read**: `routes/session/index.tsx` already calls `useConfig()` and
  keeps a config-derived memo block (`thinkingMode`, `showScrollbar`, …). Two
  memos join it:
  - `interactiveChildren = createMemo(() => config.session?.interactive_children ?? true)`
  - `childComposerMasked = createMemo(() => !interactiveChildren() && !!session()?.parentID)`
- **Hot reload**: free. `ConfigProvider` watches the TUI config file and
  re-resolves on change; the memos ride the solid-js store. Editing the config
  flips the flag at runtime without a restart (manual checklist covers this).

Why this seam and not the alternatives: the TUI-local config schema is entirely
client-side — no `packages/schema`, no protocol, no client regen, no server
round-trip. A core-config or `OPENCODE_*` env var would have been strictly more
plumbing for the same one boolean. The bail-out clause never came into play.

## Exactly what it gates (five sites, one file)

All in `packages/tui/src/routes/session/index.tsx`. With the flag **false**,
`childComposerMasked()` ≡ upstream's `!!session()?.parentID`, so each site
evaluates the same boolean upstream had:

| # | Site (feature-active shape) | Upstream shape restored when disabled | Line |
| ---: | --- | --- | ---: |
| 1 | Picker toggle: `if (composer.open \|\| childComposerMasked()) setComposer("open", false)` | `composer.open \|\| session()?.parentID` — picker force-closes on children | 1175 |
| 2 | `open={composer.open \|\| (childComposerMasked() && forms().length === 0)}` | composer force-opened on children with no forms | 1366 |
| 3 | `defaultTab={composer.tab ?? (childComposerMasked() ? "subagents" : undefined)}` | `subagents` tab forced on children | 1367 |
| 4 | `<Match when={composer.open \|\| (childComposerMasked() && forms().length === 0)}>` | render switch suppresses prompt/permission/form surfaces on children | 1379 |
| 5 | Priority-2 keymap layer `enabled: () => interactiveChildren() && !composer.open && !!session()?.parentID` | layer never enables — no child-only `session.parent` precedence over prompt history | 1234 |

Site 5 note: the layer object still exists when disabled but is permanently
inert (`enabled` is `false`, contributing no bindings) — behaviorally identical
to upstream having no layer, without restructuring the guard.

Deliberately **not** gated (unchanged in both states): the child-view early
returns in `descendantSessionIDs()` / `permissions()` / `forms()` (the v1
constraint — child-local blockers stay root-aggregated), upstream's
`session.child.first` / `session.parent` commands, and upstream's composer
`onClose` parent navigation. The feature's 2026-09-11 footprint beyond the four
guards is exactly one thing — the priority-2 layer — and that is site 5.

## Tests

New suite `packages/tui/test/cli/tui/child-composer-flag.test.tsx` using the
`createAppFixture` harness (real app, fake HTTP server, boots straight into a
child session via `args: { sessionID }` — the `command-selection.test.tsx`
entry pattern):

1. **default config keeps the child composer interactive** — child transcript
   renders, no "No active subagents" picker, prompt textarea focused
   (`TextareaRenderable`), and `up` navigates to the parent (priority-2 layer
   beats the focused prompt's history binding).
2. **`session.interactive_children=false` restores stock child masking** —
   subagents picker force-opened ("Subagents" / "No active subagents"), no
   prompt textarea focused, `escape` close navigates to the parent via
   upstream's own `onClose` (confirming the disabled path really is upstream's).

Results (2026-09-22, freshened line + flag commits):

| Suite | Result |
| --- | --- |
| `test/cli/tui/child-composer-flag.test.tsx` (new) | **2 pass, 0 fail** |
| `test/cli/tui/composer-keymap.test.tsx` | 6 pass, 0 fail |
| `test/cli/tui/input-scope.test.tsx` | 5 pass, 0 fail |
| keymap trio (`test/keymap.test.tsx` + `test/keymap-scope.test.tsx` + `test/keybind.test.ts`) | 9 pass, 0 fail |
| `bun typecheck` from `packages/tui` | clean (after `bun install --frozen-lockfile` for the 403-commit base jump — recorded stale-`node_modules` precedent) |

## How the reversal is recorded

- Here (this doc) and in the workspace `README.md` "Behavior" section: the
  09-11 quote, the reversal, the flag semantics, and refreshed guard-table line
  pins on the current base.
- `/home/rektide/ado/patches.md` — the on-deck entry's "Decisions (2026-09-11)"
  list keeps the original decision text; the Standards seed section states the
  reversal, and this wave extends it with the learned pattern (separate commit
  in the `~/archive/doc` repo).
- No attempt to rewrite history: the 09-11 decision remains visible in
  `sub-interactive-20260911` and the manifest.

## Reusable pattern for future feature flags

1. **Find the client-local config surface first.** TUI behavior flags belong in
   `packages/tui/src/config/index.tsx` (`Config.Info` schema) — one
   `Schema.optional(Schema.Boolean)` line in the semantically right struct.
   Core/server behavior flags need the real config stack; env vars
   (`OPENCODE_*`) are the fallback when no config surface reaches the consumer.
2. **Default = feature active, expressed at the read site** (`?? true`), not in
   `resolve()` — the flag exists so *disabling* is the exceptional, deliberate
   act, and the default must survive every config layer that omits the key.
3. **Gate at the sites, not around the component.** Compute one memo per
   polarity you need (active memo for capabilities the feature adds; masked
   memo that reduces to the upstream guard expression when disabled) and splice
   them into the exact expressions the feature changed. This makes
   "disabled = upstream" a local, reviewable property instead of a duplicated
   code path.
4. **Never gate what the feature didn't change.** Deliberate constraints
   (sub-interactive's hidden child-local forms) and upstream behaviors
   (`onClose` navigation) stay identical in both states — the flag's job is
   reversibility of *this feature's* delta, nothing more.
5. **Inert-layer beats structural removal** when the feature adds a keymap
   layer: keep the `Keymap.createLayer` call and gate its `enabled` — the
   disabled state contributes no bindings, which is behaviorally identical to
   the layer not existing.
6. **Test both states through the real app** where a fixture harness exists
   (`createAppFixture` boots the genuine route; `args: { sessionID }` is the
   cheap direct-entry trick). One test per state, asserting the *discriminating*
   behavior — the thing that differs between states — not re-tested incidental
   chrome.
7. **Name the flag in the feature's manifest entry** and let it graduate or die
   with the feature line (per the Standards seed).

## Result

- Flag commits: `bd1b75c2` (feat: flag + gating + README reversal),
  `3c28e5b0` (test: both states), plus this doc, all directly on the repaired
  refresh tip `b0fd91a1` (freshened line on `dcfe1ec7bd49`).
- Bookmarks: `sub-interactive-20260922` stays at the refresh report commit
  `b0fd91a1`; floating `sub-interactive` fast-forwards to this doc's commit
  (top real commit). `sub-interactive-20260911` untouched.
- Promotion status unchanged: on-deck; nothing composed into `working`.

## Cross-references

- [`patches.md`](file:///home/rektide/ado/patches.md) — on-deck entry,
  Standards § Feature flags on promoted lines (extended by this wave), §
  Bookmark convention (the same-day-completion rule used for the repair).
- [`refresh-20260922.glm53fx.md`](file:///home/rektide/src/opencode-sub-interactive/.design/sub-interactive/refresh-20260922.glm53fx.md)
  — the freshen this work rides; its Result section described the bookmark
  state repaired above.
- `README.md` (root, feature tip) — operator-facing flag documentation and the
  manual verification checklist, including the flag-off live check.
