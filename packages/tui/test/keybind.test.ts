import { expect, test } from "bun:test"
import { TuiKeybind } from "../src/config/keybind"

test("binds agent cycling only to shift+tab by default", () => {
  expect(TuiKeybind.Definitions["agent.cycle"].default).toBe("shift+tab")
  expect(TuiKeybind.Definitions["agent.cycle.reverse"].default).toBe("none")
})

test("binds next review session to lowercase g", () => {
  expect(TuiKeybind.Definitions["session.review.next"].default).toBe("g")
})
