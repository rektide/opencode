/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import type { Context, EpilogueRow } from "@opencode-ai/plugin/tui/context"
import SidebarPlugin, { SidebarContext } from "../../src/feature-plugins/sidebar/context"

function context(options?: { cost?: number; tokens?: number }) {
  const color = RGBA.fromInts(200, 200, 200)
  return {
    theme: { text: { default: color, subdued: color } },
    data: {
      session: {
        get: () => ({ location: { directory: "/workspace" } }),
        cost: () => options?.cost ?? 0,
        message: {
          list: () =>
            options?.tokens
              ? [
                  {
                    id: "message",
                    type: "assistant",
                    model: { providerID: "provider", id: "model" },
                    tokens: {
                      input: options.tokens,
                      output: 0,
                      reasoning: 0,
                      cache: { read: 0, write: 0 },
                    },
                  },
                ]
              : [],
        },
      },
      location: {
        model: { list: () => [] },
      },
    },
  } as unknown as Context
}

test("sidebar omits context before usage is available", async () => {
  const app = await testRender(() => <SidebarContext context={context()} sessionID="session" />, {
    width: 42,
    height: 8,
  })

  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).not.toContain("Context")
    expect(app.captureCharFrame()).not.toContain("Not measured")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar shows available context usage", async () => {
  const app = await testRender(() => <SidebarContext context={context({ tokens: 1234 })} sessionID="session" />, {
    width: 42,
    height: 8,
  })

  try {
    await app.renderOnce()
    expect(app.captureCharFrame()).toContain("Context")
    expect(app.captureCharFrame()).toContain("1,234 tokens")
  } finally {
    app.renderer.destroy()
  }
})

test("sidebar plugin contributes cached Session cost to the epilogue", async () => {
  let project: ((scope: { readonly sessionID: string }) => EpilogueRow | undefined) | undefined
  await SidebarPlugin.setup({
    data: { session: { cost: (sessionID: string) => (sessionID === "paid" ? 1.25 : 0) } },
    ui: {
      epilogue: {
        register(value: typeof project) {
          project = value
          return () => {}
        },
      },
      slot: () => () => {},
    },
  } as unknown as Context)

  expect(project?.({ sessionID: "free" })).toBeUndefined()
  expect(project?.({ sessionID: "paid" })).toEqual({
    label: "Cost",
    value: { type: "text", text: "$1.25" },
  })
})
