# ADR 0013: Platform abstraction layer

## Metadata

- **Numero:** 0013
- **Status:** Proposed
- **Data:** 2026-04-17
- **Autor(es):** @squad-ares
- **Stakeholders:** @frontend-lead, @devops-lead
- **Épico:** 01-kernel (TASK-01-04)

## Contexto

v1 tinha OS-specific code espalhado pela codebase:

1. **Platform detection:** `process.platform` em múltiplos arquivos
2. **Runtime paths:** keychain diferentes em macOS/Windows/Linux
3. **Spawn:** envvars e opções diferentes por OS
4. **Credentials:** Keychain, Windows Credential Manager, Linux pass
5. **App paths:** `~/Library` (macOS), `%APPDATA%` (Windows), `~/.config` (Linux)

Resultado: bugs de plataforma descobertos tarde, duplicação de lógica, teste difícil.

Exemplo problema:
```ts
// Em 3 arquivos diferentes:
if (process.platform === 'darwin') {
  // macOS keychain via Security framework
} else if (process.platform === 'win32') {
  // Windows Credential Manager
} else {
  // Linux libsecret
}

// Testabilidade: como mockar platform durante teste?
```

Em v2, queremos **@g4os/platform** package como abstração única:

```ts
// Único lugar onde process.platform aparece
export const platformInfo = {
  os: 'darwin' | 'win32' | 'linux',
  arch: 'x64' | 'arm64',
  runtime: 'electron' | 'node',
};

// Implementações abstratas
export interface IKeychain {
  get(key: string): Promise<Result<string, CredentialError>>;
  set(key: string, value: string): Promise<Result<void, CredentialError>>;
  delete(key: string): Promise<Result<void, CredentialError>>;
}

// Implementações concretas por plataforma
export const keychain: IKeychain = 
  platformInfo.os === 'darwin' ? new MacOSKeychain()
  : platformInfo.os === 'win32' ? new WindowsKeychain()
  : new LinuxKeychain();

// Consumidor não sabe/se importa:
await keychain.set('token', secret);  // funciona em qualquer OS
```

**Benefícios:**
- Centralizado: `process.platform` em 1 arquivo apenas
- Type-safe: IKeychain garante contrato
- Testável: mock platformInfo durante teste
- Isolado: changes em macOS keychain não afetam Windows

## Opções consideradas

### Opção A: @g4os/platform package com interfaces abstratas
**Descrição:**
Package dedicado contendo:
- `platformInfo` (detection)
- Interfaces (`IKeychain`, `ISpawn`, etc.)
- Implementations por OS
- Runtime paths builder

```
packages/platform/
├── src/
│   ├── platform-info.ts          (OS detection)
│   ├── paths.ts                  (app folders via env-paths)
│   ├── runtime-paths.ts          (runtime binaries)
│   ├── keychain/
│   │   ├── interface.ts
│   │   ├── macos.ts
│   │   ├── windows.ts
│   │   └── linux.ts
│   ├── spawn/
│   │   ├── interface.ts
│   │   ├── macos.ts
│   │   ├── windows.ts
│   │   └── linux.ts
│   └── index.ts                  (exports)
```

**Pros:**
- Centralizado
- Type-safe
- Fácil testar (mock platform)
- Escalável (novo OS = novo arquivo)

**Contras:**
- Nova dependência (mas interna, ok)
- Coordenação com @g4os/kernel (Result, errors)

**Custo de implementação:** M (3-5 dias)

### Opção B: Decoradores + Dynamic imports
**Descrição:**
```ts
const KeychainImpl = 
  process.platform === 'darwin' ? (await import('./macos')).MacOSKeychain
  : process.platform === 'win32' ? (await import('./windows')).WindowsKeychain
  : (await import('./linux')).LinuxKeychain;
```

**Pros:**
- Tree-shakeable (imports desnecessários não inclusos no bundle)
- Lazy load

**Contras:**
- Magic imports difícil de debugar
- Type system não consegue validar bem
- Sem interface comum (pode ter typo em nome de método)

**Custo de implementação:** S (1 dia, mas frágil)

### Opção C: Runtime factory function
**Descrição:**
```ts
type PlatformFactory = (platform: NodeJS.Platform) => {
  keychain: IKeychain;
  spawn: ISpawn;
};

const factories: Record<NodeJS.Platform, PlatformFactory> = {
  darwin: (p) => ({ keychain: new MacOSKeychain(), ... }),
  win32: (p) => ({ keychain: new WindowsKeychain(), ... }),
  linux: (p) => ({ keychain: new LinuxKeychain(), ... }),
};

export const platform = factories[process.platform](process.platform);
```

**Pros:**
- Type-safe
- Fácil de extend (novo OS = nova entrada no map)

**Contras:**
- Boilerplate de factory
- Necessita Map/Record manual

**Custo de implementação:** S (1-2 dias)

## Decisão

Optamos pela **Opção A (@g4os/platform package com interfaces)** porque:

1. **Centralizado:** `process.platform` aparece em 1 arquivo apenas
2. **Type-safe:** interfaces garantem contrato
3. **Testável:** mock platformInfo é trivial
4. **Escalável:** novo OS ou nova abstração é novo arquivo
5. **Familiar:** padrão usado por outras apps cross-platform (Electron, Tauri)

Opção B é boa para produção (tree-shaking), mas Opção A é melhor para manutenção. Opção B pode vir depois como optimização.

## Consequências

### Positivas
- Centralizado: apenas `platform-info.ts` usa `process.platform`
- Type-safe: interfaces garantem contrato (IKeychain, ISpawn, etc.)
- Testável: mock `platformInfo` durante testes
- Isolado: bug em macOS keychain não afeta Windows
- Documentável: cada abstração tem tipo explícito

### Negativas / Trade-offs
- **Nova dependência:** @g4os/platform package (mas interna)
- **Coordenação:** com @g4os/kernel (Result, errors, logger)
- **Boilerplate:** cada implementação é arquivo separado
- **Testing:** precisa de fixtures por platform (mais complex test matrix)

### Neutras
- `@g4os/kernel` é dependência de @g4os/platform (não vice-versa)
- Runtime paths (claude, git, node, uv) são side-effect free
- Credentials (keychain) será implementado em TASK-05-01, não aqui

## Validação

Como saberemos que essa decisão foi boa?

- Apenas `platform-info.ts` contém `process.platform` check
- Todos os OS-specific code está em `platform/macos.ts`, `platform/windows.ts`, `platform/linux.ts`
- IKeychain, ISpawn têm type-safe implementações por OS
- Testes rodam matrix Mac/Win/Linux sem ifdef
- Code review rejeita `process.platform` fora de platform package
- Revisão em 2026-05-15 para avaliar cobertura de casos edge

## Implementação no kernel

**TASK-01-04:**

```ts
// platform-info.ts
export interface PlatformInfo {
  os: 'darwin' | 'win32' | 'linux';
  arch: 'x64' | 'arm64' | 'arm';
  runtime: 'electron' | 'node';
  version: string;
}

export const platformInfo: PlatformInfo = {
  os: (process.platform as 'darwin' | 'win32' | 'linux'),
  arch: (process.arch as any),
  runtime: (() => {
    // Check if running in Electron
    if (process.versions?.electron) return 'electron';
    return 'node';
  })(),
  version: process.version,
};

// Reexport
export * from './platform-info.ts';
export * from './paths.ts';
export * from './runtime-paths.ts';
export { type IKeychain } from './keychain/interface.ts';
export { type ISpawn } from './spawn/interface.ts';
```

**Interfaces:**

```ts
// keychain/interface.ts
export interface IKeychain {
  get(key: string): Promise<Result<string, CredentialError>>;
  set(key: string, value: string): Promise<Result<void, CredentialError>>;
  delete(key: string): Promise<Result<void, CredentialError>>;
  list(): Promise<Result<string[], CredentialError>>;
}

// spawn/interface.ts
export interface ISpawn {
  spawn(command: string, args: string[], options?: any): ChildProcess;
}
```

## Histórico de alterações

- 2026-04-17: Proposta inicial
- (pendente) Aceita pelo time
