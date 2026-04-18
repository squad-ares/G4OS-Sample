import { type Level, type Logger as PinoLogger, pino } from 'pino';

export interface LogContext {
  // Identificação
  workspaceId?: string;
  sessionId?: string;
  messageId?: string;
  userId?: string;

  // Request tracing
  requestId?: string;
  traceId?: string;
  spanId?: string;

  // Componente
  component?: string;
  operation?: string;

  // Metrics
  durationMs?: number;
  [key: string]: unknown;
}

const REDACT_PATHS = [
  // API keys
  '*.apiKey',
  '*.api_key',
  '*.anthropicApiKey',
  '*.ANTHROPIC_API_KEY',
  '*.openaiApiKey',
  '*.OPENAI_API_KEY',
  '*.geminiApiKey',
  '*.GEMINI_API_KEY',
  // Tokens
  '*.accessToken',
  '*.access_token',
  '*.refreshToken',
  '*.refresh_token',
  '*.authToken',
  '*.auth_token',
  '*.token',
  // Passwords
  '*.password',
  '*.pwd',
  // Headers
  '*.authorization',
  '*.Authorization',
  '*.cookie',
  '*.Cookie',
  '*.x-api-key',
];

const baseLogger = pino({
  level: (process.env['LOG_LEVEL'] ?? 'info') as Level,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(process.env['NODE_ENV'] === 'development' && {
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

function wrap(inner: PinoLogger): Logger {
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
    child: (context) => wrap(inner.child(context)),
    trace: log('trace'),
    debug: log('debug'),
    info: log('info'),
    warn: log('warn'),
    error: log('error'),
    fatal: log('fatal'),
  };
}

export const logger = wrap(baseLogger);
export function createLogger(component: string): Logger {
  return logger.child({ component });
}
