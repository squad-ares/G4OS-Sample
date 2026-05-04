/**
 * Probe leve para sources `mcp-stdio` — spawna o binário configurado,
 * envia um `initialize` JSON-RPC e aguarda a resposta com timeout curto.
 *
 * NÃO substitui o `McpClient` real (que faz handshake completo, negocia
 * capabilities e mantém a conexão viva). É um preflight para
 * `SourcesService.testConnection` e para distinguir "binário quebrado"
 * de "binário OK mas sem auth" sem precisar ativar o source no broker.
 *
 * DI-friendly: aceita um `spawn` injetável para permitir testes com
 * subprocess fake. Sem essa injeção, usa `node:child_process.spawn`.
 */

import type { ChildProcess, SpawnOptions } from 'node:child_process';

export interface McpStdioProbeConfig {
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /** Default: 5000ms. */
  readonly timeoutMs?: number;
}

export type McpStdioProbeResult = 'connected' | 'needs_auth' | 'error';

export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface ProbeDeps {
  /** Defaults to `child_process.spawn` carregado via dynamic import. */
  readonly spawn?: SpawnFn;
}

const DEFAULT_TIMEOUT_MS = 5_000;

export async function probeMcpStdio(
  config: McpStdioProbeConfig,
  deps: ProbeDeps = {},
): Promise<McpStdioProbeResult> {
  const spawn = deps.spawn ?? (await loadDefaultSpawn());
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<McpStdioProbeResult>((resolve) => {
    let settled = false;
    const finish = (r: McpStdioProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill('SIGKILL');
      } catch {
        // process already gone; ignore
      }
      resolve(r);
    };

    const child = spawn(config.command, config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      // ADR-0050: secrets do main process (ANTHROPIC_API_KEY, SUPABASE_*, etc.)
      // nunca devem vazar para binários de terceiros. Usamos allowlist mínima
      // suficiente para resolver o binário via PATH e executar normalmente.
      env: buildProbeEnv(config.env),
      shell: false,
    });

    const timer = setTimeout(() => finish('error'), timeoutMs);

    child.on('error', () => finish('error'));
    child.on('exit', (code, signal) => {
      // Saída limpa é OK se já resolvemos via stdout. Saída sem resposta = erro.
      if (!settled && (code !== 0 || signal !== null)) finish('error');
    });

    let buffer = '';
    const stdout = child.stdout;
    if (!stdout) {
      finish('error');
      return;
    }
    stdout.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const verdict = classifyLine(line);
        if (verdict !== null) {
          finish(verdict);
          return;
        }
      }
    });

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'g4os-probe', version: '0.1.0' },
      },
    };
    child.stdin?.write(`${JSON.stringify(req)}\n`);
  });
}

/**
 * Vars de ambiente mínimas para execução segura do probe. Exclui qualquer
 * secret do main process (API keys, tokens de supabase, etc.). O subprocess
 * recebe apenas o que precisa para resolver o binário e seu runtime.
 */
const PROBE_ENV_ALLOWLIST = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SHELL'] as const;

function buildProbeEnv(configEnv?: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  const base: Record<string, string> = {};
  for (const key of PROBE_ENV_ALLOWLIST) {
    // biome-ignore lint/style/noProcessEnv: leitura individual de var da allowlist — não spread completo
    const value = process.env[key];
    if (value !== undefined) base[key] = value;
  }
  return { ...base, ...(configEnv ?? {}) } as NodeJS.ProcessEnv;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Retorna o verdict quando a linha é conclusiva, senão `null` (continua lendo). */
function classifyLine(line: string): McpStdioProbeResult | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parsed = tryParseJson(trimmed);
  if (!parsed || typeof parsed !== 'object') return null;
  const msg = parsed as { id?: unknown; result?: unknown; error?: { message?: unknown } };
  if (msg.id === 1 && msg.result !== undefined) return 'connected';
  if (msg.error) {
    const emsg = String(msg.error.message ?? '').toLowerCase();
    if (emsg.includes('auth') || emsg.includes('unauthor')) return 'needs_auth';
    return 'error';
  }
  return null;
}

async function loadDefaultSpawn(): Promise<SpawnFn> {
  const specifier = 'node:child_process';
  const mod = (await import(/* @vite-ignore */ specifier)) as typeof import('node:child_process');
  return mod.spawn as SpawnFn;
}
