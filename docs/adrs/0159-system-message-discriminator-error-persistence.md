# ADR 0159: System message discriminator + persistência de erros de turn no event log

## Metadata

- **Numero:** 0159
- **Status:** Accepted
- **Data:** 2026-05-02
- **Autor(es):** @squad-ares
- **Stakeholders:** @frontend-lead, @backend-lead
- **Épico:** 11-features (CR-24 / chat UX parity V1→V2)
- **Relacionado:** ADR-0010 (event-sourced sessions), ADR-0070 (IAgent interface), ADR-0135 (session-runtime), code-review-24.md

## Contexto

V1 mantinha quatro `MessageRole` independentes para mensagens "fora do par user/assistant":

```ts
// V1 — apps/electron/src/shared/types.ts
type MessageRole = 'user' | 'assistant' | 'tool' | 'system' | 'info' | 'warning' | 'error' | 'plan' | 'partner_help' | ...
```

Quando um turn falhava (auth, rate limit, network, timeout), o reducer V1 (`apps/electron/src/main/sessions/event-reducer-error.ts`) empurrava `Message{role:'error', content, errorCode, ...}` para `managed.messages` — fonte de verdade da sessão. O `SessionViewer` (`packages/ui/src/components/chat/SessionViewer.tsx`) roteava `role==='error'/'warning'/'info'` para o componente `SystemMessage` que renderizava o card tinted permanentemente na transcript.

V2 simplificou a enum para 4 roles canônicos:

```ts
// V2 — packages/kernel/src/schemas/message.schema.ts
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);
```

Mas o runtime de turn (`TurnDispatcher`, `turn-runner`) NÃO persistia erros. `turn.error` era emitido apenas como evento ephemeral via `SessionEventBus`, consumido pelo renderer como `toast.error(message)` que sumia em ~5s. Resultado:

1. **Auditoria perdida:** após reload, nenhuma pista de que houve falha — sessão parecia "limpa".
2. **Sem retry contextual:** nenhuma mensagem-erro na transcript para anexar `RetryButton`. Único retry era `onRetryLast` no header (fora do contexto visual da falha).
3. **ADR-0010 promete event log como source of truth de sessão.** Erros que alteram o estado visível do chat deveriam estar nele.
4. **Paridade UX V1→V2 quebrada:** usuário V1 espera ver "Invalid API key — please check your Anthropic key in Settings > Agents" persistido, com retry inline.

Evidência (CR-24):
- 3 paths emitindo `turn.error` sem persistência: `TurnDispatcher.dispatchInternal` (registry.create fail), `turn-runner.next.error` (agent emite error event), `turn-runner.subscriber.error` (stream error).
- `MessageCard` em V2 sequer tinha branch para `role==='system'` — qualquer mensagem com esse role caía em `null`.

## Opções consideradas

### Opção A: Reintroduzir roles `error`/`info`/`warning` na enum

**Descrição:** Reverter a simplificação e voltar a 4+ roles dedicados.

```ts
export const MessageRoleSchema = z.enum(['user', 'assistant', 'system', 'tool', 'error', 'info', 'warning']);
```

**Pros:**
- Paridade direta com V1 — migrador V1→V2 pass-through trivial.
- Type narrowing imediato no consumer (`if (msg.role === 'error') ...`).

**Contras:**
- Inflam role em direção contrária à decisão V2 de minimizar a enum.
- Cada nova categoria visual (warning, info, partner_help, plan, ...) exige mudança no schema canônico, propagando através de 24 packages, migrations, tests.
- Roles `error`/`info`/`warning` não correspondem a "papéis" semânticos (de quem fala), só a tipos visuais — mistura de duas dimensões na mesma enum.

### Opção B: Single role `system` + discriminator em `metadata`

**Descrição:** Manter enum de 4 roles, adicionar `metadata.systemKind: 'error' | 'info' | 'warning'` (opcional). Persistir errors como `Message{role:'system', metadata:{systemKind:'error', errorCode:'agent.invalid_api_key'}}`. Renderer despacha role `system` para componente que lê `systemKind` e renderiza variante visual.

**Pros:**
- Enum permanece estável; novas categorias visuais (`partner_help`, `plan`, etc.) viram novo `systemKind` sem tocar schema canônico.
- Discriminador fica próximo ao dado que ele descreve (metadata da própria mensagem) em vez de na enum global.
- Compatível com ADR-0010 — system messages são mensagens normais que entram no event log via `message.added` event.
- `errorCode` no metadata permite Settings/Repair filtrar histórico por categoria de falha (`agent.invalid_api_key`, `agent.rate_limited`) sem parsear texto.

**Contras:**
- Type narrowing requer dois steps: `role === 'system' && metadata.systemKind === 'error'`.
- Discriminator opcional — necessário tratar `systemKind === undefined` como variante neutra `'system'`.
- Migração V1→V2 requer mapper: `role:'error' → role:'system' + metadata.systemKind:'error'`.

### Opção C: Tabela paralela `session_errors` separada do event log

**Descrição:** Criar tabela SQLite dedicada para erros (sem persistir no JSONL).

**Pros:**
- Erros não "poluem" o event log com mensagens não-conversacionais.
- Schema dedicado pode ter campos específicos (`stack`, `attempt_number`, etc.).

**Contras:**
- **Quebra ADR-0010 frontalmente** — event log deixa de ser source of truth.
- Sync/replay precisa coordenar duas fontes (events.jsonl + errors.db).
- UI precisa joinar manualmente cronologia (intercalar mensagens com erros).
- Backups (ADR-0045) precisam de outro caminho de export/import para `session_errors`.

## Decisão

Optamos pela **Opção B (single role system + metadata.systemKind)** porque:

1. **Mantém ADR-0010 íntegro** — erros persistem como `message.added` events no JSONL, replay reconstrói cronologia exata sem joins.
2. **Enum estável** — adicionar nova variante visual no futuro (ex.: `'rate_limit_notice'`) é um campo opcional, não breaking change na enum.
3. **Migração V1→V2 simples** — mapper unidirecional em `@g4os/migration` converte `role:'error'/'info'/'warning'` → `role:'system' + metadata.systemKind`.
4. **Paridade UX preservada** — `SystemMessage` component lê `systemKind` e renderiza as 4 variantes (error/warning/info/system), espelhando o V1 `SystemMessage`.
5. **errorCode tipado** — anexar `metadata.errorCode: 'agent.invalid_api_key'` permite roteamento i18n no renderer e telemetria/repair filtragem por código sem regex em texto.

## Consequências

### Positivas

- Erros são parte da timeline da sessão. Ao reload, usuário ainda vê "Invalid API key" tinted no chat com botão Retry. Auditoria completa para suporte.
- `RetryButton` inline no `SystemMessage` (variante `error`) reduz distância visual entre feedback e ação corretiva — antes só existia "Retry last" no header da sessão.
- Schema futuros: warnings de rate-limit, info de auto-retry (V1 `emitRetryInfo`), notices de fallback de model (V1 `emitDisallowedModelWarning`) podem reusar o mesmo discriminator sem inflar a enum.
- Backup/restore (ADR-0045): erros são automaticamente incluídos no ZIP — operador de suporte recebe contexto completo sem precisar do log paralelo.
- `errorCode` permite Settings → Repair listar histórico de falhas por categoria sem fazer NLP no texto.

### Negativas / Trade-offs

- **Renderer dispatch é dois steps:** `role === 'system'` → escolhe `SystemMessage`, depois `systemKind` → escolhe variante visual. Comparado com `role === 'error'` direto, mais um indireção.
- **Discriminador opcional:** quando `systemKind === undefined`, fallback é `'system'` neutro. Casos edge precisam tratar — tests cobrem todos os 4 valores possíveis (`error`/`warning`/`info`/undefined).
- **Migração V1→V2 não é zero-cost:** o mapper precisa rodar em todas as sessions importadas que tenham roles legados. Custo é uma pass linear no JSONL — aceitável para uma migração one-shot.
- **Type narrowing via metadata** pode pegar de surpresa devs acostumados com discriminated unions na role. Compensar com helper: `isSystemError(msg): boolean`.

### Neutras

- `Message.metadata` já era `default({})` — adicionar campo opcional não afeta sessões existentes (parser Zod aceita gracefully).
- `MessagesService.append` ganhou parâmetro `metadata` opcional, retro-compatível com callers que não passam.
- `kernel-to-chat-mapper` no renderer ficou pass-through de `systemKind`/`errorCode`. Outros callers do mapper (legacy import, viewer read-only) recebem o forward de graça.

## Validação

- Cold-restart pós-falha de turn: a mensagem de erro ainda aparece na transcript com texto e código, e o `RetryButton` dispara `retryLastTurn` corretamente. Observamos manualmente em sessão Codex+anthropic com chave inválida (CR-24 manual smoke).
- Suite passa: `kernel`, `data`, `ipc`, `features`, `translate`, `desktop` (567 testes verdes pós-CR-24).
- **Planejado:** test integration em `apps/desktop/__tests__/turn-error-persistence.test.ts` que stub um agent factory para falhar com `AgentError.invalidApiKey`, valida que após o turn termina (a) `messages.list` contém role='system' com systemKind='error', (b) eventBus emitiu `message.added` antes de `turn.error`, (c) renderer mock recebeu ambos eventos na ordem correta. Recomendação CR-25.
- **Métrica:** PostHog event `chat.error_persisted` (a adicionar em ADR-0064 catálogo de telemetria) com label `errorCode`. Em 30 dias, `errorCode` distribution permite verificar se o código semântico está preservado (sem `agent.unavailable` impostor para 401/403, conforme F-CR22-2).

## Implementação

### Schema (kernel)

```ts
// packages/kernel/src/schemas/message.schema.ts
metadata: z
  .object({
    // ...campos existentes
    systemKind: z.enum(['error', 'info', 'warning']).optional(),
    errorCode: z.string().optional(),
  })
  .default({}),
```

### Service contract (ipc)

```ts
// packages/ipc/src/server/context-services.ts
export interface MessagesService {
  append(
    input: Pick<Message, 'sessionId' | 'role' | 'content'> & {
      readonly metadata?: Pick<NonNullable<Message['metadata']>, 'systemKind' | 'errorCode'>;
    },
  ): Promise<Result<MessageAppendResult, AppError>>;
}
```

### Persistence (TurnDispatcher)

```ts
// apps/desktop/src/main/services/turn-dispatcher.ts
private async persistSystemError(sessionId: SessionId, code: string, message: string): Promise<void> {
  const result = await this.#deps.messages.append({
    sessionId,
    role: 'system',
    content: [{ type: 'text', text: message }],
    metadata: { systemKind: 'error', errorCode: code },
  });
  if (result.isOk()) {
    this.#deps.eventBus.emit(sessionId, buildMessageAddedEvent(result.value));
  }
}

// Chamado em 2 paths:
// 1. agentResult.isErr() — registry.create falhou (provider config inválido)
// 2. loopResult.isErr() && !isAbortedError(...) — runToolLoop terminou em erro não-interrupção
```

### Renderer

```tsx
// packages/features/src/chat/components/transcript/message-card/system-message.tsx
const VARIANT = {
  error:   { container: 'border-destructive/25 bg-destructive/5 ...', icon: AlertCircle, ... },
  warning: { container: 'border-amber-500/30 bg-amber-500/5 ...',     icon: AlertTriangle, ... },
  info:    { container: 'border-foreground/10 bg-muted/30 ...',       icon: Info, ... },
  system:  { container: 'border-foreground/10 bg-muted/30 ...',       icon: Info, ... }, // fallback
};
```

`MessageCard` despacha `message.role === 'system'` para `SystemMessage`, passando `onRetry` quando variante é `error` e o caller forneceu `callbacks.onRetryLast`.

### Translation keys (pt-br + en-us)

- `chat.systemMessage.errorTitle` ("Falha no turno" / "Turn failed")
- `chat.systemMessage.warningTitle` / `chat.systemMessage.infoTitle`
- `chat.systemMessage.retry` ("Tentar novamente" / "Retry")

## Mapping V1 → V2 (referência para `@g4os/migration`)

| V1 role          | V2 role     | V2 metadata.systemKind |
|------------------|-------------|------------------------|
| `error`          | `system`    | `error`                |
| `warning`        | `system`    | `warning`              |
| `info`           | `system`    | `info`                 |
| `system`         | `system`    | _(undefined)_          |

V1 `Message.errorCode` → V2 `metadata.errorCode` (rename simples). Campos V1 `errorTitle`/`errorDetails`/`errorOriginal`/`errorCanRetry` ficam fora do schema V2 — `errorTitle` virou `systemKind` (categoria), `errorDetails` é parte do `content[].text`, `errorCanRetry` é deduzido do `errorCode` no renderer (ex.: 401/403 sempre retry-able após reauth).

## Não-decisões (deliberadamente fora de escopo)

- **Stack trace persistido em `metadata`:** rejeitado. Stack contém path do usuário (`/Users/<name>/...`), classificado PII. Telemetria via Sentry (ADR-0062) já scrub stack via `scrubObject`; o JSONL local não precisa repetir a info.
- **Auto-retry com backoff antes de persistir o erro:** rejeitado para esta rodada. V1 tinha `surfaceTypedErrorRetryFailure` com 5+ ramos de retry (provider availability, model-not-found, OpenRouter, Bedrock, Claude Max, etc.) que totalizavam 800 LOC só de recovery. V2 mantém isso fora do `TurnDispatcher` por enquanto — quando a feature-paridade chegar, virá em ADR próprio referenciando este.
- **Mensagens `info` de retry-info (V1 `emitRetryInfo`):** rejeitado para esta rodada — depende do auto-retry acima. Esquema atual já suporta (`systemKind: 'info'`); falta o emissor.

## Histórico de alterações

- 2026-05-02: Proposta inicial pós CR-24. Aceita após smoke manual em sessão Codex e suite verde nas 6 packages tocadas.
