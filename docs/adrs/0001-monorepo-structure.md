# ADR 0001: Monorepo structure com pnpm + Turborepo

## Metadata

- **Numero:** 0001
- **Status:** Accepted
- **Data:** 2026-04-16
- **Autor(es):** @tech-lead
- **Stakeholders:** @senior-1, @devops-lead

## Contexto

V1 usa Bun como package manager. Identificamos 2 problemas criticos:

1. **Bugs em módulos nativos:** better-sqlite3, Electron, sharp apresentam bugs conhecidos de install com Bun
2. **Hoisting instável:** módulos fantasma resolvem imports nao declarados

Além disso, v1 nao tem cache de build. CI leva 15+ minutos por PR.

## Opções consideradas

### Opção A: Manter Bun como package manager
- **Pros:** rápido, familiar ao time
- **Contras:** bugs documentados; incerteza em Electron; sem cache de tasks

### Opção B: pnpm workspaces puro (sem task runner)
- **Pros:** hoisting determinístico, maturidade
- **Contras:** sem cache; builds sequenciais lentos

### Opção C: pnpm + Turborepo
- **Pros:** hoisting estável; cache local e remoto; paralelismo; afinidade com Vercel ecosystem
- **Contras:** mais complexidade inicial; 1 ferramenta a mais no stack

### Opção D: pnpm + Nx
- **Pros:** features extras (generators, migrations)
- **Contras:** mais pesado, over-engineered para nosso caso

## Decisão
**Opcao C — pnpm + Turborepo**.

## Consequências

### Positivas
- Install determinístico cross-platform
- Cache reduz CI de 15min para 2-3min em PRs típicos
- Paralelismo automático respeitando grafo de deps
- Graph de pacotes explicito

### Trade-offs
- Curva de aprendizado para desenvolvedores novos em Turborepo
- Dependência de infra Vercel para cache remoto (opcional)

### Neutras
- Bun ainda pode ser usado para rodar scripts TS (velocidade), mas nao como PM

## Validação

- Meta: CI para PR tipico < 5min
- Meta: `pnpm install` < 60s em cache quente
- Revisão em 3 meses para confirmar decisão

## Referencias

- [pnpm workspaces](https://pnpm.io/workspaces)
- [Turborepo handbook](https://turbo.build/repo/docs/handbook)