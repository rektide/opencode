import type { ControlledEventInterest } from "@opencode-ai/client/solid"
import type { LocationRef } from "@opencode-ai/client"
import { createEffect, onCleanup, type ParentProps } from "solid-js"
import { useClient } from "./client"
import { locationKey, useData } from "./data"
import { useLocation } from "./location"
import type { Route } from "./route"
import { useRoute } from "./route"
import { useSessionTabs } from "./session-tabs"

export function EventInterestProvider(props: ParentProps<{ launch: LocationRef }>) {
  const client = useClient()
  const data = useData()
  const location = useLocation()
  const route = useRoute()
  const tabs = useSessionTabs()
  const readDesired = () =>
    eventInterest({
      launch: props.launch,
      current: location.ref,
      route: route.data,
      tabs: tabs.enabled() ? tabs.tabs() : [],
      root: data.session.root,
      family: data.session.family,
      sessionLocation: (sessionID) => data.session.get(sessionID)?.location,
    })
  onCleanup(client.interest.bind(readDesired))
  const update = () => client.interest.setDesired(readDesired())

  update()
  createEffect(update)
  return props.children
}

export function eventInterest(input: {
  readonly launch: LocationRef
  readonly current?: LocationRef
  readonly route: Route
  readonly tabs: ReadonlyArray<{ readonly sessionID: string }>
  readonly root: (sessionID: string) => string
  readonly family: (sessionID: string) => readonly string[]
  readonly sessionLocation: (sessionID: string) => LocationRef | undefined
}): ControlledEventInterest {
  const locations = new Map<string, LocationRef>()
  const sessions = new Set<string>()
  const hold = (ref?: LocationRef) => {
    if (ref) locations.set(locationKey(ref), ref)
  }
  const follow = (sessionID: string) => {
    if (sessionID === "dummy") return
    const root = input.root(sessionID)
    const members = new Set([sessionID, root, ...input.family(root)])
    members.forEach((member) => {
      sessions.add(member)
      hold(input.sessionLocation(member))
    })
  }

  hold(input.launch)
  hold(input.current)
  if (input.route.type === "home") hold(input.route.location)
  if (input.route.type === "session") follow(input.route.sessionID)
  input.tabs.forEach((tab) => follow(tab.sessionID))
  return { locations: Array.from(locations.values()), sessions: Array.from(sessions), profile: "session-streaming" }
}
