/**
 * Contrato de rotação. Handlers declaram para quais chaves são
 * responsáveis via `canHandle`. O `rotate` recebe um contexto com a `key`
 * sendo rotacionada, o `currentValue` (valor atual da meta key — útil
 * para handlers symmetric-key que rotacionam o próprio valor) e o `vault`
 * (necessário para handlers OAuth resolverem `<key>.refresh_token` por
 * convenção). Retorna o novo par `(valor, expiresAt)`; o orchestrator
 * aplica a escrita no vault.
 *
 * CR-18 F-C2: a versão antiga recebia só `currentValue`. OAuth handler
 * usava esse valor como refresh_token no POST, mas o migrator armazena o
 * refresh em slot SEPARADO (`<key>.refresh_token`). Resultado: provider
 * recebia access token onde esperava refresh, retornava `invalid_grant`,
 * handler nunca rotacionava. Agora handler tem acesso ao vault para
 * resolver convenções de slot.
 */

import type { CredentialVault } from '../vault.ts';

export interface RotatedCredential {
  readonly newValue: string;
  readonly expiresAt: number;
}

export interface RotationContext {
  readonly key: string;
  readonly currentValue: string;
  readonly vault: CredentialVault;
}

export interface RotationHandler {
  canHandle(key: string): boolean;
  rotate(context: RotationContext): Promise<RotatedCredential>;
}
