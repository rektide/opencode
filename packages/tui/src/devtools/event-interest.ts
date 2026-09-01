export function interestSize(
  interest?: Readonly<{
    locations: ReadonlyArray<unknown>
    sessions: ReadonlyArray<unknown>
  }>,
) {
  if (!interest) return "Pending"
  const locations = `${interest.locations.length} ${interest.locations.length === 1 ? "location" : "locations"}`
  const sessions = `${interest.sessions.length} ${interest.sessions.length === 1 ? "session" : "sessions"}`
  return `${locations}, ${sessions}`
}
