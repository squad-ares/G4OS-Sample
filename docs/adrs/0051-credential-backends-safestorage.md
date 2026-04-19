# ADR 0051: Credential backends + Electron safeStorage

## Metadata

- **Numero:** 0051
- **Status:** Accepted
- **Data:** 2026-04-18
- **Autor(es):** @g4os-core
- **Stakeholders:** @tech-lead, @security
- **Task relacionada:** TASK-05-02 (epic 05-credentials)

## Contexto

A v1 usava AES-256-GCM custom com chave derivada de constante embarcada — criptografia era teatro. A chave real fica gerida pelo OS via keychain nativo; faltava adotar o padrão.

Restrições do v2:
- Testes não podem depender de Electron runtime (pacote `electron` não é instalado em CI de unit tests).
- Dev sem Electron deve funcionar (ex.: rodar `vitest` local, scripts).
- Boundary (dependency-cruiser) proíbe qualquer pacote fora de `@g4os/credentials` importar `electron.safeStorage`.

## Opções consideradas

### Opção A: `keytar` (node-keytar)
**Pros:** API simples, cross-platform.
**Contras:** arquivado pelo autor em 2023; binding nativo frágil no Electron moderno; banido na lista do v2.

### Opção B: AES custom v2 com KDF sério
**Pros:** zero dependência nativa.
**Contras:** chave precisa vir de algum lugar — seed do OS (volta ao ponto inicial) ou input do usuário (UX ruim). Reinventa safeStorage com menos auditoria.

### Opção C: Electron `safeStorage` + abstração `IKeychain` (aceita)
**Descrição:** três backends plugáveis atrás do mesmo contrato `IKeychain`:
- `InMemoryKeychain` — `Map<string,string>` volátil, usado em testes.
- `FileKeychain` + `SecretCodec` — arquivos em `<baseDir>/<base64url(key)>.enc`, codec injetado.
- `safe-storage-codec.ts` — carrega `electron.safeStorage` via **dynamic import** (padrão já em uso em `electron-runtime.ts`, `cpu-pool.ts`); expõe `loadSafeStorageCodec()` assíncrono e `createPlaintextCodec()` para dev.

Factory `createVault({ mode: 'prod' | 'dev' | 'test', baseDir? })` escolhe o backend:
- `test` → `InMemoryKeychain`.
- `dev` → `FileKeychain` + plaintext codec.
- `prod` → `FileKeychain` + safeStorage codec (carrega `electron` via dynamic import).

`mode` é **explícito**: sem inferência de `NODE_ENV`, respeitando a regra `noProcessEnv: error`. Quem instancia é o bootstrap em `apps/desktop/src/main/*`, que já conhece o flavor.

## Decisão

**Opção C.** Implementação em [`packages/credentials/src/backends/`](../../packages/credentials/src/backends/) e [`factory.ts`](../../packages/credentials/src/factory.ts).

Boundary enforcement (dependency-cruiser, ADR-0006): regra dedicada impede qualquer caminho fora de `^packages/credentials` de importar `electron.safeStorage`.

## Consequências

### Positivas
- Chave nunca em plaintext fora do keychain do OS (macOS Keychain / Windows DPAPI / Linux libsecret).
- Testes rodam em Node puro com `InMemoryKeychain`; zero dependência de Electron em CI de unit.
- Dev mode (file+plaintext) permite inspecionar arquivos durante desenvolvimento sem travar em um keychain bloqueado.

### Negativas / Trade-offs
- Primeiro boot em Linux exige `libsecret` / `gnome-keyring` ativo; codec reporta `available: false` e escritas retornam `credential.locked`. Mitigação: detectar no boot e mostrar instrução ao usuário (fora do escopo deste ADR).
- Dynamic import de `electron` só resolve em runtime; se o consumer chamar `createVault({ mode: 'prod' })` fora de Electron, explode em runtime em vez de build. Aceitável — o caller errado já viola o contrato.

### Neutras
- `FileKeychain` confia na serialização via mutex do vault (não serializa internamente). Um segundo consumidor escrevendo direto no `FileKeychain` quebraria a garantia, mas esse caminho é proibido pela boundary.

## Validação

- 5 testes unitários (`backends.test.ts`): roundtrip in-memory, not-found, persistência + leitura via FileKeychain, list decodificado, erro quando codec reporta `available: false`.
- Gate `check:cruiser` confirma que nenhum pacote fora de `@g4os/credentials` importa `electron.safeStorage`.

## Referencias

- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- ADR-0006 (boundaries), ADR-0013 (platform abstraction), ADR-0050 (vault API)
- `STUDY/Audit/Tasks/05-credentials/TASK-05-02-safe-storage-integration.md`

---

## Histórico de alterações

- 2026-04-18: Proposta + aceita (TASK-05-02 landed)
