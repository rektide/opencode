import { createSimpleContext } from "./helper"
import { sessionEpilogue } from "../util/presentation"

export type SessionEpilogueCandidate = {
  readonly title: string
  readonly sessionID: string
  readonly updated: number
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
    freeze(now: number) {
      if (state.status !== "live") return
      state = {
        status: "frozen",
        output: state.candidate ? sessionEpilogue(state.candidate, now) : undefined,
      }
    },
    take() {
      if (state.status !== "frozen") return
      const output = state.output
      state = { status: "written" }
      return output
    },
  }
}

export const { use: useEpilogue, provider: EpilogueProvider } = createSimpleContext({
  name: "Epilogue",
  init: (props: { set(value?: SessionEpilogueCandidate): void }) => props.set,
})
