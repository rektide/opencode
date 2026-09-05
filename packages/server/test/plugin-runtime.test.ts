import { expect } from "bun:test"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import { SdkPlugins } from "@opencode/core/plugin/sdk"
import { Plugin } from "@opencode/plugin/effect"
import type { Context } from "@opencode/plugin/effect/plugin"
import { Context as EffectContext, Deferred, Effect, Layer } from "effect"
import { HttpEffect, HttpRouter, HttpServer } from "effect/unstable/http"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir"
import { it } from "../../core/test/lib/effect"
import { createRoutes } from "../src/routes"

// The production routes are the only place the PluginRuntime cell gets its
// provider wired; the core plugin fixture builds it separately. Exercise the
// host session read surface through a real server graph so a missing provider
// fails here instead of dying at plugin tool execution ("Plugin runtime is
// unavailable").
const fixture = Effect.fn(function* () {
  const tmp = yield* tmpdirScoped("opencode-plugin-runtime-")
  const directory = path.join(tmp.path, "project")
  const config = path.join(tmp.path, "config")
  yield* Effect.promise(() => Promise.all([directory, config].map((dir) => mkdir(dir))))
  const exposed = yield* Deferred.make<Context>()
  const context = yield* Layer.build(
    createRoutes({
      password: "secret",
      database: { path: ":memory:" },
      models: { fetch: false },
      fs: { filewatcher: false },
      config: { directory: config, project: false },
    }).pipe(Layer.provide(HttpServer.layerServices)),
  )
  const sdk = EffectContext.get(context, SdkPlugins.Service)
  yield* sdk.register(
    Plugin.define({
      id: "runtime-probe",
      effect: (ctx) => Deferred.succeed(exposed, ctx),
    }),
  )
  const handler = EffectContext.get(context, HttpRouter.HttpRouter).asHttpEffect().pipe(HttpEffect.toWebHandlerWith(context))
  // Any location-scoped request boots the location, activating the probe plugin.
  const plugins = yield* request(handler, directory, "GET", "/api/plugin")
  expect(plugins.status).toBe(200)
  return { directory, exposed }
})

const request = (
  handler: ReturnType<typeof HttpEffect.toWebHandlerWith>,
  directory: string,
  method: "GET" | "POST",
  route: string,
) =>
  Effect.promise(() => {
    const url = new URL(route, "http://opencode.local")
    url.searchParams.set("location[directory]", directory)
    return handler(
      new Request(url, {
        method,
        headers: { authorization: `Basic ${btoa("opencode:secret")}` },
      }),
    )
  })

it.live("populates the plugin runtime cell for host session reads", () =>
  Effect.gen(function* () {
    const server = yield* fixture()
    const ctx = yield* Deferred.await(server.exposed)

    const created = yield* ctx.session.create({ title: "runtime probe" })
    const other = yield* ctx.session.create({ title: "runtime peer" })

    const listed = yield* ctx.session.list({})
    expect(listed.data.map((session) => session.id)).toEqual(expect.arrayContaining([created.id, other.id]))

    const roots = yield* ctx.session.list({ parentID: null })
    expect(roots.data.map((session) => session.id)).toEqual(expect.arrayContaining([created.id]))

    const children = yield* ctx.session.children({ sessionID: created.id })
    expect(children.data).toEqual([])

    const messages = yield* ctx.session.messages({ sessionID: created.id, limit: 10, order: "asc" })
    expect(messages.data).toEqual([])

    const inbox = yield* ctx.session.inbox.list({ sessionID: created.id })
    expect(inbox).toEqual([])

    const active = yield* ctx.session.active()
    expect(active).toEqual({})
  }),
)
