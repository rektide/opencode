<p align="center">
  <a href="https://opencode.ai">
    <picture>
      <source srcset="packages/console/app/src/asset/logo-ornate-dark.svg" media="(prefers-color-scheme: dark)">
      <source srcset="packages/console/app/src/asset/logo-ornate-light.svg" media="(prefers-color-scheme: light)">
      <img src="packages/console/app/src/asset/logo-ornate-light.svg" alt="OpenCode logo">
    </picture>
  </a>
</p>
<p align="center">The open source AI coding agent.</p>
<p align="center">
  <a href="https://opencode.ai/discord"><img alt="Discord" src="https://img.shields.io/discord/1391832426048651334?style=flat-square&label=discord" /></a>
  <a href="https://www.npmjs.com/package/opencode-ai"><img alt="npm" src="https://img.shields.io/npm/v/opencode-ai?style=flat-square" /></a>
  <a href="https://github.com/anomalyco/opencode/actions/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/anomalyco/opencode/publish.yml?style=flat-square&branch=dev" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh.md">简体中文</a> |
  <a href="README.zht.md">繁體中文</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.it.md">Italiano</a> |
  <a href="README.da.md">Dansk</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.pl.md">Polski</a> |
  <a href="README.ru.md">Русский</a> |
  <a href="README.bs.md">Bosanski</a> |
  <a href="README.ar.md">العربية</a> |
  <a href="README.no.md">Norsk</a> |
  <a href="README.br.md">Português (Brasil)</a> |
  <a href="README.th.md">ไทย</a> |
  <a href="README.tr.md">Türkçe</a> |
  <a href="README.uk.md">Українська</a> |
  <a href="README.bn.md">বাংলা</a> |
  <a href="README.gr.md">Ελληνικά</a> |
  <a href="README.vi.md">Tiếng Việt</a>
</p>

[![OpenCode Terminal UI](packages/web/src/assets/lander/screenshot.png)](https://opencode.ai)

---

### Installation

```bash
# YOLO
curl -fsSL https://opencode.ai/install | bash

# Package managers
npm i -g opencode-ai@latest        # or bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS and Linux (recommended, always up to date)
brew install opencode              # macOS and Linux (official brew formula, updated less)
sudo pacman -S opencode            # Arch Linux (Stable)
paru -S opencode-bin               # Arch Linux (Latest from AUR)
mise use -g opencode               # Any OS
nix run nixpkgs#opencode           # or github:anomalyco/opencode for latest dev branch
```

> [!TIP]
> Remove versions older than 0.1.x before installing.

### Desktop App (BETA)

OpenCode is also available as a desktop application. Download directly from the [releases page](https://github.com/anomalyco/opencode/releases) or [opencode.ai/download](https://opencode.ai/download).

| Platform              | Download                           |
| --------------------- | ---------------------------------- |
| macOS (Apple Silicon) | `opencode-desktop-mac-arm64.dmg`   |
| macOS (Intel)         | `opencode-desktop-mac-x64.dmg`     |
| Windows               | `opencode-desktop-windows-x64.exe` |
| Linux                 | `.deb`, `.rpm`, or `.AppImage`     |

```bash
# macOS (Homebrew)
brew install --cask opencode-desktop
# Windows (Scoop)
scoop bucket add extras; scoop install extras/opencode-desktop
```

#### Installation Directory

The install script respects the following priority order for the installation path:

1. `$OPENCODE_INSTALL_DIR` - Custom installation directory
2. `$XDG_BIN_DIR` - XDG Base Directory Specification compliant path
3. `$HOME/bin` - Standard user binary directory (if it exists or can be created)
4. `$HOME/.opencode/bin` - Default fallback

```bash
# Examples
OPENCODE_INSTALL_DIR=/usr/local/bin curl -fsSL https://opencode.ai/install | bash
XDG_BIN_DIR=$HOME/.local/bin curl -fsSL https://opencode.ai/install | bash
```

### Agents

OpenCode includes two built-in agents you can switch between with the `Tab` key.

- **build** - Default, full-access agent for development work
- **plan** - Read-only agent for analysis and code exploration
  - Denies file edits by default
  - Asks permission before running bash commands
  - Ideal for exploring unfamiliar codebases or planning changes

Also included is a **general** subagent for complex searches and multistep tasks.
This is used internally and can be invoked using `@general` in messages.

Learn more about [agents](https://opencode.ai/docs/agents).

### Documentation

For more info on how to configure OpenCode, [**head over to our docs**](https://opencode.ai/docs).

### Contributing

If you're interested in contributing to OpenCode, please read our [contributing docs](./CONTRIBUTING.md) before submitting a pull request.

### Building on OpenCode

If you are working on a project that's related to OpenCode and is using "opencode" as part of its name, for example "opencode-dashboard" or "opencode-mobile", please add a note to your README to clarify that it is not built by the OpenCode team and is not affiliated with us in any way.

---

**Join our community** [Discord](https://discord.gg/opencode) | [X.com](https://x.com/opencode)

---

## Local patch: interactive child sessions

This workspace carries the `sub-interactive` TUI patch on base commit
`312651f68ed2` (`feat(tui): configure session permission handling (#48545)`).
The source of truth is the **TUI child-session interaction** entry in
[`/home/rektide/a/doc/opencode/patches.md`](file:///home/rektide/a/doc/opencode/patches.md),
with lifecycle background in
[`/home/rektide/a/doc/opencode/subagents.md`](file:///home/rektide/a/doc/opencode/subagents.md).

### Behavior

The patch gives a child Session (`parentID` set) the same ordinary prompt
composer as any other Session. A human can steer a running child or continue an
idle/completed child directly from its transcript. The prompt submits to the
current `route.sessionID`; a response produced after the original subagent Job
has settled remains in the child transcript and is not automatically returned
to the parent.

The global disarm has no configuration gate and introduces no new keybinding:

| Guard | Requested pin | Location on the base | Final line |
| --- | ---: | ---: | ---: |
| Picker toggle no longer force-closes on children | 1197 | 1166 | [`packages/tui/src/routes/session/index.tsx:1166`](packages/tui/src/routes/session/index.tsx#L1166) |
| Composer is no longer force-opened on children | 1381 | 1350 | [`packages/tui/src/routes/session/index.tsx:1356`](packages/tui/src/routes/session/index.tsx#L1356) |
| Composer no longer forces the `subagents` default tab | 1382 | 1351 | [`packages/tui/src/routes/session/index.tsx:1357`](packages/tui/src/routes/session/index.tsx#L1357) |
| The render switch suppresses the prompt only while the picker is open | 1394 | 1363 | [`packages/tui/src/routes/session/index.tsx:1369`](packages/tui/src/routes/session/index.tsx#L1369) |

All four guards had drifted 31 lines earlier than the requested pins on the
specified base. The final render lines are six lines later than those relocated
positions because the patch also preserves parent navigation at
[`packages/tui/src/routes/session/index.tsx:1223-1227`](packages/tui/src/routes/session/index.tsx#L1223-L1227).
When the picker is closed on a child, this child-only base-mode layer gives the
existing `session.parent` command priority over the focused prompt's history
binding. Thus `up` still navigates to the parent. When the picker is open,
Composer activates `composer` mode as before; closing its subagents tab still
uses the existing `onClose` path to navigate to the parent.

### Deliberate v1 constraint — **may revisit**

Do not remove the child-view early returns in `descendantSessionIDs()`,
`permissions()`, or `forms()` at
[`packages/tui/src/routes/session/index.tsx:178-195`](packages/tui/src/routes/session/index.tsx#L178-L195).
The root view aggregates descendant blockers, while the child view exposes no
child-local permissions and only global forms. Consequently, a child blocked on
elicitation can accept a user steer into its queue without showing that blocker
in the child view; answer the elicitation from the root view. This is accepted
for v1 and **may revisit** later.

With the picker closed:

- no visible global form: the ordinary focused `<Prompt>` renders for the child;
- a global form present: the global `<FormPrompt>` renders instead;
- child-local forms or permissions: they remain hidden by the deliberate v1
  filtering above, so the ordinary prompt remains visible.

With the picker open, `<Composer>` renders and the switch suppresses the prompt
and blocker surfaces regardless of form state, matching the existing picker
behavior.

### Verification checklist

Use `bun run dev:live` from this development worktree for manual verification
against the elected background server and live Sessions.

- [x] Run `bun typecheck` from `packages/tui`.
- [x] Run the neighboring keymap/composer tests:
  `bun test test/cli/tui/composer-keymap.test.tsx test/keymap.test.tsx` from
  `packages/tui` (10 passed). There are no `*.test.*` files under
  `packages/tui/src/routes/session`, and no existing test directly covers these
  child-view guards; tests importing that module exercise exported display
  helpers instead.
- [ ] Open a running child and submit a prompt; verify it steers the active run.
- [ ] Open a completed child and submit a prompt; verify it continues in the
  child transcript without an implicit return to the parent.
- [ ] Drive a child whose agent has `edit: allow`; verify permitted edits happen
  silently under the child agent's own permission policy. Also verify an
  interactive ask still reaches the root view and remains first-reply-wins.
- [ ] With the picker closed on a child, press `up` and verify navigation to the
  parent. Reopen the subagents picker and verify its close action also navigates
  to the parent.
