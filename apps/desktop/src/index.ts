/**
 * Ponto de entrada do processo principal do Electron.
 *
 * Delega para `./main/index.ts` (entry fino), mantendo este módulo como
 * fachada pública do pacote `@g4os/desktop`.
 */

import { bootstrapMain } from './main/index.ts';

export { bootstrapMain };
