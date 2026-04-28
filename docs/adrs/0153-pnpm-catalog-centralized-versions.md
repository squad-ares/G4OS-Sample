# ADR 0153: Adoção de pnpm catalog para centralizar versões compartilhadas

## Metadata

- **Numero:** 0153
- **Status:** Accepted
- **Data:** 2026-04-27
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

O monorepo usa pnpm@10.33.0 + Turborepo (ADR-0001). Com 15 packages + 2 apps,
diversas dependências com versão fixa ou range se repetem em múltiplos
`package.json`:

- `neverthrow` aparecia em 8 arquivos (`8.2.0` fixo em todos — OK)
- `zod` aparecia em 6 arquivos com **drift**: `^4.0.0` (credentials, ipc, kernel)
  vs `^4.3.6` (agents, data, features) — potencial resolução em versões diferentes
- `@types/archiver` aparecia em 3 arquivos com **drift**: `6.0.3` (observability)
  vs `7.0.0` (desktop, data) — type mismatch latente
- `@types/node`, `vitest`, `rxjs`, `react/react-dom`, `pino/pino-pretty/pino-roll`,
  `drizzle-orm`, `electron-trpc`, `superjson`, `shiki`, etc. — cada um repetido
  em 2–13 arquivos

Sem uma fonte de verdade centralizada, qualquer bump de versão exige N edições
manuais em N `package.json`, e o drift detectado só é visível em `pnpm install`
(resolução divergente) ou via auditoria manual periódica.

## Opções consideradas

### Opção A: Continuar com versões hardcoded por package.json

**Pros:**
- Zero overhead de setup.

**Contras:**
- Drift de versão entre packages é silencioso — `zod: "^4.0.0"` vs `"^4.3.6"`
  pode resolver em versões diferentes dependendo do lockfile snapshot.
- Bump de `neverthrow 8.2.0 → 8.3.0` exige tocar 8 arquivos.
- Code review não detecta facilmente se alguém adicionou versão ligeiramente
  diferente de uma dep já usada.

### Opção B: pnpm workspace `catalog:` (escolhida)

**Descrição:** pnpm v9.1+ (estável em v10) suporta bloco `catalog:` em
`pnpm-workspace.yaml`. Packages declaram `"catalog:"` em vez de versão literal.
pnpm resolve tudo para a versão definida no catalog.

**Pros:**
- Bump em um lugar propaga para todos os packages em `pnpm install`.
- Drift detectado e corrigido na migração (versão canônica escolhida).
- `pnpm install` falha com erro claro se package usa `"catalog:"` para dep
  não listada no catalog — impede drift silencioso.
- Zero overhead de runtime.

**Contras:**
- `package.json` com `"catalog:"` não indica a versão real sem consultar o
  workspace file — developers que leem `package.json` isolado não veem a versão.
- Deps usadas em apenas um package devem permanecer com versão literal (adicioná-las
  ao catalog seria noise sem benefício).

### Opção C: Syncpack / Manypkg (ferramentas de sync)

**Descrição:** Ferramentas que verificam inconsistências de versão via CI sem
mudar a sintaxe do `package.json`.

**Pros:**
- `package.json` permanece legível.
- Detecta drift.

**Contras:**
- Detecta mas não centraliza — bump ainda exige N edições.
- Dependência de tooling adicional (outro package a manter).
- pnpm catalog resolve o mesmo problema de forma nativa.

## Decisão

**Opção B**. Adoção do `pnpm catalog:` nativo como fonte de verdade para
dependências compartilhadas em ≥ 2 packages.

**Critério de inclusão no catalog:** dep presente em 2+ packages.
Deps usadas em um único lugar permanecem com versão literal no `package.json`.

**Catalog inicial (27 entradas):** `@types/archiver`, `@types/node`,
`@types/react`, `@types/react-dom`, `@types/yauzl`, `@tanstack/react-router`,
`@trpc/client`, `@trpc/react-query`, `archiver`, `drizzle-orm`,
`electron-trpc`, `lucide-react`, `neverthrow`, `pino`, `pino-pretty`,
`pino-roll`, `react`, `react-dom`, `react-markdown`, `rehype-raw`,
`remark-gfm`, `rxjs`, `shiki`, `superjson`, `vitest`, `yauzl`, `zod`.

**Versão canônica escolhida para drifts:**
- `zod`: consolidado para `^4.3.6` (superset compatível de `^4.0.0`)
- `@types/archiver`: consolidado para `7.0.0` (alinhado com `archiver@7.x`)

## Consequências

### Positivas

- Bump de qualquer dep catalogada é uma linha em `pnpm-workspace.yaml`.
- `pnpm install` garante que todos os packages resolvem para a mesma versão.
- Drift detectado na migração foi corrigido (zod, @types/archiver).

### Negativas / Trade-offs

- `package.json` com `"catalog:"` requer consulta ao workspace file para
  saber a versão real. Mitigação: `pnpm why <pkg>` ou `pnpm list` continuam
  funcionando normalmente.
- Deps novas adicionadas a apenas um package mas que eventualmente se tornam
  compartilhadas precisam ser movidas ao catalog — requer disciplina.

### Neutras

- Lockfile gerado pelo `pnpm install` permanece determinístico (sem mudança).
- ADR-0001 (pnpm + Turborepo) não é alterado — catalog é feature nativa do
  pnpm, não nova tooling.

## Validação

- `pnpm install` retorna `Done` sem erros de catalog missing.
- Gates de CI continuam passando: typecheck, lint, test.
- Novos packages adicionados ao monorepo devem usar `"catalog:"` para deps
  já catalogadas — code review rejeita versão literal duplicada.

## Referencias

- pnpm Catalogs: https://pnpm.io/catalogs
- ADR-0001 — Monorepo structure (pnpm + Turborepo).
- `pnpm-workspace.yaml` — bloco `catalog:` com 27 entradas.

---

## Histórico de alterações

- 2026-04-27: Proposta e aceita junto com migração dos 15 package.json.
  Drifts `zod` e `@types/archiver` corrigidos. Gates: typecheck 30/30,
  lint 0 erros, tests 29/29.
