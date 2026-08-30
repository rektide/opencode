export * as WatcherInternal from "./internal.js"

import path from "node:path"

const metadata = Symbol("WatcherInternal.metadata")

export type Metadata = {
  readonly ready?: () => void
  readonly placement?: Placement
}

export type Placement = { readonly type: "project"; readonly root: string } | { readonly type: "exact" }

export type Input = {
  readonly [metadata]?: Metadata
}

export type WatchInput =
  | { readonly path: string; readonly type: "file" }
  | { readonly path: string; readonly type: "directory"; readonly ignore?: readonly string[] }

export function attach<A extends object>(input: A, value: Metadata): A & Input {
  return Object.assign(input, { [metadata]: value })
}

export function read(input: object) {
  return (input as Input)[metadata]
}

export function normalize(input: WatchInput): WatchInput {
  const target = path.resolve(input.path)
  if (input.type === "file") return { path: target, type: "file" }
  const ignore = [...new Set(input.ignore ?? [])].toSorted()
  return ignore.length ? { path: target, type: "directory", ignore } : { path: target, type: "directory" }
}
