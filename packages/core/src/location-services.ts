import { Duration, Effect, Layer, LayerMap, Option } from "effect"
import path from "path"
import { Agent } from "./agent.js"
import { AISDK } from "./aisdk.js"
import { Catalog } from "./catalog.js"
import { Command } from "./command.js"
import { Config } from "./config.js"
import { LayerNode } from "@opencode-ai/util/effect/layer-node"
import { Node } from "@opencode-ai/util/effect/app-node"
import { Bus } from "./bus.js"
import { FileMutation } from "./file-mutation.js"
import { Environment } from "./environment/index.js"
import { Formatter } from "./formatter.js"
import { FileSystem } from "./filesystem.js"
import { FileSystemSearch } from "./filesystem/search.js"
import { Generate } from "./generate.js"
import { Form } from "./form.js"
import { Image } from "./image.js"
import { LocationWatcher } from "./filesystem/location-watcher.js"
import { Integration } from "./integration.js"
import { Location } from "./location.js"
import { LocationMutation } from "./location-mutation.js"
import { LocationServiceMap } from "./location-service-map.js"
import { ModelResolver } from "./model-resolver.js"
import { MCP } from "./mcp/index.js"
import { Permission } from "./permission.js"
import { Plugin } from "./plugin.js"
import { PluginSupervisor } from "./plugin/supervisor.js"
import { Worktree } from "./worktree.js"
import { Pty } from "./pty.js"
import { Shell } from "./shell.js"
import { ShellSelect } from "./shell/select.js"
import { Reference } from "./reference.js"
import { WebSearch } from "./websearch.js"
import { ReferenceInstructions } from "./reference/instructions.js"
import { SessionRunnerLLM } from "./session/runner/llm.js"
import { SessionRunnerModel } from "./session/runner/model.js"
import { SessionModelTransport } from "./session/model-transport.js"
import { SessionCompaction } from "./session/compaction.js"
import { SessionTitle } from "./session/title.js"
import { Skill } from "./skill.js"
import { SkillInstructions } from "./skill/instructions.js"
import { Snapshot } from "./snapshot.js"
import { InstructionDiscovery } from "./instruction-discovery.js"
import { InstructionBuiltIns } from "./instructions/builtins.js"
import { InstructionEntry } from "./session/instruction-entry.js"
import { SessionInstructions } from "./session/instructions.js"
import { SessionGenerateNode } from "./session/generate-node.js"
import { McpTool } from "./tool/mcp.js"
import { ReadToolFileSystem } from "./tool/read-filesystem.js"
import { Tool } from "./tool.js"
import { ToolOutput } from "./tool-output.js"
import { Vcs } from "./vcs.js"
import { AbsolutePath } from "./schema.js"

export { LocationServiceMap } from "./location-service-map.js"

const locationServiceNodes = [
  Location.node,
  Environment.node,
  Config.node,
  Agent.node,
  Command.node,
  Reference.node,
  WebSearch.node,
  Integration.node,
  Catalog.node,
  ModelResolver.node,
  AISDK.node,
  Plugin.node,
  PluginSupervisor.node,
  Worktree.refreshNode,
  FileSystemSearch.node,
  FileSystem.node,
  ShellSelect.node,
  Pty.node,
  Shell.node,
  Skill.node,
  InstructionBuiltIns.node,
  InstructionDiscovery.node,
  LocationMutation.node,
  FileMutation.node,
  Formatter.node,
  MCP.node,
  Permission.node,
  Tool.node,
  ToolOutput.node,
  Image.node,
  SkillInstructions.node,
  ReferenceInstructions.node,
  InstructionEntry.node,
  Form.node,
  Generate.node,
  SessionGenerateNode.node,
  ReadToolFileSystem.node,
  McpTool.node,
  SessionInstructions.node,
  SessionRunnerModel.node,
  SessionModelTransport.node,
  SessionCompaction.node,
  SessionTitle.node,
  Snapshot.node,
  SessionRunnerLLM.node,
  Vcs.node,
  // Start repository watches only after boot-critical filesystem and Git work.
  LocationWatcher.node,
] as const satisfies readonly Node.LocationNode<unknown, unknown>[]

export const locationServices = LayerNode.group<typeof locationServiceNodes>(locationServiceNodes)

export type LocationServices = LayerNode.Output<typeof locationServices>
export type LocationError = LayerNode.Error<typeof locationServices>

/**
 * Options for the per-directory location cache. When `idleTimeToLive` is not
 * given, the `OPENCODE_LOCATION_CACHE_TTL` env var is consulted (Duration
 * syntax: "90 minutes", "2 hours", "7 days", or "Infinity").
 */
export interface LocationCacheOptions {
  readonly idleTimeToLive?: Duration.Input
}

const DEFAULT_IDLE_TIME_TO_LIVE = "60 minutes"

export const resolveIdleTimeToLive = Effect.fnUntraced(function* (options: LocationCacheOptions) {
  if (options.idleTimeToLive !== undefined) return Duration.fromInputUnsafe(options.idleTimeToLive)
  const raw = process.env.OPENCODE_LOCATION_CACHE_TTL?.trim()
  if (raw === undefined || raw === "") return Duration.fromInputUnsafe(DEFAULT_IDLE_TIME_TO_LIVE)
  // RcMap treats a zero idle lifetime as evict-on-release and Infinity as never evict.
  // `fromInput` totals over arbitrary runtime strings (None on bad syntax); the
  // `Duration.Input` type only constrains what callers can write as literals.
  const parsed = raw.toLowerCase() === "infinity" ? Option.some(Duration.infinity) : Duration.fromInput(raw as Duration.Input)
  if (Option.isSome(parsed)) return parsed.value
  yield* Effect.logWarning(
    `ignoring invalid OPENCODE_LOCATION_CACHE_TTL ${JSON.stringify(raw)}; using ${DEFAULT_IDLE_TIME_TO_LIVE}`,
  )
  return Duration.fromInputUnsafe(DEFAULT_IDLE_TIME_TO_LIVE)
})

export function buildLocationServiceMap(
  replacements: LayerNode.Replacements = [],
  options: LocationCacheOptions = {},
): Layer.Layer<LocationServiceMap.Service> {
  // Structural Equal distinguishes optional-key shape and Windows separator style.
  // The RcMap caches the raw key before the build callback, so normalize both here.
  const canonical = (ref: Location.Ref) =>
    Location.Ref.make({
      directory: AbsolutePath.make(process.platform === "win32" ? path.normalize(ref.directory) : ref.directory),
      workspaceID: ref.workspaceID,
    })
  return Layer.effect(
    LocationServiceMap.Service,
    Effect.gen(function* () {
      const idleTimeToLive = yield* resolveIdleTimeToLive(options)
      return yield* Effect.map(
        LayerMap.make(
          (ref: Location.Ref) => {
            const startedAt = performance.now()
            const allReplacements = replacements.concat([[Location.node, Location.boundNode(ref)]])
            // Apply replacements during hoist, not afterward: replacements can
            // introduce new tagged dependencies (Location.boundNode depends on
            // Project), and the hoist walk is the only pass that can still slice
            // those back out.
            const location = LayerNode.hoist(locationServices, Node.tags.values.global, allReplacements)

            return LayerNode.compile(location.node).pipe(
              Layer.fresh,
              // The tap runs in the RcMap entry scope, so the finalizer fires
              // when the entry is retired after sitting idle past its TTL.
              Layer.tap(() =>
                Effect.gen(function* () {
                  yield* Effect.addFinalizer(() =>
                    Effect.logInfo("location services retired", {
                      directory: ref.directory,
                      workspaceID: ref.workspaceID,
                      lifetimeMs: Math.round(performance.now() - startedAt),
                    }),
                  )
                  yield* Effect.logInfo("location services booted", {
                    directory: ref.directory,
                    workspaceID: ref.workspaceID,
                    durationMs: Math.round(performance.now() - startedAt),
                  })
                }),
              ),
              Layer.provide(LayerNode.compile(location.hoisted)),
            )
          },
          { idleTimeToLive },
        ),
        (inner) => ({
          ...inner,
          get: (ref: Location.Ref) => inner.get(canonical(ref)),
          contextEffect: (ref: Location.Ref) => inner.contextEffect(canonical(ref)),
          invalidate: (ref: Location.Ref) => inner.invalidate(canonical(ref)),
        }),
      )
    }),
  )
}
