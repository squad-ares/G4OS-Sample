/**
 * Tipos compartilhados do Debug HUD — importados tanto pelo main process
 * (aggregator) quanto pelo renderer (app.tsx).
 *
 * Motivo da separação: renderer não pode importar de `src/main/**`
 * (boundary `renderer-no-electron`). Tipos puros ficam aqui, num módulo
 * neutro fora de ambas as pastas.
 */

import type { LogStreamLine } from '@g4os/kernel/log-stream';
import type { IpcSnapshot } from '@g4os/observability/ipc';
import type { ListenerLeakSnapshot } from '@g4os/observability/memory';

export interface MemorySample {
  readonly ts: number;
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly rss: number;
}

export interface MemorySnapshot {
  readonly current: MemorySample;
  readonly history: readonly MemorySample[];
  readonly growthRateBytesPerSec: number;
}

export interface LogsSnapshot {
  readonly recent: readonly LogStreamLine[];
  readonly totalSeen: number;
}

export interface VaultActivity {
  readonly ts: number;
  readonly level: LogStreamLine['level'];
  readonly key: string | undefined;
  readonly msg: string;
}

export interface VaultSnapshot {
  readonly lastActivity: VaultActivity | undefined;
  readonly recentErrors: readonly VaultActivity[];
  readonly counts60s: {
    readonly ops: number;
    readonly errors: number;
  };
}

export interface ProcessNodeSnapshot {
  readonly kind: 'main' | 'session-worker' | 'mcp-stdio' | 'cpu-worker' | 'unknown';
  readonly pid: number;
  readonly label: string;
  readonly rssBytes: number;
  readonly heapUsedBytes?: number;
  readonly uptimeMs: number;
}

export interface ProcessTreeSnapshot {
  readonly nodes: readonly ProcessNodeSnapshot[];
}

export interface ActiveSessionRow {
  readonly sessionId: string;
  readonly turnId: string;
  readonly startedAt: number;
}

export interface SessionsSnapshot {
  readonly activeCount: number;
  readonly active: readonly ActiveSessionRow[];
}

export interface HudSnapshot {
  readonly ts: number;
  readonly memory: MemorySnapshot;
  readonly listeners: ListenerLeakSnapshot;
  readonly logs: LogsSnapshot;
  readonly vault: VaultSnapshot;
  readonly ipc: IpcSnapshot;
  readonly processTree: ProcessTreeSnapshot;
  readonly sessions: SessionsSnapshot;
}
