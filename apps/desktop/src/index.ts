/**
 * Ponto de entrada do processo principal do Electron.
 *
 * Esta é a camada de orquestração: cria a BrowserWindow, instala o
 * handler tRPC via electron-trpc/main, e encaminha eventos do ciclo de
 * vida da app. Toda lógica de domínio vive em pacotes (`@g4os/ipc`,
 * `@g4os/kernel`, `@g4os/features`), mantendo este módulo fino.
 *
 * Runtime:
 * - Dependências Electron (`electron`, `electron-trpc/main`) são resolvidas
 *   em tempo de execução pelo processo principal do Electron.
 * - Imports dinâmicos preservam typecheck mesmo enquanto `electron` ainda
 *   não está instalado no workspace (fase de scaffolding).
 */

import { bootstrapMain } from './main/bootstrap.ts';

export { bootstrapMain };

void bootstrapMain();
