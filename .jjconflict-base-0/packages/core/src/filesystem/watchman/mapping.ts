export * as Mapping from "./mapping.js"

import isGlob from "is-glob"
import micromatch from "micromatch"
import path from "node:path"
import type { Protocol } from "./protocol.js"

/**
 * Pure watchman-row to update mapping with Parcel-compatible ignores.
 *
 * The daemon reports rows relative to the canonical root `C`
 * (`realpath(target)`); callers asked for the logical path `L`. Rows are
 * mapped into the `L` namespace and filtered with the same algebra the
 * @parcel/watcher wrapper applies to its watch directory: literals resolve
 * against `L` and match equal-or-component-below; globs compile per pattern
 * (`micromatch.makeRe`, `dot: true`, `lookbehinds: false`) and match the
 * `L`-relative suffix. Matching never happens in the canonical namespace —
 * when `L != C`, canonical spellings of ignore entries are inert.
 */

export interface Compiled {
  readonly logical: string
  readonly canonical: string
  readonly literals: readonly string[]
  readonly globs: readonly RegExp[]
}

export const compile = (logical: string, canonical: string, ignore: readonly string[]): Compiled => ({
  logical,
  canonical,
  literals: ignore.filter((value) => !isGlob(value)).map((value) => path.resolve(logical, value)),
  globs: ignore
    .filter((value) => isGlob(value))
    .map((value) => micromatch.makeRe(value, { dot: true, lookbehinds: false })),
})

/** Cookie files synchronize daemon queries and are never user-visible events. */
const isCookie = (name: string) => path.basename(name).startsWith(".watchman-cookie-")

const contains = (parent: string, child: string) => {
  const prefix = parent.endsWith(path.sep) ? parent : parent + path.sep
  return child === parent || child.startsWith(prefix)
}

export type Mapped = { readonly path: string; readonly type: "update" | "delete" } | undefined

/**
 * Maps one daemon row. Returns `undefined` for rows that are ignored,
 * malformed, or escape the canonical root; directory rows map exactly like
 * file rows (`exists` decides update versus delete).
 */
export const row = (compiled: Compiled, file: Protocol.Row): Mapped => {
  const name = file.name
  if (name === "" || name.includes("\0") || path.isAbsolute(name)) return undefined
  const canonical = path.resolve(compiled.canonical, name)
  if (!contains(compiled.canonical, canonical)) return undefined
  if (isCookie(name)) return undefined
  const logical = path.join(compiled.logical, path.relative(compiled.canonical, canonical))
  if (compiled.literals.some((literal) => contains(literal, logical))) return undefined
  const suffix = path.relative(compiled.logical, logical)
  if (suffix === "") return undefined
  if (compiled.globs.some((glob) => glob.test(suffix.split(path.sep).join("/")))) return undefined
  return { path: logical, type: file.exists ? "update" : "delete" }
}

export const rows = (compiled: Compiled, files: readonly Protocol.Row[]) =>
  files.flatMap((entry) => {
    const mapped = row(compiled, entry)
    return mapped ? [mapped] : []
  })
