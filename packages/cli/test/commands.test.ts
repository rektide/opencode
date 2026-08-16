import { expect, test } from "bun:test"
import { NodeServices } from "@effect/platform-node"
import { Effect, Option } from "effect"
import { Command } from "effect/unstable/cli"
import { Commands } from "../src/commands/commands"

test("root session flag preserves repeated values in order", async () => {
  let sessions: readonly string[] = []
  const command = Commands.spec.pipe(Command.withHandler((input) => Effect.sync(() => (sessions = input.session))))

  await Effect.runPromise(
    Command.runWith(command, { version: "test" })(["-s", "first", "--session", "second"]).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )

  expect(sessions).toEqual(["first", "second"])
})

test("root session flag preserves zero and one value behavior", async () => {
  const parsed: Array<readonly string[]> = []
  const command = Commands.spec.pipe(Command.withHandler((input) => Effect.sync(() => parsed.push(input.session))))
  const run = (args: readonly string[]) =>
    Effect.runPromise(Command.runWith(command, { version: "test" })(args).pipe(Effect.provide(NodeServices.layer)))

  await run([])
  await run(["-s", "only"])

  expect(parsed).toEqual([[], ["only"]])
})

test("root session review flag accepts a preset file", async () => {
  let review = ""
  const command = Commands.spec.pipe(
    Command.withHandler((input) => Effect.sync(() => (review = Option.getOrElse(input.sessionReview, () => "")))),
  )

  await Effect.runPromise(
    Command.runWith(command, { version: "test" })(["--session-review", "reviews/today.txt"]).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )

  expect(review).toBe("reviews/today.txt")
})
