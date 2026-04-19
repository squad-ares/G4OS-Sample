---
name: execute-task
description: Execute a TASK-XX-YY file from STUDY/Audit/Tasks following G4 OS v2 conventions end-to-end — read task, implement with project patterns (IDisposable, Result, tRPC, event sourcing), run all CI gates, write ADR when a non-trivial decision is made, and update CLAUDE.md/AGENTS.md when behavior changes. Use when the user points at a TASK file or asks to execute/implement an epic or task from the audit folder.
---

# execute-task

Dominant workflow in this repository. v2 is being built from the audit roadmap in `STUDY/Audit/Tasks/` (repo irmão `G4OS/`). Cada task é auto-contida com critério de aceite. Este skill é o checklist imutável que mantém a disciplina da v1→v2 sem depender de memória de curto prazo.

## Quando acionar

- Usuário aponta para um arquivo `TASK-XX-YY-*.md` em `STUDY/Audit/Tasks/`
- Usuário diz "execute a tarefa X", "implemente TASK-XX", "rode o épico 04"
- Usuário pede "próxima tarefa" e o contexto já menciona o roadmap

## Fluxo obrigatório

### 1. Ler a task **inteira**

Não comece a codar antes de ler do topo ao fim, inclusive:
- **Metadata** (prioridade, esforço, dependências) — bloqueia se dep não está feita
- **Contexto** — o que no v1 motivou essa task
- **Passo a passo** — o código de exemplo na task é **referência**, não cópia literal; adapte ao estilo v2 (TS strict, Biome, IDisposable, Result)
- **Critérios de aceite** — cada checklist vai virar verificação concreta no final
- **Armadilhas v1** — o sinal mais alto. NÃO repita esses erros.

### 2. Verificar ADR relacionado

Antes de codar uma decisão não-trivial:
- Ler `docs/adrs/README.md` — achar ADR existente para a camada (kernel, ipc, process, data, credentials, etc.)
- Se não existe ADR e a decisão é estrutural (nova lib, novo padrão, novo boundary): **crie um antes** com `pnpm adr:new`
- Decisões triviais (nome de arquivo, estrutura interna de 1 módulo) não precisam de ADR

ADRs aceitos são **imutáveis**. Decisão nova que contradiz ADR aceito = novo ADR com status `Superseded by ADR-NNNN`.

### 3. Planejar com TodoWrite

Se a task tem >3 passos distintos, use `TodoWrite`. Um único todo `in_progress` por vez. Marque `completed` imediatamente (não batch).

### 4. Implementar seguindo os padrões v2

Checklist rápida antes de escrever cada arquivo:

- [ ] Arquivo ≤ 300 LOC se estiver em `apps/desktop/src/main/`, ≤ 500 LOC em qualquer outro lugar
- [ ] `import type` para imports só-de-tipo (`verbatimModuleSyntax`)
- [ ] Sem `any`, sem `@ts-ignore`, sem `console.*` fora de `scripts/`
- [ ] Sem `default export` fora de configs
- [ ] Classes com listener/timer/subprocess extendem `DisposableBase` + usam `this._register(...)`
- [ ] Erros esperados → `Result<T, E>` via `neverthrow`; exceptions só para bugs
- [ ] `process.env` bloqueado (`noProcessEnv`) — workers lêem `process.argv[N]`
- [ ] Native deps opcionais via `import()` dinâmico com type interface local (padrão usado em `electron-runtime.ts`, `cpu-pool.ts`, `sqlite/database.ts`)
- [ ] Boundaries: feature **não importa** outra feature; renderer **não importa** `electron`/`main`
- [ ] Nome de arquivo em `kebab-case.ts`

Consulte `CLAUDE.md` na raiz para a tabela completa de convenções.

### 5. Rodar gates localmente **antes** de reportar conclusão

Ordem exata (falha rápido = fix rápido):

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check:file-lines
pnpm check:main-size      # se tocou em apps/desktop/src/main/
pnpm check:circular
pnpm check:cruiser
pnpm check:dead-code
pnpm check:unused-deps
pnpm check:exports
```

Todos verdes antes de dizer "pronto". Gate falhando = task não está completa, por definição.

Se um gate só roda depois de `pnpm install` de uma dep nova (ex: `better-sqlite3` native binding exige `pnpm rebuild`), documente isso na resposta ao usuário e rode o passo de setup.

### 6. Atualizar documentação no mesmo ciclo

Se o comportamento mudou (nova lib, novo padrão, novo fluxo):
- **Criar ADR** (passo 2) — status `Accepted` quando testes passam
- **Atualizar `docs/adrs/README.md`** — tabela + seção por época
- **Atualizar `CLAUDE.md` e `AGENTS.md`** (sempre em par) — apenas se convenção repo-wide mudou
- **Atualizar README do pacote** (se houver) — não inventar se não existe

Nunca edite um ADR aceito. Para reverter, crie novo ADR.

### 7. Changeset quando tocar pacote publicável

`pnpm changeset` para qualquer mudança em `packages/*`. Scaffolding privado (`private: true`) é dispensável, mas quando em dúvida, crie — barato.

### 8. Commit apenas se o usuário pediu

Por convenção do repositório, **não comite automaticamente**. Só quando o usuário explicitar ("faz o commit", "/commit"). Quando for comitar: Conventional Commits (`feat(data): ...`, `fix(electron): ...`, `docs(adr): ...`), mensagem focada no WHY.

### 9. Reportar

Formato curto:
- **Arquivos criados/modificados** (bullet list com path clicável)
- **ADRs adicionados** se houver
- **Gates** (uma linha: "typecheck ✓ lint ✓ test ✓ build ✓ circular ✓ boundaries ✓ main-size (X/2000)")
- **Próximo passo sugerido** (se task anterior desbloqueou uma específica)

## Armadilhas que eu mesmo tento cair

1. **"Só copiar o código da task"** — os exemplos usam sintaxe solta (nullable sem check, `process.env`, default exports). Traduza para v2-strict.
2. **"Gate falhou por formatação, só rodar `lint:fix`"** — OK se for só formato. Se for `useAwait` ou `noEmptyBlockStatements`, o autofix não resolve; refatore.
3. **"Pular `check:unused-deps`"** — essa é a gate que pega dep declarada mas não usada; acontece com dynamic imports. Solução: `knip.json` → `ignoreDependencies`.
4. **"Escrever ADR depois"** — ADR depois do código = documento decorativo. ADR antes = força reflexão sobre trade-offs.
5. **"Atualizar só `CLAUDE.md`, esquecer `AGENTS.md`"** — convenção repo-wide é sincronizar os dois no mesmo commit.
6. **"Passar `process.env.X` no worker"** — bloqueado por `noProcessEnv`. Use `process.argv[N]` em `utilityProcess.fork(module, [arg])`.
7. **"Escrever testes que mocksam o native binding"** — se o binding não estiver disponível, use `describeIfBinding` pattern (ver `packages/data/src/__tests__/database.test.ts`). Teste o contrato, não o mock.

## Referências canônicas

- `CLAUDE.md` (raiz) — convenções repo-wide, stack decisions, comandos
- `docs/adrs/` — decisões aceitas (imutáveis)
- `STUDY/Audit/Tasks/README.md` — filosofia do roadmap
- `STUDY/Audit/analise-causas-e-solucoes.md` — por que v2 existe (3 dores do cliente)
- `STUDY/Audit/packages.md` — mapa biblioteca → problema que resolve
- `scripts/check-*.ts` — gates customizados (ler antes de "contornar")
