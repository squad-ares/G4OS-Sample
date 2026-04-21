# ADR 0102: Theme system — Context API + CSS custom properties, sem next-themes

## Metadata

- **Numero:** 0102
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead

## Contexto

V1 usava `next-themes` — biblioteca criada para Next.js SSR. Em Electron (sem SSR, sem hidratação), `next-themes` adiciona overhead sem benefício: o problema de flash-of-unstyled-theme que ela resolve não existe em apps desktop onde não há round-trip de servidor.

Além disso, `next-themes` está na lista de bibliotecas banidas em V2 (CLAUDE.md) por ser "overkill em Electron — Context API".

## Opções consideradas

### Opção A: Context API nativo + CSS custom properties
**Descrição:** `ThemeContext` com `light | dark | system`. Tema `system` lê `prefers-color-scheme` via `window.matchMedia`. Preferência persistida em `localStorage`. Classe `dark` adicionada ao `<html>` para compatibilidade com Tailwind CSS `darkMode: 'class'`.

**Pros:**
- Zero dependência extra
- Sem flash: script inline em `index.html` lê localStorage antes do React montar
- Funciona identicamente em Electron e em qualquer browser
- Totalmente controlável — nenhum comportamento oculto de biblioteca externa

**Contras:**
- ~50 LOC a implementar vs import de lib pronta
- Listener de `matchMedia` precisa ser descartado em unmount

**Custo de implementação:** XS (< 1 dia)

### Opção B: Manter next-themes
**Descrição:** Continuar usando `next-themes` por familiaridade.

**Pros:**
- Zero esforço de migração (V1 já tinha)

**Contras:**
- Dependência banida (CLAUDE.md)
- Overhead de hidratação SSR desnecessário
- Não suportado como padrão do projeto

**Custo de implementação:** XS

## Decisão

**Opção A**. Implementação própria é < 50 LOC, elimina dependência banida e não tem comportamento surpresa.

Contrato do `ThemeProvider`:

```tsx
type Theme = 'light' | 'dark' | 'system';
interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: 'light' | 'dark';   // nunca 'system'
  setTheme: (t: Theme) => void;
}
```

Script anti-flash em `index.html` (antes do bundle React):
```html
<script>
  const t = localStorage.getItem('g4-theme') ?? 'system';
  const d = t === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : t;
  document.documentElement.classList.add(d);
</script>
```

## Consequências

### Positivas
- Sem flash no boot (script inline resolve tema antes do paint)
- Tailwind `dark:` classes funcionam via `class="dark"` no `<html>`
- `resolvedTheme` sempre `light | dark` — componentes nunca lidam com `system`

### Negativas / Trade-offs
- Script inline em `index.html` é duplicação leve da lógica do Context

### Neutras
- Listener de `matchMedia` registrado via `useEffect` com cleanup — sem leak

## Validação

- Mudar de `light` para `dark` e reabrir o app: tema persiste sem flash
- `system` no macOS: mudar preferência do SO reflete em tempo real no app
- `tsc --noEmit` não reporta erro em nenhum uso de `useTheme()`

## Referencias

- TASK-10-03: Theme system
- ADR-0102a: Core visual do shell
- `packages/ui/src/theme/`

---

## Histórico de alterações

- 2026-04-21: Proposta e aceita (TASK-10-03)
