# ADR 0125: Export/import de workspace — pipeline ZIP com filtragem de caminhos sensíveis

## Metadata

- **Numero:** 0125
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 não tinha exportação/importação de workspaces. Usuários migrando de máquina, fazendo backup manual ou compartilhando configurações de workspace com colegas precisavam copiar diretórios manualmente, sem garantia de que arquivos sensíveis (tokens OAuth, credenciais armazenadas localmente) não seriam incluídos.

O Epic 11-02 (TASK-11-02-05) precisa de:

1. Exportação de workspace como arquivo ZIP portátil
2. Importação em qualquer instalação do G4 OS
3. Proteção explícita contra exportação acidental de dados sensíveis
4. Proteção contra zip-slip na importação

O pacote `@g4os/data` já tem um padrão de backup ZIP (ADR-0045). Workspaces são uma unidade diferente (diretório do usuário + config do banco), mas o padrão de formato pode ser reutilizado.

## Opções consideradas

### Opção A: Reutilizar o backup ZIP da `@g4os/data` integralmente

**Descrição:** Workspaces entram no backup ZIP existente (`packages/data/src/backup/`) como mais um tipo de artefato.

**Pros:**
- Reusa código existente
- Um único formato de backup

**Contras:**
- Backup de `@g4os/data` é para recuperação do banco inteiro (sessions + attachments + events); workspace export é para portabilidade de um workspace individual
- Misturar os dois no mesmo ZIP impede importação granular (não é possível importar só um workspace de um backup completo sem modificar o formato)
- Feature boundary: `@g4os/data` não deve conhecer o conceito de "workspace" (pertence ao `apps/desktop`)

**Custo de implementação:** Baixo agora, mas cria acoplamento cross-boundary inaceitável.

### Opção B: `tar.gz` (tar + gzip) com `node:zlib` nativo

**Descrição:** Usar streams nativas do Node para criar um tarball comprimido.

**Pros:**
- Zero dependência nova
- Formato padrão no ecossistema Unix

**Contras:**
- ZIP é o formato esperado por usuários em macOS/Windows (double-click para abrir no explorador de arquivos)
- Node não tem API nativa de escrita de ZIP — apenas de tar
- Leitura de ZIP para importação precisaria de dependência de qualquer forma

**Custo de implementação:** Médio; tar write nativo, mas ZIP read ainda precisaria de lib.

### Opção C: `archiver` (write) + `yauzl` (read) — ZIP com manifest tipado

**Descrição:** Usar `archiver` para criar ZIP streaming e `yauzl` para ler ZIP entry-by-entry na importação. O ZIP contém `manifest.json` (versão, metadados do workspace), `workspace/config.json` (dados do banco serializados), e `workspace/files/**` (arquivos do `rootPath`, exceto caminhos sensíveis). Caminhos sensíveis definidos por `SENSITIVE_PATH_SEGMENTS` em `transfer-manifest.ts`.

**Pros:**
- ZIP é o formato com melhor UX para o usuário final (abre com duplo-clique em qualquer OS)
- `archiver` é streaming: workspaces grandes não consomem memória
- `yauzl` é entry-by-entry: importação não precisa extrair tudo antes de validar o manifest
- Manifest tipado via Zod garante que o contrato de versão é verificado na importação
- `SENSITIVE_PATH_SEGMENTS` é uma lista central auditável que cobre: `auth`, `tokens`, `secrets`, `credentials`, `.env`, `private-keys`

**Contras:**
- Duas novas dependências (`archiver` + `yauzl`) em `apps/desktop`
- `archiver` tem interface de callback; precisa de wrapper Promise

**Custo de implementação:** Médio; wrappers Promise + 3 arquivos de lógica.

## Decisão

Optamos pela **Opção C** (`archiver` + `yauzl` + manifest Zod).

Reasoning:

1. ZIP é o formato com melhor UX para usuários não-técnicos: abre no explorador de arquivos sem ferramentas extras.
2. A extensão `.g4os-workspace.zip` é auto-descritiva e filtrável por tipo na caixa de diálogo de save/open.
3. `archiver` streaming evita carregar workspaces grandes inteiramente em memória.
4. Zip-slip é um vetor de ataque documentado em importações de ZIP; `yauzl` + verificação de containment (padrão do ADR-0123) mitiga isso completamente.
5. O manifest versionado permite evolução futura do formato sem quebrar importações de versões anteriores.

## Consequências

### Positivas

- Usuários podem exportar um workspace e importá-lo em outra máquina em segundos
- Arquivos sensíveis são filtrados na exportação — tokens OAuth e credenciais locais não saem do dispositivo
- Zip-slip é impossível: `extractWorkspaceFiles` valida `isPathInside(targetPath, targetRootPath)` para cada entry
- Conflito de slug na importação é tratado automaticamente: slug existente recebe sufixo "(importado)"
- Manifest permite que versões futuras do G4 OS leiam ZIPs criados por versões anteriores

### Negativas / Trade-offs

- `archiver` e `yauzl` são dependências adicionais em `apps/desktop/package.json`
- Sem compressão máxima por default — `archiver` usa `zlib.Z_DEFAULT_COMPRESSION`; workspaces com muitos arquivos de texto se beneficiariam de `Z_BEST_COMPRESSION`, mas a troca de velocidade não justifica a complexidade adicional
- Credenciais do `CredentialVault` (Keychain/DPAPI) nunca estão no `rootPath` do workspace — a filtragem de `SENSITIVE_PATH_SEGMENTS` cobre arquivos locais opcionais que o usuário possa ter criado manualmente

### Neutras

- A extensão do arquivo exportado é sempre `.g4os-workspace.zip` — o filtro do dialog de save é `[{ name: 'G4OS Workspace', extensions: ['zip'] }]`

## Estrutura implementada

```
apps/desktop/src/main/services/workspaces/
├── transfer-manifest.ts   # WORKSPACE_TRANSFER_VERSION, SENSITIVE_PATH_SEGMENTS, isPathSensitive
├── transfer-export.ts     # exportWorkspaceToZip → { path, filesIncluded }
└── transfer-import.ts     # readWorkspaceZip → { manifest, workspaceConfig, files: Map }
                           # extractWorkspaceFiles → zip-slip protection

apps/desktop/src/main/services/
└── workspace-transfer-service.ts  # exportWorkspace + importWorkspace (fachada de serviço)
```

Contrato do manifest:

```ts
export const WorkspaceTransferManifestSchema = z.object({
  version: z.literal(1),
  format: z.literal('g4os-workspace-v1'),
  exportedAt: z.string().datetime(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  workspaceSlug: z.string(),
});
```

Filtragem de caminhos sensíveis:

```ts
export const SENSITIVE_PATH_SEGMENTS = [
  'auth', 'tokens', 'secrets', 'credentials', '.env', 'private-keys',
];

export function isPathSensitive(relPath: string): boolean {
  const parts = relPath.split(/[/\\]/);
  return parts.some((p) => SENSITIVE_PATH_SEGMENTS.includes(p.toLowerCase()));
}
```

## Validação

- Teste: exportar workspace com diretório `auth/` → entrada ausente no ZIP
- Teste: importar ZIP com path `../../etc/passwd` → erro de zip-slip, arquivo não extraído
- Teste: importar workspace com slug existente → slug no banco com sufixo "(importado)"
- Gate `check:file-lines`: todos os arquivos de transfer ≤ 200 LOC
- Smoke: exportar workspace A, importar em nova instalação → workspace aparece na lista com arquivos corretos

## Referencias

- TASK-11-02-05 (`STUDY/Audit/Tasks/11-features/02-workspaces/TASK-11-02-05-export-import.md`)
- ADR-0045: Backup ZIP v1 (padrão de manifest Zod, inspiração para o formato)
- ADR-0121: Persistência híbrida SQLite + filesystem (contexto do que é exportado)
- ADR-0123: Cleanup filesystem — validação por containment (mesmo padrão de zip-slip)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-02-05 entregue)
