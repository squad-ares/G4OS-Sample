/**
 * `McpMountRegistry` — per-session cache de sources `brokerFallback` ativos.
 *
 * Responsabilidades:
 *   - Dado um set de slugs sticky + seus `SourceConfig`, garantir que cada
 *     source está criado e ativado exatamente uma vez, reaproveitando a
 *     instância em turnos seguintes.
 *   - Expor `MountedSource` (slug + instance + tools list) para o adapter
 *     transformar em `ToolHandler`s pro `ToolCatalog`.
 *   - Dispose composto: fecha subprocessos/transportes de todas as sources
 *     montadas quando a sessão encerra ou o registry é descartado.
 *
 * Escopo intencional: não monta `native_deferred` (Anthropic direct MCP) nem
 * `filesystem_direct` (acesso via Read/Grep/Glob). Só `brokerFallback`.
 */

import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ISource, SourceConfig, SourceFactory, ToolDefinition } from '../interface/index.ts';

const log = createLogger('mcp-mount-registry');

// CR6-04: ensureMounted no caminho hot do turn não pode ficar bloqueado se um
// MCP stdio subprocess hang ou um server HTTP estagnar. ADR-0143 já usa 5s no
// probe; aqui damos uma folga porque activate pode envolver handshake real.
const DEFAULT_ACTIVATE_TIMEOUT_MS = 10_000;
const DEFAULT_LIST_TOOLS_TIMEOUT_MS = 5_000;

export interface MountedSource {
  readonly slug: string;
  readonly source: ISource;
  readonly tools: readonly ToolDefinition[];
}

export interface MountRegistryDeps {
  readonly factories: readonly SourceFactory[];
  readonly activateTimeoutMs?: number;
  readonly listToolsTimeoutMs?: number;
}

export class McpMountRegistry extends DisposableBase {
  readonly #factories: readonly SourceFactory[];
  readonly #mounted = new Map<string, MountedSource>();
  readonly #activateTimeoutMs: number;
  readonly #listToolsTimeoutMs: number;

  constructor(deps: MountRegistryDeps) {
    super();
    this.#factories = deps.factories;
    this.#activateTimeoutMs = deps.activateTimeoutMs ?? DEFAULT_ACTIVATE_TIMEOUT_MS;
    this.#listToolsTimeoutMs = deps.listToolsTimeoutMs ?? DEFAULT_LIST_TOOLS_TIMEOUT_MS;
  }

  /**
   * Garante que todos os `configs` estão ativados. Sources já no cache são
   * reaproveitadas. Sources com ativação falha são logadas e puladas —
   * retornamos só o subconjunto que subiu OK.
   */
  async ensureMounted(configs: readonly SourceConfig[]): Promise<readonly MountedSource[]> {
    const results: MountedSource[] = [];
    for (const config of configs) {
      const cached = this.#mounted.get(config.slug);
      if (cached) {
        results.push(cached);
        continue;
      }
      const mounted = await this.#tryMount(config);
      if (mounted) results.push(mounted);
    }
    return results;
  }

  getMounted(slug: string): MountedSource | undefined {
    return this.#mounted.get(slug);
  }

  getAll(): readonly MountedSource[] {
    return Array.from(this.#mounted.values());
  }

  async unmount(slug: string): Promise<void> {
    const m = this.#mounted.get(slug);
    if (!m) return;
    this.#mounted.delete(slug);
    try {
      await m.source.deactivate();
    } catch (e) {
      log.warn({ slug, err: String(e) }, 'deactivate threw during unmount');
    }
    m.source.dispose();
  }

  override dispose(): void {
    for (const m of this.#mounted.values()) {
      try {
        void m.source.deactivate();
      } catch (e) {
        log.warn({ slug: m.slug, err: String(e) }, 'deactivate threw during dispose');
      }
      m.source.dispose();
    }
    this.#mounted.clear();
    super.dispose();
  }

  async #tryMount(config: SourceConfig): Promise<MountedSource | null> {
    const factory = this.#factories.find((f) => f.supports(config));
    if (!factory) {
      log.debug({ slug: config.slug, kind: config.kind }, 'no factory supports kind');
      return null;
    }
    let source: ISource;
    try {
      source = factory.create(config);
    } catch (e) {
      log.warn({ slug: config.slug, err: String(e) }, 'factory.create threw');
      return null;
    }
    // Registra dispose cedo — se activate/listTools falharem, ainda limpamos.
    this._register(toDisposable(() => source.dispose()));

    const activateResult = await withTimeout(
      source.activate(),
      this.#activateTimeoutMs,
      `source activate timed out (${config.slug})`,
    );
    if (activateResult === null) {
      log.warn(
        { slug: config.slug, timeoutMs: this.#activateTimeoutMs },
        'source activate timeout',
      );
      // CR7: simétrico com o caminho de listTools — best-effort deactivate
      // pra encerrar subprocess/transport iniciado no `source.activate()`
      // mesmo que o handshake não tenha completado. Sem isso, MCP stdio
      // subprocesses ficam pendurados quando activate trava.
      await source.deactivate().catch(() => undefined);
      return null;
    }
    if (activateResult.isErr()) {
      log.warn({ slug: config.slug, err: activateResult.error.message }, 'source activate failed');
      // Mesma simetria: activate retornou Err, mas pode ter parcialmente
      // alocado recursos antes — deactivate best-effort.
      await source.deactivate().catch(() => undefined);
      return null;
    }

    const toolsResult = await withTimeout(
      source.listTools(),
      this.#listToolsTimeoutMs,
      `listTools timed out (${config.slug})`,
    );
    if (toolsResult === null) {
      log.warn(
        { slug: config.slug, timeoutMs: this.#listToolsTimeoutMs },
        'listTools timeout after activate',
      );
      await source.deactivate().catch(() => undefined);
      return null;
    }
    if (toolsResult.isErr()) {
      log.warn(
        { slug: config.slug, err: toolsResult.error.message },
        'listTools failed after activate',
      );
      await source.deactivate().catch(() => undefined);
      return null;
    }

    const entry: MountedSource = {
      slug: config.slug,
      source,
      tools: toolsResult.value,
    };
    this.#mounted.set(config.slug, entry);
    return entry;
  }
}

/**
 * Resolve com `null` quando ultrapassa `timeoutMs`. Não usamos `p-timeout`
 * para não adicionar dep — o sinal é simples: timeout = trate como falha,
 * source não monta neste turn (próximo turn pode tentar de novo).
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, _label: string): Promise<T | null> {
  return new Promise<T | null>((resolve, reject) => {
    let settled = false;
    const handle = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    handle.unref?.();
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(handle);
        resolve(value);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(handle);
        reject(err);
      },
    );
  });
}
