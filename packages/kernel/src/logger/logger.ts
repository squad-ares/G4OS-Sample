import { type Level, type Logger as PinoLogger, pino } from 'pino';

export interface LogContext {
  workspaceId?: string;
  sessionId?: string;
  messageId?: string;
  userId?: string;

  requestId?: string;
  traceId?: string;
  spanId?: string;

  component?: string;
  operation?: string;

  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = [
  'apiKey',
  'api_key',
  'anthropicApiKey',
  'ANTHROPIC_API_KEY',
  'openaiApiKey',
  'OPENAI_API_KEY',
  'geminiApiKey',
  'GEMINI_API_KEY',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'authToken',
  'auth_token',
  'token',
  'password',
  'pwd',
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'x-api-key',
];

export const REDACT_PATHS: readonly string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  ...SENSITIVE_KEYS.map((k) => `*.*.${k}`),
];

export const REDACT_CENSOR = '[REDACTED]';

const defaultLevel: Level = (process.env['LOG_LEVEL'] ?? 'info') as Level;
const isDev = process.env['NODE_ENV'] === 'development';

const baseLogger = pino({
  level: defaultLevel,
  redact: {
    paths: [...REDACT_PATHS],
    censor: REDACT_CENSOR,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
});

export interface Logger {
  child(context: LogContext): Logger;
  trace(ctx: LogContext | string, msg?: string): void;
  debug(ctx: LogContext | string, msg?: string): void;
  info(ctx: LogContext | string, msg?: string): void;
  warn(ctx: LogContext | string, msg?: string): void;
  error(ctx: LogContext | string, msg?: string): void;
  fatal(ctx: LogContext | string, msg?: string): void;
}

export function wrapPinoLogger(inner: PinoLogger): Logger {
  const log =
    (level: Level) =>
    (ctx: LogContext | string, msg?: string): void => {
      if (typeof ctx === 'string') {
        (inner[level] as (msg: string) => void)(ctx);
      } else {
        (inner[level] as (obj: object, msg?: string) => void)(ctx, msg);
      }
    };

  return {
    child: (context) => wrapPinoLogger(inner.child(context)),
    trace: log('trace'),
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    fatal: log('fatal'),
  };
}

export const logger = wrapPinoLogger(baseLogger);
export function createLogger(component: string): Logger {
  return logger.child({ component });
}
