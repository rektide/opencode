import { describe, expect, test } from "bun:test"
import { Mapping } from "@opencode-ai/core/filesystem/watchman/mapping"

describe("watchman mapping", () => {
  const L = "/logical/root"
  const C = "/canonical/root"

  test("maps rows into the logical namespace with update and delete from exists", () => {
    const compiled = Mapping.compile(L, C, [])
    expect(Mapping.rows(compiled, [
      { name: "a.txt", exists: true },
      { name: "sub/b.txt", exists: false },
    ])).toEqual([
      { path: "/logical/root/a.txt", type: "update" },
      { path: "/logical/root/sub/b.txt", type: "delete" },
    ])
  })

  test("maps directory rows exactly like file rows", () => {
    const compiled = Mapping.compile(L, C, [])
    expect(Mapping.row(compiled, { name: "sub", exists: true })).toEqual({
      path: "/logical/root/sub",
      type: "update",
    })
  })

  test("drops cookie files, empty, absolute, and escaping names", () => {
    const compiled = Mapping.compile(L, C, [])
    expect(Mapping.row(compiled, { name: ".watchman-cookie-1", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "/etc/passwd", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "../escape", exists: true })).toBeUndefined()
  })

  test("ignores paths at or below a literal, resolved against the logical root", () => {
    const compiled = Mapping.compile(L, C, ["node_modules", "exact/file.txt"])
    expect(Mapping.row(compiled, { name: "node_modules/pkg/index.js", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "node_modules", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "exact/file.txt", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "exact/other.txt", exists: true })).toBeDefined()
    // A literal sibling with a shared prefix must not overmatch.
    expect(Mapping.row(compiled, { name: "node_modulesX/file", exists: true })).toBeDefined()
  })

  test("excludes the whole watch when a literal is the root or an ancestor of it", () => {
    const self = Mapping.compile(L, C, [L])
    expect(Mapping.row(self, { name: "anything.txt", exists: true })).toBeUndefined()
    const ancestor = Mapping.compile(L, C, ["/logical"])
    expect(Mapping.row(ancestor, { name: "anything.txt", exists: true })).toBeUndefined()
  })

  test("keeps canonical-namespace spellings inert when the logical root differs", () => {
    // The ignore entry spells the canonical location of a symlinked root.
    const compiled = Mapping.compile(L, C, [C])
    expect(Mapping.row(compiled, { name: "file.txt", exists: true })).toEqual({
      path: "/logical/root/file.txt",
      type: "update",
    })
  })

  test("matches globs against the logical-relative suffix", () => {
    const compiled = Mapping.compile(L, C, ["**/{node_modules,.git}/**"])
    expect(Mapping.row(compiled, { name: "deep/node_modules/pkg/a.js", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: ".git/config", exists: true })).toBeUndefined()
    // micromatch's `x/**` also matches the bare `x`, matching parcel.
    expect(Mapping.row(compiled, { name: "node_modules", exists: true })).toBeUndefined()
    expect(Mapping.row(compiled, { name: "src/main.ts", exists: true })).toBeDefined()
  })

  test("matches dot-directories with dot:true like the parcel wrapper", () => {
    const compiled = Mapping.compile(L, C, [".cache/**"])
    expect(Mapping.row(compiled, { name: ".cache/a", exists: true })).toBeUndefined()
  })
})
