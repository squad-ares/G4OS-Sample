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
| 0030 | Electron utilityProcess for worker isolation | Accepted | 2026-04-18 | 03-process-architecture |
| 0031 | Main process thin-layer architecture (<2000 LOC) | Accepted | 2026-04-18 | 03-process-architecture |
| 0032 | Graceful shutdown with deadline and backoff | Accepted | 2026-04-18 | 03-process-architecture |
| 0040 | SQLite persistence with better-sqlite3 | Superseded by 0040a | 2026-04-18 | 04-data-layer |
| 0040a | Node.js `node:sqlite` as SQLite driver | Accepted | 2026-04-18 | 04-data-layer |
| 0042 | Drizzle ORM 1.0 beta pinado até GA (desvio controlado) | Accepted with caveat | 2026-04-18 | 04-data-layer |
| 0043 | Formato do event store (JSONL + multi-consumer checkpoints) | Accepted | 2026-04-18 | 04-data-layer |
| 0044 | Attachment storage content-addressed com refcount + GC | Accepted | 2026-04-18 | 04-data-layer |
| 0045 | Backup/restore ZIP v1 + scheduler 7/4/3 | Accepted | 2026-04-18 | 04-data-layer |

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

### ADRs de Process Architecture (03-process-architecture)
Definem arquitetura de processos, isolamento e lifecycle:
- **0030:** Electron utilityProcess para isolamento de workers
- **0031:** Main thin-layer (<2000 LOC, ≤300 per file)
- **0032:** Graceful shutdown com deadline e exponential backoff

### ADRs de Data Layer (04-data-layer)
Definem persistência, schemas e migrations:
- **0040:** SQLite com better-sqlite3 — _superseded no mesmo dia por 0040a, mantida como registro histórico_
- **0040a:** `node:sqlite` nativo (Node 24 LTS) — zero binding externo, elimina vetor de runtime Windows perdido
- **0042:** Drizzle ORM 1.0 beta pinado até GA — única exceção autorizada à política "sem beta em deps"; rastreada em [`docs/TODO-DRIZZLE-GA.md`](../TODO-DRIZZLE-GA.md)

## Histórico de Alterações

- 2026-04-18: Adicionada ADR 0040 (data-layer)
- 2026-04-18: Adicionadas ADRs 0030-0032 (process-architecture)
- 2026-04-17: Adicionadas ADRs 0010-0013 (kernel)
- 2026-04-16: Adicionadas ADRs 0001-0009 (foundation)
