import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class AgentError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `agent.${string}`> },
  ) {
    super(options);
    this.name = 'AgentError';
  }

  static unavailable(provider: string, cause?: unknown): AgentError {
    return new AgentError({
      code: ErrorCode.AGENT_UNAVAILABLE,
      message: `Agent unavailable: ${provider}`,
      context: { provider },
      cause,
    });
  }

  static rateLimited(provider: string, retryAfterMs?: number): AgentError {
    return new AgentError({
      code: ErrorCode.AGENT_RATE_LIMITED,
      message: `Rate limited by provider: ${provider}`,
      context: { provider, retryAfterMs },
    });
  }

  static invalidInput(detail: string): AgentError {
    return new AgentError({
      code: ErrorCode.AGENT_INVALID_INPUT,
      message: `Invalid agent input: ${detail}`,
      context: { detail },
    });
  }

  static network(provider: string, cause?: unknown): AgentError {
    return new AgentError({
      code: ErrorCode.AGENT_NETWORK,
      message: `Network error for provider: ${provider}`,
      context: { provider },
      cause,
    });
  }

  static invalidApiKey(provider: string, cause?: unknown): AgentError {
    return new AgentError({
      code: ErrorCode.AGENT_INVALID_API_KEY,
      message: `Invalid API key for provider: ${provider}`,
      context: { provider },
      cause,
    });
  }
}
