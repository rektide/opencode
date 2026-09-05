import { OpenCode, type OpenCodeEvent } from "@opencode-ai/client"

export const worktree = "/tmp/opencode"
export const directory = `${worktree}/packages/tui`

export function json(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  if (!headers.has("content-type")) headers.set("content-type", "application/json")
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

export function createEventStream() {
  const encoder = new TextEncoder()
  const v2 = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const pending: Uint8Array[] = []
  const controlled = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const controlledPending: Uint8Array[] = []
  let controlledActive = false
  const response = (
    controllers: Set<ReadableStreamDefaultController<Uint8Array>>,
    queued: Uint8Array[],
    initial?: unknown,
    signal?: AbortSignal,
  ) => {
    let current: ReadableStreamDefaultController<Uint8Array> | undefined
    const cancel = () => {
      if (current && controllers.delete(current)) current.close()
      signal?.removeEventListener("abort", cancel)
    }
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          current = controller
          controllers.add(controller)
          signal?.addEventListener("abort", cancel, { once: true })
          if (initial) controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`))
          for (const chunk of queued.splice(0)) controller.enqueue(chunk)
        },
        cancel() {
          if (current) controllers.delete(current)
          signal?.removeEventListener("abort", cancel)
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    )
  }
  const send = (
    controllers: Set<ReadableStreamDefaultController<Uint8Array>>,
    queued: Uint8Array[],
    event: unknown,
  ) => {
    const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
    if (controllers.size === 0) {
      queued.push(chunk)
      return
    }
    for (const controller of controllers) controller.enqueue(chunk)
  }

  return {
    emit(event: OpenCodeEvent) {
      send(v2, pending, event)
      if (controlledActive) send(controlled, controlledPending, event)
    },
    v2(signal?: AbortSignal) {
      return response(v2, pending, { id: "evt_connected", type: "server.connected", data: {} }, signal)
    },
    controlled(signal?: AbortSignal) {
      controlledActive = false
      return response(
        controlled,
        controlledPending,
        {
          type: "event-feed.ready",
          data: {
            subscriptionID: "evsub_00000000000000000000000000000001",
            profiles: ["location", "session-streaming"],
          },
        },
        signal,
      )
    },
    activate() {
      if (controlledActive) return
      controlledActive = true
      send(controlled, controlledPending, { id: "evt_connected", type: "server.connected", data: {} })
    },
    disconnect() {
      for (const controller of v2) controller.close()
      v2.clear()
      for (const controller of controlled) controller.close()
      controlled.clear()
      controlledActive = false
    },
  }
}

export type FetchHandler = (url: URL, request: Request) => Response | undefined | Promise<Response | undefined>

export function createFetch(
  override?: FetchHandler,
  events?: ReturnType<typeof createEventStream>,
  options?: { readonly controlled?: (interest: unknown) => void | Promise<void> },
) {
  const session = [] as URL[]
  async function fetch(input: RequestInfo | URL, init?: RequestInit) {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    if (url.pathname === "/session") session.push(url)
    const overridden = await override?.(url, request)
    if (overridden) return overridden
    if (url.pathname === "/api/experimental/event") {
      if (events && options?.controlled) return events.controlled(request.signal)
      return new Response(null, { status: 404 })
    }
    if (
      request.method === "PUT" &&
      /^\/api\/experimental\/event\/subscriptions\/[^/]+\/interests$/.test(url.pathname) &&
      events &&
      options?.controlled
    ) {
      const interest: unknown = await request.json()
      await options.controlled(interest)
      events.activate()
      return new Response(null, { status: 204 })
    }
    if (url.pathname === "/api/event" && events) return events.v2(request.signal)

    if (
      [
        "/agent",
        "/command",
        "/experimental/workspace",
        "/experimental/workspace/status",
        "/formatter",
        "/lsp",
      ].includes(url.pathname)
    )
      return json([])
    if (["/config", "/experimental/resource", "/mcp", "/provider/auth", "/session/status"].includes(url.pathname))
      return json({})
    if (url.pathname === "/config/providers") return json({ providers: {}, default: {} })
    if (url.pathname === "/experimental/console") return json({ consoleManagedProviders: [], switchableOrgCount: 0 })
    if (url.pathname === "/experimental/capabilities") return json({ backgroundSubagents: true })
    if (url.pathname === "/path") return json({ home: "", state: "", config: "", worktree, directory })
    if (url.pathname === "/api/location")
      return json({ directory, project: { id: "proj_test", directory: worktree, canonical: worktree } })
    if (url.pathname === "/api/plugin")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/vcs")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: { branch: { current: "main", default: "main" } },
      })
    if (url.pathname === "/api/fs/list")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/project/current") return json({ id: "proj_test", directory: worktree })
    if (url.pathname === "/api/project") return json([])
    if (url.pathname === "/api/worktree") {
      if (request.method === "GET") return json([{ directory: worktree }])
      if (request.method === "POST") return json({ directory: `${worktree}/created` })
      return new Response(null, { status: 204 })
    }
    if (url.pathname === "/api/worktree/refresh") return new Response(null, { status: 204 })
    if (url.pathname === "/api/shell")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/mcp")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/mcp/resource")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: { resources: [], templates: [] },
      })
    if (url.pathname === "/api/session") return json({ data: [], cursor: {} })
    if (url.pathname === "/api/config") return json([])
    if (url.pathname === "/api/session/active") return json({ data: {} })
    if (request.method === "POST" && /^\/api\/session\/[^/]+\/model$/.test(url.pathname))
      return new Response(null, { status: 204 })
    if (url.pathname === "/api/permission/request")
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/form/request")
      return json({ location: { directory, project: { id: "proj_test", directory: worktree } }, data: [] })
    if (/^\/api\/session\/[^/]+\/form$/.test(url.pathname)) return json({ data: [] })
    if (/^\/api\/experimental\/session\/[^/]+\/terminal$/.test(url.pathname)) return json({ data: [] })
    if (
      ["/api/agent", "/api/model", "/api/provider", "/api/integration", "/api/command", "/api/skill"].includes(
        url.pathname,
      )
    )
      return json({
        location: { directory, project: { id: "proj_test", directory: worktree, canonical: worktree } },
        data: [],
      })
    if (url.pathname === "/api/reference")
      return json({ location: { directory, project: { id: "proj_test", directory, canonical: directory } }, data: [] })
    if (url.pathname === "/api/websearch/provider") {
      return json({ location: { directory, project: { id: "proj_test", directory, canonical: directory } }, data: [] })
    }
    if (url.pathname === "/provider") return json({ all: [], default: {}, connected: [] })
    if (url.pathname === "/session") return json([])
    if (url.pathname === "/vcs") return json({ branch: "main" })
    if (url.pathname === "/api/experimental/migration/v1") return json({ status: "completed" })
    throw new Error(`unexpected request: ${url.pathname}`)
  }
  fetch.preconnect = () => {}
  return { fetch, session }
}

export function createApi(fetch: typeof globalThis.fetch) {
  return OpenCode.make({ baseUrl: "http://test", fetch })
}
