/**
 * SourcePlanner — classifica sources ativas de uma sessão em 3 categorias
 * (`native_deferred` / `broker_fallback` / `filesystem_direct`) por turn.
 *
 * ADR-0086 (V1) define que sources não são todas montadas por default:
 *  - `native_deferred`: API remotas/MCP HTTP — anexadas ao prompt como
 *    ferramentas (lazy, carregadas pelo provider em demand).
 *  - `broker_fallback`: MCP stdio + managed connectors locais — dormentes
 *    até o agent chamar `activate_sources` ou o usuário pedir explicitamente.
 *  - `filesystem_direct`: pastas locais acessíveis via `Read`/`Glob`/`Grep`/
 *    `LS` diretamente pelo agent — não entram em broker.
 *
 * Phase 1 (OUTLIER-10 MVP): produz apenas o plano estruturado. Chamadores
 * em main (`TurnDispatcher`) usam o plano pra compor o system prompt
 * contextual. Ativação real dos brokers vira em fases posteriores quando
 * os handlers managed/MCP stdio estiverem implementados.
 */

import type { SourceConfigView } from '@g4os/kernel/types';

export type SourceBucket = 'native_deferred' | 'broker_fallback' | 'filesystem_direct';

export interface SourcePlanItem {
  readonly slug: string;
  readonly displayName: string;
  readonly bucket: SourceBucket;
  readonly kind: SourceConfigView['kind'];
  readonly status: SourceConfigView['status'];
}

export interface SourcePlan {
  readonly nativeDeferred: readonly SourcePlanItem[];
  readonly brokerFallback: readonly SourcePlanItem[];
  readonly filesystemDirect: readonly SourcePlanItem[];
  readonly rejected: readonly string[];
  readonly sticky: readonly string[];
}

export interface SourcePlanInput {
  /** Sources do workspace atual, já filtradas por `enabled=true`. Plano cruza
   *  com `sessionEnabledSlugs` pra decidir o que entra de fato na turn. */
  readonly enabledSources: readonly SourceConfigView[];
  /**
   * Slugs escolhidos no SourcePicker da sessão. Se `undefined`, toda fonte
   * enabled no workspace entra (modo default pre-OUTLIER-18). Se `[]`, nada
   * entra (usuário desabilitou todas as fontes pra esta sessão).
   */
  readonly sessionEnabledSlugs?: readonly string[];
  /** Slugs mountados "sticky" na sessão (persistem entre turns até remoção). */
  readonly stickySlugs: readonly string[];
  /** Slugs vetados na sessão ("don't use X"). Não mountar. */
  readonly rejectedSlugs: readonly string[];
}

export function planTurn(input: SourcePlanInput): SourcePlan {
  const rejectedSet = new Set(input.rejectedSlugs);
  const stickySet = new Set(input.stickySlugs);
  const sessionEnabledSet =
    input.sessionEnabledSlugs === undefined ? null : new Set(input.sessionEnabledSlugs);

  const nativeDeferred: SourcePlanItem[] = [];
  const brokerFallback: SourcePlanItem[] = [];
  const filesystemDirect: SourcePlanItem[] = [];

  for (const source of input.enabledSources) {
    if (rejectedSet.has(source.slug)) continue;
    if (sessionEnabledSet !== null && !sessionEnabledSet.has(source.slug)) continue;
    const bucket = classifyBucket(source);
    const item: SourcePlanItem = {
      slug: source.slug,
      displayName: source.displayName,
      bucket,
      kind: source.kind,
      status: source.status,
    };
    if (bucket === 'native_deferred') nativeDeferred.push(item);
    else if (bucket === 'filesystem_direct') filesystemDirect.push(item);
    else brokerFallback.push(item);
  }

  return {
    nativeDeferred,
    brokerFallback,
    filesystemDirect,
    rejected: [...rejectedSet],
    sticky: [...stickySet],
  };
}

/**
 * ADR-0086 classification:
 *   - `mcp-http`, `api`, `managed` → native_deferred (provider attaches tools
 *     lazily via its own mechanism; managed connectors fall here because
 *     they speak HTTP against G4 OS-hosted endpoints).
 *   - `filesystem` → filesystem_direct (agent reads via `read_file`/`list_dir`).
 *   - `mcp-stdio` → broker_fallback (local subprocess, needs explicit activate).
 */
function classifyBucket(source: SourceConfigView): SourceBucket {
  switch (source.kind) {
    case 'mcp-http':
    case 'api':
    case 'managed':
      return 'native_deferred';
    case 'filesystem':
      return 'filesystem_direct';
    default:
      return 'broker_fallback';
  }
}

/**
 * Formata o plano como linha curta de system prompt contextual, para que o
 * agent saiba o que está disponível sem mountar tudo upfront.
 *
 * Exemplo output:
 *   "Available sources: Gmail (managed, needs_auth), GitHub (managed, disconnected).
 *    Rejected: hubspot."
 */
export function formatPlanForPrompt(plan: SourcePlan): string {
  const parts: string[] = [];
  const all = [...plan.nativeDeferred, ...plan.brokerFallback, ...plan.filesystemDirect];
  // Hide sources that are not connected yet — model would misuse them otherwise.
  // Agent must call `activate_sources` (broker_fallback) or receive auth CTA
  // from UI before the source becomes visible in the prompt.
  const ready = all.filter((s) => s.status === 'connected');
  if (ready.length === 0) {
    parts.push('No workspace sources are currently available.');
  } else {
    const listed = ready
      .map((s) => {
        const sticky = plan.sticky.includes(s.slug) ? ' *mounted*' : '';
        return `${s.displayName} (${s.kind}${sticky})`;
      })
      .join(', ');
    parts.push(`Available sources: ${listed}.`);
  }
  const pending = all.filter((s) => s.status !== 'connected').map((s) => s.slug);
  if (pending.length > 0) {
    parts.push(
      `Not connected (use activate_sources or ask user to authorize): ${pending.join(', ')}.`,
    );
  }
  if (plan.rejected.length > 0) {
    parts.push(`Rejected by user: ${plan.rejected.join(', ')}.`);
  }
  return parts.join(' ');
}
