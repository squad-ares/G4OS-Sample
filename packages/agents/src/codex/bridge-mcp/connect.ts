import { AgentError } from '@g4os/kernel/errors';
import { createLogger, type Logger } from '@g4os/kernel/logger';

export interface BridgeMcpOptions {
  readonly url?: string;
  readonly logger?: Logger;
}

export interface BridgeMcpHandle {
  readonly url: string;
  readonly attachedAt: number;
}

export class BridgeMcpConnector {
  private readonly log: Logger;
  private handle: BridgeMcpHandle | undefined;

  constructor(private readonly options: BridgeMcpOptions = {}) {
    this.log = options.logger ?? createLogger('codex-bridge-mcp');
  }

  attach(url: string = this.options.url ?? ''): BridgeMcpHandle {
    if (!url) {
      throw AgentError.invalidInput('bridge MCP url is required');
    }
    this.handle = { url, attachedAt: Date.now() };
    this.log.info({ url }, 'bridge MCP attached');
    return this.handle;
  }

  current(): BridgeMcpHandle | undefined {
    return this.handle;
  }

  detach(): void {
    if (!this.handle) return;
    this.log.info({ url: this.handle.url }, 'bridge MCP detached');
    this.handle = undefined;
  }
}
