import { describe, expect } from "bun:test"
import { Effect, Stream } from "effect"
import { Plugin as EffectPlugin } from "@opencode-ai/plugin/effect"
import { define } from "@opencode-ai/plugin/promise/plugin"
import { Bus } from "@opencode-ai/core/bus"
import { Plugin } from "@opencode-ai/core/plugin"
import { PluginPromise } from "@opencode-ai/core/plugin/promise"
import { SubscriberRegistry } from "@opencode-ai/core/subscriber-registry"
import { Config as ConfigSchema } from "@opencode-ai/schema/config"
import { Subscriber } from "@opencode-ai/schema/subscriber"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)

const versioned = <R>(plugin: EffectPlugin.Plugin<R>, version = "1") => ({ ...plugin, version })

describe("subscriber registry plugin integration", () => {
  it.live("attributes plugin event subscriptions with owner and generation", () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const registry = yield* SubscriberRegistry.Service

      const watching = EffectPlugin.define({
        id: "watching",
        effect: (ctx) =>
          ctx.event
            .subscribe()
            .pipe(
              Stream.runDrain,
              Effect.forkScoped,
              Effect.asVoid,
            ),
      })

      yield* plugins.activate([versioned(watching)])
      yield* Effect.sleep(5)
      const first = yield* registry.snapshot()
      const owned = first.subscribers.filter((subscriber) => subscriber.owner.type === "plugin")
      expect(owned.length).toBe(1)
      if (owned[0]?.owner.type !== "plugin") throw new Error("expected plugin owner")
      expect(owned[0]?.owner.pluginID).toBe(Plugin.ID.make("watching"))
      expect(owned[0]?.owner.generation).toBe("1")
      expect(owned[0]?.kind).toBe("stream")
      expect(owned[0]?.target.namespace).toBe("event")
      expect(owned[0]?.target.name).toBe("public-feed")
      expect(owned[0]?.delivery).toEqual({ type: "effect-stream" })

      const bus = yield* Bus.Service
      yield* bus.publish(ConfigSchema.Event.Updated, {})
      yield* Effect.sleep(5)
      const counted = yield* registry.snapshot()
      const activity = counted.subscribers.find((subscriber) => subscriber.owner.type === "plugin")?.activity
      expect(activity?.delivered).toBeGreaterThan(0)

      yield* plugins.activate([versioned(watching, "2")])
      yield* Effect.sleep(5)
      const replaced = yield* registry.snapshot()
      const generations = replaced.subscribers
        .filter((subscriber) => subscriber.owner.type === "plugin")
        .map((subscriber) => (subscriber.owner.type === "plugin" ? subscriber.owner.generation : undefined))
      expect(generations).toEqual(["2"])

      yield* plugins.activate([])
      yield* Effect.sleep(5)
      expect(yield* registry.count({ owner: { type: "plugin" } })).toBe(0)
    }),
  )

  it.live("exposes read-only subscriber access through both plugin domains", () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      let effectSnapshot: Subscriber.Snapshot | undefined
      let promiseSnapshot: unknown
      let promiseCount: number | undefined

      const effectPlugin = EffectPlugin.define({
        id: "effect-reader",
        effect: (ctx) =>
          Effect.gen(function* () {
            yield* ctx.event
              .subscribe()
              .pipe(Stream.runDrain, Effect.forkScoped, Effect.asVoid)
            yield* Effect.sleep(5)
            effectSnapshot = yield* ctx.subscriber.snapshot({ owner: { type: "plugin" } })
            yield* ctx.subscriber
              .watch({ kind: "stream" })
              .pipe(Stream.take(1), Stream.runDrain, Effect.forkScoped, Effect.asVoid)
          }),
      })

      const promisePlugin = define({
        id: "promise-reader",
        setup: async (ctx) => {
          promiseSnapshot = await ctx.subscriber.snapshot()
          promiseCount = await ctx.subscriber.count({ owner: { type: "plugin" } })
        },
      })

      yield* plugins.activate([versioned(effectPlugin), versioned(PluginPromise.fromPromise(promisePlugin))])
      yield* Effect.sleep(10)

      expect(effectSnapshot?.subscribers.map((subscriber) => subscriber.owner.type)).toContain("plugin")
      expect(promiseCount).toBe(1)
      const encoded = promiseSnapshot as { revision: number; subscribers: Array<{ owner: { type: string } }> }
      expect(typeof encoded.revision).toBe("number")
      expect(encoded.subscribers.length).toBeGreaterThan(0)
      expect(encoded.subscribers.every((subscriber) => typeof subscriber.owner.type === "string")).toBeTrue()
    }),
  )
})
