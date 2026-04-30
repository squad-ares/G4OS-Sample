import type { LogStreamLine } from '@g4os/kernel/log-stream';
import type { IpcSnapshot } from '@g4os/observability/ipc';
import type { ListenerLeakSnapshot } from '@g4os/observability/memory';
import { type ReactNode, useEffect, useState } from 'react';
import type {
  HudSnapshot,
  LogsSnapshot,
  MemorySnapshot,
  ProcessTreeSnapshot,
  SessionsSnapshot,
  VaultSnapshot,
} from '../../debug-hud-types.ts';

declare global {
  interface Window {
    debugHud?: {
      subscribe(channel: string, handler: (data: unknown) => void): () => void;
      loadConfig(): Promise<unknown>;
      saveConfig(config: unknown): Promise<void>;
    };
  }
}

type Status = 'ok' | 'warn' | 'critical';

export function App(): ReactNode {
  const snapshot = useHudSnapshot();
  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <Header />
      {snapshot ? (
        <>
          <MemoryCard memory={snapshot.memory} />
          <ProcessTreeCard tree={snapshot.processTree} />
          <ActiveSessionsCard sessions={snapshot.sessions} />
          <ListenerLeakCard listeners={snapshot.listeners} />
          <IpcThroughputCard ipc={snapshot.ipc} />
          <VaultStatusCard vault={snapshot.vault} />
          <LogTailCard logs={snapshot.logs} />
        </>
      ) : (
        <Empty />
      )}
    </div>
  );
}

function Header(): ReactNode {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 8,
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontWeight: 700 }}>G4 OS Debug HUD</span>
      <span style={{ color: 'var(--muted)', fontSize: 10 }}>1Hz · sub-MVP</span>
    </div>
  );
}

function Empty(): ReactNode {
  return <div style={{ color: 'var(--muted)', padding: 12 }}>Aguardando primeiro tick…</div>;
}

function Card(props: { title: string; status: Status; children: React.ReactNode }): ReactNode {
  return (
    <div
      style={{
        border: `1px solid ${statusBorder(props.status)}`,
        borderRadius: 8,
        padding: 8,
        background: 'rgba(0,0,0,0.2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>
          {props.title}
        </span>
        <Dot status={props.status} />
      </div>
      <div style={{ display: 'grid', gap: 4 }}>{props.children}</div>
    </div>
  );
}

function Stat(props: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--muted)' }}>{props.label}</span>
      <span>
        {props.value}
        {props.sub ? (
          <span style={{ color: 'var(--muted)', marginLeft: 6 }}>{props.sub}</span>
        ) : null}
      </span>
    </div>
  );
}

function Dot({ status }: { status: Status }): ReactNode {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: statusBorder(status),
      }}
    />
  );
}

function MemoryCard({ memory }: { memory: MemorySnapshot }): ReactNode {
  const status = statusFromGrowth(memory.growthRateBytesPerSec);
  return (
    <Card title="Memory" status={status}>
      <Stat
        label="heap"
        value={fmtBytes(memory.current.heapUsed)}
        sub={`${fmtBytes(memory.current.heapTotal)} total`}
      />
      <Stat label="rss" value={fmtBytes(memory.current.rss)} />
      <Stat label="ext" value={fmtBytes(memory.current.external)} />
      <Sparkline values={memory.history.map((s) => s.heapUsed)} status={status} />
      <GrowthLabel rate={memory.growthRateBytesPerSec} />
    </Card>
  );
}

function Sparkline({ values, status }: { values: readonly number[]; status: Status }): ReactNode {
  const width = 320;
  const height = 32;
  if (values.length < 2) return <div style={{ height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');
  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block' }}
      role="img"
      aria-label="Memory usage timeline"
    >
      <title>Memory usage timeline</title>
      <polyline
        points={points}
        fill="none"
        stroke={statusBorder(status)}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GrowthLabel({ rate }: { rate: number }): ReactNode {
  const mbPerMin = (rate * 60) / 1_048_576;
  const sign = mbPerMin >= 0 ? '+' : '';
  return (
    <div style={{ color: 'var(--muted)', fontSize: 10 }}>
      growth: {sign}
      {mbPerMin.toFixed(2)} MB/min (60s window)
    </div>
  );
}

// Process Tree. V2 só tem o main (ADR-0145 — sem process isolation).
// Card mostra explícito que é por design.
function ProcessTreeCard({ tree }: { tree: ProcessTreeSnapshot }): ReactNode {
  const total = tree.nodes.length;
  return (
    <Card title={`Processes (${total})`} status="ok">
      {tree.nodes.map((node) => (
        <div key={node.pid} style={{ display: 'grid', gap: 2, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>
              <span style={{ color: 'var(--muted)' }}>{node.kind}</span> {node.label}
            </span>
            <span style={{ color: 'var(--muted)' }}>pid {node.pid}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted)' }}>rss {fmtBytes(node.rssBytes)}</span>
            <span style={{ color: 'var(--muted)', fontSize: 10 }}>
              uptime {fmtDuration(node.uptimeMs)}
            </span>
          </div>
        </div>
      ))}
      {total === 1 ? (
        <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 4 }}>
          ADR-0145: V2 sem worker-per-session. Supervisor virá se métricas justificarem.
        </div>
      ) : null}
    </Card>
  );
}

// Active Sessions — lista turnos em vôo do TurnDispatcher.
function ActiveSessionsCard({ sessions }: { sessions: SessionsSnapshot }): ReactNode {
  const status: Status = sessions.activeCount > 5 ? 'warn' : 'ok';
  return (
    <Card title={`Active Sessions (${sessions.activeCount})`} status={status}>
      {sessions.active.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>Sem turnos em vôo</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {sessions.active.map((row) => (
            <div
              key={`${row.sessionId}-${row.turnId}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 6,
                fontSize: 11,
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ color: 'var(--muted)' }}>session</span> {row.sessionId.slice(0, 12)}…
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {fmtDuration(Date.now() - row.startedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Listener Leak Card.
function ListenerLeakCard({ listeners }: { listeners: ListenerLeakSnapshot }): ReactNode {
  const status = statusFromListenerCount(listeners.total, listeners.stale.length);
  const top = listeners.byEvent.slice(0, 5);
  return (
    <Card title="Listeners" status={status}>
      <Stat label="active" value={String(listeners.total)} />
      {top.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>
          Sem listeners rastreados — instrumente subsistemas com listenerDetector.track()
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {top.map((entry) => (
            <div
              key={entry.event}
              style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}
            >
              <span style={{ color: 'var(--muted)' }}>{entry.event}</span>
              <span>{entry.count}</span>
            </div>
          ))}
        </div>
      )}
      {listeners.stale.length > 0 ? (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--warn)' }}>
          {listeners.stale.length} stale (≥ 60s sem dispose)
        </div>
      ) : null}
    </Card>
  );
}

// IPC Throughput Card.
function IpcThroughputCard({ ipc }: { ipc: IpcSnapshot }): ReactNode {
  const status = statusFromIpc(ipc);
  return (
    <Card title="IPC (tRPC)" status={status}>
      <Stat label="req/s" value={ipc.reqPerSec.toFixed(1)} />
      <Stat label="p50" value={`${ipc.p50Ms.toFixed(0)}ms`} />
      <Stat label="p95" value={`${ipc.p95Ms.toFixed(0)}ms`} />
      <Stat label="errors" value={`${ipc.errorCount} (${(ipc.errorRate * 100).toFixed(1)}%)`} />
      {ipc.topPaths.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>Aguardando primeiros procedures…</div>
      ) : (
        <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
          {ipc.topPaths.map((p) => (
            <div
              key={p.path}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 8,
                fontSize: 10,
              }}
            >
              <span
                style={{
                  color: 'var(--muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.path}
              </span>
              <span>{p.count}×</span>
              <span style={{ color: 'var(--muted)' }}>p95 {p.p95Ms.toFixed(0)}ms</span>
              {p.errors > 0 ? (
                <span style={{ color: 'var(--critical)' }}>{p.errors} err</span>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Vault Status Card.
function VaultStatusCard({ vault }: { vault: VaultSnapshot }): ReactNode {
  const status = statusFromVault(vault);
  const errorRate = vault.counts60s.ops === 0 ? 0 : vault.counts60s.errors / vault.counts60s.ops;
  return (
    <Card title="Credential Vault" status={status}>
      <Stat label="ops/min" value={String(vault.counts60s.ops)} />
      <Stat
        label="errors/min"
        value={`${vault.counts60s.errors} (${(errorRate * 100).toFixed(1)}%)`}
      />
      {vault.lastActivity ? (
        <div style={{ display: 'grid', gap: 2, fontSize: 10 }}>
          <span style={{ color: 'var(--muted)' }}>last activity:</span>
          <VaultActivityRow activity={vault.lastActivity} />
        </div>
      ) : (
        <div style={{ color: 'var(--muted)', fontSize: 10 }}>Sem atividade vault registrada</div>
      )}
      {vault.recentErrors.length > 0 ? (
        <details style={{ marginTop: 4 }}>
          <summary style={{ color: 'var(--warn)', fontSize: 10, cursor: 'pointer' }}>
            {vault.recentErrors.length} recent error{vault.recentErrors.length === 1 ? '' : 's'}
          </summary>
          <div style={{ display: 'grid', gap: 2, marginTop: 4 }}>
            {[...vault.recentErrors].reverse().map((entry, i) => (
              <VaultActivityRow key={i} activity={entry} />
            ))}
          </div>
        </details>
      ) : null}
    </Card>
  );
}

function VaultActivityRow({
  activity,
}: {
  activity: VaultSnapshot['lastActivity'] & object;
}): ReactNode {
  const time = new Date(activity.ts);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  const color =
    activity.level === 'error' || activity.level === 'fatal'
      ? 'var(--critical)'
      : activity.level === 'warn'
        ? 'var(--warn)'
        : 'var(--muted)';
  return (
    <div
      style={{
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontSize: 10,
      }}
    >
      <span style={{ color: 'var(--muted)' }}>
        {hh}:{mm}:{ss}
      </span>
      <span style={{ color, marginLeft: 4 }}>{activity.level}</span>
      {activity.key ? <span style={{ marginLeft: 4 }}>{activity.key}</span> : null}
      <span style={{ color: 'var(--muted)', marginLeft: 4 }}>· {activity.msg}</span>
    </div>
  );
}

// Log Tail Card.
function LogTailCard({ logs }: { logs: LogsSnapshot }): ReactNode {
  const [levelFilter, setLevelFilter] = useState<LogStreamLine['level'] | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = logs.recent.filter((line) => {
    if (levelFilter !== 'all' && line.level !== levelFilter) return false;
    if (query.length > 0) {
      const text = `${line.component} ${line.msg}`.toLowerCase();
      if (!text.includes(query.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <Card title={`Logs (${logs.totalSeen} total)`} status="ok">
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value as typeof levelFilter)}
          style={{
            background: 'transparent',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 10,
            padding: '2px 4px',
          }}
        >
          <option value="all">all</option>
          <option value="trace">trace</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="fatal">fatal</option>
        </select>
        <input
          type="text"
          placeholder="filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: 'transparent',
            color: 'var(--fg)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 10,
            padding: '2px 4px',
          }}
        />
      </div>
      <div
        style={{
          maxHeight: 220,
          overflowY: 'auto',
          fontSize: 10,
          lineHeight: 1.4,
          fontFamily: 'inherit',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: 4 }}>
            {logs.recent.length === 0 ? 'Aguardando logs…' : 'Nenhuma linha bate com o filtro'}
          </div>
        ) : (
          filtered.slice(-100).map((line, i) => <LogLine key={i} line={line} />)
        )}
      </div>
    </Card>
  );
}

function LogLine({ line }: { line: LogStreamLine }): ReactNode {
  const color =
    line.level === 'error' || line.level === 'fatal'
      ? 'var(--critical)'
      : line.level === 'warn'
        ? 'var(--warn)'
        : 'var(--muted)';
  const time = new Date(line.time);
  const hh = String(time.getHours()).padStart(2, '0');
  const mm = String(time.getMinutes()).padStart(2, '0');
  const ss = String(time.getSeconds()).padStart(2, '0');
  return (
    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      <span style={{ color: 'var(--muted)' }}>
        {hh}:{mm}:{ss}
      </span>
      <span style={{ color, marginLeft: 4 }}>{line.level}</span>
      <span style={{ color: 'var(--muted)', marginLeft: 4 }}>[{line.component}]</span>
      <span style={{ marginLeft: 4 }}>{line.msg}</span>
    </div>
  );
}

function statusFromGrowth(bytesPerSec: number): Status {
  const mbPerMin = (bytesPerSec * 60) / 1_048_576;
  if (mbPerMin > 5) return 'critical';
  if (mbPerMin > 2) return 'warn';
  return 'ok';
}

function statusFromListenerCount(total: number, staleCount: number): Status {
  if (staleCount > 0 || total > 100) return 'critical';
  if (total > 50) return 'warn';
  return 'ok';
}

function statusFromIpc(ipc: IpcSnapshot): Status {
  if (ipc.totalCount === 0) return 'ok';
  if (ipc.errorRate > 0.05) return 'critical';
  if (ipc.p95Ms > 1000) return 'warn';
  if (ipc.errorRate > 0) return 'warn';
  return 'ok';
}

function statusFromVault(vault: VaultSnapshot): Status {
  if (vault.counts60s.ops === 0) return 'ok';
  const rate = vault.counts60s.errors / vault.counts60s.ops;
  if (rate > 0.05) return 'critical';
  if (vault.recentErrors.length > 0) return 'warn';
  return 'ok';
}

function statusBorder(status: Status): string {
  if (status === 'critical') return 'var(--critical)';
  if (status === 'warn') return 'var(--warn)';
  return 'var(--ok)';
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

function useHudSnapshot(): HudSnapshot | null {
  const [snapshot, setSnapshot] = useState<HudSnapshot | null>(null);
  useEffect(() => {
    if (!window.debugHud) return;
    const unsub = window.debugHud.subscribe('snapshot', (data: unknown) => {
      setSnapshot(data as HudSnapshot);
    });
    return unsub;
  }, []);
  return snapshot;
}
