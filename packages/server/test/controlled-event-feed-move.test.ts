import { expect } from "bun:test"
import { mkdir, rmdir } from "node:fs/promises"
import { Effect, Fiber, Stream } from "effect"
import { Bus } from "@opencode-ai/core/bus"
import { Session } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Global } from "@opencode-ai/util/global"
import { AbsolutePath } from "@opencode-ai/schema/schema"
import { SessionEvent } from "@opencode-ai/schema/session-event"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { Permission } from "@opencode-ai/schema/permission"
import { Form } from "@opencode-ai/schema/form"
import { Event } from "@opencode-ai/schema/event"
import { ControlledFeedItem, EventSubscriptionID } from "@opencode-ai/protocol/groups/event"
import { Schema } from "effect"
import { ControlledEventFeed } from "../src/controlled-event-feed.ts"
import { testEffect } from "../../core/test/lib/effect.ts"
import { tempGlobalLayer } from "../../core/test/fixture/global.ts"
import { offlineModels } from "../../core/test/fixture/models.ts"
import { tmpdirScoped } from "../../core/test/fixture/tmpdir.ts"

const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Session.node, SessionExecution.node, Bus.node]), [
    Global.node.replace(tempGlobalLayer),
    offlineModels,
  ]),
)

for (const path of ["runner", "missing-source", "unavailable-instance"] as const) {
  it.live(
    `real ${path} move admits destination permission/form and streaming suffix without a client PUT`,
    () =>
      Effect.gen(function* () {
        const tmp = yield* tmpdirScoped()
        const source = AbsolutePath.make(`${tmp.path}/source`)
        const destination = AbsolutePath.make(`${tmp.path}/destination`)
        yield* Effect.promise(() => Promise.all([mkdir(source), mkdir(destination)]))
        if (path === "unavailable-instance")
          yield* Effect.promise(() =>
            Bun.write(`${source}/opencode.json`, JSON.stringify({ instructions: ["{file:./missing.txt}"] })),
          )
        const session = yield* Session.Service
        const execution = yield* SessionExecution.Service
        const bus = yield* Bus.Service
        const created = yield* session.create({ location: { directory: source } })
        if (path === "missing-source") yield* Effect.promise(() => rmdir(source))
        let next = 0
        const feed = yield* ControlledEventFeed.make(bus.observeRouted, {
          createID: () => EventSubscriptionID.make(`evsub_${++next}`),
        })
        const streams = []
        for (const profile of ["location", "session-streaming"] as const) {
          const stream = yield* feed.subscribe
          yield* feed.replaceInterests({
            subscriptionID: EventSubscriptionID.make(`evsub_${next}`),
            interest: { locations: [], sessions: [created.id], profile },
          })
          streams.push(
            yield* stream.pipe(
              Stream.map((frame) => Schema.decodeUnknownSync(ControlledFeedItem)(JSON.parse(frame.slice(6)))),
              Stream.takeUntil((event) => "id" in event && event.id === "evt_suffix"),
              Stream.runCollect,
              Effect.forkScoped,
            ),
          )
        }
        yield* session.move({ sessionID: created.id, directory: destination })
        yield* execution.awaitIdle(created.id)
        expect((yield* session.get(created.id)).location.directory).toBe(destination)
        expect(yield* session.inbox(created.id)).toEqual([])
        yield* bus.publish(
          Permission.Event.Asked,
          { id: Permission.ID.make("per_test"), sessionID: created.id, action: "read", resources: [] },
          { location: { directory: destination }, id: Event.ID.make("evt_permission") },
        )
        yield* bus.publish(
          Form.Event.Cancelled,
          { id: Form.ID.make("frm_test"), sessionID: created.id },
          { location: { directory: destination }, id: Event.ID.make("evt_form") },
        )
        yield* bus.publish(
          SessionEvent.Text.Delta,
          {
            sessionID: created.id,
            assistantMessageID: SessionMessage.ID.make("msg_test"),
            ordinal: 0,
            delta: "suffix",
          },
          { id: Event.ID.make("evt_suffix") },
        )
        for (const stream of streams) {
          const received = Array.from(yield* Fiber.join(stream))
          const moved = received.findIndex((event) => event.type === "session.moved")
          expect(moved).toBeGreaterThanOrEqual(0)
          expect(
            received
              .slice(moved + 1)
              .filter((event) => "id" in event && ["evt_permission", "evt_form", "evt_suffix"].includes(event.id))
              .map((event) => event.type),
          ).toEqual(["permission.asked", "form.cancelled", "session.text.delta"])
        }
      }),
    { timeout: 15_000 },
  )
}
