import { expect, test } from "bun:test"
import { Schema } from "effect"
import { Project } from "../src/project.js"

test("current project reports VCS classification without encoding absent values", () => {
  const current = { id: "project", directory: "/repo", canonical: "/repo", vcs: "jj" }
  expect(Schema.encodeSync(Project.Current)(Schema.decodeUnknownSync(Project.Current)(current))).toEqual(current)
  expect(Schema.encodeSync(Project.Current)({ ...current, vcs: undefined })).toEqual({
    id: "project",
    directory: "/repo",
    canonical: "/repo",
  })
})
