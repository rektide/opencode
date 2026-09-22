import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect, Scope } from "effect"
import { WatchmanDirectory } from "@opencode/core/filesystem/watchman/directory"

/**
 * Live smoke against a real private watchman-compatible daemon. Skipped
 * unless OPENCODE_TEST_WATCHMAN_SOCK points at a scratch daemon, e.g.:
 *
 *   systemd-run --user --collect watchman -u $PWD/sock \
 *     --statefile=$PWD/state -o - -f
 *   OPENCODE_TEST_WATCHMAN_SOCK=$PWD/sock bun test test/filesystem/watchman/
 */

const socket = process.env.OPENCODE_TEST_WATCHMAN_SOCK
const describeLive = socket ? describe : describe.skip

const waitFor = async (predicate: () => boolean, label: string, ms = 10_000) => {
  const deadline = Date.now() + ms
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50))
  if (!predicate()) throw new Error(`timeout waiting for ${label}`)
}

describeLive("watchman live", () => {
  test("attaches, publishes mapped hints, respects ignores, and stops on release", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "watchman-live-"))
    const published: { path: string; type: string }[] = []
    const invalidations: number[] = []
    const scope = Effect.runSync(Scope.make())
    const subscription = await Effect.runPromise(
      WatchmanDirectory.subscribe(
        { socket: socket!, commandTimeoutMs: 5000, heartbeatMs: 60_000 },
        scope,
        {
          type: "directory",
          target: root,
          ignore: ["node_modules"],
          publish: (update) => published.push(update),
          invalidate: () => invalidations.push(1),
        },
      ),
    )
    try {
      await waitFor(() => invalidations.length >= 1, "first attach")

      await fs.writeFile(path.join(root, "hello.txt"), "v1")
      await waitFor(() => published.some((u) => u.path.endsWith("hello.txt") && u.type === "update"), "update publish")

      await fs.writeFile(path.join(root, "hello.txt"), "v2")
      await waitFor(
        () => published.filter((u) => u.path.endsWith("hello.txt")).length >= 2,
        "modify publish",
      )

      await fs.mkdir(path.join(root, "pkg"), { recursive: true })
      await fs.writeFile(path.join(root, "pkg", "nested.txt"), "n")
      await waitFor(() => published.some((u) => u.path.endsWith("pkg/nested.txt")), "nested publish")

      await fs.mkdir(path.join(root, "node_modules"), { recursive: true })
      await fs.writeFile(path.join(root, "node_modules", "ignored.txt"), "x")
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(published.some((u) => u.path.includes("node_modules"))).toBe(false)

      await fs.unlink(path.join(root, "hello.txt"))
      await waitFor(() => published.some((u) => u.path.endsWith("hello.txt") && u.type === "delete"), "delete publish")

      const before = published.length
      await subscription.unsubscribe()
      await fs.writeFile(path.join(root, "after-stop.txt"), "x")
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(published.length).toBe(before)
      expect(invalidations.length).toBe(1)
    } finally {
      await subscription.unsubscribe()
      await Scope.close(scope, { _tag: "Success", value: undefined } as never)
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
