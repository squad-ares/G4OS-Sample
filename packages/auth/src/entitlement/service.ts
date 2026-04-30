import type { AuthError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { DEV_ENTITLEMENTS, type Entitlements } from './types.ts';

export interface EntitlementClient {
  fetch(accessToken: string): Promise<Result<Entitlements, AuthError>>;
}

interface EntitlementServiceProdOptions {
  readonly client: EntitlementClient;
  readonly devBypass?: false;
}

interface EntitlementServiceDevOptions {
  readonly client: EntitlementClient;
  readonly devBypass: true;
  /**
   * Callback obrigatório quando `devBypass: true`. Garante audit trail —
   * sem ele, bypass ativaria silenciosamente em produção. ADR-0093.
   */
  readonly onBypassUsed: (entitlements: Entitlements) => void;
}

/**
 * Discriminated union: `devBypass: true` força `onBypassUsed` em compile time.
 * Construir com `devBypass: true` sem callback é erro de tipo.
 */
export type EntitlementServiceOptions =
  | EntitlementServiceProdOptions
  | EntitlementServiceDevOptions;

export class EntitlementService {
  private readonly client: EntitlementClient;
  private readonly devBypass: boolean;
  private readonly onBypassUsed?: (entitlements: Entitlements) => void;

  constructor(options: EntitlementServiceOptions) {
    this.client = options.client;
    this.devBypass = options.devBypass === true;
    if (options.devBypass === true) {
      this.onBypassUsed = options.onBypassUsed;
    }
  }

  getEntitlements(accessToken: string): Promise<Result<Entitlements, AuthError>> {
    if (this.devBypass) {
      this.onBypassUsed?.(DEV_ENTITLEMENTS);
      return Promise.resolve(ok(DEV_ENTITLEMENTS));
    }
    return this.client.fetch(accessToken);
  }
}
