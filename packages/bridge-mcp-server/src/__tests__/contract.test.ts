/**
 * Testes de contrato para `@g4os/bridge-mcp-server`.
 *
 * Congela a shape das interfaces e o comportamento do skeleton — qualquer mudança
 * não-intencional no contrato (ErrorCode, campos de interface, flag de feature)
 * vai ser capturada aqui antes de chegar ao consumer (CodexAgent).
 */

import { ErrorCode } from '@g4os/kernel/errors';
import { describe, expect, it } from 'vitest';
import type {
  BridgeAuthToken,
  BridgeMcpServerHandle,
  BridgeMcpServerOptions,
  BridgeMcpToolSpec,
  BridgeMcpUrl,
  BridgeToolCallContext,
} from '../index.ts';
import { createBridgeAuthToken, isBridgeMcpServerEnabled, startBridgeMcpServer } from '../index.ts';

// Garante que todos os tipos públicos são exportados (se a importação acima
// compilar, o shape está presente em runtime).
type _AssertExports = {
  handle: BridgeMcpServerHandle;
  options: BridgeMcpServerOptions;
  tool: BridgeMcpToolSpec;
  ctx: BridgeToolCallContext;
  token: BridgeAuthToken;
  url: BridgeMcpUrl;
};

const TOOL: BridgeMcpToolSpec = {
  name: 'list_dir',
  description: 'Lista diretório',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
  kind: 'read',
};

const VALID_TOKEN = 'a'.repeat(32);

// onToolCall stub que satisfaz a assinatura sem usar async sem await
const STUB_ON_TOOL_CALL = (): Promise<never> => Promise.reject(new Error('não deve ser chamado'));

describe('createBridgeAuthToken', () => {
  it('aceita token de 32+ chars hex', () => {
    const result = createBridgeAuthToken(VALID_TOKEN);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe(VALID_TOKEN);
    }
  });

  it('rejeita token com menos de 32 chars', () => {
    const result = createBridgeAuthToken('abc');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });

  it('rejeita token com chars não-hex', () => {
    const result = createBridgeAuthToken('z'.repeat(32));
    expect(result.isErr()).toBe(true);
  });
});

describe('isBridgeMcpServerEnabled', () => {
  it('retorna false no skeleton', () => {
    expect(isBridgeMcpServerEnabled()).toBe(false);
  });
});

describe('startBridgeMcpServer skeleton', () => {
  const tokenResult = createBridgeAuthToken(VALID_TOKEN);

  it('retorna err com FEATURE_DISABLED no skeleton', async () => {
    if (!tokenResult.isOk()) throw new Error('token inválido no teste');
    const result = await startBridgeMcpServer({
      authToken: tokenResult.value,
      tools: [TOOL],
      onToolCall: STUB_ON_TOOL_CALL,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      // Congelar: skeleton deve usar FEATURE_DISABLED, não UNKNOWN_ERROR.
      // Se esse assertion falhar, F-CR33-3 foi reintroduzido.
      expect(result.error.code).toBe(ErrorCode.FEATURE_DISABLED);
    }
  });

  it('retorna err com VALIDATION_ERROR em tools duplicadas', async () => {
    if (!tokenResult.isOk()) throw new Error('token inválido no teste');
    const duplicateTool: BridgeMcpToolSpec = { ...TOOL };
    const result = await startBridgeMcpServer({
      authToken: tokenResult.value,
      tools: [TOOL, duplicateTool],
      onToolCall: STUB_ON_TOOL_CALL,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    }
  });
});
