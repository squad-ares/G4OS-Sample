---
'@g4os/agents': patch
'@g4os/credentials': patch
'@g4os/desktop': patch
'@g4os/features': patch
'@g4os/ipc': patch
'@g4os/kernel': patch
'@g4os/platform': patch
'@g4os/sources': patch
'@g4os/ui': patch
'@g4os/viewer': patch
---

Scaffolding: estrutura mínima de `apps/desktop` com `bootstrap`, `ipc-context` stub e `preload`; gates de CI ajustados para scaffolding (`knip.json`, wrappers `check:exports` e `check:size`, `dependency-cruiser` reconhecendo preload como entry); ADR-0020 enriquecido e `packages/ipc` documentado em ptBR.
