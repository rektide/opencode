export * as VcsJjPlugin from "./jj.js"

import { define } from "@opencode-ai/plugin/effect/plugin"
import { Effect } from "effect"
import { AppProcess } from "@opencode-ai/util/process"
import { Location } from "../../location.js"
import { VcsJj } from "../../vcs/jj.js"

export const Plugin = define({
  id: "opencode.vcs.jj",
  effect: Effect.fn("VcsJjPlugin")(function* (ctx) {
    const location = yield* Location.Service
    if (location.vcs?.type !== "jj") return

    const processes = yield* AppProcess.Service
    const adapter = VcsJj.make(processes, {
      directory: location.directory,
      worktree: location.project.directory,
    })

    yield* ctx.vcs.transform((draft) => {
      draft.add({
        id: "jj",
        name: "Jujutsu",
        info: () => adapter.info(),
        // Bookmark listing arrives with the working-copy label work; the
        // provider interface requires a value today.
        branches: () => Effect.succeed([]),
        status: () => adapter.status(),
        diff: (input) => adapter.diff(input.mode, { context: input.context, base: input.base }),
      })
    })
  }),
})
