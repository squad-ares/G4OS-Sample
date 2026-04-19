import { join } from 'node:path';
import { type Level, pino, transport as pinoTransport } from 'pino';
import { type Logger, REDACT_CENSOR, REDACT_PATHS, wrapPinoLogger } from './logger.ts';

export interface ProductionTransportOptions {
  readonly logsDir: string;
  readonly frequency?: 'daily' | 'hourly' | number;
  readonly maxSize?: string;
  readonly historyCount?: number;
  readonly level?: Level;
}

export interface PinoTarget {
  readonly target: string;
  readonly level: Level;
  readonly options: Record<string, unknown>;
}

export interface PinoMultiTransport {
  readonly targets: readonly PinoTarget[];
}

const DEFAULT_FREQUENCY: ProductionTransportOptions['frequency'] = 'daily';
const DEFAULT_MAX_SIZE = '100M';
const DEFAULT_HISTORY = 7;

export function createProductionTransport(options: ProductionTransportOptions): PinoMultiTransport {
  const frequency = options.frequency ?? DEFAULT_FREQUENCY;
  const size = options.maxSize ?? DEFAULT_MAX_SIZE;
  const count = options.historyCount ?? DEFAULT_HISTORY;

  return {
    targets: [
      {
        target: 'pino-roll',
        level: 'info',
        options: {
          file: join(options.logsDir, 'app.log'),
          frequency,
          size,
          mkdir: true,
          limit: { count },
        },
      },
      {
        target: 'pino-roll',
        level: 'error',
        options: {
          file: join(options.logsDir, 'error.log'),
          frequency,
          size,
          mkdir: true,
          limit: { count },
        },
      },
    ],
  };
}

export function createProductionLogger(options: ProductionTransportOptions): Logger {
  const transport = pinoTransport(createProductionTransport(options) as never);
  const inner = pino(
    {
      level: options.level ?? 'info',
      redact: { paths: [...REDACT_PATHS], censor: REDACT_CENSOR },
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    transport,
  );
  return wrapPinoLogger(inner);
}
