# ADR-0130 — Project CRUD: schema SQLite + rootPath no filesystem + bootstrap de diretórios

**Status:** Accepted  
**Data:** 2026-04-22  
**Épico:** 11-features/03-projects (TASK-11-03-01)

---

## Contexto

O v1 não tinha entidade "Project" isolada: projetos eram pastas ad-hoc dentro do working directory sem estado rastreado. Isso tornava impossível listar, arquivar, ou associar sessões a um projeto de forma confiável.

## Decisão

### Schema

Dois novos tables em `packages/data/src/schema/`:

- **`projects`** — `id`, `workspace_id` (FK cascade), `name`, `slug`, `description`, `root_path`, `status ('active'|'archived')`, `color`, `created_at`, `updated_at`.
- **`project_tasks`** — `id`, `project_id` (FK cascade), `title`, `status`, `priority`, `labels` (JSON array), `session_id` (FK set null), `order` (string fracional), `created_at`, `updated_at`.

Índices: `(workspace_id, status, updated_at)` em `projects` para listagem paginada; `(project_id, status, order)` em `project_tasks` para board Kanban.

### rootPath no filesystem

Cada projeto recebe um `root_path` absoluto gravado no SQLite no momento da criação. O path é derivado de:

```
<workspacesRootPath>/<workspaceId>/projects/<slug>
```

Onde `<slug>` é a normalização Unicode NFD + kebab-case do nome (máx 80 chars), calculada inline sem dependência externa (função `toSlug` em `projects-service.ts`).

### Bootstrap de diretórios

No `create()`, antes de gravar no banco, `bootstrapProjectDir(rootPath)` cria:

```
<rootPath>/
├── files/      # arquivos gerenciados do projeto
├── context/    # contexto textual do projeto
└── project.json
```

`project.json` é um marcador mínimo com `createdAt`, `sessionIds: []`, `tasks: []`.

A criação de diretórios usa `{ recursive: true }` para ser idempotente.

### Service

`SqliteProjectsService` em `apps/desktop/src/main/services/projects-service.ts` implementa a interface `ProjectsService` do IPC com 17 métodos. Os métodos que delegam diretamente para o repositório omitem `async` (retornam a Promise gerada pelo `#try` diretamente).

## Consequências

- Projetos existem como pastas no filesystem E como registros no SQLite — as duas fontes devem ser consistentes; deleção física do projeto não é feita automaticamente (decisão: manter arquivos, deletar apenas o registro).
- `rootPath` é imutável após criação; renomear projeto não move a pasta.
- Importação de projetos legados requer migration manual do `rootPath` (escopo de TASK-11-03-06).

## Alternativas Rejeitadas

- **Projetos como subpastas virtuais sem banco**: sem status, sem arquivamento, sem associação com sessões.
- **Slugify externo**: dependência extra para uma transformação de 7 linhas; rejeitado (biblioteca banida: lodash, e equivalentes simples não justificam dep).
