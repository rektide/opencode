import { batch, onCleanup, onMount } from "solid-js"
import { createStore } from "solid-js/store"
import type { OpenCodeClient, OpenCodeEvent } from "../promise"

export type ClientConnectionStatus = "connected" | "connecting" | "reconnecting"
export type ClientConnectionEvent = {
  readonly type: "client.connection"
  readonly created: number
  readonly data: {
    readonly status: "connecting" | "connected" | "disconnected" | "reconnecting"
    readonly attempt: number
    readonly error?: string
  }
}

export interface ClientConnectionDiagnostics {
  readonly receivedDomainEvents: number
  readonly reconnects: number
}

export type EventStreamAdapter = (api: OpenCodeClient, signal: AbortSignal) => AsyncIterable<OpenCodeEvent>

export type ClientConnectionOptions = {
  readonly reconnect?: (signal: AbortSignal) => Promise<OpenCodeClient>
  readonly subscribe?: EventStreamAdapter
  readonly retry?: (error: unknown) => "retry" | "pause"
  readonly onEvent: (event: OpenCodeEvent) => void
  readonly flushInterval?: number
  readonly pageLifecycle?: boolean
  readonly log?: {
    readonly debug?: (message: string, data?: Readonly<Record<string, unknown>>) => void
    readonly info?: (message: string, data?: Readonly<Record<string, unknown>>) => void
  }
}

const connectTimeout = 2_000
const reconnectDelay = 1_000
const connectionHistoryLimit = 50

export function createClientConnection(initialApi: OpenCodeClient, options: ClientConnectionOptions) {
  const abort = new AbortController()
  const history: ClientConnectionEvent[] = []
  const [connection, setConnection] = createStore<{
    status: ClientConnectionStatus
    attempt: number
    error?: string
    paused: boolean
  }>({ status: "connecting", attempt: 0, paused: false })
  let api = initialApi
  let pending: OpenCodeEvent[] = []
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let stream: AbortController | undefined
  let run: Promise<void> | undefined
  let started = false
  let generation = 0
  let subscriptions = 0
  let receivedDomainEvents = 0
  let reconnects = 0
  let wakeVersion = 0
  let wake: (() => void) | undefined
  let resolveOnStart = false

  function record(status: ClientConnectionEvent["data"]["status"], attempt: number, error?: string) {
    history.push({ type: "client.connection", created: Date.now(), data: { status, attempt, error } })
    if (history.length > connectionHistoryLimit) history.shift()
  }

  function publish(event: OpenCodeEvent) {
    pending.push(event)
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = undefined
      const events = pending
      pending = []
      batch(() => events.forEach(options.onEvent))
    }, options.flushInterval ?? 10)
  }

  async function connect(signal: AbortSignal, attempt: number) {
    let connectedAt: number | undefined
    const request = new AbortController()
    const cancel = () => request.abort(signal.reason)
    const timeout = setTimeout(() => request.abort(new Error("Timed out connecting to server")), connectTimeout)
    signal.addEventListener("abort", cancel, { once: true })
    if (signal.aborted) cancel()
    let iterator: AsyncIterator<OpenCodeEvent> | undefined

    try {
      if (subscriptions > 0) reconnects += 1
      subscriptions += 1
      record(attempt === 0 ? "connecting" : "reconnecting", attempt)
      options.log?.info?.("event stream connecting", { attempt })
      if (signal.aborted) return { error: undefined, connectedAt }
      iterator = (
        options.subscribe ? options.subscribe(api, request.signal) : api.event.subscribe({ signal: request.signal })
      )[Symbol.asyncIterator]()
      const first = await iterator.next()
      if (signal.aborted) return { error: undefined, connectedAt }
      if (first.done)
        return {
          error:
            request.signal.reason instanceof Error ? request.signal.reason : new Error("Event stream disconnected"),
          connectedAt,
        }
      if (first.value.type !== "server.connected")
        return { error: new Error("Event stream did not start with server.connected"), connectedAt }

      clearTimeout(timeout)
      record("connected", attempt)
      connectedAt = Date.now()
      options.log?.info?.("event stream connected")
      publish(first.value)
      setConnection({ status: "connected", attempt: 0, error: undefined })

      while (!signal.aborted) {
        const event = await iterator.next()
        if (signal.aborted) return { error: undefined, connectedAt }
        if (event.done) return { error: new Error("Event stream disconnected"), connectedAt }
        if ("durable" in event.value && event.value.durable)
          options.log?.debug?.("event", {
            type: event.value.type,
            aggregateID: event.value.durable.aggregateID,
            seq: event.value.durable.seq,
          })
        if (event.value.type !== "server.connected") receivedDomainEvents += 1
        publish(event.value)
      }
      return { error: undefined, connectedAt }
    } catch (error) {
      return { error, connectedAt }
    } finally {
      request.abort()
      clearTimeout(timeout)
      signal.removeEventListener("abort", cancel)
      await iterator?.return?.()
    }
  }

  async function runStream(active: number) {
    let attempt = 0
    while (!abort.signal.aborted && started && generation === active) {
      setConnection({ status: attempt === 0 ? "connecting" : "reconnecting", attempt })
      const controller = new AbortController()
      stream = controller
      if (resolveOnStart) {
        resolveOnStart = false
        const next = await options.reconnect?.(controller.signal).catch((error) => {
          options.log?.info?.("server resolution failed", { error: errorMessage(error) })
        })
        if (abort.signal.aborted || !started || generation !== active) return
        if (next) api = next
      }
      const cancel = () => controller.abort(abort.signal.reason)
      abort.signal.addEventListener("abort", cancel)
      const result = await connect(controller.signal, attempt)
      abort.signal.removeEventListener("abort", cancel)
      if (abort.signal.aborted || !started || generation !== active) return
      if (result.connectedAt !== undefined && Date.now() - result.connectedAt >= reconnectDelay) attempt = 0
      attempt += 1
      const message = errorMessage(result.error)
      record("disconnected", attempt, message)
      options.log?.info?.("event stream disconnected", { attempt, error: message })
      setConnection({ status: "reconnecting", attempt, error: message })

      const version = wakeVersion
      if (options.retry?.(result.error) === "pause" && version === wakeVersion) {
        setConnection("paused", true)
        await new Promise<void>((resolve) => {
          wake = resolve
        })
        wake = undefined
        setConnection("paused", false)
        if (abort.signal.aborted || !started || generation !== active) return
      }

      if (options.reconnect) {
        const next = await options.reconnect(controller.signal).catch((error) => {
          if (!controller.signal.aborted)
            options.log?.info?.("server resolution failed", { attempt, error: errorMessage(error) })
        })
        if (abort.signal.aborted || controller.signal.aborted || !started || generation !== active) return
        if (next) {
          api = next
          if (attempt === 1) continue
        }
      }
      await wait(reconnectDelay, controller.signal)
    }
  }

  function start() {
    if (started) return run
    started = true
    const active = ++generation
    const previous = run
    const current = (async () => {
      if (previous) await previous
      await runStream(active)
    })().finally(() => {
      if (run !== current) return
      run = undefined
    })
    run = current
    return run
  }

  function stop() {
    started = false
    generation += 1
    stream?.abort()
    wakeEvents()
  }

  function wakeEvents() {
    wakeVersion += 1
    wake?.()
  }

  function reconnectEvents() {
    stop()
    resolveOnStart = true
    if (!abort.signal.aborted) void start()
  }

  onMount(() => {
    if (options.pageLifecycle) {
      const pagehide = () => stop()
      const pageshow = (event: PageTransitionEvent) => {
        if (event.persisted) void start()
      }
      window.addEventListener("pagehide", pagehide)
      window.addEventListener("pageshow", pageshow)
      onCleanup(() => {
        window.removeEventListener("pagehide", pagehide)
        window.removeEventListener("pageshow", pageshow)
      })
    }
    void start()
  })

  onCleanup(() => {
    stop()
    abort.abort()
    if (flushTimer) clearTimeout(flushTimer)
    pending = []
  })

  return {
    status: () => connection.status,
    attempt: () => connection.attempt,
    error: () => connection.error,
    paused: () => connection.paused,
    wakeEvents,
    reconnectEvents,
    internal: {
      history: () => history.slice(),
      diagnostics: (): ClientConnectionDiagnostics => ({ receivedDomainEvents, reconnects }),
    },
  }
}

function errorMessage(error: unknown) {
  if (error === undefined) return undefined
  if (error instanceof Error) return error.message
  return String(error)
}

function wait(delay: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    const timer = setTimeout(done, delay)
    signal.addEventListener("abort", done, { once: true })
    function done() {
      clearTimeout(timer)
      signal.removeEventListener("abort", done)
      resolve()
    }
  })
}
