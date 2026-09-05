import type { ControlledEventFeed, ControlledEventInterest } from "@opencode-ai/client/solid"
import { onCleanup, untrack } from "solid-js"

/** One policy owner, pulled synchronously before prompt admission and transcript reads. */
export function createEventInterestBinding(feed: ControlledEventFeed, focused: () => boolean) {
  let readDesired: (() => ControlledEventInterest) | undefined
  let mode = new AbortController()
  onCleanup(() => mode.abort())
  return {
    ...feed,
    mode: () => (focused() ? feed.mode() : ("legacy" as const)),
    fallback: () => (focused() ? feed.fallback() : ("disabled" as const)),
    bind(reader: () => ControlledEventInterest) {
      if (readDesired) throw new Error("Event interest policy is already bound")
      readDesired = reader
      return () => {
        if (readDesired === reader) readDesired = undefined
      }
    },
    changed() {
      const previous = mode
      mode = new AbortController()
      previous.abort()
    },
    async flush(signal?: AbortSignal) {
      while (true) {
        if (signal?.aborted) throw signal.reason
        if (readDesired) feed.setDesired(untrack(readDesired))
        if (!focused()) return
        if (!readDesired) throw new Error("Event interest policy is not bound")
        const current = mode.signal
        try {
          await feed.flush(signal ? AbortSignal.any([signal, current]) : current)
          return
        } catch (error) {
          if (!current.aborted || current === mode.signal) throw error
          // A mode toggle releases the old barrier; it never restarts the service.
        }
      }
    },
  }
}
