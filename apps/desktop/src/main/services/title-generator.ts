/**
 * TitleGeneratorService — gera título de session em duas fases (paridade V1):
 *
 * 1. **`scheduleImmediateFromFirstMessage`** (1º turno): trunca a primeira
 *    user msg e grava como título imediato. Sem chamada ao LLM, sem latência.
 *    Garante que sub-sidebar mostre algo significativo logo após enviar a
 *    primeira mensagem em vez de "Nova sessão".
 *
 * 2. **`scheduleGeneration`** (≥2º turno): chama Anthropic Haiku para gerar
 *    título refinado baseado em contexto (user msgs + 1ª resposta assistant).
 *    Fire-and-forget; falhas são silenciosas (usuário sempre pode renomear
 *    manualmente).
 *
 * Em ambos os caminhos:
 *   - Detecta default name via `defaultNames` array (`'Nova sessão'`,
 *     `'New session'`); só sobrescreve se o nome atual ainda é default OU
 *     o título inicial truncado da 1ª msg (pra permitir refinement na 2ª).
 *   - Emite `session.renamed` via `eventBus + emitLifecycleEvent` para sync
 *     instantâneo da UI sem reload (paridade V1 `title_generated`).
 *   - AbortController de 8s no LLM call evita pendurar background.
 *
 * Implementação V1 espelhada: `apps/electron/src/main/sessions/turn-dispatcher.ts`
 * (initial truncate em isFirstUserMessage + `generateTitleDeferred` no 2º turn).
 */

import type { CredentialVault } from '@g4os/credentials';
import type { AppDb } from '@g4os/data';
import { applyEvent } from '@g4os/data/events';
import type { SessionsRepository } from '@g4os/data/sessions';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { Message, Session, SessionId } from '@g4os/kernel/types';
import { emitLifecycleEvent, type SessionEventBus } from '@g4os/session-runtime';

const log = createLogger('title-generator');

const ANTHROPIC_TITLE_MODEL = 'claude-haiku-4-5';
const TITLE_MAX_CHARS = 60;
/** Truncate da 1ª msg pra preview imediato; mais curto que `TITLE_MAX_CHARS`
 *  para deixar espaço de refinement na 2ª msg sem visualmente "encolher". */
const IMMEDIATE_TITLE_MAX_CHARS = 50;
const TITLE_TIMEOUT_MS = 8_000;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
// CR-30 F-CR30-1: chave canônica do vault para Anthropic é `'anthropic_api_key'`
// (consistente com `agents-bootstrap.ts`, `api-keys-panel.tsx`, `onboarding-wizard.tsx`,
// `log-stream.ts`). Antes esta constante apontava para
// `'connection.anthropic-direct.apiKey'`, que NUNCA era escrita por
// nenhuma camada — `vault.get()` sempre retornava NOT_FOUND e a 2ª fase
// (AI refine via Haiku) era no-op silencioso. Sintoma: paridade V1
// CR-26 F-CR26-1 (dual-fase truncate-imediato + AI refine) só executava
// o truncate; refine nunca acontecia.
const VAULT_KEY_ANTHROPIC = 'anthropic_api_key';

export interface TitleGeneratorDeps {
  readonly vault: CredentialVault;
  readonly sessionsRepo: SessionsRepository;
  readonly fetchImpl?: typeof fetch;
  /** Strings que indicam "ainda usando nome default" — comparadas contra session.name. */
  readonly defaultNames: readonly string[];
  /**
   * CR-26 F-CR26-1: bus + drizzle injetados para emitir `session.renamed`
   * após gravar o novo título. Sem isso, a UI (sub-sidebar, header, command
   * palette) só atualizava após o próximo `message.added` invalidar o cache
   * — ou full reload. Com paridade V1 (`title_generated` event), o renderer
   * recebe o evento via `trpc.sessions.stream` subscription e invalida.
   */
  readonly eventBus?: SessionEventBus;
  readonly drizzle?: AppDb;
}

interface AnthropicMessageResponse {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
}

export class TitleGeneratorService extends DisposableBase {
  private readonly inflight = new Set<AbortController>();
  /**
   * Sessions cujo título atual é o truncate-imediato da 1ª mensagem,
   * aguardando refinement AI no 2º turno. Permite que `scheduleGeneration`
   * sobrescreva o nome auto-truncado mesmo que ele não bata com `defaultNames`.
   * Set in-memory; perda em restart é OK — nesse caso o título inicial
   * permanece e o usuário pode renomear manualmente.
   */
  private readonly pendingRefinement = new Set<SessionId>();

  constructor(private readonly deps: TitleGeneratorDeps) {
    super();
    this._register(
      toDisposable(() => {
        for (const ac of this.inflight) ac.abort();
        this.inflight.clear();
        this.pendingRefinement.clear();
      }),
    );
  }

  /**
   * Tenta gerar título em background. Falhas são silenciosas — o usuário
   * sempre pode renomear manualmente. Não retorna Promise — fire-and-forget.
   */
  scheduleGeneration(sessionId: SessionId, messages: readonly Message[]): void {
    if (this._disposed) return;
    void this.runOnce(sessionId, messages).catch((err: unknown) => {
      log.warn({ err, sessionId }, 'title generation failed');
    });
  }

  /**
   * Paridade V1: trunca a 1ª mensagem do usuário em ~50 chars e grava como
   * título imediato. Não chama LLM — feedback instantâneo na UI. Marca o
   * resultado como "pending refinement" via metadata pra que o `scheduleGeneration`
   * subsequente (2º turn) considere o nome ainda default-mutável.
   *
   * Fire-and-forget; falhas são silenciosas.
   */
  scheduleImmediateFromFirstMessage(sessionId: SessionId, firstUserMessage: string): void {
    if (this._disposed) return;
    void this.runImmediateTruncate(sessionId, firstUserMessage).catch((err: unknown) => {
      log.warn({ err, sessionId }, 'immediate title truncate failed');
    });
  }

  private async runImmediateTruncate(sessionId: SessionId, userMessage: string): Promise<void> {
    const session = await this.deps.sessionsRepo.get(sessionId);
    if (!session) return;
    if (!this.isDefaultName(session.name)) return;
    const initial = sanitizeImmediateTitle(userMessage);
    if (!initial) return;
    await this.updateTitle(sessionId, initial, session.metadata);
    this.pendingRefinement.add(sessionId);
  }

  private async runOnce(sessionId: SessionId, messages: readonly Message[]): Promise<void> {
    const session = await this.deps.sessionsRepo.get(sessionId);
    if (!session) return;
    // Permite override quando o nome ainda é default OU veio do truncate-imediato
    // (fluxo paridade V1: 1ª msg trunca, 2ª msg refina via IA).
    const canOverride = this.isDefaultName(session.name) || this.pendingRefinement.has(sessionId);
    if (!canOverride) return;
    this.pendingRefinement.delete(sessionId);

    const prompt = this.buildPrompt(messages);
    if (!prompt) return;
    const fallbackTitle = buildFallbackTitle(messages);

    const apiKeyResult = await this.deps.vault.get(VAULT_KEY_ANTHROPIC);
    if (apiKeyResult.isErr()) {
      log.debug({ sessionId }, 'no anthropic key in vault — skipping title gen');
      if (fallbackTitle) await this.updateTitle(sessionId, fallbackTitle, session.metadata);
      return;
    }

    const title = await this.callAnthropic(apiKeyResult.value, prompt);
    if (!title && !fallbackTitle) return;

    const nextTitle = title ?? fallbackTitle;
    if (!nextTitle) return;
    await this.updateTitle(sessionId, nextTitle, session.metadata);
  }

  private isDefaultName(name: string): boolean {
    // CR-25 F-CR25-3: igualdade exata. Antes usava `startsWith` esperando
    // defaults numerados ("Nova sessão 2", "Nova sessão 3"), mas o V2 não
    // gera nomes numerados — `sessions.index.tsx` usa só `t('session.new.defaultName')`
    // (string única). Com `startsWith`, qualquer rename do usuário começando
    // com o default ("Nova sessão sobre billing") era considerado default e
    // sobrescrito pelo título gerado por IA, violando "default-name skip if
    // same" do CLAUDE.md ("Padrões obrigatórios"). Se defaults numerados
    // forem reintroduzidos no futuro, casar via regex específica
    // (`/^Nova sessão( \d+)?$/`) em vez de `startsWith`.
    return this.deps.defaultNames.some((d) => name === d);
  }

  private buildPrompt(messages: readonly Message[]): string | null {
    // Usa as 2 primeiras mensagens do usuário para contexto mais rico.
    // Chamado somente quando há >= 3 user messages (gate no turn-dispatcher).
    const userMsgs = messages.filter((m) => m.role === 'user').slice(0, 2);
    const assistantMsg = [...messages].reverse().find((m) => m.role === 'assistant');
    if (userMsgs.length === 0) return null;

    const userLines = userMsgs
      .map((m, i) => {
        const text = extractText(m).slice(0, 500);
        return text.length > 0 ? `USUÁRIO ${i + 1}:\n${text}` : null;
      })
      .filter((l): l is string => l !== null);
    if (userLines.length === 0) return null;

    const assistantText = assistantMsg ? extractText(assistantMsg).slice(0, 400) : '';

    return [
      'Gere um título curto (máximo 6 palavras, idealmente 3-5) para esta conversa.',
      'Responda APENAS com o título, sem aspas, sem prefixo, sem pontuação final.',
      '',
      ...userLines,
      assistantText.length > 0 ? `\nASSISTENTE:\n${assistantText}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async callAnthropic(apiKey: string, prompt: string): Promise<string | null> {
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TITLE_TIMEOUT_MS);
    this.inflight.add(controller);

    try {
      const response = await fetchImpl(ANTHROPIC_API, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: ANTHROPIC_TITLE_MODEL,
          max_tokens: 50,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        log.warn({ status: response.status }, 'anthropic title gen non-OK status');
        return null;
      }
      const body = (await response.json()) as AnthropicMessageResponse;
      const text = body.content?.find((b) => b.type === 'text')?.text ?? '';
      return sanitizeTitle(text);
    } finally {
      clearTimeout(timer);
      this.inflight.delete(controller);
    }
  }

  private async updateTitle(
    sessionId: SessionId,
    title: string,
    metadata: Session['metadata'],
  ): Promise<void> {
    // CR-26 F-CR26-1: emite `session.renamed` ANTES do update SQLite quando
    // bus + drizzle estão injetados. `emitLifecycleEvent` persiste no JSONL
    // (append-only source-of-truth) e roda o reducer SQLite, então o
    // sessions.lastEventSequence acompanha. O bus.emit subsequente notifica
    // tRPC subscribers (renderer.session.stream) para invalidar caches.
    //
    // Ordem importa: evento antes do update direto. Caso contrário,
    // o reducer atualiza o `name` e o subsequente `repo.update` também,
    // mas o reducer não sabe sobre `metadata.titleGeneratedAt` (campo
    // exclusivo de UI/telemetria). Mantemos `repo.update` para atualizar
    // metadata; o `name` é gravado tanto pelo reducer quanto pelo update,
    // resultado idempotente.
    if (this.deps.eventBus && this.deps.drizzle) {
      const session = await this.deps.sessionsRepo.get(sessionId);
      if (session) {
        const drizzle = this.deps.drizzle;
        const event = await emitLifecycleEvent(
          {
            workspaceId: session.workspaceId,
            currentSequence: session.lastEventSequence,
            applyReducer: (e) => applyEvent(drizzle, e),
          },
          sessionId,
          'session.renamed',
          { newName: title },
        );
        if (event) {
          this.deps.eventBus.emit(sessionId, event);
        }
      }
    }
    await this.deps.sessionsRepo.update(sessionId, {
      name: title,
      metadata: { ...metadata, titleGeneratedAt: Date.now() },
    });
    log.info({ sessionId, title }, 'session title generated');
  }
}

function extractText(message: Message): string {
  return message.content
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

function sanitizeTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length <= TITLE_MAX_CHARS) return cleaned;
  return `${cleaned.slice(0, TITLE_MAX_CHARS - 1).trim()}…`;
}

/**
 * Trunca a 1ª user msg para uso como título imediato. Mais agressivo que
 * `sanitizeTitle` — colapsa whitespace, remove markdown leading (#, -, >),
 * limita em `IMMEDIATE_TITLE_MAX_CHARS`. Sem chamada a LLM.
 */
function sanitizeImmediateTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/^[\s>#*\-+_~]+/gm, '')
    .replace(/[\s ]+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  if (cleaned.length === 0) return null;
  if (cleaned.length <= IMMEDIATE_TITLE_MAX_CHARS) return cleaned;
  return `${cleaned.slice(0, IMMEDIATE_TITLE_MAX_CHARS - 1).trim()}…`;
}

function buildFallbackTitle(messages: readonly Message[]): string | null {
  const userMsg = messages.find((m) => m.role === 'user');
  if (!userMsg) return null;
  const text = extractText(userMsg)
    .replace(/\s+/g, ' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  if (!text) return null;
  const withoutTerminalPunctuation = text.replace(/[.!?;:]+$/g, '').trim();
  return sanitizeTitle(withoutTerminalPunctuation || text);
}
