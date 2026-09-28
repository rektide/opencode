import { Config, Effect, Redacted } from "effect"

// Every environment variable the CLI reads, in one place. Consumers yield
// these instead of touching process.env so the full surface stays visible,
// typed, and redacted where secret.

// The opencode server password: sent by clients connecting to an explicit
// --server, and adopted by a manually run or standalone server. Resolution
// order is OPENCODE_PASSWORD, the legacy OPENCODE_SERVER_PASSWORD name, then
// OPENCODE_PASSWORD_FILE — a path to a file holding the password, following
// the *_PASSWORD_FILE convention for passing secrets as files. The pointer is
// a path, not a secret, so it is read unredacted. A pointer whose file is
// missing, unreadable, or empty fails loudly instead of degrading to the
// ephemeral random password.
export const password = Effect.gen(function* () {
  const fromEnvironment = yield* Config.redacted("OPENCODE_PASSWORD").pipe(
    Config.orElse(() => Config.redacted("OPENCODE_SERVER_PASSWORD")),
    Config.withDefault(undefined),
  )
  if (fromEnvironment !== undefined) return fromEnvironment
  const file = yield* Config.string("OPENCODE_PASSWORD_FILE").pipe(Config.withDefault(undefined))
  if (file === undefined) return undefined
  return yield* filePassword(file)
})

function filePassword(file: string) {
  return Effect.gen(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => Bun.file(file).text(),
      catch: (cause) => new Error(`OPENCODE_PASSWORD_FILE is set but ${file} cannot be read`, { cause }),
    })
    // Trim so a trailing newline in the secret file does not become part of
    // the password; what remains empty is no password at all.
    const password = raw.trim()
    if (!password) return yield* Effect.fail(new Error(`OPENCODE_PASSWORD_FILE is set but ${file} is empty`))
    return Redacted.make(password)
  })
}

export function session() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== "OPENCODE_PASSWORD" && entry[0] !== "OPENCODE_SERVER_PASSWORD",
    ),
  )
}

export * as Env from "./env"
