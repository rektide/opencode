import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect, Redacted } from "effect"
import { Env } from "../src/env"

test("session environment omits server credentials", () => {
  const previousPassword = process.env.OPENCODE_PASSWORD
  const previousLegacyPassword = process.env.OPENCODE_SERVER_PASSWORD
  const previousValue = process.env.OPENCODE_SESSION_ENV_TEST
  process.env.OPENCODE_PASSWORD = "password"
  process.env.OPENCODE_SERVER_PASSWORD = "legacy"
  process.env.OPENCODE_SESSION_ENV_TEST = "included"

  const environment = Env.session()

  if (previousPassword === undefined) delete process.env.OPENCODE_PASSWORD
  else process.env.OPENCODE_PASSWORD = previousPassword
  if (previousLegacyPassword === undefined) delete process.env.OPENCODE_SERVER_PASSWORD
  else process.env.OPENCODE_SERVER_PASSWORD = previousLegacyPassword
  if (previousValue === undefined) delete process.env.OPENCODE_SESSION_ENV_TEST
  else process.env.OPENCODE_SESSION_ENV_TEST = previousValue

  expect(environment.OPENCODE_PASSWORD).toBeUndefined()
  expect(environment.OPENCODE_SERVER_PASSWORD).toBeUndefined()
  expect(environment.OPENCODE_SESSION_ENV_TEST).toBe("included")
})

describe("password source chain", () => {
  const sources = ["OPENCODE_PASSWORD", "OPENCODE_SERVER_PASSWORD", "OPENCODE_PASSWORD_FILE"]
  const passwordFile = () => join(directory, "OPENCODE_PASSWORD")
  let directory: string
  let previous: Record<string, string | undefined>

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "opencode-password-file-"))
  })

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  beforeEach(() => {
    previous = Object.fromEntries(sources.map((name) => [name, process.env[name]]))
  })

  afterEach(() => {
    for (const name of sources) {
      const value = previous[name]
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  // The ambient provider snapshots process.env once per process, so install a
  // fresh one to observe the mutations these tests make.
  function readPassword() {
    return Effect.runPromise(
      Env.password.pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnv())),
    )
  }

  async function adoptPasswordFile(content?: string) {
    await (content === undefined ? rm(passwordFile(), { force: true }) : writeFile(passwordFile(), content))
    process.env.OPENCODE_PASSWORD_FILE = passwordFile()
    delete process.env.OPENCODE_PASSWORD
    delete process.env.OPENCODE_SERVER_PASSWORD
    return readPassword()
  }

  test("adopts the password file when the environment variables are unset", async () => {
    // A trailing newline is typical of secret files and is not part of the
    // password.
    const password = await adoptPasswordFile("file-password\n")

    expect(password !== undefined && Redacted.value(password)).toBe("file-password")
  })

  test("prefers the environment password over the password file", async () => {
    await writeFile(passwordFile(), "file-password\n")
    process.env.OPENCODE_PASSWORD = "environment-password"
    process.env.OPENCODE_PASSWORD_FILE = passwordFile()

    const password = await readPassword()

    expect(password !== undefined && Redacted.value(password)).toBe("environment-password")
  })

  test("prefers the legacy environment name over the password file", async () => {
    await writeFile(passwordFile(), "file-password\n")
    delete process.env.OPENCODE_PASSWORD
    process.env.OPENCODE_SERVER_PASSWORD = "legacy-password"
    process.env.OPENCODE_PASSWORD_FILE = passwordFile()

    const password = await readPassword()

    expect(password !== undefined && Redacted.value(password)).toBe("legacy-password")
  })

  test("fails when the password file is missing", async () => {
    await expect(adoptPasswordFile()).rejects.toThrow(
      `OPENCODE_PASSWORD_FILE is set but ${passwordFile()} cannot be read`,
    )
  })

  test("fails when the password file is empty or whitespace", async () => {
    await expect(adoptPasswordFile("")).rejects.toThrow(`OPENCODE_PASSWORD_FILE is set but ${passwordFile()} is empty`)
    await expect(adoptPasswordFile("  \n")).rejects.toThrow("is empty")
  })

  test("stays unset without a password file or environment variables", async () => {
    delete process.env.OPENCODE_PASSWORD
    delete process.env.OPENCODE_SERVER_PASSWORD
    delete process.env.OPENCODE_PASSWORD_FILE

    expect(await readPassword()).toBeUndefined()
  })
})
