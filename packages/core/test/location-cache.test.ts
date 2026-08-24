import { describe, expect } from "bun:test"
import { Duration, Effect } from "effect"
import { resolveIdleTimeToLive } from "../src/location-services"
import { it } from "./lib/effect"

const ENV = "OPENCODE_LOCATION_CACHE_TTL"

const withEnv = <A, E>(value: string | undefined, effect: Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const previous = process.env[ENV]
    if (value === undefined) delete process.env[ENV]
    else process.env[ENV] = value
    return yield* effect.pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (previous === undefined) delete process.env[ENV]
          else process.env[ENV] = previous
        }),
      ),
    )
  })

describe("location cache lifetime", () => {
  it.effect("defaults to 60 minutes when no override is set", () =>
    withEnv(
      undefined,
      Effect.map(resolveIdleTimeToLive({}), (duration) => expect(duration).toEqual(Duration.minutes(60))),
    ))

  it.effect("reads OPENCODE_LOCATION_CACHE_TTL", () =>
    withEnv(
      "45 seconds",
      Effect.map(resolveIdleTimeToLive({}), (duration) => expect(duration).toEqual(Duration.seconds(45))),
    ))

  it.effect("accepts Infinity in any case", () =>
    withEnv(
      "infinity",
      Effect.map(resolveIdleTimeToLive({}), (duration) => expect(duration).toEqual(Duration.infinity)),
    ))

  it.effect("falls back to the default on invalid input", () =>
    withEnv(
      "soon",
      Effect.map(resolveIdleTimeToLive({}), (duration) => expect(duration).toEqual(Duration.minutes(60))),
    ))

  it.effect("prefers the explicit option over the env var", () =>
    withEnv(
      "45 seconds",
      Effect.map(resolveIdleTimeToLive({ idleTimeToLive: "2 hours" }), (duration) =>
        expect(duration).toEqual(Duration.hours(2)),
      ),
    ))
})
