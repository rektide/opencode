export * as SubscriberRegistry from "./subscriber-registry.js"

import { Subscriber } from "@opencode-ai/schema/subscriber"
import { Plugin } from "@opencode-ai/schema/plugin"
import { makeGlobalNode } from "@opencode-ai/util/effect/app-node"
import { Cause, Context, DateTime, Effect, Layer, Queue, Scope, Stream } from "effect"

/**
 * Ambient owner for subscriptions registered while this reference is in
 * context. Plugin activation installs `{ type: "plugin", pluginID, generation }`
 * so registrations made by a plugin generation stay attributable after reload.
 */
export const CurrentOwner = Context.Reference<Subscriber.Owner>("@opencode/SubscriberRegistry/CurrentOwner", {
  defaultValue: () => ({ type: "core", component: "unknown" }),
})

export interface Principal {
  readonly location?: { readonly directory: string; readonly workspaceID?: string }
  readonly pluginID?: Plugin.ID
}

export interface RegisterInput {
  readonly kind: Subscriber.Kind
  readonly owner?: Subscriber.Owner
  readonly target: Subscriber.Target
  readonly delivery: Subscriber.Delivery
  readonly parentID?: Subscriber.ID
}

export interface Registration {
  readonly id: Subscriber.ID
  readonly delivered: (count?: number) => void
  readonly dropped: (count?: number) => void
  readonly lag: (value: number) => void
  readonly update: (update: Subscriber.Update) => void
  /** Idempotent removal; the scope release after a scoped `register` no-ops once closed. */
  readonly close: (reason?: Subscriber.RemovalReason) => void
}

export interface Interface {
  readonly register: (input: RegisterInput) => Effect.Effect<Registration, never, Scope.Scope>
  readonly snapshot: (principal?: Principal, query?: Subscriber.Query) => Effect.Effect<Subscriber.Snapshot>
  readonly summary: (query?: Subscriber.Query) => Effect.Effect<Subscriber.Summary>
  readonly watch: (
    principal?: Principal,
    query?: Subscriber.Query,
  ) => Stream.Stream<Subscriber.Change, Subscriber.WatchOverflowError>
  readonly count: (query?: Subscriber.Query) => Effect.Effect<number>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/core/SubscriberRegistry") {}

type Entry = {
  readonly id: Subscriber.ID
  readonly processID: Subscriber.ProcessID
  readonly parentID: Subscriber.ID | undefined
  readonly kind: Subscriber.Kind
  owner: Subscriber.Owner
  readonly target: Subscriber.Target
  readonly delivery: Subscriber.Delivery
  state: Subscriber.State
  readonly startedAt: DateTime.Utc
  updatedAt: DateTime.Utc
  delivered: number
  dropped: number
  lag: number | undefined
  highWaterMark: number | undefined
  lastAt: DateTime.Utc | undefined
  closed: boolean
}

type Observer = {
  readonly queue: Queue.Queue<Subscriber.Change, Subscriber.WatchOverflowError | Cause.Done>
  readonly query: Subscriber.Query | undefined
}

const matches = (query: Subscriber.Query | undefined, info: Subscriber.Info) => {
  if (query === undefined) return true
  if (query.kind !== undefined && query.kind !== info.kind) return false
  if (query.state !== undefined && query.state !== info.state) return false
  if (query.owner !== undefined) {
    if (query.owner.type !== undefined && query.owner.type !== info.owner.type) return false
    if (query.owner.pluginID !== undefined) {
      if (info.owner.type !== "plugin" || info.owner.pluginID !== query.owner.pluginID) return false
    }
    if (query.owner.component !== undefined) {
      if ((info.owner.type !== "core" && info.owner.type !== "server") || info.owner.component !== query.owner.component)
        return false
    }
  }
  if (query.target !== undefined) {
    if (query.target.namespace !== undefined && query.target.namespace !== info.target.namespace) return false
    if (query.target.name !== undefined && query.target.name !== info.target.name) return false
    if (query.target.instance !== undefined && query.target.instance !== info.target.instance) return false
  }
  return true
}

const visible = (principal: Principal | undefined, info: Subscriber.Info) => {
  const location = principal?.location
  if (location === undefined) return true
  const target = info.target.location
  if (target === undefined) return true
  if (principal?.pluginID !== undefined && info.owner.type === "plugin" && info.owner.pluginID === principal.pluginID)
    return true
  return target.directory === location.directory && target.workspaceID === location.workspaceID
}

export function configured(options?: { readonly observerCapacity?: number }) {
  const observerCapacity = options?.observerCapacity ?? 256
  return makeGlobalNode({
    service: Service,
    layer: Layer.effect(
      Service,
      Effect.gen(function* () {
        const processID = Subscriber.ProcessID.create()
        const records = new Map<Subscriber.ID, Entry>()
        const observers = new Set<Observer>()
        let revision = 0
        const now = () => DateTime.makeUnsafe(Date.now())

        const project = (entry: Entry): Subscriber.Info => ({
          id: entry.id,
          processID: entry.processID,
          parentID: entry.parentID,
          kind: entry.kind,
          owner: entry.owner,
          target: entry.target,
          delivery: entry.delivery,
          state: entry.state,
          startedAt: entry.startedAt,
          updatedAt: entry.updatedAt,
          activity: {
            delivered: entry.delivered,
            dropped: entry.dropped,
            lag: entry.lag,
            highWaterMark: entry.highWaterMark,
            lastAt: entry.lastAt,
          },
        })

        const emit = (change: Subscriber.Change, info: Subscriber.Info) => {
          for (const observer of observers) {
            if (!matches(observer.query, info)) continue
            if (Queue.offerUnsafe(observer.queue, change)) continue
            observers.delete(observer)
            Queue.failCauseUnsafe(
              observer.queue,
              Cause.fail(new Subscriber.WatchOverflowError({ capacity: observerCapacity })),
            )
          }
        }

        const registration = (entry: Entry): Registration => ({
          id: entry.id,
          delivered: (count = 1) => {
            if (entry.closed) return
            entry.delivered += count
            entry.lastAt = now()
          },
          dropped: (count = 1) => {
            if (entry.closed) return
            entry.dropped += count
            entry.lastAt = now()
          },
          lag: (value) => {
            if (entry.closed) return
            entry.lag = value
            entry.highWaterMark = Math.max(entry.highWaterMark ?? 0, value)
          },
          update: (update) => {
            if (entry.closed || update.state === undefined || update.state === entry.state) return
            entry.state = update.state
            entry.updatedAt = now()
            revision++
            const info = project(entry)
            emit({ type: "updated", revision, subscriber: info }, info)
          },
          close: (reason: Subscriber.RemovalReason = "scope-closed") => {
            if (entry.closed) return
            entry.closed = true
            records.delete(entry.id)
            revision++
            emit({ type: "removed", revision, id: entry.id, reason }, project(entry))
          },
        })

        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            records.clear()
            for (const observer of observers) {
              observers.delete(observer)
              Queue.endUnsafe(observer.queue)
            }
          }),
        )

        return Service.of({
          // Registry mutations and the snapshot/observer handoff are synchronous
          // single-threaded sections, so they can never interleave: every change
          // is either inside a snapshot or strictly after it.
          register: (input) =>
            Effect.acquireRelease(
              Effect.gen(function* () {
                const owner = yield* CurrentOwner
                const entry: Entry = {
                  id: Subscriber.ID.create(),
                  processID,
                  parentID: input.parentID,
                  kind: input.kind,
                  owner: input.owner ?? owner,
                  target: input.target,
                  delivery: input.delivery,
                  state: "active",
                  startedAt: now(),
                  updatedAt: now(),
                  delivered: 0,
                  dropped: 0,
                  lag: undefined,
                  highWaterMark: undefined,
                  lastAt: undefined,
                  closed: false,
                }
                yield* Effect.sync(() => {
                  records.set(entry.id, entry)
                  revision++
                  const info = project(entry)
                  emit({ type: "added", revision, subscriber: info }, info)
                })
                return registration(entry)
              }),
              (value) => Effect.sync(() => value.close("scope-closed")),
            ),
          snapshot: (principal, query) =>
            Effect.sync(() => ({
              processID,
              revision,
              subscribers: Array.from(records.values(), project).filter(
                (info) => visible(principal, info) && matches(query, info),
              ),
            })),
          summary: (query) =>
            Effect.sync(() => {
              const groups = new Map<string, { readonly group: Subscriber.Summary["groups"][number]; count: number }>()
              let total = 0
              for (const entry of records.values()) {
                const info = project(entry)
                if (!matches(query, info)) continue
                total++
                const key = `${info.kind}/${info.target.namespace}/${info.target.name}/${info.delivery.type}`
                const current = groups.get(key)
                if (current) {
                  current.count++
                  continue
                }
                groups.set(key, {
                  group: {
                    kind: info.kind,
                    namespace: info.target.namespace,
                    name: info.target.name,
                    delivery: info.delivery.type,
                    count: 1,
                  },
                  count: 1,
                })
              }
              return {
                processID,
                revision,
                total,
                groups: Array.from(groups.values(), ({ group, count }) => ({ ...group, count })),
              }
            }),
          watch: (principal, query) =>
            Stream.unwrap(
              Effect.gen(function* () {
                const queue = yield* Queue.dropping<
                  Subscriber.Change,
                  Subscriber.WatchOverflowError | Cause.Done
                >(observerCapacity)
                const acquired = yield* Effect.acquireRelease(
                  Effect.sync(() => {
                    const observer: Observer = { queue, query }
                    observers.add(observer)
                    return {
                      observer,
                      snapshot: {
                        processID,
                        revision,
                        subscribers: Array.from(records.values(), project).filter(
                          (info) => visible(principal, info) && matches(query, info),
                        ),
                      } satisfies Subscriber.Snapshot,
                    }
                  }),
                  ({ observer }) => Effect.sync(() => observers.delete(observer)),
                )
                const first: Subscriber.Change = { type: "snapshot", snapshot: acquired.snapshot }
                return Stream.concat(Stream.make(first), Stream.fromQueue(queue))
              }),
            ),
          count: (query) =>
            Effect.sync(() => Array.from(records.values()).filter((entry) => matches(query, project(entry))).length),
        })
      }),
    ),
    deps: [],
  })
}

/**
 * Tracks a stream as a subscriber relationship for as long as the stream is
 * being consumed. The owner comes from `CurrentOwner`, so streams consumed
 * inside a plugin generation are attributed to that plugin.
 */
export const track =
  (registry: Interface, input: RegisterInput) =>
  <A, E, R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
    Stream.unwrap(
      Effect.gen(function* () {
        const owner = yield* CurrentOwner
        const registration = yield* registry.register({ ...input, owner })
        return stream.pipe(Stream.tap(() => Effect.sync(() => registration.delivered())))
      }),
    )

export const node = configured()
