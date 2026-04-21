# ADR 0113: Tool renderer plugin registry

## Metadata

- **Numero:** 0113
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

Tool results em chat assistants chegam com shape heterogêneo: `Bash` retorna stdout + exit code, `Read` retorna conteúdo de arquivo, `Grep` retorna matches, ferramentas custom retornam JSON arbitrário. A v1 tinha um `switch(toolName)` gigante dentro do render da mensagem, misturando apresentação e lógica. Dois sintomas:

- Adicionar um renderer novo exigia tocar o arquivo central (> 1000 LOC) que já estava próximo do teto de complexidade.
- Ferramentas desconhecidas (plugins em dev, MCP externo) caíam no default de `JSON.stringify`, sem marker visual de erro vs sucesso.

TASK-11-00-03 pede um pipeline extensível, onde o feature consumidor registra renderers sob demanda e os desconhecidos caem em fallback seguro.

## Opções consideradas

### Opção A: Switch centralizado por `toolName`

**Descrição:** manter um `switch` grande em um componente único (`ToolResult.tsx`).

**Pros:**
- Zero overhead de abstração.
- Fácil de ler enquanto a lista é pequena.

**Contras:**
- Não escala com ferramentas MCP de terceiros (novas ferramentas por workspace).
- Acopla features × provider × nome da ferramenta no mesmo arquivo — quebra DI.
- Bug histórico: um `default` sem marker de erro escondia falhas.

### Opção B: Registry global + dispatcher

**Descrição:** `registerToolRenderer()` adiciona uma entrada `{ name, canRender, Component }` num array module-local. `resolveToolRenderer(toolName, result)` faz `find()` pelo primeiro `canRender(toolName, result)` que retorna true. `ToolResultDispatcher` consulta o registry e renderiza; se nada casar, usa `FallbackRenderer`.

**Pros:**
- Extensível: MCP manager pode registrar renderer por tool quando o source ativa.
- Cada renderer é um arquivo isolado, ≤100 LOC.
- `canRender` é a forma mais flexível de dispatch — pode considerar o shape do `result` (ex: só renderizar se for `{stdout, exitCode}`).
- Fallback explícito via `FallbackRenderer` com marker de erro quando `result.error` existe.

**Contras:**
- Ordem de registro importa (primeiro match vence). Exige disciplina para não ter dois renderers que casam com o mesmo tool.
- Registry é singleton module-local — teste precisa de cuidado para não vazar entre specs.

### Opção C: Dispatch via React Context

**Descrição:** `ToolRendererProvider` injeta o map de renderers via Context; `useToolRenderer()` consome.

**Pros:**
- Sem singleton — cada árvore React tem seu próprio registro.

**Contras:**
- Obriga cada consumidor a embrulhar o Provider, mesmo quando o registro é estável.
- React Context não é uma mensagem de arquitetura — é um canal de estado. Confunde quem lê o código.

## Decisão

Optamos pela **Opção B** (registry module-local + dispatcher).

Reasoning:

1. Tool results são raros o suficiente para que a ordem de registro não vire um problema real; e se virar, resolve-se declarando `canRender` mais preciso.
2. Singleton é aceitável porque o módulo de tool-renderers é um ponto central de extensão — não queremos múltiplas instâncias competindo.
3. Fallback dedicado (`FallbackRenderer`) corrige o bug da v1 (default sem marker de erro): o fallback usa `CollapsibleResult` com `isError` derivado de `'error' in result`.
4. `CollapsibleResult` é o wrapper unificado — todo tool result é colapsável, com header consistente (dot verde/vermelho + nome + seta) e auto-expand quando `isError`.

## Consequências

### Positivas

- Adicionar renderer novo = um arquivo + uma linha de `registerToolRenderer()` na inicialização da feature. Sem tocar outros renderers.
- Renderers específicos (bash, read-file, search-results) mostram UX rica sem bloquear ferramentas desconhecidas (fallback JSON).
- Teste unitário por renderer é viável — cada um é um componente puro.
- Paridade com v1: o corpus de TASK-11-00-11 cobre `FallbackRenderer` com string, JSON estruturado e shape de erro.

### Negativas / Trade-offs

- Ordem importa: renderer mais específico precisa ser registrado antes do genérico.
- Registry sobrevive entre testes; quem testar registrando renderer fake precisa limpar em `afterEach`.

### Neutras

- `ToolRendererComponent` tem shape mínimo (`{ result: unknown, toolUseId: string }`) — renderers que precisam de mais contexto (ex: nome da tool para o header) recebem via extensão de prop (padrão usado no `FallbackRenderer`).

## Estrutura implementada

```
packages/features/src/chat/tool-renderers/
├── registry.tsx               # registerToolRenderer + resolveToolRenderer + types
├── tool-result-dispatcher.tsx # consulta registry; fallback se miss
├── fallback-renderer.tsx      # JSON.stringify + CollapsibleResult com isError detection
├── collapsible-result.tsx     # wrapper visual — header + body animado
├── bash-renderer.tsx          # stdout/stderr + exit code colorizado
├── read-file-renderer.tsx     # content + path com syntax highlight
├── search-results-renderer.tsx# matches lista com snippet
└── index.ts                   # barrel
```

## Validação

- Gate `check:file-lines`: todos os renderers ≤150 LOC.
- Gate `check:cruiser`: nenhum renderer importa `electron` ou `main/`.
- Vitest: snapshot de `FallbackRenderer` com string, JSON e erro (TASK-11-00-11 fixtures).

## Referências

- TASK-11-00-03
- ADR-0070 (agent events — tool_use / tool_result)
- ADR-0081-0086 (sources MCP — origem dos tool results MCP)
- ADR-0120 (legacy transcript parity — cobertura via fixtures)

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-11-00-03 entregue).
