import { NodeFileSystem } from "@effect/platform-node"
import { expect, test } from "bun:test"
import { Effect, FileSystem } from "effect"
import { writeFile } from "node:fs/promises"
import { Service, type ContenderEvent, type EnsureReason } from "../src/effect/service"
import { serviceFixture } from "./fixture/service-fixture"
import { accelerate } from "./fixture/service-timing"

const ensure = accelerate(Service.ensure)

test("a concurrent same-version start cannot invalidate a resolved endpoint", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  fixture.spawn("modern")
  await fixture.waitForFile()
  const original = await Bun.file(registration).json()

  const starts: EnsureReason[] = []
  const first = run(
    ensure({
      file: registration,
      version: "test",
      command: [],
      onStart: (reason) => starts.push(reason),
    }),
  )
  await fixture.waitForFile(registration + ".first-request")

  const resolved = await run(ensure({ file: registration, version: "test" }))
  expect(resolved.url).toBe(original.url)

  await writeFile(registration + ".release", "")
  await first

  expect(starts).toEqual([])
  expect(await Bun.file(registration).json()).toEqual(original)
  expect(await health(resolved.url)).toEqual({ healthy: true, version: "test", pid: original.pid })
})

test("reuses a compatible registered service", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("compatible")
  await fixture.waitForFile()

  const starts: EnsureReason[] = []
  const endpoint = await run(
    ensure({
      file: registration,
      version: (version) => version.startsWith("2."),
      command: [],
      onStart: (reason) => starts.push(reason),
    }),
  )

  expect(endpoint.url).toBe((await Bun.file(registration).json()).url)
  expect(starts).toEqual([])
  expect(existing.exitCode).toBe(null)
})

test("adds configured environment variables when starting a service", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("environment"),
      env: { OPENCODE_SERVICE_ENV_TEST: "configured" },
    }),
  )
  const info = await Bun.file(registration).json()
  fixture.track(info.pid)

  expect(endpoint.url).toBe(info.url)
  expect(await Bun.file(registration + ".environment").text()).toBe("configured")
})

test("replaces an incompatible registered service", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("incompatible")
  await fixture.waitForFile()

  const starts: EnsureReason[] = []
  const endpoint = await run(
    ensure({
      file: registration,
      version: (version) => version.startsWith("2."),
      command: fixture.command("delayed-compatible", "10"),
      onStart: (reason) => starts.push(reason),
    }),
  )
  const replacement = await Bun.file(registration).json()
  fixture.track(replacement.pid)

  expect(await existing.exited).toBe(0)
  expect(replacement.version).toBe("2.1.0-next.1")
  expect(endpoint.url).toBe(replacement.url)
  expect(starts).toEqual(["version-mismatch"])
})

test("waits for a registered service to finish starting", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const process = fixture.spawn("starting")
  await fixture.waitForFile()
  const result = run(ensure({ file: registration, version: "test", command: [] }))

  await fixture.waitForFile(registration + ".health-request")
  expect(process.exitCode).toBe(null)
  await writeFile(registration + ".release", "")
  expect((await result).url).toBe((await Bun.file(registration).json()).url)
})

test("reports a failed registered service without spawning", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const process = fixture.spawn("failed-owner")
  await fixture.waitForFile()

  await expect(run(ensure({ file: registration, version: "test", command: [] }))).rejects.toThrow(
    "Background service failed to start",
  )
  expect(process.exitCode).toBe(null)
})

test("evicts an unresponsive registered service before starting its replacement", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("hanging")
  await fixture.waitForFile()
  const original = await Bun.file(registration).json()

  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("delayed", "10"),
    }),
  )
  const replacement = await Bun.file(registration).json()
  fixture.track(replacement.pid)

  expect((await Bun.file(registration + ".requests").text()).trim().split("\n")).toHaveLength(3)
  expect(await existing.exited).toBe(0)
  expect(replacement.pid).not.toBe(original.pid)
  expect(endpoint.url).toBe(replacement.url)
  expect(await health(endpoint.url)).toEqual({ healthy: true, version: "test", pid: replacement.pid })
})

test("evicts an unresponsive service through a graceful stop request", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("hanging-graceful")
  await fixture.waitForFile()
  const original = await Bun.file(registration).json()

  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("delayed", "10"),
    }),
  )
  const replacement = await Bun.file(registration).json()
  fixture.track(replacement.pid)

  expect(await Bun.file(registration + ".stop").json()).toEqual({ instanceID: original.id })
  expect(await existing.exited).toBe(0)
  expect(replacement.pid).not.toBe(original.pid)
  expect(endpoint.url).toBe(replacement.url)
})

test("a briefly unresponsive registered service recovers instead of being evicted", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("stall")
  await fixture.waitForFile()
  const original = await Bun.file(registration).json()

  // command: [] makes any contender spawn fail the ensure, proving the strike
  // window holds contenders back while the incumbent is merely unresponsive.
  const result = run(
    Service.ensure({
      file: registration,
      version: "test",
      command: [],
      probeTimeoutSeconds: 0.5,
      evictionStrikes: 100,
    }),
  )
  await Bun.sleep(2_000)
  await writeFile(registration + ".release", "")

  const endpoint = await result
  expect(endpoint.url).toBe(original.url)
  expect(existing.exitCode).toBe(null)
  expect(await health(endpoint.url)).toEqual({ healthy: true, version: "test", pid: original.pid })
}, 20_000)

test("signals an unresponsive registered service process", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const process = fixture.spawn("hanging")
  await fixture.waitForFile()

  await run(Service.stop({ file: registration }))
  await process.exited
  expect(await Bun.file(registration + ".signal").text()).toBe("SIGTERM")
  expect(await Bun.file(registration).exists()).toBe(false)
})

test("signals an incompatible service before starting its replacement", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("old")
  await fixture.waitForFile()
  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("delayed", "10"),
    }),
  )
  const replacement = await Bun.file(registration).json()
  fixture.track(replacement.pid)

  expect(await existing.exited).toBe(0)
  expect(endpoint.url).toBe(replacement.url)
})

test("a legacy health response is still replaced", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const existing = fixture.spawn("legacy")
  await fixture.waitForFile()

  const starts: EnsureReason[] = []
  const result = run(ensure({ file: registration, command: [], onStart: (reason) => starts.push(reason) }))

  await expect(result).rejects.toThrow("Missing service command")
  expect(starts).toEqual(["version-mismatch"])
  await existing.exited
})

test("waits for a slow winner while bounding lock probes", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("coordinated"),
    }),
  )
  const info = await Bun.file(registration).json()
  fixture.track(info.pid)

  expect(endpoint.url).toBe(info.url)
  expect(await health(endpoint.url)).toEqual({ healthy: true, version: "test", pid: info.pid })
  expect((await Bun.file(registration + ".starts").text()).trim().split("\n")).toHaveLength(2)
})

test("waits for a live contender when another contender fails", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("coordinated-failed-loser", "300"),
    }),
  )
  const info = await Bun.file(registration).json()
  fixture.track(info.pid)

  expect(endpoint.url).toBe(info.url)
})

test("reports a contender that fails to start", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  await expect(
    run(
      ensure({
        file: registration,
        version: "test",
        command: fixture.command("failed"),
      }),
    ),
  ).rejects.toThrow("Server process exited with code 1")
})

test("reports a bounded contender stderr tail", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const error = await run(
    Service.ensure({
      file: registration,
      version: "test",
      command: fixture.command("stderr-failed"),
    }),
  ).catch((error: unknown) => error)

  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw error
  expect(error.message).toContain("actionable startup failure")
  expect(error.message.length).toBeLessThan(9_000)
}, 10_000)

test("reports a contender terminated by a signal", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  await expect(
    run(
      ensure({
        file: registration,
        version: "test",
        command: fixture.command("signal"),
      }),
    ),
  ).rejects.toThrow(/Server process (terminated by|exited with code)/)
})

test("reports a slow contender that eventually fails", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  await expect(
    run(
      ensure({
        file: registration,
        version: "test",
        command: fixture.command("delayed-failed", "500"),
      }),
    ),
  ).rejects.toThrow("Server process exited with code 1")
})

test("replaces an incompatible owner that appears during startup", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const starting = run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("delayed", "500"),
    }),
  )
  await fixture.waitForFile(registration + ".starts")
  const old = fixture.spawn("old")
  await fixture.waitForFile()
  const endpoint = await starting
  const info = await Bun.file(registration).json()
  fixture.track(info.pid)

  expect(endpoint.url).toBe(info.url)
  expect(info.version).toBe("test")
  await old.exited
})

test("reports contender outcomes with elapsed time", async () => {
  await using fixture = await serviceFixture()
  const registration = fixture.registration
  const events: ContenderEvent[] = []
  const endpoint = await run(
    ensure({
      file: registration,
      version: "test",
      command: fixture.command("coordinated"),
      onContender: (event) => events.push(event),
    }),
  )
  const info = await Bun.file(registration).json()
  fixture.track(info.pid)
  expect(endpoint.url).toBe(info.url)
  // The losing contender yields shortly after the winner registers, which
  // can land after ensure itself resolves.
  for (let attempt = 0; attempt < 500 && !events.some((event) => event.type === "finished"); attempt++)
    await Bun.sleep(10)
  expect(events.filter((event) => event.type === "spawned")).toHaveLength(2)
  const finished = events.filter((event) => event.type === "finished")
  expect(finished).toHaveLength(1)
  expect(finished[0]).toMatchObject({ type: "finished", outcome: "yielded" })
  expect(finished[0].elapsedMs).toBeGreaterThan(0)
}, 15_000)

function run<A, E>(effect: Effect.Effect<A, E, FileSystem.FileSystem>) {
  return Effect.runPromise(effect.pipe(Effect.provide(NodeFileSystem.layer)))
}

async function health(url: string) {
  return fetch(new URL("/api/health", url), { signal: AbortSignal.timeout(1_000) }).then((response) => response.json())
}
