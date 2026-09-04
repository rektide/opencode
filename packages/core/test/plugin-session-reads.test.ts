import { describe, expect } from "bun:test"
import { Location } from "@opencode/core/location"
import { Project } from "@opencode/core/project"
import { Plugin } from "@opencode/core/plugin"
import { PluginHost } from "@opencode/core/plugin/host"
import { PluginPromise } from "@opencode/core/plugin/promise"
import { PluginRuntime } from "@opencode/core/plugin/runtime"
import { Session } from "@opencode/core/session"
import { SessionMessage } from "@opencode/core/session/message"
import { define } from "@opencode/plugin/promise/plugin"
import { Money } from "@opencode/schema/money"
import { AbsolutePath } from "@opencode/core/schema"
import { SessionInbox } from "@opencode/schema/session-inbox"
import { DateTime, Effect, Encoding, Exit, Schema } from "effect"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"
import { host as testHost } from "./plugin/host"

const it = testEffect(PluginTestLayer)
const sessionCursor = Schema.String.pipe(Schema.brand("SessionsCursor")).make("foreign-parent-cursor")
  const message = SessionMessage.User.make({
    id: SessionMessage.ID.make("msg_history"),
    type: "user",
    text: "Earlier prompt",
    time: { created: DateTime.makeUnsafe(30) },
  })


function recordingRuntime(
  fallback: PluginRuntime.Interface,
  reads: {
    readonly list: (input: Parameters<PluginRuntime.Interface["session"]["list"]>[0]) => { readonly data: Session.Info[] }
    readonly messages: (input: Parameters<PluginRuntime.Interface["session"]["messages"]>[0]) => SessionMessage.Info[]
  },
): PluginRuntime.Interface {
  return {
    ...fallback,
    session: {
      ...fallback.session,
      list: (input) => Effect.sync(() => reads.list(input)),
      messages: (input) => Effect.sync(() => reads.messages(input)),
    },
  }
}

describe("plugin session reads", () => {
  const makeHost = (reads: {
    readonly list: (input: Parameters<PluginRuntime.Interface["session"]["list"]>[0]) => { readonly data: Session.Info[] }
    readonly messages: (input: Parameters<PluginRuntime.Interface["session"]["messages"]>[0]) => SessionMessage.Info[]
  }) =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const fallback = yield* PluginRuntime.Service
      const host = yield* PluginHost.make(plugins).pipe(
        Effect.provideService(PluginRuntime.Service, PluginRuntime.Service.of(recordingRuntime(fallback, reads))),
      )
      return { host, fallback }
    })

  const parentID = Session.ID.make("ses_parent")
  const otherParentID = Session.ID.make("ses_other")
  const sessionTime = { created: DateTime.makeUnsafe(10), updated: DateTime.makeUnsafe(20) }
  const session = Session.Info.make({
    id: Session.ID.make("ses_child"),
    parentID,
    projectID: Project.ID.make("probe-project"),
    cost: Money.USD.make(0),
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: sessionTime,
    location: Location.Ref.make({ directory: AbsolutePath.make("/workspace") }),
  })

  it.effect("preserves session list pagination through the Effect host", () =>
    Effect.gen(function* () {
      const lists: Session.ListInput[] = []
      const { host } = yield* makeHost({
        list: (input) => {
          lists.push(input ?? {})
          return { data: [session] }
        },
        messages: () => [],
      })

      const first = yield* host.session.list({ parentID: otherParentID, order: "asc", search: "child", limit: 1 })
      yield* host.session.list({ cursor: first.cursor.next, limit: 2 })
      yield* host.session.list({ cursor: first.cursor.previous, limit: 3 })
      yield* host.session.children({ sessionID: parentID, cursor: first.cursor.next, limit: 4 })
      const filtered = yield* host.session.list({
        directory: host.location.directory,
        project: host.location.project.id,
        limit: 5,
      })
      yield* host.session.list({ cursor: filtered.cursor.next, limit: 6 })
      yield* host.session.list()

      expect(lists).toEqual([
        { workspaceID: undefined, search: "child", order: "asc", parentID: otherParentID, limit: 1 },
        {
          workspaceID: undefined,
          search: "child",
          order: "asc",
          parentID: otherParentID,
          anchor: { id: session.id, time: 20, direction: "next" },
          limit: 2,
        },
        {
          workspaceID: undefined,
          search: "child",
          order: "asc",
          parentID: otherParentID,
          anchor: { id: session.id, time: 20, direction: "previous" },
          limit: 3,
        },
        {
          workspaceID: undefined,
          search: "child",
          order: "asc",
          parentID,
          anchor: { id: session.id, time: 20, direction: "next" },
          limit: 4,
        },
        {
          workspaceID: undefined,
          search: undefined,
          order: undefined,
          parentID: undefined,
          directory: host.location.directory,
          project: host.location.project.id,
          subpath: undefined,
          limit: 5,
        },
        {
          workspaceID: undefined,
          search: undefined,
          order: undefined,
          parentID: undefined,
          directory: host.location.directory,
          anchor: { id: session.id, time: 20, direction: "next" },
          limit: 6,
        },
        { workspaceID: undefined, search: undefined, order: undefined, parentID: undefined, limit: 50 },
      ])

      expect(Exit.isFailure(yield* host.session.list({ limit: 0 }).pipe(Effect.exit))).toBe(true)
      expect(
        Exit.isFailure(
          yield* Reflect.apply(host.session.list, undefined, [{ cursor: Encoding.encodeBase64Url("{}") }]).pipe(
            Effect.exit,
          ),
        ),
      ).toBe(true)
      expect(
        Exit.isFailure(yield* Reflect.apply(host.session.list, undefined, [{ cursor: "%%%" }]).pipe(Effect.exit)),
      ).toBe(true)
    }) as Effect.Effect<void, unknown, Plugin.Service | PluginRuntime.Service>,
  )

  it.effect("preserves message pagination through the Effect host", () =>
    Effect.gen(function* () {
      const message = SessionMessage.User.make({
        id: SessionMessage.ID.make("msg_history"),
        type: "user",
        text: "Earlier prompt",
        time: { created: DateTime.makeUnsafe(30) },
      })
      const messages: Parameters<PluginRuntime.Interface["session"]["messages"]>[0][] = []
      const { host } = yield* makeHost({
        list: () => ({ data: [] }),
        messages: (input) => {
          messages.push(input)
          return [message]
        },
      })

      const firstMessages = yield* host.session.messages({ sessionID: parentID, order: "asc", limit: 1 })
      yield* host.session.messages({ sessionID: parentID, cursor: firstMessages.cursor.next, limit: 2 })
      yield* host.session.messages({ sessionID: parentID, cursor: firstMessages.cursor.previous, limit: 3 })

      expect(messages).toEqual([
        { sessionID: parentID, limit: 1, order: "asc", cursor: undefined },
        { sessionID: parentID, limit: 2, order: "asc", cursor: { id: message.id, direction: "next" } },
        { sessionID: parentID, limit: 3, order: "asc", cursor: { id: message.id, direction: "previous" } },
      ])
      expect(
        Exit.isFailure(
          yield* host.session
            .messages({ sessionID: parentID, cursor: firstMessages.cursor.next, order: "desc" })
            .pipe(Effect.exit),
        ),
      ).toBe(true)
      expect(
        Exit.isFailure(yield* host.session.messages({ sessionID: parentID, cursor: "invalid" }).pipe(Effect.exit)),
      ).toBe(true)
      expect(Exit.isFailure(yield* host.session.messages({ sessionID: parentID, limit: 201 }).pipe(Effect.exit))).toBe(
        true,
      )
    }),
  )

  it.effect("exposes read-only inbox and active session facts", () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const fallback = yield* PluginRuntime.Service
      const sessionID = Session.ID.make("ses_running")
      const item = SessionInbox.User.make({
        id: SessionMessage.ID.make("msg_pending"),
        sessionID,
        time: { created: DateTime.makeUnsafe(40) },
        type: "user",
        payload: { text: "Queued prompt" },
        delivery: "queue",
      })
      const seen: Session.ID[] = []
      const cell = PluginRuntime.makeCell()
      cell.runtime = {
        ...fallback,
        session: {
          ...fallback.session,
          inbox: (id) =>
            Effect.sync(() => {
              seen.push(id)
              return [item]
            }),
          active: Effect.succeed(new Set([sessionID])),
        },
      }
      const runtime = yield* PluginRuntime.Service.pipe(Effect.provide(PluginRuntime.layerWithCell(cell)))
      const host = yield* PluginHost.make(plugins).pipe(Effect.provideService(PluginRuntime.Service, runtime))

      expect(yield* host.session.inbox.list({ sessionID })).toEqual([item])
      expect(yield* host.session.active()).toEqual({ [sessionID]: { type: "running" } })
      expect(Object.keys(host.session.inbox)).toEqual(["list"])
      expect(seen).toEqual([sessionID])
    }),
  )

  it.effect("adapts Promise session history reads through protocol schemas", () =>
    Effect.gen(function* () {
      const seen: unknown[] = []
      const context = testHost({
        session: {
          list: (input) => {
            seen.push(input)
            return Effect.succeed({ data: [], cursor: { next: sessionCursor } })
          },
          children: (input) => {
            seen.push(input)
            return Effect.succeed({ data: [], cursor: {} })
          },
          messages: (input) => {
            seen.push(input)
            return Effect.succeed({ data: [], cursor: {} })
          },
        },
      })

      yield* PluginPromise.fromPromise(
        define({
          id: "promise-session-history",
          setup: async (ctx) => {
            const listed = await ctx.session.list({ parentID: null, limit: 2 })
            await ctx.session.children({
              sessionID: Session.ID.make("ses_parent"),
              limit: 3,
              cursor: listed.cursor.next ?? undefined,
            })
            await ctx.session.messages({ sessionID: Session.ID.make("ses_parent"), limit: 4, order: "asc" })
            await expect(Reflect.apply(ctx.session.list, undefined, [{ directory: 42 }])).rejects.toBeDefined()
          },
        }),
      ).effect(context)

      expect(seen).toEqual([
        { parentID: null, limit: 2 },
        { sessionID: Session.ID.make("ses_parent"), cursor: "foreign-parent-cursor", limit: 3 },
        { sessionID: Session.ID.make("ses_parent"), limit: 4, order: "asc" },
      ])
    }),
  )

  it.effect("adapts Promise inbox and active reads through protocol schemas", () =>
    Effect.gen(function* () {
      const sessionID = Session.ID.make("ses_running")
      const item = SessionInbox.User.make({
        id: SessionMessage.ID.make("msg_pending"),
        sessionID,
        time: { created: DateTime.makeUnsafe(40) },
        type: "user",
        payload: { text: "Queued prompt" },
        delivery: "queue",
      })
      const seen: Session.ID[] = []
      const context = testHost({
        session: {
          active: () => Effect.succeed({ [sessionID]: { type: "running" } }),
          inbox: {
            list: (input) => {
              seen.push(input.sessionID)
              return Effect.succeed([item])
            },
          },
        },
      })

      yield* PluginPromise.fromPromise(
        define({
          id: "promise-session-state",
          setup: async (ctx) => {
            expect(await ctx.session.active()).toEqual({ [sessionID]: { type: "running" } })
            expect(await ctx.session.inbox.list({ sessionID })).toEqual([
              {
                id: "msg_pending",
                sessionID: "ses_running",
                time: { created: 40 },
                type: "user",
                payload: { text: "Queued prompt" },
                delivery: "queue",
              },
            ])
            expect(Object.keys(ctx.session.inbox)).toEqual(["list"])
          },
        }),
      ).effect(context)

      expect(seen).toEqual([sessionID])
    }),
  )
})
