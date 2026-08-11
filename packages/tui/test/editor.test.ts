import { afterEach, expect, test } from "bun:test"
import { normalizePromptContent, openEditor } from "../src/editor"

const editor = process.env.EDITOR
const visual = process.env.VISUAL

afterEach(() => {
  process.env.EDITOR = editor
  process.env.VISUAL = visual
})

test("rejects when the external editor cannot start", async () => {
  delete process.env.VISUAL
  process.env.EDITOR = "opencode-editor-that-does-not-exist"
  const events: string[] = []
  const renderer = {
    suspend() {
      events.push("renderer suspend")
    },
    resume() {
      events.push("renderer resume")
    },
    requestRender() {
      events.push("render")
    },
    currentRenderBuffer: { clear() {} },
  }
  const suspension = {
    suspend() {
      events.push("animation suspend")
    },
    resume() {
      events.push("animation resume")
    },
  }

  await expect(openEditor({ value: "original", renderer: renderer as never, suspension })).rejects.toThrow()
  expect(events).toEqual(["animation suspend", "renderer suspend", "renderer resume", "animation resume", "render"])
})

test("normalizes a single trailing editor newline for one-line prompts", () => {
  expect(normalizePromptContent("hello\n")).toBe("hello")
  expect(normalizePromptContent("hello\r\n")).toBe("hello")
})

test("preserves multiline prompts that end with a newline", () => {
  expect(normalizePromptContent("hello\nworld\n")).toBe("hello\nworld\n")
})
