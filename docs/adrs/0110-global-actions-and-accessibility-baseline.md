# ADR 0110: Action registry global + baseline de teclado e acessibilidade para o shell

## Metadata

- **Numero:** 0110
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @accessibility
- **Task relacionada:** TASK-10A-08 (epic 10A-ajustes)

## Contexto

Sem baseline agora, cada feature do épico 11 tenderia a criar:

- atalhos próprios sem fonte única
- overlays que não restauram foco
- estados vazios ou erros puramente visuais

Requisitos:

- action registry central
- lista gerada de atalhos
- command palette
- navegação keyboard-first razoável no shell base
- componentes de status com semântica acessível

## Opções consideradas

### Opção A: esperar cada feature definir seus atalhos

**Rejeitada:** repete a fragmentação da v1.

### Opção B: centralizar ações globais antes das features (escolhida)

## Decisão

Opção B.

`packages/features/src/shell/actions.ts` passa a ser a fonte única para:

- atalhos globais
- itens da command palette
- lista gerada em `support` e no dialog de atalhos

`useGlobalShortcuts()` escuta teclado fora de inputs e despacha para esse registry. `ShellShortcutsDialog`, `ShellCommandPalette` e `ShortcutsList` consomem a mesma definição. O shell também ganha:

- skip link para o conteúdo principal
- loading/error panels com `aria-live`
- labels traduzidas para conteúdo de screen reader

## Consequências

**Positivas:**

- um único arquivo governa teclado, palette e help list
- o shell já fica utilizável sem mouse em navegação global
- os componentes-base de status deixam de ser só "bonitos" e passam a ser semanticamente úteis

**Negativas:**

- atalhos específicos de feature ainda não entram aqui até a feature existir
- qualquer colisão futura de shortcut precisa ser resolvida centralmente

**Neutras:**

- o baseline não pretende cobrir toda WCAG; ele reduz dívida estrutural antes do épico 11

## Armadilhas preservadas da v1

1. Atalho definido localmente sem fonte única. v2: registry central.
2. Foco perdido após overlays. v2: dialogs Radix + surface única de atalhos.
3. Estado de loading/erro sem semântica. v2: status panels com `aria-live`.

## Referências

- `packages/features/README.md`
- `packages/ui/README.md`
- ADR-0101 (matriz de navegação)
- ADR-0103 (strings traduzidas também em labels de acessibilidade)

---

## Histórico de alterações

- 2026-04-21: Proposta inicial e aceita.
