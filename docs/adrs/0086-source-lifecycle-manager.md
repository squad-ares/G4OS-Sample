# ADR 0086: SourceLifecycleManager — intent detection + sticky/rejected por sessão

## Metadata

- **Numero:** 0086
- **Status:** Accepted
- **Data:** 2026-04-20
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @agents-team
- **Task relacionada:** TASK-08-06 (epic 08-sources-mcp)

## Contexto

A lógica de "qual source montar por turn" estava emaranhada no `sessions.ts` da v1 sem isolamento. Três consequências:
1. Sticky mounted sources (sources que persistem durante a sessão) eram rastreadas como estado ad-hoc espalhado.
2. Rejected sources (usuário rejeitou auth) não persistiam entre turns — a source era re-sugerida na próxima mensagem.
3. Intent detection (quando montar uma source automaticamente) era regex frágil sem tipo discriminado de intenção.

Requisitos:
- `SourceIntentDetector` com 4 tipos de intenção: `explicit` / `mention` / `skill-required` / `soft`
- `SourceLifecycleManager` com `planTurn`, `activateBrokered`, `markRejected` e state de sticky/rejected por `sessionId`
- Ortogonal ao transport — `SourceLifecycleManager` não conhece `McpStdioSource` ou `McpHttpSource`
- Testável sem Electron ou sources reais (opera sobre `SourceRegistry` mockável)

## Opções consideradas

### Opção A: lógica de lifecycle embutida no SessionManager (status quo v1)

**Rejeitada:** difícil testar, regredia com frequência (18 bugs de sticky regression na v1), e acoplava roteamento de sessão com lógica de source.

### Opção B: `SourceLifecycleManager` como serviço isolado (escolhido)

Dois componentes:

**`SourceIntentDetector.detect(message, context)`** retorna `SourceIntent` discriminado:
```
'explicit'       → [source:slug] no texto       → confidence: 'hard'
'mention'        → @slug no texto                → confidence: 'hard'
'skill-required' → skill do contexto pede source → confidence: 'hard'
'soft'           → referência textual vaga        → confidence: 'soft'
'none'           → sem sinal                      → confidence: 'soft'
```

**`SourceLifecycleManager`** mantém:
- `sticky: Map<sessionId, Set<slug>>` — sources ativadas nesta sessão e ainda válidas
- `rejected: Map<sessionId, Set<slug>>` — sources rejeitadas pelo usuário (não re-sugeridas)

`planTurn(sessionId, input)` filtra slugs rejeitados do intent antes de retornar o plan. `activateBrokered(sessionId, slugs)` chama `activate()` em cada source pendente e marca sticky em sucesso ou `needsAuth` em falha de auth.

## Decisão

Opção B. `@g4os/sources/lifecycle` separado (subpath isolado):

| Módulo | Papel |
|---|---|
| `intent-detector.ts` | `SourceIntentDetector` — regex + skill + soft |
| `lifecycle-manager.ts` | `SourceLifecycleManager` — planTurn, activateBrokered, markRejected |

`SourceLifecycleManager` não conhece tipos concretos de source — opera sobre `ISource` via `SourceRegistry`. SessionManager chama `planTurn` antes de cada turn e `activateBrokered` com o resultado.

## Consequências

**Positivas:**
- Sticky/rejected por sessionId isolados e testáveis
- Intent com tipo discriminado — `soft` pode ser ignorado por policy, `hard` sempre ativado
- Lifecycle decoupled de transport — adicionar um novo kind de source não altera o lifecycle

**Negativas:**
- State em memória (sticky/rejected) não persiste entre restarts — sessão reabre sem historico de rejected. Aceito: usuário pode re-rejeitar; persistir em DB seria overengineering neste estágio.

**Neutras:**
- `skip(1)` no BehaviorSubject dos sources evita emissão replay espúria no attach do lifecycle

## Armadilhas preservadas da v1

1. Logic espalhada em sessions.ts → lifecycle manager centralizado e testável.
2. Rejected não persistia entre turns → `rejected Map<sessionId, Set>` por escopo de sessão.

## Referências

- ADR-0081 (ISource interface + SourceRegistry)
- ADR-0073 (`shouldExposeSessionTool` com `promptMode: 'gemini_native'` — mesmo padrão de decision gate por turn)
- `STUDY/Audit/Tasks/08-sources-mcp/TASK-08-06-source-lifecycle.md`

---

## Histórico de alterações

- 2026-04-20: Proposta inicial e aceita (TASK-08-06 landed).
