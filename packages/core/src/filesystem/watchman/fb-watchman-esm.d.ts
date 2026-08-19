declare module "@superbfowle/fb-watchman-esm" {
  import { EventEmitter } from "node:events"

  export class Client extends EventEmitter {
    constructor(options?: { readonly watchmanBinaryPath?: string })
    command(args: readonly unknown[], callback: (error: Error | null, response?: unknown) => void): void
    capabilityCheck(
      capabilities: { readonly optional?: readonly string[]; readonly required?: readonly string[] },
      callback: (error: Error | null, response?: unknown) => void,
    ): void
    end(): void
  }
}
