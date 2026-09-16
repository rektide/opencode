export * as WatchmanMapping from "./mapping.js"

import path from "node:path"
import type { Watcher } from "../../watcher.js"

// @ts-ignore @parcel/watcher does not publish declarations for its wrapper entrypoint.
import { createWrapper } from "@parcel/watcher/wrapper"

export type Options = {
  readonly logicalRoot: string
  readonly canonicalRoot: string
  readonly ignore: readonly string[]
}

export type Compiled = {
  readonly logicalRoot: string
  readonly canonicalRoot: string
  readonly literals: readonly string[]
  readonly globs: readonly RegExp[]
}

export type Row = {
  readonly name: string
  readonly exists: boolean
}

export type Result =
  | { readonly _tag: "Mapped"; readonly update: Watcher.Update }
  | { readonly _tag: "Ignored" }
  | { readonly _tag: "Invalid"; readonly reason: string }

export function compile(options: Options): Compiled {
  const logicalRoot = path.resolve(options.logicalRoot)
  const normalized = normalizeIgnores(logicalRoot, options.ignore)
  return {
    logicalRoot,
    canonicalRoot: path.resolve(options.canonicalRoot),
    literals: normalized.ignorePaths ?? [],
    globs: (normalized.ignoreGlobs ?? []).map((value) => new RegExp(value)),
  }
}

export function map(compiled: Compiled, row: Row): Result {
  if (!row.name || row.name.includes("\0")) return { _tag: "Invalid", reason: "name must be nonempty and NUL-free" }
  if (path.posix.isAbsolute(row.name)) return { _tag: "Invalid", reason: "name must be relative" }
  const name = path.posix.normalize(row.name)
  if (name === "." || name === ".." || name.startsWith("../"))
    return { _tag: "Invalid", reason: "name must remain below the watched root" }

  const canonical = path.resolve(compiled.canonicalRoot, ...name.split("/"))
  if (!contains(compiled.canonicalRoot, canonical))
    return { _tag: "Invalid", reason: "resolved name escaped the watched root" }
  if (path.posix.basename(name).startsWith(".watchman-cookie-")) return { _tag: "Ignored" }

  const logical = path.resolve(compiled.logicalRoot, path.relative(compiled.canonicalRoot, canonical))
  if (compiled.literals.some((literal) => contains(literal, logical))) return { _tag: "Ignored" }
  if (compiled.globs.some((glob) => glob.test(name))) return { _tag: "Ignored" }
  return { _tag: "Mapped", update: { path: logical, type: row.exists ? "update" : "delete" } }
}

function contains(parent: string, target: string) {
  const relative = path.relative(parent, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

type NormalizedIgnores = {
  readonly ignorePaths?: readonly string[]
  readonly ignoreGlobs?: readonly string[]
}

function normalizeIgnores(root: string, ignore: readonly string[]): NormalizedIgnores {
  let normalized: NormalizedIgnores = {}
  createWrapper({
    writeSnapshot: (_directory: string, _snapshot: string, options: NormalizedIgnores) => {
      normalized = options
    },
  }).writeSnapshot(root, root, { ignore: [...ignore] })
  return normalized
}
