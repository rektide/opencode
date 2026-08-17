/** Connection details for a local OpenCode service. */
export type Endpoint = {
  /** Base URL of the service. */
  readonly url: string
  /** Authentication required by the service, when configured. */
  readonly auth?: {
    /** HTTP authentication scheme. */
    readonly type: "basic"
    /** Basic authentication username. */
    readonly username: string
    /** Basic authentication password. */
    readonly password: string
  }
}

/** Options used to discover the local OpenCode service. */
export type DiscoverOptions = {
  /** Absolute registration file path. Defaults to the XDG state directory. */
  readonly file?: string
  /** Required service version. */
  readonly version?: string
  /** Health probe timeout in seconds. Defaults to 2. */
  readonly probeTimeoutSeconds?: number
}

/** Reason ensuring the service requires a new process. */
export type EnsureReason = "missing" | "version-mismatch"

/** Options used to ensure the local OpenCode service is running. */
export type EnsureOptions = DiscoverOptions & {
  /** Service command and arguments. Defaults to `opencode serve --service`. */
  readonly command?: ReadonlyArray<string>
  /** Called once before spawning a new service process. */
  readonly onStart?: (reason: EnsureReason, previousVersion?: string) => void
  /**
   * Consecutive probe timeouts before an unresponsive registered service is evicted.
   * Each strike costs one probe timeout plus one second of poll spacing. Defaults to 3;
   * raise it to tolerate slow-but-alive servers (e.g. 100 for roughly a five minute window).
   */
  readonly evictionStrikes?: number
  /** Grace between stop request or SIGTERM and SIGKILL, in seconds. Defaults to 5. */
  readonly killGraceSeconds?: number
}

/** Options used to stop the local OpenCode service. */
export type StopOptions = {
  /** Absolute registration file path. Defaults to the XDG state directory. */
  readonly file?: string
  /** Grace between stop request or SIGTERM and SIGKILL, in seconds. Defaults to 5. */
  readonly killGraceSeconds?: number
}

/** Default timeout for a single service health probe, in seconds. */
export const defaultProbeTimeoutSeconds = 2
/** Default consecutive probe timeouts before evicting an unresponsive registered service. */
export const defaultEvictionStrikes = 3
/** Default grace between stop request or SIGTERM and SIGKILL, in seconds. */
export const defaultKillGraceSeconds = 5

/** Contents of the local service registration file. */
export type Info = {
  /** Unique service instance identifier. */
  readonly id?: string
  /** OpenCode version served by the process. */
  readonly version?: string
  /** Base URL advertised by the service. */
  readonly url: string
  /** Operating system process identifier. */
  readonly pid: number
  /** Private service password, when authentication is enabled. */
  readonly password?: string
}
