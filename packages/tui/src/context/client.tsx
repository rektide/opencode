import type { OpenCodeClient, OpenCodeEvent } from "@opencode-ai/client"
import { createClientConnection, createControlledEventFeed, createPersistentPtyClient } from "@opencode-ai/client/solid"
import { createGlobalEmitter } from "@solid-primitives/event-bus"
import { createEffect, onCleanup } from "solid-js"
import { createEventInterestBinding } from "./event-interest-binding.ts"
import { useConfig } from "../config/index.tsx"
import { createSimpleContext } from "./helper"
import { useLog } from "./log"

type ManagedService = {
  reconnect: (signal: AbortSignal) => Promise<{ api: OpenCodeClient; url?: string }>
  restart: () => Promise<void>
}

type ClientEventMap = { [Type in OpenCodeEvent["type"]]: Extract<OpenCodeEvent, { type: Type }> }

export const { use: useClient, provider: ClientProvider } = createSimpleContext({
  name: "Client",
  init: (props: { api: OpenCodeClient; url?: string; service?: ManagedService }) => {
    const log = useLog({ component: "client" })
    const service = props.service
    const config = useConfig()
    const focused = () => config.data.experimental?.session_streaming === true
    const events = createGlobalEmitter<ClientEventMap>()
    let api = props.api
    let url = props.url
    let persistentPty = url ? createPersistentPtyClient(api, { url }) : undefined
    const feed = createControlledEventFeed({ log, onDesiredChange: () => connection.wakeEvents() })
    const interest = createEventInterestBinding(feed, focused)

    const connection = createClientConnection(api, {
      reconnect: service
        ? async (signal) => {
            const next = await service.reconnect(signal)
            api = next.api
            if (next.url) url = next.url
            if (url) persistentPty = createPersistentPtyClient(api, { url })
            return api
          }
        : undefined,
      onEvent(event) {
        events.emit(event.type, event)
      },
      subscribe: (api, signal) => (focused() ? feed.subscribe(api, signal) : api.event.subscribe({ signal })),
      retry: feed.retry,
      log,
    })
    let previous = focused()
    createEffect(() => {
      const next = focused()
      if (next === previous) return
      previous = next
      interest.changed()
      connection.reconnectEvents({ resolve: false })
    })

    onCleanup(() => {
      events.clear()
    })

    return {
      get api() {
        return api
      },
      get persistentPty() {
        if (!persistentPty) throw new Error("Persistent terminal server endpoint is unavailable")
        return persistentPty
      },
      interest,
      event: {
        on: events.on,
        listen: events.listen,
      },
      connection,
      restart: service?.restart,
    }
  },
})
