import { SourceError } from '@g4os/kernel/errors';
import type { SourceRegistry } from '../interface/registry.ts';
import type { ISource } from '../interface/source.ts';
import type { IntentContext, SourceIntent, SourceIntentDetector } from './intent-detector.ts';

export interface ActivationFailure {
  readonly slug: string;
  readonly error: SourceError;
}

export interface ActivationResult {
  readonly activated: readonly string[];
  readonly needsAuth: readonly string[];
  readonly failed: readonly ActivationFailure[];
}

export interface TurnPlan {
  readonly intent: SourceIntent;
  readonly nativeSources: readonly string[];
  readonly brokeredSources: readonly string[];
}

export interface PlanTurnInput {
  readonly sessionId: string;
  readonly message: string;
  readonly context: IntentContext;
  readonly enabledNativeSources?: readonly string[];
}

export class SourceLifecycleManager {
  private readonly sticky = new Map<string, Set<string>>();
  private readonly rejected = new Map<string, Set<string>>();

  constructor(
    private readonly registry: SourceRegistry,
    private readonly detector: SourceIntentDetector,
  ) {}

  planTurn(input: PlanTurnInput): TurnPlan {
    const intent = this.detector.detect(input.message, input.context);
    const rejected = this.rejected.get(input.sessionId) ?? new Set<string>();
    const sticky = this.sticky.get(input.sessionId) ?? new Set<string>();

    const requested = intent.sources.filter((s) => !rejected.has(s));
    const brokered = Array.from(new Set([...sticky, ...requested])).filter((s) => !rejected.has(s));

    return {
      intent,
      nativeSources: input.enabledNativeSources ?? [],
      brokeredSources: brokered,
    };
  }

  async activateBrokered(sessionId: string, slugs: readonly string[]): Promise<ActivationResult> {
    const activated: string[] = [];
    const needsAuth: string[] = [];
    const failed: ActivationFailure[] = [];

    for (const slug of slugs) {
      const source = this.registry.get(slug);
      if (!source) {
        failed.push({ slug, error: sourceNotFound(slug) });
        continue;
      }
      const outcome = await this.tryActivate(source);
      if (outcome === 'activated') {
        activated.push(slug);
        this.markSticky(sessionId, slug);
      } else if (outcome.code === 'source.auth_required') {
        needsAuth.push(slug);
      } else {
        failed.push({ slug, error: outcome });
      }
    }

    return { activated, needsAuth, failed };
  }

  markRejected(sessionId: string, slug: string): void {
    const set = this.rejected.get(sessionId) ?? new Set<string>();
    set.add(slug);
    this.rejected.set(sessionId, set);
    const sticky = this.sticky.get(sessionId);
    sticky?.delete(slug);
  }

  clearRejected(sessionId: string, slug: string): void {
    this.rejected.get(sessionId)?.delete(slug);
  }

  isRejected(sessionId: string, slug: string): boolean {
    return this.rejected.get(sessionId)?.has(slug) ?? false;
  }

  stickyFor(sessionId: string): readonly string[] {
    return Array.from(this.sticky.get(sessionId) ?? []);
  }

  clearSession(sessionId: string): void {
    this.sticky.delete(sessionId);
    this.rejected.delete(sessionId);
  }

  private markSticky(sessionId: string, slug: string): void {
    const set = this.sticky.get(sessionId) ?? new Set<string>();
    set.add(slug);
    this.sticky.set(sessionId, set);
  }

  private async tryActivate(source: ISource): Promise<'activated' | SourceError> {
    const result = await source.activate();
    return result.isOk() ? 'activated' : result.error;
  }
}

function sourceNotFound(slug: string): SourceError {
  return SourceError.notFound(slug);
}
