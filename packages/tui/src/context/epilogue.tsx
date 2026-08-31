import { createSimpleContext } from "./helper"
import { sessionEpilogue } from "../util/presentation.ts"

export type SessionEpilogueCandidate = {
  readonly title: string
  readonly sessionID: string
  readonly activity: {
    readonly status: "idle" | "running"
    readonly updated: number
    readonly idle?: number
  }
}

type State =
  | { readonly status: "live"; readonly candidate?: SessionEpilogueCandidate }
  | { readonly status: "frozen"; readonly output?: string }
  | { readonly status: "written" }

export function createEpilogue() {
  let state: State = { status: "live" }
  return {
    set(candidate?: SessionEpilogueCandidate) {
      if (state.status !== "live") return
      state = { status: "live", candidate }
    },
    clear(sessionID: string) {
      if (state.status !== "live" || state.candidate?.sessionID !== sessionID) return
      state = { status: "live" }
    },
    freeze(now: number) {
      if (state.status !== "live") return
      state = {
        status: "frozen",
        output: state.candidate ? sessionEpilogue(state.candidate, now) : undefined,
      }
    },
    take() {
      if (state.status !== "frozen") return undefined
      const output = state.output
      state = { status: "written" }
      return output
    },
  }
}

export const { use: useEpilogue, provider: EpilogueProvider } = createSimpleContext({
  name: "Epilogue",
  init: (props: { value: Pick<ReturnType<typeof createEpilogue>, "set" | "clear"> }) => props.value,
})
