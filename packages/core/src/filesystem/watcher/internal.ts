export * as WatcherInternal from "./internal.js"

const metadata = Symbol("WatcherInternal.metadata")

export type Metadata = {
  readonly ready?: () => void
  readonly placement?: Placement
}

export type Placement = { readonly type: "project"; readonly root: string } | { readonly type: "exact" }

export type Input = {
  readonly [metadata]?: Metadata
}

export function attach<A extends object>(input: A, value: Metadata): A & Input {
  return Object.assign(input, { [metadata]: value })
}

export function read(input: object) {
  return (input as Input)[metadata]
}
