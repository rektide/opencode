import { defaultEvictionStrikes, defaultKillGraceSeconds, defaultProbeTimeoutSeconds } from "./service.js"

export type EnsureTiming = {
  readonly pollInterval: number
  readonly attempts: number
  readonly requestTimeout: number
  readonly evictionStrikes: number
  readonly spawnDelay: number
  readonly maxSpawnDelay: number
  readonly promiseTimeout: number
  readonly stopPollInterval: number
  readonly stopPollAttempts: number
}

// Public patience options, shared by discover, ensure, and stop.
type PatienceOptions = {
  readonly probeTimeoutSeconds?: number
  readonly evictionStrikes?: number
  readonly killGraceSeconds?: number
}

const timings = new WeakMap<object, EnsureTiming>()

export function timingFromOptions(options: PatienceOptions): EnsureTiming {
  const probeTimeoutSeconds = options.probeTimeoutSeconds ?? defaultProbeTimeoutSeconds
  const evictionStrikes = options.evictionStrikes ?? defaultEvictionStrikes
  const killGraceSeconds = options.killGraceSeconds ?? defaultKillGraceSeconds
  // The overall window must cover the full strike window plus one kill grace
  // and startup headroom, so a patient configuration is never cut short.
  const promiseTimeout = Math.max(
    120_000,
    evictionStrikes * (probeTimeoutSeconds + 1) * 1000 + killGraceSeconds * 1000 + 60_000,
  )
  return {
    pollInterval: 1_000,
    attempts: Math.round(promiseTimeout / 1_000),
    requestTimeout: probeTimeoutSeconds * 1000,
    evictionStrikes,
    spawnDelay: 5_000,
    maxSpawnDelay: 30_000,
    promiseTimeout,
    stopPollInterval: 50,
    stopPollAttempts: Math.max(1, Math.round(killGraceSeconds * 20)),
  }
}

export const defaultEnsureTiming: EnsureTiming = timingFromOptions({})

export function ensureTiming(options: PatienceOptions) {
  return timings.get(options) ?? timingFromOptions(options)
}

// Keep test timing out of the public lifecycle option types. Overrides win
// over derived patience values, so accelerated tests keep configured windows.
export function withEnsureTiming<A extends object>(options: A, overrides: Partial<EnsureTiming>): A {
  timings.set(options, { ...timingFromOptions(options), ...overrides })
  return options
}
