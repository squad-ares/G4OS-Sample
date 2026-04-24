# ADR-0133 — Legacy project import: discovery em 3 candidatos + sentinel file

**Status:** Accepted  
**Data:** 2026-04-22  
**Épico:** 11-features/03-projects (TASK-11-03-06)

---

## Contexto

O v1 armazenava projetos em locais variados dependendo da versão e configuração:

1. `~/.g4os/workspaces/{id}/projects/` — root legado dentro do diretório de dados do workspace
2. `<workingDirectory>/projects/` — root dentro do diretório de trabalho configurado
3. `<workingDirectory>/projetos/` — variante em português usada em versões antigas

O v2 adota um único root canônico em `<workspacesRootPath>/<workspaceId>/projects/` (ADR-0130). Projetos que existem nos locais legados não estão no banco de dados v2 e precisam ser descobertos e registrados para que o domínio de projetos funcione corretamente após upgrade.

---

## Decisão

### 1. Discovery nos 3 candidatos com deduplicação

A função `discoverLegacyProjects` em `legacy-import.ts` varre os 3 locais candidatos usando `Set<string>` de paths resolvidos para evitar duplicatas (e.g., se `workingDirectory/projects` aponta para o mesmo lugar que o root canônico via symlink ou coincidência de path):

```typescript
const candidates = [...new Set(rawCandidates.map((c) => resolve(c)))];
for (const root of candidates) {
  found.push(...(await scanRoot(root, canonicalRoot, seenPaths)));
}
```

Para cada subdiretório que contém `project.json`, extrai `id`, `name`, `slug`, `description` com fallback seguro para valores padrão derivados do nome do diretório.

### 2. Filtragem de projetos já registrados no DB

O `ProjectsService.discoverLegacyProjects` filtra os resultados da descoberta filesystem antes de retornar ao renderer, excluindo projetos cujo `rootPath` ou `id` já constam no banco de dados do workspace. Isso evita exibir no wizard projetos que já foram importados anteriormente.

### 3. Três decisões por projeto: import / keep / skip

- **import**: move o diretório para o root canônico via `fs.rename` (atômico no mesmo volume), em seguida registra no DB com o ID original do `project.json` (se existente) ou um novo UUID.
- **keep**: registra no DB com o path legado como `rootPath`, sem mover arquivos. Útil quando o projeto está num volume diferente ou numa localização gerenciada externamente.
- **skip**: noop — o projeto permanece no filesystem sem registro no DB.

### 4. `registerLegacy` no repositório

Método distinto de `create` que aceita um `id` explícito opcional:

```typescript
async registerLegacy(input: { id?: string; workspaceId: string; name: string;
                               slug: string; description?: string; rootPath: string })
```

Permite preservar o UUID original do `project.json`, mantendo referências de sessão que já apontavam para aquele ID (se existirem no DB v2).

### 5. Sentinel file para auto-discovery único

Após a execução do import (incluindo decisões "skip"), o serviço cria `<workspacesRootPath>/<workspaceId>/.legacy-import-done` com o timestamp ISO da execução. O renderer pode checar `hasLegacyImportDone` antes de disparar a discovery, evitando mostrar o wizard em toda abertura de workspace.

Escolhemos arquivo sentinel em vez de campo no banco de dados porque:
- Não requer migration de schema
- Permanece válido mesmo se o workspace for recriado com a mesma estrutura de arquivos
- É idempotente: `writeFile` com overwrite é seguro

---

## Consequências

- **Conflict handling**: se o path destino já existe ao tentar `import`, `moveLegacyProject` lança erro com mensagem legível. O `#try` wrapper em `ProjectsService` transforma em `Err<AppError>` propagado ao renderer.
- **Slug duplicado**: o schema não tem `UNIQUE(workspaceId, slug)`, apenas um índice. Dois projetos com o mesmo slug podem coexistir no DB — é raro em contexto legado e aceitável para o caso de uso de import.
- **Projetos em volumes diferentes**: `fs.rename` falha cross-device. Para o MVP, `decision === 'keep'` é o caminho correto nesses casos. Uma futura versão pode usar copy+delete com progresso para cross-device moves.
- **Session links**: sessões v2 referenciam `projectId` (UUID). Se o `project.json` legado contiver o mesmo UUID que foi usado em sessões já importadas para o DB v2, `registerLegacy` preserva esse vínculo automaticamente. Sessões que não estão no DB v2 não têm vínculo para preservar.

## Alternativas Rejeitadas

- **Campo no workspace schema (`metadata.legacyImportDone`)**: requer migration Drizzle + bumping de schema Zod. O sentinel file é mais leve e igualmente confiável.
- **Wizard sempre na abertura (re-discovery a cada vez)**: inaceitável em termos de UX — mostraria lista vazia para usuários que já importaram, e seria lento para workspaces com muitos diretórios legados.
- **Discovery automática sem UI de review**: arriscado — mover diretórios sem confirmação poderia afetar projetos com builds em andamento ou referências externas.
