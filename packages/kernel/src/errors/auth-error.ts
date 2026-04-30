import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class AuthError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `auth.${string}`> },
  ) {
    super(options);
    this.name = 'AuthError';
  }

  static notAuthenticated(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_NOT_AUTHENTICATED,
      message: 'User is not authenticated',
    });
  }

  static tokenExpired(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_TOKEN_EXPIRED,
      message: 'Authentication token expired',
    });
  }

  static otpInvalid(): AuthError {
    return new AuthError({ code: ErrorCode.AUTH_OTP_INVALID, message: 'Invalid OTP code' });
  }

  static entitlementRequired(feature: string): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_ENTITLEMENT_REQUIRED,
      message: `Entitlement required: ${feature}`,
      context: { feature },
    });
  }

  static bootstrapFailed(message: string): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_BOOTSTRAP_FAILED,
      message: `Bootstrap failed: ${message}`,
      context: { reason: message },
    });
  }

  /**
   * Sinaliza calls em service já disposto (race entre logout/quit e operações
   * em vôo). Caller decide se ignora ou propaga.
   */
  static disposed(): AuthError {
    return new AuthError({
      code: ErrorCode.AUTH_DISPOSED,
      message: 'Auth service has been disposed',
    });
  }
}
