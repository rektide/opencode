import { describe, expect } from "bun:test"
import { DateTime, Effect, Exit } from "effect"
import { Location } from "@opencode-ai/core/location"
import { Plugin } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { PluginPromise } from "@opencode-ai/core/plugin/promise"
import { PluginRuntime } from "@opencode-ai/core/plugin/runtime"
import { Session } from "@opencode-ai/core/session"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { define } from "@opencode-ai/plugin/promise/plugin"
import { Money } from "@opencode-ai/schema/money"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"
import { host as testHost } from "./plugin/host"

const it = testEffect(PluginTestLayer)

describe("plugin session reads", () => {
  it.effect("preserves session and message pagination through the Effect host", () =>
    Effect.gen(function* () {
      const plugins = yield* Plugin.Service
      const fallback = yield* PluginRuntime.Service
      const location = yield* Location.Service
      const parentID = Session.ID.make("ses_parent")
      const otherParentID = Session.ID.make("ses_other")
      const session = Session.Info.make({
        id: Session.ID.make("ses_child"),
        parentID,
        projectID: location.project.id,
        cost: Money.USD.make(0),
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        time: { created: DateTime.makeUnsafe(10), updated: DateTime.makeUnsafe(20) },
        location: Location.Ref.make({ directory: location.directory }),
      })
      const message = SessionMessage.User.make({
        id: SessionMessage.ID.make("msg_history"),
        type: "user",
        text: "Earlier prompt",
        time: { created: DateTime.makeUnsafe(30) },
      })
      const lists: Session.ListInput[] = []
      const messages: Parameters<typeof fallback.session.messages>[0][] = []
      const host = yield* PluginHost.make(plugins).pipe(
        Effect.provideService(
          PluginRuntime.Service,
          PluginRuntime.Service.of({
            ...fallback,
            session: {
              ...fallback.session,
              list: (input) =>
                Effect.sync(() => {
                  lists.push(input ?? {})
                  return { data: [session] }
                }),
              messages: (input) =>
                Effect.sync(() => {
                  messages.push(input)
                  return [message]
                }),
            },
          }),
        ),
      )

      const first = yield* host.session.list({ parentID: otherParentID, order: "asc", search: "child", limit: 1 })
      yield* host.session.list({ cursor: first.cursor.next, limit: 2 })
      yield* host.session.list({ cursor: first.cursor.previous, limit: 3 })
      yield* host.session.children({ sessionID: parentID, cursor: first.cursor.next, limit: 4 })
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
        { workspaceID: undefined, search: undefined, order: undefined, parentID: undefined, limit: 50 },
      ])

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
    }),
  )

  it.effect("adapts Promise session history reads through protocol schemas", () =>
    Effect.gen(function* () {
      const seen: unknown[] = []
      const context = testHost({
        session: {
          list: (input) => {
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
            await ctx.session.list({ parentID: null, limit: 2 })
            await ctx.session.children({ sessionID: Session.ID.make("ses_parent"), limit: 3 })
            await ctx.session.messages({ sessionID: Session.ID.make("ses_parent"), limit: 4, order: "asc" })
            await expect(Reflect.apply(ctx.session.list, undefined, [{ directory: 42 }])).rejects.toBeDefined()
          },
        }),
      ).effect(context)

      expect(seen).toEqual([
        { parentID: null, limit: 2 },
        { parentID: Session.ID.make("ses_parent"), limit: 3 },
        { sessionID: Session.ID.make("ses_parent"), limit: 4, order: "asc" },
      ])
    }),
  )
})
