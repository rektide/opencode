import { describe, expect, test } from "bun:test"
import path from "node:path"
import { WatchmanMapping } from "@opencode-ai/core/filesystem/watcher/watchman/mapping"

const compile = (ignore: readonly string[] = []) =>
  WatchmanMapping.compile({
    logicalRoot: "/workspace/link",
    canonicalRoot: "/srv/project",
    ignore,
  })

describe("WatchmanMapping", () => {
  test("maps file and directory rows into the logical namespace", () => {
    const mapping = compile()

    expect(WatchmanMapping.map(mapping, { name: "src/index.ts", exists: true })).toEqual({
      _tag: "Mapped",
      update: { path: path.join("/workspace/link", "src/index.ts"), type: "update" },
    })
    expect(WatchmanMapping.map(mapping, { name: "src", exists: false })).toEqual({
      _tag: "Mapped",
      update: { path: path.join("/workspace/link", "src"), type: "delete" },
    })
  })

  test("applies Parcel literal ignores in the logical namespace", () => {
    const mapping = compile(["node_modules", "../link", "../sibling"])

    expect(WatchmanMapping.map(mapping, { name: "node_modules/pkg/index.js", exists: true })).toEqual({
      _tag: "Ignored",
    })
    expect(WatchmanMapping.map(mapping, { name: "src/index.ts", exists: true })).toEqual({ _tag: "Ignored" })

    const canonical = compile(["/srv/project/src"])
    expect(WatchmanMapping.map(canonical, { name: "src/index.ts", exists: true })).toMatchObject({ _tag: "Mapped" })

    const sibling = compile(["../sibling"])
    expect(WatchmanMapping.map(sibling, { name: "src/index.ts", exists: true })).toMatchObject({ _tag: "Mapped" })
  })

  test("applies each Parcel glob to the logical relative POSIX name", () => {
    const mapping = compile(["**/{node_modules,.git}/**", "src/**/*.test.ts"])

    expect(WatchmanMapping.map(mapping, { name: "packages/a/node_modules/pkg/index.js", exists: true })).toEqual({
      _tag: "Ignored",
    })
    expect(WatchmanMapping.map(mapping, { name: ".git/refs/heads/main", exists: true })).toEqual({
      _tag: "Ignored",
    })
    expect(WatchmanMapping.map(mapping, { name: "src/unit/a.test.ts", exists: true })).toEqual({
      _tag: "Ignored",
    })
    expect(WatchmanMapping.map(mapping, { name: "src/unit/a.ts", exists: true })).toMatchObject({ _tag: "Mapped" })
  })

  test("drops Watchman cookies at every depth", () => {
    const mapping = compile()

    expect(WatchmanMapping.map(mapping, { name: ".watchman-cookie-root", exists: true })).toEqual({
      _tag: "Ignored",
    })
    expect(WatchmanMapping.map(mapping, { name: "nested/.watchman-cookie-child", exists: true })).toEqual({
      _tag: "Ignored",
    })
  })

  test.each(["", ".", "..", "../escape", "/absolute", "src/../../escape", "src/\0bad"]) (
    "rejects unsafe row name %p",
    (name) => {
      expect(WatchmanMapping.map(compile(), { name, exists: true })).toMatchObject({ _tag: "Invalid" })
    },
  )
})
