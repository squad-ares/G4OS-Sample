# ADR-0131 — Project files: path-traversal guard + snapshots locais pré-save + limite 10 MiB

**Status:** Accepted  
**Data:** 2026-04-22  
**Épico:** 11-features/03-projects (TASK-11-03-02)

---

## Contexto

Arquivos de projetos são expostos via IPC: o renderer pode chamar `saveFile(projectId, relativePath, content)` com qualquer `relativePath`. Sem validação, um atacante local poderia escalar para arquivos fora do diretório `files/` do projeto.

## Decisão

### Path-traversal guard

Toda operação de arquivo em `file-ops.ts` passa por `safeResolve(rootPath, relativePath)`:

```ts
function safeResolve(rootPath: string, relativePath: string): string {
  const filesDir = join(rootPath, 'files');
  const abs = resolve(filesDir, relativePath);
  if (!abs.startsWith(filesDir)) {
    throw new Error('path traversal attempt');
  }
  return abs;
}
```

`resolve()` normaliza `../` antes da verificação com `startsWith`. A operação falha com erro antes de qualquer I/O.

### Snapshots pré-save

Antes de sobrescrever um arquivo existente, `snapshotIfExists()` copia o conteúdo atual para:

```
<rootPath>/.g4os/snapshots/<relativePath>/<timestamp-ms>.bak
```

`pruneSnapshots()` mantém no máximo os 10 snapshots mais recentes por arquivo (ordenação lexicográfica do timestamp em ms).

### Limite de tamanho

`saveFile` rejeita conteúdo maior que 10 MiB (`MAX_UPLOAD_BYTES = 10 * 1024 * 1024`) antes de qualquer escrita. O campo `canSync` em `ProjectFile` sinaliza ao renderer se o arquivo é menor que 1 MiB para sync (limiar de colaboração do Multiplayer Projects V1).

### Tipos de MIME

`MIME_MAP` mapeia extensões → MIME type. Extensões desconhecidas recebem `application/octet-stream`.

## Consequências

- Arquivos `.g4os/` são excluídos da listagem recursiva (`entry.name.startsWith('.')` em `collectFiles`).
- Snapshots ocupam espaço em disco; o limite de 10 é um compromisso entre segurança e espaço.
- O guard protege contra traversal em contexto de processo local; não é um substituto para validação de entrada no IPC.

## Alternativas Rejeitadas

- **Sem guard**: trivialmente inseguro.
- **Sandbox em Worker isolado**: overhead desnecessário para operações de arquivo locais com usuário autenticado.
- **Versioning via git**: adiciona dependência externa (git CLI) e complexidade de merge para o caso de uso simples de "desfazer última edição".
