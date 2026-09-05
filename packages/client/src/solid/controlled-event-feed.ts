import { createStore } from "solid-js/store"
import { onCleanup, type Accessor } from "solid-js"
import {
  ClientError,
  isInvalidRequestError,
  type EventControlledReplaceInterestsInput,
  type EventControlledSubscribeOutput,
  type OpenCodeClient,
} from "../promise"
import type { EventStreamAdapter } from "./connection"

export type ControlledEventFeedMode = "connecting" | "controlled" | "legacy"
export type ControlledEventInterest = Omit<EventControlledReplaceInterestsInput, "subscriptionID">

export interface ControlledEventFeed {
  readonly subscribe: EventStreamAdapter
  readonly setDesired: (interest: ControlledEventInterest) => void
  readonly flush: () => Promise<void>
  readonly desired: Accessor<ControlledEventInterest>
  readonly installed: Accessor<ControlledEventInterest | undefined>
  readonly mode: Accessor<ControlledEventFeedMode>
  readonly error: Accessor<string | undefined>
  readonly fallback: Accessor<"not-found" | "unsupported-profile" | undefined>
  readonly retry: (error: unknown) => "retry" | "pause"
}

export interface ControlledEventFeedOptions {
  readonly removalGrace?: number
  readonly onDesiredChange?: () => void
  readonly log?: {
    readonly debug?: (message: string, data?: Readonly<Record<string, unknown>>) => void
    readonly info?: (message: string, data?: Readonly<Record<string, unknown>>) => void
  }
}

type InterestSet = {
  readonly profile: NonNullable<ControlledEventInterest["profile"]>
  readonly locations: Map<string, ControlledEventInterest["locations"][number]>
  readonly sessions: Set<ControlledEventInterest["sessions"][number]>
}

type Held<Value> = {
  readonly value: Value
  readonly expires: number
}

type Generation = {
  readonly api: OpenCodeClient
  readonly parent: AbortSignal
  readonly controller: AbortController
  readonly controlled: AbortController
  legacy?: boolean
  profiles?: readonly string[]
  failure?: { target: InterestSet; error: unknown }
  subscriptionID?: string
  installed?: InterestSet
  dirty: boolean
  running?: Promise<void>
}

type Waiter = {
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

const empty = (): InterestSet => ({ profile: "location", locations: new Map(), sessions: new Set() })

export function createControlledEventFeed(options: ControlledEventFeedOptions = {}): ControlledEventFeed {
  const removalGrace = options.removalGrace ?? 3_000
  let desired = empty()
  let target = desired
  let rejected: { target: InterestSet; error: unknown } | undefined
  const heldLocations = new Map<string, Held<ControlledEventInterest["locations"][number]>>()
  const heldSessions = new Map<
    ControlledEventInterest["sessions"][number],
    Held<ControlledEventInterest["sessions"][number]>
  >()
  const waiters = new Set<Waiter>()
  const [state, setState] = createStore<{
    desired: ControlledEventInterest
    installed?: ControlledEventInterest
    mode: ControlledEventFeedMode
    error?: string
    fallback?: "not-found" | "unsupported-profile"
  }>({ desired: toInterest(desired), mode: "connecting" })
  let active: Generation | undefined
  let removalTimer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let fallbackLogged = false

  const settle = () => {
    if (!active || (active.controller.signal.aborted && !active.legacy)) return
    if (!active.legacy && (!active.installed || !equal(active.installed, target))) return
    waiters.forEach((waiter) => waiter.resolve())
    waiters.clear()
  }

  const fail = (error: unknown) => {
    waiters.forEach((waiter) => waiter.reject(error))
    waiters.clear()
  }

  const update = (generation: Generation) => {
    generation.dirty = true
    if (generation.running) return generation.running
    const running = drain(generation).finally(() => {
      if (generation.running !== running) return
      generation.running = undefined
      if (generation.dirty && active === generation && !generation.controller.signal.aborted) {
        void update(generation).catch(() => {})
      }
    })
    generation.running = running
    return running
  }

  const drain = async (generation: Generation) => {
    while (active === generation && !generation.controller.signal.aborted && generation.subscriptionID) {
      generation.dirty = false
      const attempted = target
      if (generation.installed && equal(generation.installed, attempted)) {
        settle()
        if (!generation.dirty) return
        continue
      }
      try {
        if (attempted.profile === "session-streaming" && !generation.profiles?.includes(attempted.profile)) {
          throw new Error("Controlled event profile is unavailable; reconnect to negotiate")
        }
        await generation.api.event.controlled.replaceInterests(
          {
            subscriptionID: generation.subscriptionID,
            ...toInterest(attempted),
          },
          { signal: generation.controller.signal },
        )
      } catch (error) {
        if (generation.parent.aborted || disposed || active !== generation) throw error
        setState({ mode: "connecting", installed: undefined, error: errorMessage(error) })
        options.log?.info?.("controlled event interest replacement failed", {
          indeterminate: isIndeterminate(error),
          error: errorMessage(error),
        })
        generation.installed = undefined
        generation.failure = { target: attempted, error }
        if (!isIndeterminate(error)) {
          rejected = generation.failure
          if (equal(attempted, target)) fail(error)
        }
        generation.controlled.abort(error)
        generation.controller.abort(error)
        throw error
      }
      if (active !== generation || generation.controller.signal.aborted) return
      generation.installed = attempted
      const installed = toInterest(attempted)
      setState({ installed, error: undefined })
      options.log?.debug?.("controlled event interests installed", {
        desiredLocations: state.desired.locations.length,
        desiredSessions: state.desired.sessions.length,
        installedLocations: installed.locations.length,
        installedSessions: installed.sessions.length,
      })
      settle()
      if (!generation.dirty && equal(attempted, target)) return
    }
  }

  const subscribe: EventStreamAdapter = async function* (api, signal) {
    if (disposed || signal.aborted) return
    active?.controller.abort()
    active?.controlled.abort()
    const controller = new AbortController()
    const controlled = new AbortController()
    const generation: Generation = { api, parent: signal, controller, controlled, dirty: false }
    const current = () => active === generation && !disposed && !signal.aborted && !controller.signal.aborted
    const cancel = () => {
      controller.abort(signal.reason)
      controlled.abort(signal.reason)
    }
    signal.addEventListener("abort", cancel, { once: true })
    active = generation
    rejected = undefined
    setState({ mode: "connecting", installed: undefined, fallback: undefined })
    let iterator: AsyncIterator<EventControlledSubscribeOutput> | undefined
    try {
      iterator = api.event.controlled.subscribe({ signal: controlled.signal })[Symbol.asyncIterator]()
      let first: IteratorResult<EventControlledSubscribeOutput> | undefined
      let fallback: "not-found" | "unsupported-profile" | undefined
      try {
        first = await iterator.next()
      } catch (error) {
        if (!current()) return
        if (!isNotFound(error)) {
          if (!signal.aborted) setState("error", errorMessage(error))
          throw error
        }
        fallback = "not-found"
      }
      if (!current()) return
      if (!fallback) {
        if (!first || first.done) throw new Error("Controlled event stream disconnected before ready")
        if (first.value.type !== "event-feed.ready") throw new Error("Controlled event stream did not start with ready")
        generation.profiles = first.value.data.profiles
        if (target.profile === "session-streaming" && !generation.profiles?.includes(target.profile))
          fallback = "unsupported-profile"
        generation.subscriptionID = first.value.data.subscriptionID
      }
      if (fallback) {
        controlled.abort()
        await iterator.return?.()
        iterator = undefined
        if (!current()) return
        generation.subscriptionID = undefined
        generation.legacy = true
        setState({ mode: "legacy", installed: undefined, error: undefined, fallback })
        if (!fallbackLogged) {
          fallbackLogged = true
          options.log?.info?.("controlled event feed unavailable; using legacy event stream", { reason: fallback })
        }
        settle()
        for await (const event of api.event.subscribe({ signal: controller.signal })) {
          if (!current()) return
          yield event
        }
        return
      }
      await update(generation)
      if (active !== generation || controller.signal.aborted) return
      setState({ mode: "controlled", error: undefined })
      options.log?.info?.("controlled event feed active")

      while (!signal.aborted) {
        const next = await iterator.next()
        if (generation.failure && !signal.aborted && active === generation && !disposed) throw generation.failure.error
        if (next.done) return
        if (active !== generation) return
        if (next.value.type === "event-feed.ready") throw new Error("Controlled event stream emitted duplicate ready")
        yield next.value
      }
    } catch (error) {
      if (signal.aborted || disposed || active !== generation) return
      if (generation.failure) error = generation.failure.error
      if (!signal.aborted && active === generation) setState("error", errorMessage(error))
      throw error
    } finally {
      signal.removeEventListener("abort", cancel)
      controller.abort()
      controlled.abort()
      await iterator?.return?.()
      if (active === generation) {
        active = undefined
        setState({ mode: "connecting", installed: undefined })
      }
    }
  }

  function transportTarget(): InterestSet {
    const locations = new Map<string, ControlledEventInterest["locations"][number]>()
    heldLocations.forEach((held, key) => locations.set(key, held.value))
    desired.locations.forEach((ref, key) => locations.set(key, ref))
    return {
      profile: desired.profile,
      locations,
      sessions: new Set([...heldSessions.keys(), ...desired.sessions]),
    }
  }

  function scheduleRemovals() {
    if (removalTimer) clearTimeout(removalTimer)
    removalTimer = undefined
    const expires = Math.min(
      ...Array.from(heldLocations.values(), (held) => held.expires),
      ...Array.from(heldSessions.values(), (held) => held.expires),
    )
    if (!Number.isFinite(expires)) return
    removalTimer = setTimeout(
      () => {
        removalTimer = undefined
        const before = target
        const now = Date.now()
        heldLocations.forEach((held, key) => {
          if (held.expires <= now) heldLocations.delete(key)
        })
        heldSessions.forEach((held, key) => {
          if (held.expires <= now) heldSessions.delete(key)
        })
        scheduleRemovals()
        target = transportTarget()
        if (equal(before, target)) return
        rejected = undefined
        options.onDesiredChange?.()
        if (active?.subscriptionID) void update(active).catch(() => {})
      },
      Math.max(0, expires - Date.now()),
    )
  }

  function setDesired(interest: ControlledEventInterest) {
    if (disposed) return
    const next = normalize(interest)
    if (equal(desired, next)) return
    const before = target
    const expires = Date.now() + removalGrace
    desired.locations.forEach((ref, key) => {
      if (!next.locations.has(key) && !heldLocations.has(key)) heldLocations.set(key, { value: ref, expires })
    })
    desired.sessions.forEach((sessionID) => {
      if (!next.sessions.has(sessionID) && !heldSessions.has(sessionID)) {
        heldSessions.set(sessionID, { value: sessionID, expires })
      }
    })
    next.locations.forEach((_, key) => heldLocations.delete(key))
    next.sessions.forEach((sessionID) => heldSessions.delete(sessionID))
    desired = next
    target = transportTarget()
    rejected = undefined
    setState("desired", toInterest(next))
    scheduleRemovals()
    options.onDesiredChange?.()
    if (equal(before, target)) {
      settle()
      return
    }
    if (active?.subscriptionID) void update(active).catch(() => {})
  }

  function flush() {
    if (disposed) return Promise.reject(new Error("Controlled event feed disposed"))
    if (rejected && equal(rejected.target, target)) return Promise.reject(rejected.error)
    if (
      active &&
      !active.controller.signal.aborted &&
      (active.legacy || (active.installed && equal(active.installed, target)))
    ) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => waiters.add({ resolve, reject }))
  }

  onCleanup(() => {
    disposed = true
    if (removalTimer) clearTimeout(removalTimer)
    active?.controller.abort()
    active?.controlled.abort()
    fail(new Error("Controlled event feed disposed"))
  })

  return {
    subscribe,
    setDesired,
    flush,
    desired: () => state.desired,
    installed: () => state.installed,
    mode: () => state.mode,
    error: () => state.error,
    fallback: () => state.fallback,
    retry: (error) =>
      rejected &&
      rejected.error === error &&
      equal(rejected.target, target) &&
      isInvalidRequestError(error) &&
      error.field === "interest"
        ? "pause"
        : "retry",
  }
}

function normalize(interest: ControlledEventInterest): InterestSet {
  return {
    profile: interest.profile ?? "location",
    locations: new Map(interest.locations.map((ref) => [locationKey(ref), ref])),
    sessions: new Set(interest.sessions),
  }
}

function toInterest(interest: InterestSet): ControlledEventInterest {
  return {
    locations: Array.from(interest.locations.values()),
    sessions: Array.from(interest.sessions),
    ...(interest.profile === "location" ? {} : { profile: interest.profile }),
  }
}

function equal(left: InterestSet, right: InterestSet) {
  if (
    left.profile !== right.profile ||
    left.locations.size !== right.locations.size ||
    left.sessions.size !== right.sessions.size
  )
    return false
  for (const key of left.locations.keys()) if (!right.locations.has(key)) return false
  for (const id of left.sessions) if (!right.sessions.has(id)) return false
  return true
}

function locationKey(ref: ControlledEventInterest["locations"][number]) {
  return JSON.stringify([ref.directory, ref.workspaceID])
}

function isNotFound(error: unknown) {
  if (!(error instanceof ClientError) || error.reason !== "UnexpectedStatus") return false
  if (typeof error.cause !== "object" || error.cause === null || !("status" in error.cause)) return false
  return error.cause.status === 404
}

function isIndeterminate(error: unknown) {
  return error instanceof ClientError && error.reason === "Transport"
}

function errorMessage(error: unknown) {
  if (error instanceof ClientError && error.cause instanceof Error) return `${error.reason}: ${error.cause.message}`
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message
  }
  return String(error)
}
