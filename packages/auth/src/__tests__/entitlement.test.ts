import { AuthError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { EntitlementService } from '../entitlement/service.ts';
import { DEV_ENTITLEMENTS, type Entitlements } from '../entitlement/types.ts';

const entitlements: Entitlements = {
  email: 'user@company.com',
  role: 'admin',
  tier: 'pro',
  status: 'active',
  allowedModelTiers: ['smart', 'balanced'],
  canAccessG4: true,
  canAccessPublic: true,
  domainAllowedForG4: true,
};

describe('EntitlementService', () => {
  it('delegates to client when bypass disabled', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(ok(entitlements)));
    const service = new EntitlementService({ client: { fetch: fetchFn } });
    const result = await service.getEntitlements('access');
    expect(result._unsafeUnwrap()).toEqual(entitlements);
    expect(fetchFn).toHaveBeenCalledWith('access');
  });

  it('returns DEV_ENTITLEMENTS when devBypass is true', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(ok(entitlements)));
    const onBypassUsed = vi.fn();
    const service = new EntitlementService({
      client: { fetch: fetchFn },
      devBypass: true,
      onBypassUsed,
    });
    const result = await service.getEntitlements('access');
    expect(result._unsafeUnwrap()).toEqual(DEV_ENTITLEMENTS);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onBypassUsed).toHaveBeenCalledWith(DEV_ENTITLEMENTS);
  });

  it('propagates AuthError from client', async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(
        err(
          new AuthError({
            code: ErrorCode.AUTH_ENTITLEMENT_REQUIRED,
            message: 'not entitled',
          }),
        ),
      ),
    );
    const service = new EntitlementService({ client: { fetch: fetchFn } });
    const result = await service.getEntitlements('access');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('auth.entitlement_required');
  });
});
