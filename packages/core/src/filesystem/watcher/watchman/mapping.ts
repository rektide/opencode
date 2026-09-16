export * as WatchmanMapping from "./mapping.js"

import { createRequire } from "node:module"
import path from "node:path"
import type { Watcher } from "../../watcher.js"

const parcelRequire = createRequire(import.meta.resolve("@parcel/watcher/wrapper"))
const isGlob: (value: string) => boolean = parcelRequire("is-glob")
const micromatch: {
  readonly makeRe: (value: string, options: { readonly dot: boolean; readonly lookbehinds: boolean }) => RegExp
} = parcelRequire("micromatch")

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
  return {
    logicalRoot,
    canonicalRoot: path.resolve(options.canonicalRoot),
    literals: options.ignore.filter((value) => !isGlob(value)).map((value) => path.resolve(logicalRoot, value)),
    globs: options.ignore
      .filter(isGlob)
      .map((value) => micromatch.makeRe(value, { dot: true, lookbehinds: false })),
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
