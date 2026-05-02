// bun test grep-ratelimits.test.ts

import { describe, expect, test } from "bun:test"
import { nest, filterSeqs, insert, collapse } from "./grep-ratelimits.js"

const codex = {
  "x-codex-active-limit": "premium",
  "x-codex-plan-type": "plus",
  "x-codex-credits-has-credits": "False",
  "x-codex-credits-unlimited": "False",
  "x-codex-primary-over-secondary-limit-percent": "0",
  "x-codex-primary-reset-after-seconds": "18000",
  "x-codex-primary-reset-at": "1776153444",
  "x-codex-primary-reset-duration-hours": "5",
  "x-codex-primary-used-percent": "1",
  "x-codex-primary-window-minutes": "300",
  "x-codex-secondary-reset-after-seconds": "232878",
  "x-codex-secondary-reset-at": "1776368321",
  "x-codex-secondary-reset-duration-hours": "64.7",
  "x-codex-secondary-used-percent": "100",
  "x-codex-secondary-window-minutes": "10080",
}

describe("filterSeqs", () => {
  test("drops single segments", () => {
    expect(filterSeqs(["x", "codex", "plan"], [["x"]])).toEqual(["codex", "plan"])
  })

  test("drops multi-sequence matches", () => {
    expect(filterSeqs(["codex", "primary", "window", "minutes"], [["window", "minutes"]])).toEqual(["codex", "primary"])
  })

  test("drops both single and multi", () => {
    expect(filterSeqs(["x", "codex", "at"], [["x"], ["at"]])).toEqual(["codex"])
  })

  test("returns empty when all stripped", () => {
    expect(filterSeqs(["x", "at"], [["x"], ["at"]])).toEqual([])
  })

  test("no match leaves parts unchanged", () => {
    expect(filterSeqs(["codex", "plan"], [["x"], ["at"]])).toEqual(["codex", "plan"])
  })
})

describe("insert", () => {
  test("single key becomes leaf", () => {
    const root = {}
    insert(root, ["a", "b"], "v", Infinity)
    expect(root).toEqual({ a: { b: "v" } })
  })

  test("sibling keys branch", () => {
    const root = {}
    insert(root, ["a", "b"], "1", Infinity)
    insert(root, ["a", "c"], "2", Infinity)
    expect(root).toEqual({ a: { b: "1", c: "2" } })
  })

  test("respects maxDepth", () => {
    const root = {}
    insert(root, ["a", "b", "c"], "v", 1)
    expect(root).toEqual({ a: { "b-c": "v" } })
  })
})

describe("collapse", () => {
  test("single-child path joins keys", () => {
    expect(collapse({ a: { b: "v" } })).toEqual({ "a-b": "v" })
  })

  test("multi-child node stays", () => {
    expect(collapse({ a: { b: "1", c: "2" } })).toEqual({ a: { b: "1", c: "2" } })
  })

  test("leaf values pass through", () => {
    expect(collapse({ a: "v" })).toEqual({ a: "v" })
  })

  test("deep single chain collapses fully", () => {
    expect(collapse({ a: { b: { c: "v" } } })).toEqual({ "a-b-c": "v" })
  })
})

describe("nest", () => {
  test("full codex rate limits", () => {
    const result = nest(codex)
    expect(result).toEqual({
      codex: {
        "active-limit": "premium",
        "plan-type": "plus",
        credits: { "has-credits": "False", unlimited: "False" },
        primary: {
          "over-secondary-limit-percent": "0",
          reset: { "after-seconds": "18000", "duration-hours": "5" },
          "used-percent": "1",
        },
        secondary: {
          reset: { "after-seconds": "232878", "duration-hours": "64.7" },
          "used-percent": "100",
        },
      },
    })
  })

  test("empty input returns empty", () => {
    expect(nest({})).toEqual({})
  })

  test("custom dropped set", () => {
    const result = nest({ "foo-bar-baz": "v" }, Infinity, new Set(["foo"]))
    expect(result).toEqual({ "bar-baz": "v" })
  })

  test("maxDepth limits recursion", () => {
    const result = nest({ "a-b-c-d": "1", "a-b-c-e": "2" }, 1, new Set())
    expect(result).toEqual({ a: { "b-c-d": "1", "b-c-e": "2" } })
  })
})
