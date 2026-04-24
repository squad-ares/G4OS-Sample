# ADR 0103: @g4os/ui — consolidação Radix + shadcn/ui como biblioteca única

## Metadata

- **Numero:** 0103
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

V1 tinha primitivos Radix espalhados em três lugares diferentes (`packages/ui`, `apps/electron/src/renderer/components/ui`, raiz do monorepo) com versões divergentes. Consequência: `Dialog` de um lugar não compunha com `Tooltip` de outro; upgrades quebravam em dois ou três locais.

V2 precisa de uma única fonte de verdade para componentes UI compartilhados entre o renderer e qualquer futura surface web.

## Opções consideradas

### Opção A: @g4os/ui como host único de Radix + shadcn/ui
**Descrição:** Todos os primitivos Radix importados e re-exportados de `packages/ui`. Componentes compostos (Button, Input, Dialog, etc.) seguem o padrão shadcn/ui: código-fonte no repositório, não dependência de npm. Tailwind CSS como engine de estilo.

**Pros:**
- Uma versão de cada primitivo em todo o monorepo
- shadcn/ui é copiar-e-colar — zero dep adicional de runtime
- Tailwind tokens centralizados em `packages/ui/tailwind.config.ts`
- Componentes são editáveis diretamente (sem override de biblioteca fechada)

**Contras:**
- shadcn/ui não é uma lib npm — atualizações são manuais
- Tailwind precisa de configuração correta de `content` em cada app consumidora

**Custo de implementação:** M (3-5 dias para portar componentes usados)

### Opção B: Manter espalhamento com peer deps
**Descrição:** Cada pacote declara `@radix-ui/*` como peer dep e instala sua própria versão.

**Pros:**
- Nenhum esforço imediato

**Contras:**
- Problema estrutural que gerou bugs em V1 permanece
- Versões divergem a cada update

**Custo de implementação:** XS (mas divida técnica alta)

### Opção C: Biblioteca de componentes publicada (ex: Mantine, Chakra)
**Descrição:** Substituir Radix por biblioteca com componentes prontos.

**Pros:**
- Componentes mais completos out-of-the-box

**Contras:**
- Lock-in em biblioteca externa; customização requer overrides
- Estilo não alinhado com design tokens do V1 (parity contract ADR-0102a)
- Quebra separação de concerns entre `@g4os/ui` e o design system

**Custo de implementação:** L

## Decisão

**Opção A**. shadcn/ui + Radix em `packages/ui` é o padrão de mercado para Electron apps com design system próprio (VS Code segue padrão similar). O custo de manutenção manual de shadcn/ui é aceitável dado que mudanças de componentes passam por code review de qualquer forma.

Estrutura adotada:

```
packages/ui/
├── src/
│   ├── components/        # componentes compostos (Button, Input, Dialog, …)
│   ├── primitives/        # re-exports de @radix-ui/* quando necessário
│   ├── hooks/             # useMediaQuery, useDebounce, etc.
│   ├── theme/             # ThemeProvider + ThemeContext
│   └── index.ts           # barrel
├── tailwind.config.ts     # tokens canônicos — ÚNICA fonte de verdade
└── package.json           # peerDeps: react, react-dom; deps: @radix-ui/*, tailwind-merge, class-variance-authority
```

Apps consumidoras estendem `tailwind.config.ts` de `@g4os/ui`:
```ts
import baseConfig from '@g4os/ui/tailwind.config';
export default { ...baseConfig, content: ['./src/**/*.{tsx,ts}', ...baseConfig.content] };
```

## Consequências

### Positivas
- Uma versão de `@radix-ui/*` em todo o monorepo
- Tokens Tailwind (cores, espaçamento, radius) centralizados
- Componentes editáveis sem override de biblioteca fechada

### Negativas / Trade-offs
- Updates de shadcn/ui são manuais — equipe precisa acompanhar changelog
- Apps consumidoras precisam configurar `content` no Tailwind corretamente

### Neutras
- `packages/ui` não depende de `electron` — pode ser usado em `apps/viewer`

## Validação

- `pnpm check:cruiser` não detecta imports diretos de `@radix-ui/*` fora de `packages/ui`
- `tsc --noEmit` em `packages/ui` passa sem erros
- Button, Input, Dialog, Spinner, Tooltip funcionais com dark mode

## Referencias

- TASK-10-04: Base components
- ADR-0102a: Core visual do shell
- ADR-0006: Package boundaries
- `packages/ui/`

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-04)
