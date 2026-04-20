import { DisposableBase } from '@g4os/kernel/disposable';
import { err, ok, type Result } from 'neverthrow';
import { OAuthError } from './types.ts';

interface Pending {
  readonly resolve: (params: URLSearchParams) => void;
  readonly reject: (error: OAuthError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface CallbackHandlerOptions {
  readonly protocols?: readonly string[];
  readonly pathname?: string;
  readonly defaultTimeoutMs?: number;
}

export class OAuthCallbackHandler extends DisposableBase {
  private readonly pending = new Map<string, Pending>();
  private readonly protocols: readonly string[];
  private readonly pathname: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: CallbackHandlerOptions = {}) {
    super();
    this.protocols = options.protocols ?? ['g4os:', 'g4os-internal:'];
    this.pathname = options.pathname ?? '/callback';
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 5 * 60 * 1000;
  }

  handleDeepLink(rawUrl: string): boolean {
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (!this.protocols.includes(parsed.protocol)) return false;
    if (parsed.pathname !== this.pathname) return false;

    const state = parsed.searchParams.get('state');
    if (!state) return false;
    return this.resolveState(state, parsed.searchParams);
  }

  handleParams(params: URLSearchParams): boolean {
    const state = params.get('state');
    if (!state) return false;
    return this.resolveState(state, params);
  }

  waitFor(
    state: string,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<Result<URLSearchParams, OAuthError>> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const entry = this.pending.get(state);
        if (entry) {
          this.pending.delete(state);
          entry.reject(OAuthError.timeout());
        }
      }, timeoutMs);

      this.pending.set(state, {
        resolve: (params) => resolve(ok(params)),
        reject: (error) => resolve(err(error)),
        timer,
      });
    });
  }

  private resolveState(state: string, params: URLSearchParams): boolean {
    const entry = this.pending.get(state);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(state);
    entry.resolve(params);
    return true;
  }

  override dispose(): void {
    for (const [state, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(OAuthError.pendingNotFound());
      this.pending.delete(state);
    }
    super.dispose();
  }
}
