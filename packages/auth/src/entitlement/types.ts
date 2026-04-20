export type EntitlementRole = 'owner' | 'admin' | 'member';
export type EntitlementTier = 'standard' | 'pro' | 'enterprise' | 'internal';
export type EntitlementStatus = 'active' | 'blocked' | 'invited';
export type ModelTier = 'smart' | 'balanced' | 'fast';

export interface Entitlements {
  readonly email: string;
  readonly role: EntitlementRole;
  readonly tier: EntitlementTier;
  readonly status: EntitlementStatus;
  readonly allowedModelTiers: readonly ModelTier[];
  readonly canAccessG4: boolean;
  readonly canAccessPublic: boolean;
  readonly domainAllowedForG4: boolean;
}

export const DEV_ENTITLEMENTS: Entitlements = {
  email: 'dev@local',
  role: 'member',
  tier: 'internal',
  status: 'active',
  allowedModelTiers: ['smart', 'balanced', 'fast'],
  canAccessG4: true,
  canAccessPublic: true,
  domainAllowedForG4: true,
};
