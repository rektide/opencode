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
      const workingCopy = yield* jj.info()
      return { branch: {}, workingCopy } satisfies Info
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

  // Label fallback when the working copy carries no local bookmark: name the
  // nearest bookmarked ancestor with its distance, e.g. main+5. Both queries
  // are metadata — distances count commits, not unsaved edits.
  const nearest = Effect.fn("VcsJj.nearest")(function* () {
    const found = yield* run(
      [
        "log",
        "--no-graph",
        "-r",
        "heads(::@ & bookmarks())",
        "-T",
        'bookmarks.map(|b| b.name()).join("\\x1f") ++ "\\n"',
      ],
      { metadata: true },
    )
    if (found.exitCode !== 0) return undefined
    const name = found.text
      .split("\n")
      .flatMap((line) => line.split("\x1f"))
      .filter(Boolean)
      .toSorted()[0]
    if (!name) return undefined
    const counted = yield* run(["log", "--no-graph", "-r", `${name}..@`, "-T", 'commit_id ++ "\\n"'], {
      metadata: true,
    })
    if (counted.exitCode !== 0) return undefined
    // The range includes the working-copy commit itself; report only the
    // commits of real history past the bookmark.
    const ahead = Math.max(0, counted.text.split("\n").filter(Boolean).length - 1)
    return ahead > 0 ? `${name}+${ahead}` : name
  })

  const info = Effect.fn("VcsJj.workingCopy")(function* () {
    const [identity, workspaces] = yield* Effect.all(
      [
        run([
          "log",
          "--no-graph",
          "-r",
          "@",
          "-T",
          'change_id ++ "\\0" ++ commit_id ++ "\\0" ++ local_bookmarks.map(|bookmark| bookmark.name()).join("\\x1f") ++ "\\0" ++ description.first_line() ++ "\\0" ++ conflict ++ "\\0" ++ empty ++ "\\0"',
        ]),
        run(["workspace", "list", "-T", 'name ++ "\\0" ++ root ++ "\\0"'], { metadata: true }),
      ],
      { concurrency: 2 },
    )
    if (identity.exitCode !== 0 || workspaces.exitCode !== 0) return undefined
    const fields = identity.text.split("\0")
    const changeID = fields[0]?.trim()
    const commitID = fields[1]?.trim()
    if (!changeID || !commitID) return undefined
    const bookmarks = (fields[2] ?? "").split("\x1f").filter(Boolean).toSorted()
    const workspaceFields = workspaces.text.split("\0")
    const workspace = Array.from({ length: Math.floor(workspaceFields.length / 2) }, (_, index) => ({
      name: workspaceFields[index * 2],
      root: workspaceFields[index * 2 + 1],
    })).find((item) => item.name && path.resolve(item.root) === path.resolve(worktree))?.name
    return {
      label: bookmarks[0] ?? (yield* nearest()) ?? changeID.slice(0, 12),
      workspace,
      changeID,
      commitID,
      bookmarks,
      description: fields[3] || undefined,
      conflicted: fields[4] === "true",
      empty: fields[5] === "true",
    }
  })

  return { items, conflicts, patch, trunk, info }
}
