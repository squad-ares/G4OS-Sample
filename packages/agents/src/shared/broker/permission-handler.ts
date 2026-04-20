export interface PermissionDecision {
  readonly allowed: boolean;
  readonly requiresUserApproval: boolean;
  readonly description?: string;
}

export interface PermissionHandler {
  evaluate(
    toolName: string,
    input: Readonly<Record<string, unknown>>,
    command?: string,
  ): PermissionDecision;

  whitelist(toolName: string): void;
  whitelistDomain(domain: string): void;
}

export class AlwaysAllowHandler implements PermissionHandler {
  evaluate(): PermissionDecision {
    return { allowed: true, requiresUserApproval: false };
  }
  whitelist(): void {
    // allow-all ignores whitelist mutations
  }
  whitelistDomain(): void {
    // allow-all ignores whitelist mutations
  }
}

export class AlwaysDenyHandler implements PermissionHandler {
  evaluate(): PermissionDecision {
    return { allowed: false, requiresUserApproval: false, description: 'denied by policy' };
  }
  whitelist(): void {
    // deny-all ignores whitelist mutations
  }
  whitelistDomain(): void {
    // deny-all ignores whitelist mutations
  }
}

export interface AskHandlerHooks {
  isWhitelisted(toolName: string): boolean;
  isDomainWhitelisted(domain: string): boolean;
  needsApproval(toolName: string, input: Readonly<Record<string, unknown>>): boolean;
}

export class AskHandler implements PermissionHandler {
  private readonly toolWhitelist = new Set<string>();
  private readonly domainWhitelist = new Set<string>();

  constructor(private readonly hooks: AskHandlerHooks) {}

  evaluate(toolName: string, input: Readonly<Record<string, unknown>>): PermissionDecision {
    if (this.toolWhitelist.has(toolName) || this.hooks.isWhitelisted(toolName)) {
      return { allowed: true, requiresUserApproval: false };
    }
    const requiresUserApproval = this.hooks.needsApproval(toolName, input);
    return { allowed: true, requiresUserApproval };
  }

  whitelist(toolName: string): void {
    this.toolWhitelist.add(toolName);
  }

  whitelistDomain(domain: string): void {
    this.domainWhitelist.add(domain);
  }

  hasDomain(domain: string): boolean {
    return this.domainWhitelist.has(domain) || this.hooks.isDomainWhitelisted(domain);
  }
}
