# plugact

Feature line: surface tab-mutation actions and user-rebindable plugin
keybinds on the TUI plugin API. Two commits on `v2@origin`.

## Plugin tabs API (`ctx.ui.tabs`)

Beyond the existing `enabled/list/open/focus/move/close` surface:

```ts
moveBy(direction: 1 | -1): boolean            // shift the active tab one slot
moveBy(sessionID: string, direction: 1 | -1): boolean
cycle(direction: 1 | -1): boolean             // switch to next/previous tab, wrapping
```

- `moveBy` clamps at the strip ends (no wrap). It is adapter sugar over the
  host controller's absolute `move(sessionID, index)`; the host's model
  (`moveSessionTab`) does the clamping. Returns `false` only when tabs are
  disabled or the target tab is not open (child session ids resolve to their
  root, matching `move`/`close`). Edge-clamped moves are accepted no-ops that
  still return `true`.
- `cycle` delegates to `host.sessionTabs.cycle`, which now returns the
  navigated session id; `false` means tabs are disabled or none are open.
- Overloads exist because a required `direction` cannot follow an optional
  `sessionID` in TypeScript — the originally sketched
  `moveBy(sessionID?, direction)` single signature is not expressible.
- Upstream had already added the absolute `move(sessionID, index)` since this
  feature was specced, so the directional form landed under the name `moveBy`
  rather than colliding with it.

Seams: `packages/tui/src/plugin/api.tsx` (adapter), `packages/plugin/src/tui/context.ts`
(public types), `packages/tui/src/context/session-tabs.tsx` (host `cycle` return).

## User-rebindable plugin keybinds (`cli.json` → `keybinds`)

`cli.json` `keybinds` now accepts command ids that are not built-in
`Definitions` — i.e. ids of keymap commands registered by plugins — validated
as binding values. `Keymap.createLayer`'s named-command branch already prefers
`config.keybinds.get(command.id)` over a layer's declared `bind`, so a
configured override wins once the plugin registers its command; without a
registered command the entry is inert (every lookup consumer does keyed
`get()` reads).

The old reject-unknown-ids error is dropped: config parse runs at boot,
before plugin layers register, so "neither built-in nor registered" is not
decidable at parse time. Invalid binding *values* still fail schema decode
loudly.

Seams: `packages/tui/src/config/keybind.ts` (`KeybindOverrides` struct+rest,
`parse` pass-through), `packages/tui/src/context/keymap.tsx` (consuming seam,
unchanged), `packages/cli/src/config/migrate.ts` (undefined-value drop).

## Verification

- `packages/tui/test/context/session-tabs.test.tsx` — five plugin-tabs tests
  (directions, clamping, explicit id, disabled/unknown guards, cycle wrap).
- `packages/tui/test/context/keymap-plugin-keybinds.test.tsx` — override
  dispatch beats declared bind; declared-bind fallback.
- `packages/tui/test/config-v2.test.tsx` — schema retention, value
  validation, lookup reachability, orphaned ids inert.
- `packages/cli/test/config.test.ts` — unchanged and passing (JSON schema
  document shape survives the struct+rest change).
- Typechecks clean: `packages/tui`, `packages/cli`, `packages/plugin`.
