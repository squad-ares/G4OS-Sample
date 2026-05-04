import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAppPaths } from '../paths.ts';
import { getPlatformInfo, isLinux, isMacOS, isWindows } from '../platform-info.ts';
import { initRuntimePaths, validateRuntimeIntegrity } from '../runtime-paths.ts';

// reset singleton entre testes
function _resetRuntimePaths(): void {
  // acessa o módulo via reimport não é possível facilmente — forçamos via
  // initRuntimePaths em cada teste que precise de um estado limpo.
}

describe('getPlatformInfo()', () => {
  it('retorna um objeto com todos os campos obrigatórios', () => {
    // CR-43 F-CR43-8: PlatformInfo contem apenas informação de SO.
    // Campos removidos: isDev, isPackaged, isWsl, pathSeparator, executableSuffix.
    const info = getPlatformInfo();
    expect(info).toHaveProperty('family');
    expect(info).toHaveProperty('arch');
    expect(info).toHaveProperty('version');
    expect(info).toHaveProperty('homeDir');
    expect(info).toHaveProperty('tempDir');
  });

  it('family é um dos valores válidos', () => {
    const { family } = getPlatformInfo();
    expect(['macos', 'windows', 'linux']).toContain(family);
  });

  it('arch é um dos valores válidos', () => {
    const { arch } = getPlatformInfo();
    expect(['x64', 'arm64']).toContain(arch);
  });

  it('retorna objeto congelado (imutável)', () => {
    const info = getPlatformInfo();
    expect(Object.isFrozen(info)).toBe(true);
  });

  it('retorna a mesma referência em chamadas repetidas (singleton)', () => {
    expect(getPlatformInfo()).toBe(getPlatformInfo());
  });

  it('isMacOS / isWindows / isLinux — exatamente um é true', () => {
    const flags = [isMacOS(), isWindows(), isLinux()];
    expect(flags.filter(Boolean)).toHaveLength(1);
  });
});

describe('getAppPaths()', () => {
  it('retorna um objeto com todos os campos obrigatórios', () => {
    const paths = getAppPaths();
    expect(typeof paths.config).toBe('string');
    expect(typeof paths.data).toBe('string');
    expect(typeof paths.cache).toBe('string');
    expect(typeof paths.state).toBe('string');
    expect(typeof paths.logs).toBe('string');
    expect(typeof paths.credentialsFile).toBe('string');
  });

  it('workspace() retorna string que contém o id', () => {
    const paths = getAppPaths();
    const id = 'test-workspace-id';
    expect(paths.workspace(id)).toContain(id);
  });

  it('session() retorna string que contém workspaceId e sessionId', () => {
    const paths = getAppPaths();
    const wid = 'wid-123';
    const sid = 'sid-456';
    const result = paths.session(wid, sid);
    expect(result).toContain(wid);
    expect(result).toContain(sid);
  });

  it('credentialsFile está dentro de data', () => {
    const paths = getAppPaths();
    expect(paths.credentialsFile).toContain(paths.data);
  });

  it('retorna objeto congelado (imutável)', () => {
    const paths = getAppPaths();
    expect(Object.isFrozen(paths)).toBe(true);
  });

  it('state e cache resolvem para diretórios distintos (estado persistente vs cache descartável)', () => {
    const paths = getAppPaths();
    expect(paths.state).not.toBe(paths.cache);
    expect(paths.state).not.toBe(paths.data);
  });

  it('state nunca aponta para tmp do SO (env-paths.state, não env-paths.temp)', () => {
    const paths = getAppPaths();
    expect(paths.state.toLowerCase()).not.toContain(tmpdir().toLowerCase());
  });
});

describe('validateRuntimeIntegrity()', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-runtime-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    // CR-18 F-P3: reset singleton via helper test-only `_resetForTestingInternal`.
    // Antes era `_resetForTesting?.()` (com `?.`), que silenciava a ausência
    // do helper — o teste passava sem realmente resetar, e o segundo teste
    // reusava `_location` seedado pelo primeiro.
    const mod = await import('../runtime-paths.ts');
    mod._resetForTestingInternal();
  });

  it('retorna missing quando arquivos não existem', () => {
    // afterEach garante _resetForTestingInternal — initRuntimePaths não vai
    // lançar "already initialized" aqui desde que o afterEach tenha rodado.
    const runtimeDir = join(tmpDir, 'runtime');
    const vendorDir = join(tmpDir, 'vendor');
    initRuntimePaths({ runtimeDir, vendorDir });
    const result = validateRuntimeIntegrity();
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
  });

  it('retorna ok quando todos os arquivos críticos existem', async () => {
    // CR-43 F-CR43-11: remover try/catch que silenciava falhas no init —
    // o afterEach reseta o singleton via _resetForTestingInternal, então
    // initRuntimePaths nunca lança "already initialized" aqui. Assertar
    // ok===true explicitamente em vez de `typeof result.ok === 'boolean'`.
    const runtimeDir = join(tmpDir, 'runtime2');
    const vendorDir = join(tmpDir, 'vendor2');

    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(runtimeDir, 'claude-agent-sdk'), { recursive: true });
    await mkdir(join(runtimeDir, 'interceptor'), { recursive: true });
    await mkdir(join(runtimeDir, 'session-mcp-server'), { recursive: true });
    await mkdir(join(runtimeDir, 'bridge-mcp-server'), { recursive: true });
    await writeFile(join(runtimeDir, 'claude-agent-sdk', 'cli.js'), '');
    await writeFile(join(runtimeDir, 'interceptor', 'network-interceptor.cjs'), '');
    await writeFile(join(runtimeDir, 'session-mcp-server', 'index.js'), '');
    await writeFile(join(runtimeDir, 'bridge-mcp-server', 'index.js'), '');

    initRuntimePaths({ runtimeDir, vendorDir });
    const result = validateRuntimeIntegrity();
    expect(result.ok).toBe(true);
    expect(result.missing).toEqual([]);
  });
});
