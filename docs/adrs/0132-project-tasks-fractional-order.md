# ADR-0132 — Project tasks: ordering fracional via string lexicográfica sem dependência externa

**Status:** Accepted  
**Data:** 2026-04-22  
**Épico:** 11-features/03-projects (TASK-11-03-03)

---

## Contexto

Tarefas de projeto exigem ordenação persistente e reordenável pelo usuário (drag-and-drop dentro de colunas Kanban). O padrão da indústria para isso é "fractional indexing" — índices de ponto flutuante ou string que permitem inserir um item entre dois existentes sem reindexar.

## Decisão

Usar a coluna `order TEXT NOT NULL` com valores string comparáveis lexicograficamente. A função `generateOrder()` em `tasks-repository.ts` usa o timestamp em milissegundos como string de 16 dígitos zero-padded:

```ts
function generateOrder(): string {
  return Date.now().toString().padStart(16, '0');
}
```

Isso garante:
1. Ordenação de criação por padrão (timestamp crescente).
2. Sem necessidade de recalcular índices ao criar — cada nova tarefa recebe um timestamp único.
3. Compatível com `ORDER BY order ASC` no SQLite sem funções especiais.

Para reordenação drag-and-drop (futura), a string pode ser atualizada para um valor entre os vizinhos usando strings intermediárias (ex: `"aaaa"` entre `"aaab"` e `"aaac"`).

## Consequências

- **Colisão de timestamp**: se duas tarefas forem criadas no mesmo milissegundo, terão o mesmo `order`. O campo `id` UUID desempata na prática, mas não há garantia de ordenação entre elas.
- **Sem reordenação implementada ainda**: drag-and-drop Kanban está fora do escopo desta task. Quando implementado, precisará de lógica de cálculo de valor intermediário (pode ser inline ou via biblioteca `fractional-indexing`).
- **Tamanho da string**: 16 chars para timestamp ms é suficiente até o ano 33658; não há problema prático de overflow.

## Alternativas Rejeitadas

- **`fractional-indexing` npm**: biblioteca madura, mas adiciona dependência para o caso simples. Reservada para quando drag-and-drop for implementado.
- **INTEGER sequencial**: não permite inserção entre dois existentes sem reindexar toda a coluna.
- **FLOAT**: imprecisão de ponto flutuante pode gerar colisões após várias reordenações.
