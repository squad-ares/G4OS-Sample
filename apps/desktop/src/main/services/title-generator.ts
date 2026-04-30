/**
 * TitleGeneratorService — gera título de session baseado na conversa após o
 * primeiro turn completar. Roda em background, não bloqueia retorno do
 * `runToolLoop`. Falhas são logadas mas não propagadas (best-effort).
 *
 * Estratégia:
 *   - Após `runToolLoop` ok, se a session ainda tiver nome default
 *     ('Nova sessão' / 'New session'), pega user msg + assistant response
 *   - Chama Anthropic Haiku via fetch direto (sem SDK pra não inflar payload)
 *   - Trunca em 60 chars + remove quebras
 *   - Update via `SessionsRepository`
 *
 * Observações:
 *   - Default name é detectado via `t('session.new.defaultName')` — passamos
 *     a string atual como input e comparamos.
 *   - Sem API key disponível → no-op silencioso.
 *   - AbortController de 8s evita pendurar o background indefinidamente.
 */

import type { CredentialVault } from '@g4os/credentials';
import type { SessionsRepository } from '@g4os/data/sessions';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { Message, Session, SessionId } from '@g4os/kernel/types';

const log = createLogger('title-generator');

const ANTHROPIC_TITLE_MODEL = 'claude-haiku-4-5';
const TITLE_MAX_CHARS = 60;
const TITLE_TIMEOUT_MS = 8_000;
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const VAULT_KEY_ANTHROPIC = 'connection.anthropic-direct.apiKey';

export interface TitleGeneratorDeps {
  readonly vault: CredentialVault;
  readonly sessionsRepo: SessionsRepository;
  readonly fetchImpl?: typeof fetch;
  /** Strings que indicam "ainda usando nome default" — comparadas contra session.name. */
  readonly defaultNames: readonly string[];
}

interface AnthropicMessageResponse {
  readonly content?: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
}

export class TitleGeneratorService extends DisposableBase {
  private readonly inflight = new Set<AbortController>();

  constructor(private readonly deps: TitleGeneratorDeps) {
    super();
    this._register(
      toDisposable(() => {
        for (const ac of this.inflight) ac.abort();
        this.inflight.clear();
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

  private async runOnce(sessionId: SessionId, messages: readonly Message[]): Promise<void> {
    const session = await this.deps.sessionsRepo.get(sessionId);
    if (!session) return;
    if (!this.isDefaultName(session.name)) return;

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
    return this.deps.defaultNames.some((d) => name === d || name.startsWith(d));
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
