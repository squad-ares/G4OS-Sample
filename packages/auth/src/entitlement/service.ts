import type { AuthError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { DEV_ENTITLEMENTS, type Entitlements } from './types.ts';

export interface EntitlementClient {
  fetch(accessToken: string): Promise<Result<Entitlements, AuthError>>;
}

export interface EntitlementServiceOptions {
  readonly client: EntitlementClient;
  /**
   * When true, `getEntitlements` returns synthesized dev entitlements and
   * logs a warning. Must be wired behind an explicit env flag (see ADR-0093)
   * and CI must assert it is false in release builds.
   */
  readonly devBypass?: boolean;
  readonly onBypassUsed?: (entitlements: Entitlements) => void;
}

export class EntitlementService {
  private readonly client: EntitlementClient;
  private readonly devBypass: boolean;
  private readonly onBypassUsed?: (entitlements: Entitlements) => void;

  constructor(options: EntitlementServiceOptions) {
    this.client = options.client;
    this.devBypass = options.devBypass === true;
    if (options.onBypassUsed) this.onBypassUsed = options.onBypassUsed;
  }

  getEntitlements(accessToken: string): Promise<Result<Entitlements, AuthError>> {
    if (this.devBypass) {
      this.onBypassUsed?.(DEV_ENTITLEMENTS);
      return Promise.resolve(ok(DEV_ENTITLEMENTS));
    }
    return this.client.fetch(accessToken);
  }
}
