import { describe, expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Argument, Command, Flag, GlobalFlag } from "effect/unstable/cli"
import { Spec } from "../framework/spec.ts"
import { prepareArguments } from "./environment.ts"

const commands = Spec.make("opencode", {
  params: {
    server: Flag.string("server").pipe(Flag.optional),
    continue: Flag.boolean("continue").pipe(Flag.withAlias("c")),
    prompt: Flag.string("prompt").pipe(Flag.optional),
    directory: Argument.string("directory").pipe(Argument.optional),
  },
  commands: [
    Spec.make("run", {
      params: {
        server: Flag.string("server").pipe(Flag.optional),
        model: Flag.string("model").pipe(Flag.optional),
      },
    }),
    Spec.make("serve", {
      params: {
        port: Flag.integer("port").pipe(Flag.optional),
      },
    }),
    Spec.make("mini", {
      params: {
        server: Flag.string("server").pipe(Flag.optional),
        model: Flag.string("model").pipe(Flag.optional),
      },
    }),
  ],
})

const globals = GlobalFlag.BuiltIns.map((flag) => flag.flag)

describe("environment arguments", () => {
  test("leaves explicit arguments unchanged when neither environment source is set", () => {
    const args = ["run", "--server", "explicit"]
    const result = prepareArguments(commands, args, {}, globals)

    expect(result.args).toBe(args)
    expect(result.warnings).toEqual([])
  })

  test("combines generic and TUI defaults after explicit arguments", () => {
    const result = prepareArguments(
      commands,
      ["--server", "explicit"],
      {
        OPENCODE_ARGS: "--server generic --continue",
        OPENCODE_TUI_ARGS: '--server "tui server"',
      },
      globals,
    )

    expect(result.args).toEqual(["--server", "explicit", "--server", "tui server", "--server", "generic", "--continue"])
    expect(result.warnings).toEqual([])
  })

  test("Effect CLI resolves explicit flags before environment defaults", async () => {
    const received: Array<string | undefined> = []
    const command = Command.make("opencode", { server: Flag.string("server").pipe(Flag.optional) }, (input) =>
      Effect.sync(() => {
        received.push(Option.getOrUndefined(input.server))
      }),
    )
    const prepared = prepareArguments(
      commands,
      ["--server", "explicit"],
      {
        OPENCODE_ARGS: "--server generic",
        OPENCODE_TUI_ARGS: "--server tui",
      },
      globals,
    )

    await Effect.runPromise(
      Command.runWith(command, { version: "test" })(prepared.args).pipe(Effect.provide(NodeServices.layer)),
    )

    expect(received).toEqual(["explicit"])
  })

  test("silently leaves TUI defaults unused on CLI subcommands", () => {
    const result = prepareArguments(
      commands,
      ["run", "--server", "explicit"],
      {
        OPENCODE_ARGS: "--server fallback",
        OPENCODE_TUI_ARGS: "--continue",
      },
      globals,
    )

    expect(result.args).toEqual(["run", "--server", "explicit", "--server", "fallback"])
    expect(result.warnings).toEqual([])
  })

  test("applies TUI defaults to the interactive mini command", () => {
    const result = prepareArguments(commands, ["mini"], { OPENCODE_TUI_ARGS: "--model provider/model" }, globals)

    expect(result.args).toEqual(["mini", "--model", "provider/model"])
    expect(result.warnings).toEqual([])
  })

  test("does not mistake a flag value for a subcommand", () => {
    const result = prepareArguments(commands, ["--server", "run"], { OPENCODE_TUI_ARGS: "--continue" }, globals)

    expect(result.args).toEqual(["--server", "run", "--continue"])
    expect(result.warnings).toEqual([])
  })

  test("drops flags that are valid elsewhere but unsupported by the selected command", () => {
    const result = prepareArguments(
      commands,
      ["serve"],
      { OPENCODE_ARGS: "--server http://127.0.0.1:3000 --port 4999" },
      globals,
    )

    expect(result.args).toEqual(["serve", "--port", "4999"])
    expect(result.warnings).toEqual(["OPENCODE_ARGS dropped unsupported arguments: --server."])
  })

  test("preserves values with spaces and escaped whitespace", () => {
    const result = prepareArguments(
      commands,
      [],
      {
        OPENCODE_ARGS: '--prompt "a wide $USER prompt" --server http://localhost\\:3000',
      },
      globals,
    )

    expect(result.args).toEqual(["--prompt", "a wide $USER prompt", "--server", "http://localhost:3000"])
  })

  test("drops environment flags missing their values", () => {
    const result = prepareArguments(commands, [], { OPENCODE_ARGS: "--server" }, globals)

    expect(result.args).toEqual([])
    expect(result.warnings).toEqual(["OPENCODE_ARGS dropped unsupported arguments: --server (missing value)."])
  })

  test("ignores malformed shell-word strings with a stderr-ready warning", () => {
    const result = prepareArguments(commands, [], { OPENCODE_ARGS: '--prompt "unfinished' }, globals)

    expect(result.args).toEqual([])
    expect(result.warnings).toEqual(["OPENCODE_ARGS ignored: invalid shell-word syntax (unterminated double quote)."])
  })

  test("drops positional command words from environment defaults", () => {
    const result = prepareArguments(commands, [], { OPENCODE_ARGS: "run --server http://localhost" }, globals)

    expect(result.args).toEqual(["--server", "http://localhost"])
    expect(result.warnings).toEqual(["OPENCODE_ARGS dropped unsupported arguments: <positional argument>."])
  })

  test("inserts defaults before the explicit trailing-operand delimiter", () => {
    const result = prepareArguments(
      commands,
      ["run", "--", "verbatim", "--model"],
      { OPENCODE_ARGS: "--server http://localhost" },
      globals,
    )

    expect(result.args).toEqual(["run", "--server", "http://localhost", "--", "verbatim", "--model"])
  })
})
