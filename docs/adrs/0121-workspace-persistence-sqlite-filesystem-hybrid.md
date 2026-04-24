# ADR 0121: Persistência de workspaces — híbrido SQLite + filesystem com metadata JSON

## Metadata

- **Numero:** 0121
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

A v1 persiste workspaces em `config.json` global, sem banco de dados. Isso causava:

- Sem índice: listar workspaces exigia ler todos os arquivos do disco
- Sem integridade referencial: sessões apontavam para workspaces deletados sem FK constraint
- Migração frágil: qualquer campo novo quebrava JSON anterior
- Colisão de escrita: sem lock, dois processos podiam sobrescrever simultaneamente

O Epic 11-02 precisa de um modelo de persistência que:
1. Seja consultável via SQL (lista, busca por slug, FK para sessions)
2. Suporte campos novos sem migrations manuais
3. Mantenha filesystem como verdade de dados gerenciados (arquivos do usuário)

## Opções consideradas

### Opção A: SQLite puro — todos os dados na tabela

**Descrição:** Tabela `workspaces` com colunas explícitas para cada campo (`name`, `slug`, `root_path`, `default_model`, `default_permissions`, `theme`, etc.).

**Pros:**
- Consultas SQL expressivas em qualquer campo
- Schema autodocumentado

**Contras:**
- Cada campo novo exige migration + `drizzle-kit generate`
- Epics futuros que adicionem preferências precisam de PRs de schema
- Beta pin do Drizzle (ADR-0042) significa que geração de migrations é arriscada em release

**Custo de implementação:** Alto — toda mudança de produto vira tarefa de banco.

### Opção B: Filesystem puro — JSON por workspace

**Descrição:** Manter o modelo da v1: cada workspace é um diretório com `config.json`. Index gerado em memória no boot.

**Pros:**
- Sem SQLite; portabilidade máxima
- Edição manual direta

**Contras:**
- Sem FK para sessions (corrompe referências)
- Sem índice para queries (impede `sessions JOIN workspaces`)
- Boot lento com muitos workspaces (ler todos os diretórios)

**Custo de implementação:** Baixo agora, alto depois (refactoring quando sessions precisarem FK).

### Opção C: SQLite + coluna `metadata TEXT` — híbrido com zero migration

**Descrição:** Tabela `workspaces` tem colunas consultáveis fixas (`id`, `name`, `slug`, `root_path`, `created_at`, `updated_at`) mais uma coluna `metadata TEXT NOT NULL DEFAULT '{}'`. Campos de produto que evoluem frequentemente (`defaults`, `setupCompleted`, `styleSetupCompleted`, `theme`, flags) vivem dentro do blob JSON.

**Pros:**
- Colunas fixas permitem FK de sessions + consultas de lista/busca
- `metadata` absorve qualquer campo novo sem migration
- Interface `StoredDetails` em TypeScript define o contrato de serialização
- Filesystem continua sendo a verdade dos arquivos gerenciados (AGENTS.md, projects/, etc.)

**Contras:**
- Campos dentro de `metadata` não são consultáveis por SQL (sem `json_extract` nas queries principais)
- Se `StoredDetails` mudar de forma breaking, o código de `serialize.ts` precisa handle de migração inline

**Custo de implementação:** Médio — requer `serialize.ts` cuidadoso; investimento único.

## Decisão

Optamos pela **Opção C** (híbrido SQLite + coluna metadata JSON).

Reasoning:

1. Sessions precisarão de FK `workspace_id` nas tasks seguintes; sem SQLite isso é impossível.
2. A faixa de campos que muda com maior frequência são as preferências do workspace (`defaults.*`, flags de wizard), não o core identitário (`name`, `slug`). Separar as duas categorias é a decisão certa.
3. Drizzle beta pin (ADR-0042) desaconselha adicionar colunas a toda evolução de produto; a coluna `metadata` atua como buffer.
4. O filesystem mantém seu papel: workspaces são directorios reais (`rootPath`) com conteúdo do usuário. SQLite é o índice, não a cópia.

## Consequências

### Positivas

- `workspaces.list()` é uma query SQL com ORDER BY, sem I/O de disco por workspace
- `sessions` pode ter `FOREIGN KEY (workspace_id) REFERENCES workspaces(id)` sem schema break
- Adicionar `metadata.myNewFlag` em `StoredDetails` não exige migration nem PR de schema
- Rollback em erro de bootstrap do filesystem: o serviço deleta o registro do SQLite, garantindo consistência

### Negativas / Trade-offs

- Campos dentro de `metadata` não são filtraveis via SQL sem `json_extract`; aceitável porque todas as queries de lista operam sobre `name`/`slug`/`root_path`
- `serialize.ts` é ponto único de falha: parsing inválido de `metadata` cai em `{}` com defaults, comportamento defensivo documentado

### Neutras

- Filesystem bootstrap cria `context/`, `people/`, `goals/`, `projects/`, `AGENTS.md`, `CLAUDE.md`, `labels/config.json` (Área/Tipo pt-BR) — estrutura idêntica à do working directory central

## Estrutura implementada

```
apps/desktop/src/main/services/
├── workspaces-service.ts         # SqliteWorkspacesService (lista, cria, atualiza, deleta)
└── workspaces/
    ├── serialize.ts              # rowToWorkspace / workspaceToRow + StoredDetails interface
    ├── filesystem.ts             # bootstrapWorkspaceFilesystem / cleanupWorkspaceFilesystem
    └── slug.ts                   # generateSlug (kebab-case + unicidade)

packages/data/src/schema/
└── workspaces.ts                 # Drizzle table: id, name, slug, root_path, metadata, timestamps
```

Interface de serialização:

```ts
interface StoredDetails {
  readonly defaults: Workspace['defaults'];
  readonly setupCompleted: boolean;
  readonly styleSetupCompleted: boolean;
  readonly metadata: Workspace['metadata'];
}
```

## Validação

- Testes unitários em `__tests__/serialize.test.ts`: round-trip sem perda, defaults em metadata ausente
- `check:circular`: `serialize.ts` não importa `filesystem.ts`
- `check:file-lines`: `workspaces-service.ts` ≤ 300 LOC (gate main-size)
- Smoke: criar workspace → reabrir app → workspace visível com mesmos defaults

## Referencias

- TASK-11-02-01 (`STUDY/Audit/Tasks/11-features/02-workspaces/TASK-11-02-01-workspace-model.md`)
- ADR-0040a: node:sqlite nativo (Node 24)
- ADR-0042: Drizzle ORM beta pin
- ADR-0045: Backup ZIP v1 (padrão de formato de transferência de dados)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-02-01/02/03 entregues)
