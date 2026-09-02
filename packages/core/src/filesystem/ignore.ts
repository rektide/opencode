const FOLDERS = new Set([
  "node_modules",
  "bower_components",
  ".pnpm-store",
  "vendor",
  ".npm",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "bin",
  "obj",
  ".git",
  ".svn",
  ".hg",
  ".vscode",
  ".idea",
  ".turbo",
  ".output",
  "desktop",
  ".sst",
  ".cache",
  ".webkit-cache",
  "__pycache__",
  ".pytest_cache",
  "mypy_cache",
  ".mypy_cache",
  ".venv",
  "venv",
  ".tox",
  ".jj",
  ".history",
  ".gradle",
])

const FILES = [
  "**/*.swp",
  "**/*.swo",
  "**/*.pyc",
  "**/.DS_Store",
  "**/Thumbs.db",
  // Classic watchman touches cookie files inside watched roots as kernel-drain
  // fences; never let them surface as updates. Both forms: cookies land in the
  // watch root itself, and `**/`-prefixed globs do not match root-level names.
  "**/.watchman-cookie-*",
  ".watchman-cookie-*",
  "**/logs/**",
  "**/tmp/**",
  "**/temp/**",
  "**/*.log",
  "**/coverage/**",
  "**/.nyc_output/**",
]

export const PATTERNS = [...FILES, ...FOLDERS, `**/{${Array.from(FOLDERS).join(",")}}/**`]

export * as Ignore from "./ignore.js"
