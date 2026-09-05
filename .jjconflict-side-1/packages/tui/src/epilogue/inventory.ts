/**
 * Returns actual routed and visible-tab IDs without expanding Session ancestry.
 * Visible tabs may originate in shared storage and are not exclusive client ownership.
 */
export function epilogueInventoryIDs(input: {
  readonly currentID?: string
  readonly tabsEnabled: boolean
  readonly visibleTabIDs: readonly string[]
}) {
  return Object.freeze(
    Array.from(new Set([input.currentID, ...(input.tabsEnabled ? input.visibleTabIDs : [])].filter(isSessionID))),
  )
}

export function hydratedEpilogueSessionID(input: {
  readonly currentID?: string
  readonly session?: { readonly id: string }
}) {
  return input.currentID !== undefined && input.session?.id === input.currentID ? input.currentID : undefined
}

function isSessionID(value: string | undefined): value is string {
  return value !== undefined
}
