# ADR 0123: Cleanup do filesystem de workspace — validação de boundary pelo managedRoot

## Metadata

- **Numero:** 0123
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Ao deletar um workspace com `removeFiles: true`, o serviço precisa remover recursivamente o diretório do filesystem. Esta operação é destrutiva e irreversível. A v1 não tinha proteção alguma: se `rootPath` fosse manipulado para apontar para `/`, `/home/usuario`, ou qualquer caminho crítico, a operação executaria silenciosamente.

O mesmo risco existe para a operação de bootstrap reverso (cleanup em caso de erro de criação): o serviço remove o diretório recém-criado, mas precisa garantir que só remove o que ele mesmo criou.

## Opções consideradas

### Opção A: Nenhuma validação — confiar no valor do banco

**Descrição:** Usar `rootPath` diretamente do banco de dados e executar `fs.rm(rootPath, { recursive: true })`.

**Pros:**
- Simples; nenhum código extra

**Contras:**
- Path traversal via dados corrompidos ou manipulados no SQLite
- Sem proteção contra bug em `serialize.ts` que produza `rootPath = ''` ou `rootPath = '/'`

**Custo de implementação:** Zero — e zero segurança.

### Opção B: Blocklist de caminhos proibidos

**Descrição:** Verificar se `rootPath` está em uma lista de prefixos proibidos (`/`, `/home`, `/Users`, `C:\`, etc.).

**Pros:**
- Simples de implementar

**Contras:**
- Blocklist nunca é exaustiva; edge cases em caminhos relativos, symlinks e UNC paths (Windows)
- Manutenção: a lista precisa ser atualizada para cada plataforma suportada

**Custo de implementação:** Médio; manutenção contínua necessária.

### Opção C: Validação por containment — `isPathInside(child, parent)`

**Descrição:** Definir um `managedRoot` como prefixo autorizado (base dir de workspaces, por exemplo `~/.g4os/workspaces/`). Qualquer operação de remoção é precedida por `isPathInside(targetPath, managedRoot)`. A biblioteca `is-path-inside` (ou implementação inline com `path.relative` + verificação de `..`) fornece a verificação robusta, incluindo normalização de `.` e `..`, e symlinks resolvidos.

**Pros:**
- Positivo em vez de negativo: "só pode remover o que está dentro de `managedRoot`"
- Cobre path traversal, caminhos relativos, e variações de separador
- Independente de plataforma
- Mesmo padrão usado no import ZIP (prevenção de zip-slip)

**Contras:**
- Workspaces em caminhos customizados fora de `~/.g4os/workspaces/` não podem ser removidos automaticamente — o serviço deleta apenas o registro do banco e avisa ao chamador

**Custo de implementação:** Baixo; função utilitária de ~10 LOC.

## Decisão

Optamos pela **Opção C** (validação por containment via `isPathInside`).

Reasoning:

1. A abordagem positiva ("só dentro do managedRoot") é fundamentalmente mais segura que blocklists.
2. O mesmo padrão de containment é usado na extração ZIP (ADR-0125), criando coerência no codebase.
3. O trade-off de não remover workspaces externos automaticamente é aceitável: workspaces em diretórios customizados tipicamente contêm trabalho do usuário que ele mesmo configurou; não removê-los automaticamente é o comportamento defensivo correto.

## Consequências

### Positivas

- Path traversal via SQLite corrompido ou manipulado é bloqueado na camada de serviço
- Código explícito: `if (!isPathInside(workspace.rootPath, managedRoot)) return` — auditável
- Mesma proteção cobre bootstrap reverso (cleanup após erro de criação)

### Negativas / Trade-offs

- Workspaces criados em diretórios externos (fora de `~/.g4os/workspaces/`) deixam o diretório no disco quando deletados; o serviço retorna indicação de que a remoção física foi pulada
- Comportamento correto mas pode surpreender: "deletei o workspace mas a pasta ainda existe" — deve ser comunicado na UI

### Neutras

- `managedRoot` é derivado do `appPaths.data` injetado no serviço, não hardcoded — testável com paths temporários

## Estrutura implementada

```ts
// apps/desktop/src/main/services/workspaces/filesystem.ts
export async function cleanupWorkspaceFilesystem(
  rootPath: string,
  managedRoot: string,
): Promise<{ removed: boolean; reason?: string }> {
  if (!isPathInside(rootPath, managedRoot)) {
    return { removed: false, reason: 'outside-managed-root' };
  }
  await fs.rm(rootPath, { recursive: true, force: true });
  return { removed: true };
}
```

A mesma função `isPathInside` (via `path.relative` + verificação de `..`) é reutilizada em `transfer-import.ts` para prevenção de zip-slip.

## Validação

- Teste unitário: `cleanupWorkspaceFilesystem('/tmp/g4os/workspaces/abc', '/tmp/g4os/workspaces')` → `{ removed: true }`
- Teste unitário: `cleanupWorkspaceFilesystem('/etc/passwd', '/tmp/g4os/workspaces')` → `{ removed: false }`
- Teste unitário: `cleanupWorkspaceFilesystem('/tmp/g4os/workspaces/../../../etc', '/tmp/g4os/workspaces')` → `{ removed: false }`

## Referencias

- TASK-11-02-03 (`STUDY/Audit/Tasks/11-features/02-workspaces/TASK-11-02-03-workspace-settings.md`)
- ADR-0121: Persistência híbrida SQLite + filesystem
- ADR-0125: Export/Import ZIP — prevenção de zip-slip (mesmo padrão de containment)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-02-03 entregue)
