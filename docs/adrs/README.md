# Architecture Decision Records (ADRs)

## O que é

ADR é um registro **imutável** de uma decisão arquitetural. Cada arquivo:

- Tem número sequencial
- Explica contexto, opções, decisão, consequências
- Não é editado após aceito (apenas novo ADR pode superseder)

## Quando escrever

Escreva ADR quando:

- Escolhe uma tecnologia significativa (banco, framework, lib core)
- Muda um padrão estrutural (ex: decompõe God File)
- Toma decisão com trade-off não-óbvio
- Decisão vai afetar mais de 1 pessoa / time

**Não escreva ADR para:**
- Decisões locais (nome de variável, estrutura de 1 arquivo)
- Decisões óbvias (usar o tipo Date para datas)
- Workarounds temporários

## Como escrever

1. Copiar `_template.md` para `NNNN-titulo-slug.md`
2. Preencher com contexto real
3. Abrir PR com status "Proposed"
4. Discussão assíncrona na PR
5. Tech Lead + pelo menos 1 stakeholder aprovam
6. Merge com status "Accepted"

## Lista

| # | Titulo | Status | Data | Épico |
|---|---|---|---|---|
| 0001 | Monorepo structure with pnpm and Turborepo | Accepted | 2026-04-16 | 00-foundation |
| 0002 | TypeScript strict mode | Accepted | 2026-04-16 | 00-foundation |
| 0003 | Biome linter over ESLint | Accepted | 2026-04-16 | 00-foundation |
| 0004 | Lefthook + Conventional Commits | Accepted | 2026-04-16 | 00-foundation |
| 0005 | CI pipeline with architectural gates | Accepted | 2026-04-16 | 00-foundation |
| 0006 | Package boundaries with dependency-cruiser | Accepted | 2026-04-16 | 00-foundation |
| 0007 | CODEOWNERS enforcement | Accepted | 2026-04-16 | 00-foundation |
| 0008 | Changesets for versioning | Accepted | 2026-04-16 | 00-foundation |
| 0009 | ADR process | Accepted | 2026-04-16 | 00-foundation |
| 0010 | Event-sourced sessions | Proposed | 2026-04-17 | 01-kernel |
| 0011 | Result pattern with neverthrow | Proposed | 2026-04-17 | 01-kernel |
| 0012 | Disposable pattern for resource management | Proposed | 2026-04-17 | 01-kernel |
| 0013 | Platform abstraction layer | Proposed | 2026-04-17 | 01-kernel |
| 0020 | IPC layer with tRPC v11 + electron-trpc + superjson | Accepted | 2026-04-18 | 02-ipc |

## Status

- **Proposed:** em discussão
- **Accepted:** vigente, deve ser seguida
- **Deprecated:** não deve mais ser seguida, mas ainda em código legado
- **Superseded by ADR-XXXX:** substituída por ADR mais recente

## Referência Rápida

### ADRs de Foundation (00-foundation)
Definem infraestrutura, tooling, processos:
- **0001:** Monorepo com pnpm + Turborepo
- **0002:** TypeScript strict mode
- **0003:** Biome (linter + formatter)
- **0004:** Lefthook + Conventional Commits
- **0005:** CI com gates arquiteturais
- **0006:** Boundaries entre pacotes
- **0007:** CODEOWNERS
- **0008:** Changesets
- **0009:** Processo ADR

### ADRs de Kernel (01-kernel)
Definem padrões de código e abstrações:
- **0010:** Event sourcing para sessions
- **0011:** Result pattern (neverthrow)
- **0012:** Disposable para limpeza de recursos
- **0013:** Platform abstraction (macOS/Windows/Linux)

### ADRs de IPC (02-ipc)
Definem protocolo de comunicação entre main e renderer:
- **0020:** tRPC v11 + electron-trpc + superjson

## Histórico de Alterações

- 2026-04-17: Adicionadas ADRs 0010-0013 (kernel)
- 2026-04-16: Adicionadas ADRs 0001-0009 (foundation)
