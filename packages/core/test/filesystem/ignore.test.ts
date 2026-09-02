import { expect, test } from "bun:test"
import { Ignore } from "@opencode-ai/core/filesystem/ignore"
// @ts-ignore
import { createWrapper } from "@parcel/watcher/wrapper"

async function recordedPatterns() {
  let ignoreGlobs: string[] = []
  const watcher = createWrapper({
    subscribe: async (
      _directory: string,
      _callback: (...args: unknown[]) => unknown,
      options: { ignoreGlobs?: string[] },
    ) => {
      ignoreGlobs = options.ignoreGlobs ?? []
    },
  })
  await watcher.subscribe("/tmp/project", () => {}, { ignore: Ignore.PATTERNS })
  return ignoreGlobs.map((source) => new RegExp(source))
}

test("parcel patterns ignore built-in folders at any depth", async () => {
  const patterns = await recordedPatterns()

  for (const path of [
    "nested/node_modules",
    "nested/node_modules/package/index.js",
    "nested/.git",
    "nested/.git/HEAD",
    "nested/dist",
    "nested/dist/index.js",
    "nested/.jj",
    "nested/.jj/working_copy/snapshot",
    "nested/.venv",
    "nested/venv/lib/python",
  ]) {
    expect(patterns.some((pattern) => pattern.test(path))).toBe(true)
  }
  expect(patterns.some((pattern) => pattern.test("nested/src/index.ts"))).toBe(false)
})

test("parcel patterns ignore watchman cookie files at root and depth", async () => {
  const patterns = await recordedPatterns()

  for (const path of [
    ".watchman-cookie-workhorse.hosts-120880-0",
    "nested/.watchman-cookie-examplehost-1-2",
  ]) {
    expect(patterns.some((pattern) => pattern.test(path))).toBe(true)
  }
  expect(patterns.some((pattern) => pattern.test("src/.watchman-like-file"))).toBe(false)
})
