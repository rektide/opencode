export * as VcsJj from "./jj"

import path from "path"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { FileDiff } from "@opencode-ai/schema/file-diff"
import { FileStatus, Info, Mode } from "@opencode-ai/schema/vcs"
import { AppProcess } from "@opencode-ai/util/process"
import type { DiffOptions } from "../vcs"
import {
  chunksByFile,
  countPatch,
  emptyPatch,
  MAX_TOTAL_PATCH_BYTES,
  PATCH_CONTEXT_LINES,
} from "./patch"

export function make(proc: AppProcess.Interface, input: { directory: string; worktree: string }) {
  const jj = makeJj(proc, input.worktree)
  const scope = path.relative(input.worktree, input.directory) || "."
  const local = (file: string) => (scope === "." ? file : path.relative(scope, file).replaceAll("\\", "/"))

  const changes = Effect.fnUntraced(function* (revision: Revision, options?: DiffOptions) {
    const [items, conflicts, patch] = yield* Effect.all(
      [
        jj.items(revision, scope),
        jj.conflicts(scope),
        jj.patch(revision, scope, options?.context ?? PATCH_CONTEXT_LINES),
      ],
      { concurrency: 3 },
    )
    const map = new Map(items.map((item) => [item.file, item]))
    conflicts.forEach((file) => {
      if (!map.has(file)) map.set(file, { file, status: "modified" })
    })
    const chunks = chunksByFile(patch, () => undefined)
    return [...map.values()]
      .toSorted((a, b) => a.file.localeCompare(b.file))
      .map((item) => {
        const chunk = chunks.get(item.file) ?? emptyPatch(item.file)
        const count = countPatch(chunk)
        return {
          file: local(item.file),
          patch: chunk,
          additions: count.additions,
          deletions: count.deletions,
          status: item.status,
        } satisfies FileDiff.Info
      })
  })

  return {
    info: Effect.fn("VcsJj.info")(function* () {
      return { branch: {} } satisfies Info
    }),
    status: Effect.fn("VcsJj.status")(function* () {
      return (yield* changes({ type: "working" })).map(
        (item) =>
          ({
            file: item.file,
            additions: item.additions,
            deletions: item.deletions,
            status: item.status,
          }) satisfies FileStatus,
      )
    }),
    diff: Effect.fn("VcsJj.diff")(function* (mode: Mode, options?: DiffOptions) {
      if (mode === "working") return yield* changes({ type: "working" }, options)
      const base = yield* jj.trunk()
      if (!base) return []
      return yield* changes({ type: "review", base }, options)
    }),
  }
}

type Kind = FileStatus["status"]
type Revision = { readonly type: "working" } | { readonly type: "review"; readonly base: string }

interface Item {
  readonly file: string
  readonly status: Kind
}

const kind = (status: string): Kind => {
  if (status === "added") return "added"
  if (status === "removed") return "deleted"
  return "modified"
}

function makeJj(proc: AppProcess.Interface, worktree: string) {
  const run = Effect.fnUntraced(
    function* (args: string[], options?: { metadata?: boolean; maxOutputBytes?: number }) {
      const result = yield* proc.run(
        ChildProcess.make(
          "jj",
          [
            "--no-pager",
            "--color=never",
            // Metadata answers never depend on unsaved edits, and jj snapshots
            // the working copy on load unless told not to.
            ...(options?.metadata ? ["--ignore-working-copy"] : []),
            ...args,
          ],
          {
            cwd: worktree,
            extendEnv: true,
            stdin: "ignore",
          },
        ),
        { maxOutputBytes: options?.maxOutputBytes },
      )
      return {
        exitCode: result.exitCode,
        text: result.stdout.toString("utf8"),
        truncated: result.stdoutTruncated || result.stderrTruncated,
      }
    },
    Effect.catch(() => Effect.succeed({ exitCode: 1, text: "", truncated: false })),
  )

  const revisions = (revision: Revision) =>
    revision.type === "working" ? ["-r", "@"] : ["--from", revision.base, "--to", "@"]

  const items = Effect.fn("VcsJj.items")(function* (revision: Revision, scope: string) {
    const result = yield* run([
      "diff",
      ...revisions(revision),
      "-T",
      'status ++ "\\0" ++ path ++ "\\0"',
      "--",
      scope,
    ])
    if (result.exitCode !== 0) return []
    const fields = result.text.split("\0")
    return Array.from({ length: Math.floor(fields.length / 2) }, (_, index) => ({
      status: fields[index * 2],
      file: fields[index * 2 + 1],
    })).flatMap((item) => (item.file ? [{ file: item.file, status: kind(item.status) } satisfies Item] : []))
  })

  const conflicts = Effect.fn("VcsJj.conflicts")(function* (scope: string) {
    const result = yield* run(
      [
        "log",
        "--no-graph",
        "-r",
        "@",
        "-T",
        'conflicted_files.map(|file| file.path() ++ "\\0").join("")',
      ],
      { metadata: true },
    )
    if (result.exitCode !== 0) return []
    const prefix = scope === "." ? "" : scope.replaceAll("\\", "/").replace(/\/$/, "") + "/"
    return result.text.split("\0").filter((file) => file && (!prefix || file === scope || file.startsWith(prefix)))
  })

  const patch = Effect.fn("VcsJj.patch")(function* (revision: Revision, scope: string, context: number) {
    const result = yield* run(
      ["diff", ...revisions(revision), "--git", "--context", String(context), "--", scope],
      { maxOutputBytes: MAX_TOTAL_PATCH_BYTES },
    )
    if (result.exitCode !== 0) return { text: "", truncated: false }
    return { text: result.text, truncated: result.truncated }
  })

  const trunk = Effect.fn("VcsJj.trunk")(function* () {
    const result = yield* run(["log", "--no-graph", "-r", "trunk()", "-T", "commit_id"], { metadata: true })
    if (result.exitCode !== 0) return undefined
    const commit = result.text.trim()
    if (!commit || /^0+$/.test(commit)) return undefined
    return commit
  })

  return { items, conflicts, patch, trunk }
}
