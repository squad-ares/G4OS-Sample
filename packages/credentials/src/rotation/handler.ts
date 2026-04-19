/**
 * Contrato de rotação. Handlers declaram para quais chaves são
 * responsáveis via `canHandle`. O `rotate` recebe o valor atual e
 * retorna o novo par `(valor, expiresAt)`; o orchestrator aplica a
 * escrita no vault.
 */

export interface RotatedCredential {
  readonly newValue: string;
  readonly expiresAt: number;
}

export interface RotationHandler {
  canHandle(key: string): boolean;
  rotate(currentValue: string): Promise<RotatedCredential>;
}
