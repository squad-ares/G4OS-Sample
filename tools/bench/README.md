# Performance benchmarks

Suite que roda em CI noturno + on-demand. Falha PR se p95 regredir mais
de 10% vs `baseline.json`.

## Métricas alvo (TASK-15-02)

| Métrica | Target | Crítico (bloqueia GA) |
|---|---|---|
| Cold start | < 2s | < 3s |
| Warm start | < 800ms | < 1.5s |
| First message send | < 300ms | < 500ms |
| Session switch | < 150ms | < 300ms |
| Source mount | < 500ms | < 1s |
| Memory idle | < 300MB | < 400MB |
| Memory 10 sessões | < 700MB | < 900MB |
| Memory leak (100 ciclos) | 0 growth | < 5MB/ciclo |

## Como rodar

```bash
# Suite completa (Playwright + Electron)
pnpm bench:all

# Métrica específica
pnpm bench:startup
pnpm bench:roundtrip
pnpm bench:memory

# Comparar com baseline
pnpm bench:check
```

## Baseline

`baseline.json` é a fonte da verdade. Atualizar sempre que regression
intencional acontece (refactor que troca tradeoff conhecido). Commit
inclui `chore(bench): rebaseline X → Y` no message.

## CI integration

`.github/workflows/bench.yml` roda em PR que toca `apps/desktop/**` ou
`packages/**`. Falha o build se `bench:check` retornar exit ≠ 0.

## Threshold de regressão

Default: 10% regressão em p95 bloqueia. Customizar via flag:

```bash
pnpm bench:check --max-regression 0.05  # 5% mais estrito
```

## Layout

- `runner.ts` — entry point que dispara cada bench helper.
- `startup.ts` / `roundtrip.ts` / `memory.ts` — bench individuais.
- `check-regression.ts` — compara `bench-results.json` vs `baseline.json`.
- `baseline.json` — versão atual da baseline (commitar com cuidado).
- `percentile.ts` — helper compartilhado.

## Estado atual

⏸️ **Scaffold.** Os ficheiros `*.ts` são stubs — implementação real pede:

1. `pnpm add -D playwright @playwright/test` no workspace root.
2. App build artifact: `pnpm build` precisa produzir `dist/main/index.js`
   antes de cada run.
3. Selectors `[data-testid="ready"]`, `[data-testid="composer"]`,
   `[data-testid="send"]` precisam existir no renderer (atualmente não
   existem — adicionar quando promover scaffold).
4. CI runner com Xvfb (headless display) pra rodar Electron — `ubuntu-latest`
   default não tem.

Promover quando time tiver ciclo dedicado pra estabilizar bench (sinal de
ruído alto em CI compartilhado).
