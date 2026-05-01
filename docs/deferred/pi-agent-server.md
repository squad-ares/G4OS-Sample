# Deferred: pi-agent-server (TASK-18-03)

**Status:** ⏸️ Adiado — pendente decisão de stakeholder.

## Origem

V1 tinha um package `pi-agent-server` que rodava o agente PI (proprietário)
local-only. V2 ainda não tem equivalente.

## Pergunta aberta para stakeholder

**Mantém ou aposenta?**

- **Manter:** abrir slot de package `@g4os/pi-agent-server` e re-implementar
  contra o framework `@g4os/agents/interface` (ADR-0070). Requer:
  - Acesso ao binário/protocolo do agente PI atual.
  - Decisão sobre se vai virar managed source (catálogo) ou agent provider
    (registry).
  - Se for proprietário, definir como o IP fica protegido em V2 (binário
    selado? source-restricted? license check?).
- **Aposentar:** documentar deprecation no changelog + comunicar usuários
  que dependiam de V1 PI agent. Sem impacto no roadmap V2 GA.

## Critérios pra desbloqueio

1. Stakeholder responde a pergunta acima.
2. Se "manter", criar TASK específica detalhando:
   - Binário origem.
   - Protocolo de comunicação (stdin/stdout? HTTP local? unix socket?).
   - Modelo de licenciamento.
   - Estimativa de esforço.
3. Se "aposentar", abrir PR removendo qualquer referência V1 + nota no
   migration wizard.

## Recomendação preliminar

Sem dados de uso V1 disponíveis, recomendação default é **aposentar** até
que demanda de cliente justifique reabrir. V2 tem 4 providers reais
(Claude, OpenAI, Google, Codex) cobrindo o caso de uso geral; PI agent só
agrega valor se houver uso específico documentado.

## Referências

- TASK-18-03 em `STUDY/Audit/Tasks/18-v1-parity-gaps/README.md`
- ADR-0070 — `@g4os/agents/interface`
- Sibling deferral docs: `usage-reconcile-worker.md`
