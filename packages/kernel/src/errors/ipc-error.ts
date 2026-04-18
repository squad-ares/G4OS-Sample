import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class IpcError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `ipc.${string}`> },
  ) {
    super(options);
    this.name = 'IpcError';
  }

  static handlerNotFound(channel: string): IpcError {
    return new IpcError({
      code: ErrorCode.IPC_HANDLER_NOT_FOUND,
      message: `IPC handler not found: ${channel}`,
      context: { channel },
    });
  }

  static invalidPayload(channel: string, cause?: unknown): IpcError {
    return new IpcError({
      code: ErrorCode.IPC_INVALID_PAYLOAD,
      message: `Invalid payload on channel: ${channel}`,
      context: { channel },
      cause,
    });
  }

  static timeout(channel: string, timeoutMs: number): IpcError {
    return new IpcError({
      code: ErrorCode.IPC_TIMEOUT,
      message: `IPC timeout on channel: ${channel}`,
      context: { channel, timeoutMs },
    });
  }
}
