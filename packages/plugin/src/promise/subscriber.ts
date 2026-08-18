import type { Subscriber } from "@opencode-ai/schema/subscriber"

type SnapshotJson = typeof Subscriber.Snapshot.Encoded
type ChangeJson = typeof Subscriber.Change.Encoded

/**
 * Read-only subscriber observability with JSON-encoded values. Watching
 * returns an AsyncIterable that throws on observer overflow; reacquire for a
 * fresh snapshot.
 */
export interface SubscriberDomain {
  readonly snapshot: (query?: Subscriber.Query) => Promise<SnapshotJson>
  readonly watch: (query?: Subscriber.Query) => AsyncIterable<ChangeJson>
  readonly count: (query?: Subscriber.Query) => Promise<number>
}
