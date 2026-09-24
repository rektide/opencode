import { Param, Primitive } from "effect/unstable/cli"
import { Spec } from "../framework/spec.ts"

type FlagInfo = {
  readonly takesValue: boolean
}

type WordResult =
  | { readonly _tag: "Success"; readonly words: ReadonlyArray<string> }
  | { readonly _tag: "Failure"; readonly reason: string }

export interface PreparedArguments {
  readonly args: ReadonlyArray<string>
  readonly warnings: ReadonlyArray<string>
}

export function prepareArguments(
  commands: Spec.Any,
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>>,
  globalParams: ReadonlyArray<Param.Any>,
): PreparedArguments {
  if (!environment.OPENCODE_ARGS && !environment.OPENCODE_TUI_ARGS) {
    return { args, warnings: [] }
  }

  const warnings: string[] = []
  const route = commandRoute(commands, args, globalParams)
  const sources: Array<ReadonlyArray<string>> = []
  const knownFlags = flagsInTree(commands, globalParams)
  const supportedFlags = flagsFor(route, globalParams)

  if (environment.OPENCODE_TUI_ARGS && (route === commands || route.name === "mini")) {
    addSource("OPENCODE_TUI_ARGS", environment.OPENCODE_TUI_ARGS, supportedFlags, knownFlags, sources, warnings)
  }

  if (environment.OPENCODE_ARGS) {
    addSource("OPENCODE_ARGS", environment.OPENCODE_ARGS, supportedFlags, knownFlags, sources, warnings)
  }

  const defaults = sources.flatMap((source) => source)
  const separator = args.indexOf("--")
  // Effect CLI uses the first value for a flag, so caller-supplied argv stays first.
  const effective =
    separator === -1 ? [...args, ...defaults] : [...args.slice(0, separator), ...defaults, ...args.slice(separator)]

  return { args: effective, warnings }
}

function addSource(
  name: string,
  value: string,
  supported: ReadonlyMap<string, FlagInfo>,
  known: ReadonlyMap<string, FlagInfo>,
  sources: Array<ReadonlyArray<string>>,
  warnings: string[],
) {
  const parsed = shellWords(value)
  if (parsed._tag === "Failure") {
    warnings.push(`${name} ignored: invalid shell-word syntax (${parsed.reason}).`)
    return
  }

  const filtered = filterEnvironmentWords(parsed.words, supported, known)
  if (filtered.ignored.length) {
    warnings.push(`${name} dropped unsupported arguments: ${filtered.ignored.join(", ")}.`)
  }
  if (filtered.words.length) sources.push(filtered.words)
}

function commandRoute(root: Spec.Any, args: ReadonlyArray<string>, globals: ReadonlyArray<Param.Any>) {
  let current = root
  let index = 0

  while (index < args.length) {
    const token = args[index]
    if (token === "--") break

    if (token.startsWith("-") && token !== "-") {
      const flags = flagsFor(current, globals)
      if (takesNextToken(token, flags) && !token.includes("=")) index++
      index++
      continue
    }

    const child = [...Object.values(current.commands), ...current.aliases].find((item) => item.name === token)
    if (!child) break
    current = child
    index++
  }

  return current
}

function flagsFor(command: Spec.Any, globals: ReadonlyArray<Param.Any>) {
  return flagsFromParams([...paramsIn(command.params), ...globals])
}

function flagsInTree(root: Spec.Any, globals: ReadonlyArray<Param.Any>) {
  const output = flagsFromParams(globals)
  const seen = new Set<Spec.Any>()

  function visit(command: Spec.Any) {
    if (seen.has(command)) return
    seen.add(command)
    for (const [name, info] of flagsFromParams(paramsIn(command.params))) {
      const previous = output.get(name)
      output.set(name, {
        takesValue: info.takesValue || previous?.takesValue === true,
      })
    }
    Object.values(command.commands).forEach(visit)
    command.aliases.forEach(visit)
  }

  visit(root)
  return output
}

function paramsIn(config: unknown): Array<Param.Any> {
  if (Param.isParam(config)) return [config]
  if (Array.isArray(config)) return config.flatMap(paramsIn)
  if (config && typeof config === "object") return Object.values(config).flatMap(paramsIn)
  return []
}

function flagsFromParams(params: ReadonlyArray<Param.Any>) {
  const output = new Map<string, FlagInfo>()

  for (const param of params) {
    for (const single of singlesIn(param)) {
      if (single.kind !== Param.flagKind) continue
      const info = { takesValue: single.primitiveType !== Primitive.boolean }
      output.set(`--${single.name}`, info)
      if (!info.takesValue) output.set(`--no-${single.name}`, info)
      for (const alias of single.aliases) {
        output.set(alias.length === 1 ? `-${alias}` : `--${alias}`, info)
      }
    }
  }

  return output
}

function singlesIn(param: Param.Any): Array<Param.Single<Param.ParamKind, unknown>> {
  if (Param.isSingle(param)) return [param]

  if (param._tag === "Map") return singlesIn((param as Param.Map<Param.ParamKind, unknown, unknown>).param)
  if (param._tag === "Transform") {
    const transform = param as Param.Transform<Param.ParamKind, unknown, unknown>
    return [...singlesIn(transform.param), ...transform.alternatives.flatMap((alternative) => singlesIn(alternative()))]
  }
  if (param._tag === "Optional") return singlesIn((param as Param.Optional<Param.ParamKind, unknown>).param)
  if (param._tag === "Variadic") return singlesIn((param as Param.Variadic<Param.ParamKind, unknown>).param)
  return []
}

function takesNextToken(token: string, flags: ReadonlyMap<string, FlagInfo>) {
  if (token.startsWith("--")) return flags.get(token.split("=", 1)[0])?.takesValue === true
  const cluster = token.slice(1).split("=", 1)[0]
  return [...cluster].some((flag) => flags.get(`-${flag}`)?.takesValue === true)
}

function filterEnvironmentWords(
  words: ReadonlyArray<string>,
  supported: ReadonlyMap<string, FlagInfo>,
  known: ReadonlyMap<string, FlagInfo>,
) {
  const kept: string[] = []
  const ignored = new Set<string>()

  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    if (word === "--") {
      ignored.add("--")
      break
    }

    if (word.startsWith("--")) {
      const equal = word.indexOf("=")
      const option = equal === -1 ? word : word.slice(0, equal)
      const accepted = supported.get(option)
      if (!accepted) {
        ignored.add(option)
        if (equal === -1 && known.get(option)?.takesValue && words[index + 1] && !words[index + 1].startsWith("-")) {
          index++
        }
        continue
      }

      if (equal === -1 && accepted.takesValue && words[index + 1] === undefined) {
        ignored.add(`${option} (missing value)`)
        continue
      }
      kept.push(word)
      if (equal === -1 && accepted.takesValue && words[index + 1] !== undefined) kept.push(words[++index])
      continue
    }

    if (word.startsWith("-") && word !== "-") {
      const equal = word.indexOf("=")
      const cluster = word.slice(1, equal === -1 ? undefined : equal)
      if (cluster.length === 1) {
        const option = `-${cluster}`
        const accepted = supported.get(option)
        if (!accepted) {
          ignored.add(option)
          if (equal === -1 && known.get(option)?.takesValue && words[index + 1] && !words[index + 1].startsWith("-")) {
            index++
          }
          continue
        }

        if (equal === -1 && accepted.takesValue && words[index + 1] === undefined) {
          ignored.add(`${option} (missing value)`)
          continue
        }
        kept.push(word)
        if (equal === -1 && accepted.takesValue && words[index + 1] !== undefined) kept.push(words[++index])
        continue
      }

      const optionNames = [...cluster].map((flag) => `-${flag}`)
      const infos = optionNames.map((option) => supported.get(option))
      if (infos.every((info) => info && !info.takesValue)) {
        kept.push(word)
        continue
      }

      ignored.add(word.slice(0, equal === -1 ? undefined : equal))
      if (
        equal === -1 &&
        optionNames.some((option) => known.get(option)?.takesValue) &&
        words[index + 1] &&
        !words[index + 1].startsWith("-")
      ) {
        index++
      }
      continue
    }

    ignored.add("<positional argument>")
  }

  return { words: kept, ignored: [...ignored] }
}

function shellWords(input: string): WordResult {
  const words: string[] = []
  let word = ""
  let quote: "'" | '"' | undefined
  let escaped = false
  let started = false

  for (const character of input) {
    if (escaped) {
      word += character
      escaped = false
      started = true
      continue
    }

    if (quote === "'") {
      if (character === "'") quote = undefined
      else word += character
      started = true
      continue
    }

    if (character === "\\") {
      escaped = true
      started = true
      continue
    }

    if (quote === '"') {
      if (character === '"') quote = undefined
      else word += character
      started = true
      continue
    }

    if (character === "'" || character === '"') {
      quote = character
      started = true
      continue
    }

    if (/\s/.test(character)) {
      if (started) words.push(word)
      word = ""
      started = false
      continue
    }

    word += character
    started = true
  }

  if (escaped) return { _tag: "Failure", reason: "trailing backslash" }
  if (quote)
    return {
      _tag: "Failure",
      reason: `unterminated ${quote === "'" ? "single" : "double"} quote`,
    }
  if (started) words.push(word)
  return { _tag: "Success", words }
}
