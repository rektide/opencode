export type RecordedEpilogueActivity = {
  readonly updated: number
  readonly idle?: number
}

export type EpilogueActivity = RecordedEpilogueActivity & {
  readonly status: "idle" | "running"
}

export function lastEpilogueActivity(activity: RecordedEpilogueActivity) {
  return Math.max(activity.updated, activity.idle ?? activity.updated)
}
