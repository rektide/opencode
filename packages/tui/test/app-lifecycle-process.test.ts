import { expect, test } from "bun:test"
import path from "node:path"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client.ts"
import { tmpdir } from "./fixture/fixture.ts"

const signals = [
  ["SIGHUP", 0],
  ["SIGINT", 130],
  ["SIGTERM", 130],
] as const

test.skipIf(process.platform === "win32").each(signals)(
  "%s writes one complete epilogue after cleanup and delayed stdout",
  async (signal, expectedExit) => {
    await using tmp = await tmpdir()
    const ready = path.join(tmp.path, "ready")
    const cleanup = path.join(tmp.path, "cleanup")
    const gate = path.join(tmp.path, "gate")
    const plugin = path.join(tmp.path, "plugin.ts")
    await Bun.write(
      plugin,
      `
import { appendFile } from "node:fs/promises"

export default {
  id: "test.epilogue",
  setup: async () => {
    await appendFile(${JSON.stringify(cleanup)}, "setup\\n")
    return async () => {
      await appendFile(${JSON.stringify(cleanup)}, "cleanup:start\\n")
      while (!(await Bun.file(${JSON.stringify(gate)}).exists())) await Bun.sleep(10)
      await appendFile(${JSON.stringify(cleanup)}, "cleanup:end\\n")
    }
  },
}
`,
    )
    const session = {
      id: "dummy",
      title: "Demo session",
      projectID: "project",
      location: { directory },
      cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      time: { created: 0, updated: 0 },
    }
    const calls = createFetch((url) => {
      if (url.pathname === "/api/plugin")
        return json({
          location: { directory, project: { id: "project", directory, canonical: directory } },
          data: [
            {
              id: "test.epilogue",
              source: { type: "package", package: "test-epilogue@1.0.0" },
              state: { status: "active" },
              features: { server: true, tui: true },
            },
          ],
        })
      if (url.pathname === "/api/session") return json({ data: [session], cursor: {} })
      if (url.pathname === "/api/session/dummy") return json({ data: session })
      if (url.pathname === "/api/session/dummy/message") return json({ data: [], cursor: {} })
      if (url.pathname === "/api/session/dummy/inbox") return json({ data: [] })
      if (url.pathname === "/api/session/dummy/permission") return json({ data: [] })
      return undefined
    }, createEventStream())
    const server = Bun.serve({ port: 0, fetch: (request) => calls.fetch(request) })
    const child = Bun.spawn([process.execPath, path.join(import.meta.dir, "fixture/app-lifecycle-process.ts")], {
      cwd: path.join(import.meta.dir, ".."),
      env: {
        ...process.env,
        OPENCODE_EPILOGUE_SERVER: server.url.toString(),
        OPENCODE_EPILOGUE_READY: ready,
        OPENCODE_EPILOGUE_PLUGIN: plugin,
        OPENCODE_EPILOGUE_STATE: tmp.path,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout: string[] = []
    const stderr: string[] = []
    const readStdout = collect(child.stdout, stdout)
    const readStderr = collect(child.stderr, stderr)

    try {
      await Promise.race([
        waitForFile(ready, "TUI did not become ready"),
        child.exited.then((code) => {
          throw new Error(`TUI exited before becoming ready (${code}): ${stderr.join("")}`)
        }),
      ])
      await waitForText(cleanup, "setup\n", "plugin did not finish setup")
      child.kill(signal)
      await waitForText(cleanup, "cleanup:start\n", "plugin cleanup did not start")
      await Bun.sleep(150)
      expect(stdout.join("")).toBe("")

      await Bun.write(gate, "continue\n")
      expect(await Promise.race([child.exited, Bun.sleep(10_000).then(() => -1)])).toBe(expectedExit)
      await Promise.all([readStdout, readStderr])

      const output = Bun.stripANSI(stdout.join(""))
      expect(output.match(/Session\s+Demo session/g) ?? []).toHaveLength(1)
      expect(output).toContain("Active")
      expect(output).toContain("opencode2 -s dummy")
      expect(output.endsWith("\n\n")).toBe(true)
      expect(stderr.join("")).toBe("")
      expect(await Bun.file(cleanup).text()).toBe("setup\ncleanup:start\ncleanup:end\n")
    } finally {
      await Bun.write(gate, "continue\n")
      if (child.exitCode === null) child.kill("SIGKILL")
      await child.exited
      await server.stop()
    }
  },
  30_000,
)

async function collect(stream: ReadableStream<Uint8Array>, chunks: string[]) {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(decoder.decode(result.value, { stream: true }))
  }
  chunks.push(decoder.decode())
}

async function waitForFile(file: string, message: string) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (await Bun.file(file).exists()) return
    await Bun.sleep(25)
  }
  throw new Error(message)
}

async function waitForText(file: string, text: string, message: string) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (
      (
        await Bun.file(file)
          .text()
          .catch(() => "")
      ).includes(text)
    )
      return
    await Bun.sleep(25)
  }
  throw new Error(message)
}
