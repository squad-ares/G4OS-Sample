---
'@g4os/agents': patch
'@g4os/auth': patch
'@g4os/credentials': patch
'@g4os/data': patch
'@g4os/desktop': patch
'@g4os/desktop-e2e': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/observability': patch
'@g4os/permissions': patch
'@g4os/platform': patch
'@g4os/session-runtime': patch
'@g4os/sources': patch
'@g4os/translate': patch
'@g4os/ui': patch
'@g4os/viewer': patch
---

Bug fixes batch — dados de chat, retry, atalhos e Debug HUD.

- `session-runtime` agora persiste o texto parcial do assistant quando o stream do agente erra (antes os chunks acumulados eram descartados → primeira mensagem da IA sumia após navegação).
- `turn.done` é emitido pelo dispatcher após `runToolLoop` para o renderer limpar `streamingTurnId` de forma confiável (antes ficava leak no caminho de sucesso).
- `retryLastTurn` corrige cutoff: usa `lastUserSeq - 1` em vez de `secondLastUserSeq`, preservando a resposta do assistant da turn anterior (antes apagava `asst1` indevidamente).
- Cmd+R desbindado do retry no chat (colidia com a convenção universal "recarregar página"); retry segue disponível pelos botões da UI.
- `setIsStreaming(true)` movido para antes da `mutate` de retry (antes era set depois do `await`, sobrescrevendo o reset que o `message.added` já fez → UI travava com botão de stop).
- Em packaged builds, Cmd+R / Ctrl+R / F5 são bloqueados via `before-input-event` (reload destrói estado in-flight; mantém ativo em dev pra HMR).
- Debug HUD: frame nativo (drag + close + min/max grátis), `alwaysOnTop: false` (não rouba foco), scroll aninhado removido do LogTailCard.
- Observability: Sentry init pré-`app.whenReady`, `skipOpenTelemetrySetup` em main pra evitar registro duplicado de provider OTel, /metrics scrape endpoint Prometheus, stack LGTM local em `infra/observability/`.
- OTel + `@sentry/electron` movidos para `optionalDependencies` em `@g4os/observability` e `@g4os/desktop` (CI sem binding nativo).
- README traduzido pra pt-BR.
- Main-size budget bumped 8800 → 8900 com chronicle de cada item adicionado.
