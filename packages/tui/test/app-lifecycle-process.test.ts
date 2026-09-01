import { expect, test } from "bun:test"
import path from "node:path"
import { createEventStream, createFetch, directory, json } from "./fixture/tui-client.ts"
import { tmpdir } from "./fixture/fixture.ts"

const signals = [
  ["SIGHUP", 0],
  ["SIGINT", 130],
  ["SIGTERM", 130],
] as const

test.skipIf(process.platform === "win32")(
  "app.exit writes one complete epilogue after cleanup and delayed stdout",
  () => runCase("fixture", "app.exit", 0),
  30_000,
)

test.skipIf(process.platform === "win32").each(signals)(
  "%s writes one complete epilogue after cleanup and delayed stdout",
  (signal, expectedExit) => runCase("fixture", signal, expectedExit),
  30_000,
)

test.skipIf(process.platform === "win32")(
  "actual CLI handles app.exit after cleanup with one complete epilogue",
  () => runCase("cli", "app.exit", 0),
  30_000,
)

test.skipIf(process.platform === "win32").each(signals)(
  "actual CLI handles %s after cleanup with one complete epilogue",
  (signal, expectedExit) => runCase("cli", signal, expectedExit),
  30_000,
)

async function runCase(
  mode: "fixture" | "cli",
  trigger: (typeof signals)[number][0] | "app.exit",
  expectedExit: number,
) {
  await using tmp = await tmpdir()
  const ready = path.join(tmp.path, "ready")
  const cleanup = path.join(tmp.path, "cleanup")
  const gate = path.join(tmp.path, "gate")
  const exit = path.join(tmp.path, "exit")
  const serverPlugin = path.join(tmp.path, "index.ts")
  const tuiPlugin = path.join(tmp.path, "tui.ts")
  await Bun.write(serverPlugin, "export default {}\n")
  await Bun.write(
    tuiPlugin,
    `
import { appendFile } from "node:fs/promises"

export default {
  id: "test.epilogue",
  setup: async (context) => {
    let shutdownProjections = 0
    const dispose = [
      context.ui.epilogue.register(() => {
        if (context.renderer.isDestroyed) shutdownProjections++
        return { label: "Fixture", value: { type: "text", text: "retained" } }
      }),
      context.ui.epilogue.register(({ sessionID }) => {
        if (context.renderer.isDestroyed) shutdownProjections++
        const session = context.data.session.get(sessionID)
        if (!session) return
        return { label: "Observed", value: { type: "relative-time", timestamp: session.time.updated } }
      }),
    ]
    await appendFile(${JSON.stringify(cleanup)}, "setup\\n")
    return async () => {
      dispose.reverse().forEach((remove) => remove())
      await appendFile(${JSON.stringify(cleanup)}, "cleanup:start\\n")
      while (!(await Bun.file(${JSON.stringify(gate)}).exists())) await Bun.sleep(10)
      await appendFile(${JSON.stringify(cleanup)}, "cleanup:end\\nshutdown:" + shutdownProjections + "\\n")
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
    cost: 1.25,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: 0, updated: 0 },
  }
  const sessionReady = Promise.withResolvers<void>()
  const requests: string[] = []
  const calls = createFetch(async (url) => {
    requests.push(url.pathname)
    if (url.pathname === "/api/health") return json({ healthy: true, version: "local", pid: process.pid })
    if (url.pathname === "/api/server") return json({ urls: [] })
    if (url.pathname === "/api/plugin")
      return json({
        location: { directory, project: { id: "project", directory, canonical: directory } },
        data: [
          {
            id: "test.epilogue",
            source: { type: "local", path: serverPlugin },
            state: { status: "active" },
            features: { server: true, tui: true },
          },
        ],
      })
    if (url.pathname === "/api/session" || url.pathname === "/api/session/dummy") {
      if (trigger === "app.exit") await waitForText(cleanup, "setup\n", "plugin did not finish setup")
      const current =
        trigger === "app.exit" ? { ...session, time: { created: 0, updated: Date.now() - 58_000 } } : session
      if (url.pathname === "/api/session") return json({ data: [current], cursor: {} })
      return json({ data: current })
    }
    if (url.pathname === "/api/session/dummy/message") return json({ data: [], cursor: {} })
    if (url.pathname === "/api/session/dummy/inbox") return json({ data: [] })
    if (url.pathname === "/api/session/dummy/permission") {
      sessionReady.resolve()
      return json({ data: [] })
    }
    return undefined
  }, createEventStream())
  const server = Bun.serve({ port: 0, fetch: (request) => calls.fetch(request) })
  const command =
    mode === "fixture"
      ? [process.execPath, path.join(import.meta.dir, "fixture/app-lifecycle-process.ts")]
      : [
          process.execPath,
          path.join(import.meta.dir, "../../cli/src/index.ts"),
          "--server",
          server.url.toString(),
          "--session",
          "dummy",
        ]
  const environment = { ...process.env }
  delete environment.OPENCODE_LOG_LEVEL
  delete environment.OPENCODE_PRINT_LOGS
  const child = Bun.spawn(command, {
    cwd: path.join(import.meta.dir, ".."),
    env: {
      ...environment,
      OPENCODE_DISABLE_AUTOUPDATE: "true",
      OPENCODE_EPILOGUE_SERVER: server.url.toString(),
      OPENCODE_EPILOGUE_READY: ready,
      OPENCODE_EPILOGUE_PLUGIN: tuiPlugin,
      OPENCODE_EPILOGUE_STATE: tmp.path,
      OPENCODE_EPILOGUE_EXIT: exit,
      OPENCODE_CONFIG_DIR: path.join(tmp.path, "config"),
      XDG_CACHE_HOME: path.join(tmp.path, "cache"),
      XDG_CONFIG_HOME: path.join(tmp.path, "config-home"),
      XDG_DATA_HOME: path.join(tmp.path, "data"),
      XDG_STATE_HOME: path.join(tmp.path, "state"),
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout: string[] = []
  const stderr: string[] = []
  const readStdout = collect(child.stdout, stdout)
  const readStderr = collect(child.stderr, stderr)

  try {
    await Promise.race([
      mode === "fixture" ? waitForFile(ready, "TUI did not become ready") : sessionReady.promise,
      child.exited.then((code) => {
        throw new Error(`TUI exited before becoming ready (${code}): ${stderr.join("")}`)
      }),
    ])
    await waitForText(cleanup, "setup\n", "plugin did not finish setup")
    if (mode === "cli") await Bun.sleep(500)
    if (trigger === "app.exit" && mode === "fixture") await Bun.write(exit, "exit\n")
    if (trigger === "app.exit" && mode === "cli") {
      await child.stdin.write(new Uint8Array([3]))
      await child.stdin.flush()
    }
    if (trigger !== "app.exit") child.kill(trigger)
    await waitForText(cleanup, "cleanup:start\n", "plugin cleanup did not start")
    await Bun.sleep(trigger === "app.exit" ? 3_000 : 150)
    if (mode === "fixture") expect(stdout.join("")).toBe("")
    if (mode === "cli") expect(Bun.stripANSI(stdout.join(""))).not.toContain("opencode2 -s dummy")

    await Bun.write(gate, "continue\n")
    expect(await Promise.race([child.exited, Bun.sleep(10_000).then(() => -1)])).toBe(expectedExit)
    await Promise.all([readStdout, readStderr])

    const raw = stdout.join("")
    const output = Bun.stripANSI(raw)
    if (!output.includes("opencode2 -s dummy"))
      throw new Error(
        `Missing epilogue: ${JSON.stringify({ output: output.slice(-1000), stderr: stderr.join(""), requests })}`,
      )
    expect(output.match(/opencode2 -s dummy/g) ?? []).toHaveLength(1)
    expect(output).toContain("Demo session")
    expect(output.match(/Active/g) ?? []).toHaveLength(1)
    expect(output).toContain("Cost      $1.25")
    expect(output).toContain("Fixture   retained")
    expect(output).toContain("Observed")
    expect(output.indexOf("Active")).toBeLessThan(output.indexOf("Cost"))
    expect(output.indexOf("Cost")).toBeLessThan(output.indexOf("Fixture"))
    expect(output.indexOf("Fixture")).toBeLessThan(output.indexOf("Observed"))
    expect(output.indexOf("Observed")).toBeLessThan(output.indexOf("Continue"))
    if (trigger === "app.exit") expect(output).toContain("Active    now")
    if (mode === "fixture") expect(output.endsWith("\n\n")).toBe(true)
    if (mode === "cli") expect(raw).toContain("\x1b]0;\x07")
    expect(stderr.join("")).toBe("")
    expect(await Bun.file(cleanup).text()).toBe("setup\ncleanup:start\ncleanup:end\nshutdown:0\n")
  } finally {
    await Bun.write(gate, "continue\n")
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await server.stop()
  }
}

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
  for (let attempt = 0; attempt < 800; attempt++) {
    if (await Bun.file(file).exists()) return
    await Bun.sleep(25)
  }
  throw new Error(message)
}

async function waitForText(file: string, text: string, message: string) {
  for (let attempt = 0; attempt < 800; attempt++) {
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
