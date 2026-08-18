import type { Effect, Stream } from "effect"
import type { Subscriber } from "@opencode-ai/schema/subscriber"

/**
 * Read-only subscriber observability. No corresponding Effect API client
 * exists yet, so this domain is plugin-specific; it should extend the
 * generated client API if subscriber endpoints are added to the protocol.
 */
export interface SubscriberDomain {
  readonly snapshot: (query?: Subscriber.Query) => Effect.Effect<Subscriber.Snapshot>
  readonly watch: (query?: Subscriber.Query) => Stream.Stream<Subscriber.Change, Subscriber.WatchOverflowError>
  readonly count: (query?: Subscriber.Query) => Effect.Effect<number>
}
