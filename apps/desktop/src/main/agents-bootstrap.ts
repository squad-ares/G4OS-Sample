/**
 * Agent bootstrap — registra factories disponíveis no global registry.
 *
 * Fase 1: só Claude direct API.
 * Fase 2: chaves vêm do `CredentialVault` + env fallback.
 * Fase 3: multi-provider — Claude, OpenAI, Google registrados
 *   conforme chaves disponíveis. `refresh()` re-registra tudo após mutation.
 */

import { createClaudeFactory, DirectApiProvider } from '@g4os/agents/claude';
import { createCodexFactory, NodeSubprocessSpawner } from '@g4os/agents/codex';
import { createGoogleFactory } from '@g4os/agents/google';
import type { AgentFactory, AgentRegistry } from '@g4os/agents/interface';
import { globalAgentRegistry } from '@g4os/agents/interface';
import { createOpenAIFactory } from '@g4os/agents/openai';
import type { CredentialVault } from '@g4os/credentials';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('agents-bootstrap');

// F-CR51-6: 'codex' adicionado — CodexAgent usa subprocess local, sem API key.
export type ProviderKind = 'claude' | 'openai' | 'google' | 'codex';

interface ProviderSpec {
  readonly kind: ProviderKind;
  readonly factoryKind: string;
  readonly vaultKey: string;
  readonly envKeys: readonly string[];
}

const PROVIDERS: readonly ProviderSpec[] = [
  {
    kind: 'claude',
    factoryKind: 'claude',
    vaultKey: 'anthropic_api_key',
    envKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  },
  {
    kind: 'openai',
    factoryKind: 'openai',
    vaultKey: 'openai_api_key',
    envKeys: ['OPENAI_API_KEY'],
  },
  {
    kind: 'google',
    factoryKind: 'google',
    vaultKey: 'google_api_key',
    envKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
  },
  // F-CR51-6: Codex usa subprocess local — sem API key.
  // `vaultKey` vazio; `resolveKey` retorna string vazia → trata como chave
  // especial via 'codex' case em `registerProvider`. ADR-0072.
  {
    kind: 'codex',
    factoryKind: 'codex',
    vaultKey: '',
    envKeys: [],
  },
];

export interface RegisterAgentsOptions {
  readonly registry?: AgentRegistry;
  readonly factories?: readonly AgentFactory[];
  readonly credentialVault: CredentialVault;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface AgentsRuntime {
  readonly registry: AgentRegistry;
  status(): AgentsRuntimeStatus;
  refresh(): Promise<void>;
}

export interface AgentsRuntimeStatus {
  readonly providers: readonly ProviderKind[];
  readonly claudeAvailable: boolean;
}

export async function registerAgents(options: RegisterAgentsOptions): Promise<AgentsRuntime> {
  const registry = options.registry ?? globalAgentRegistry;
  for (const factory of options.factories ?? []) {
    registry.register(factory);
  }

  const available = new Set<ProviderKind>();

  async function resolveKey(spec: ProviderSpec): Promise<string | null> {
    const fromVault = await options.credentialVault.get(spec.vaultKey);
    if (fromVault.isOk() && fromVault.value.trim().length > 0) return fromVault.value;

    for (const envKey of spec.envKeys) {
      const envVal = options.env?.[envKey]?.trim();
      if (envVal) {
        const write = await options.credentialVault.set(spec.vaultKey, envVal);
        if (write.isErr()) {
          log.warn({ err: write.error, key: spec.vaultKey }, 'failed to seed vault from env');
        } else {
          log.info({ key: spec.vaultKey }, 'seeded vault from env (one-time migration)');
        }
        return envVal;
      }
    }
    return null;
  }

  function registerProvider(spec: ProviderSpec, apiKey: string): boolean {
    try {
      const factory = buildFactory(spec.kind, apiKey);
      registry.register(factory);
      return true;
    } catch (error) {
      log.warn({ err: error, kind: spec.kind }, 'failed to register factory');
      return false;
    }
  }

  async function applyRegistration(): Promise<void> {
    available.clear();
    for (const spec of PROVIDERS) {
      if (registry.has(spec.factoryKind)) registry.unregister(spec.factoryKind);
      // F-CR51-6: Codex não precisa de API key — usa subprocess local.
      // Registra incondicionalmente; key é string vazia (ignorada no buildFactory).
      if (spec.kind === 'codex') {
        if (registerProvider(spec, '')) {
          available.add(spec.kind);
          log.info({ kind: spec.kind }, 'factory registered');
        }
        continue;
      }
      const key = await resolveKey(spec);
      if (!key) {
        log.debug({ kind: spec.kind }, 'api key not available — skipping');
        continue;
      }
      if (registerProvider(spec, key)) {
        available.add(spec.kind);
        log.info({ kind: spec.kind }, 'factory registered');
      }
    }
  }

  await applyRegistration();

  // CR-34 F-CR34-2: coalesce inflight `refresh()`. Antes, dois `vault.set` em
  // janela curta (Settings UI + Wizard concorrentes, IPC subscription
  // disparando enquanto user clica Save) podiam interleavar dois ciclos de
  // unregister/register na mesma key, deixando `registry` com a factory de
  // valor stale (refresh1 finaliza DEPOIS de refresh2 e reescreve com key
  // antiga). Mesmo pattern usado em RotationOrchestrator.rotateIfExpiring.
  let inflight: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (inflight) return inflight;
    inflight = applyRegistration().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return {
    registry,
    status: () => ({
      providers: [...available],
      claudeAvailable: available.has('claude'),
    }),
    refresh,
  };
}

function buildFactory(kind: ProviderKind, apiKey: string): AgentFactory {
  switch (kind) {
    case 'claude': {
      const provider = new DirectApiProvider({ apiKey });
      return createClaudeFactory({ resolveProvider: () => provider });
    }
    case 'openai':
      return createOpenAIFactory({ resolveApiKey: () => apiKey });
    case 'google':
      return createGoogleFactory({ resolveApiKey: () => apiKey });
    // F-CR51-6: Codex usa subprocess local, sem API key. NodeSubprocessSpawner
    // usa node:child_process (zero dep runtime extra). ADR-0072.
    case 'codex':
      return createCodexFactory({ spawner: new NodeSubprocessSpawner() });
  }
}

export function vaultKeyForProvider(kind: ProviderKind): string {
  const spec = PROVIDERS.find((p) => p.kind === kind);
  if (!spec) throw new Error(`Unknown provider kind: ${kind}`);
  return spec.vaultKey;
}

export function providerForVaultKey(vaultKey: string): ProviderKind | null {
  const spec = PROVIDERS.find((p) => p.vaultKey === vaultKey);
  return spec?.kind ?? null;
}
