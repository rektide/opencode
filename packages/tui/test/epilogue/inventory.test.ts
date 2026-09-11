import { expect, test } from "bun:test"
import { epilogueInventoryIDs } from "../../src/epilogue/inventory.ts"

test("deduplicates current and visible tabs without replacing routed children with roots", () => {
  expect(
    epilogueInventoryIDs({
      currentID: "ses_child",
      tabsEnabled: true,
      visibleTabIDs: ["ses_root", "ses_child", "ses_other", "ses_root"],
    }),
  ).toEqual(["ses_child", "ses_root", "ses_other"])
})

test("uses current only when tabs are disabled", () => {
  expect(epilogueInventoryIDs({ currentID: "ses_current", tabsEnabled: false, visibleTabIDs: ["ses_shared"] })).toEqual(
    ["ses_current"],
  )
})

test("keeps visible shared tabs available on Home without claiming ownership", () => {
  expect(epilogueInventoryIDs({ tabsEnabled: true, visibleTabIDs: ["ses_shared", "ses_other"] })).toEqual([
    "ses_shared",
    "ses_other",
  ])
})
