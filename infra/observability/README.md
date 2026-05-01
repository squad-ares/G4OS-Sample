# Observability stack — LGTM self-host

Epic 16. Stack completo para dev/staging:

| Componente | Porta | Função |
|---|---|---|
| OTel Collector | 4317 (gRPC), 4318 (HTTP), 8889 (Prom) | Receber OTLP, exportar Loki/Tempo/Prom |
| Loki | 3100 | Logs estruturados |
| Tempo | 3200 | Distributed traces |
| Prometheus | 9090 | Métricas + alerts |
| Grafana | 3000 | UI unificada |

Sentry e PostHog **NÃO** são self-host nesta stack — usam SaaS (free tier).
Self-host deles exige ~12 containers (Postgres + Kafka + ClickHouse +
ZooKeeper) e não vale para o volume atual.

## Uso rápido

```bash
make obs-up                          # sobe tudo (5 containers, ~500MB RAM)
G4OS_OTEL_ENDPOINT=http://localhost:4318 pnpm dev
open http://localhost:3000           # Grafana
make obs-down                        # para
make obs-clean                       # para + limpa volumes
```

## Cloud deploy

Mesmo `docker-compose.yml` adapta para:
- **AWS ECS:** `docker-compose-to-ecs` converte para task definition. Substitua
  volumes por EFS, Loki/Tempo storage por S3.
- **GCP/k8s:** use Grafana Helm Charts oficiais com mesmo set de configs.
- **Grafana Cloud:** alternativa managed — mesmo formato OTLP, troca apenas
  endpoints no `otel-collector/config.yaml`.

## Runbooks

- [`docs/runbook-memory-leak.md`](docs/runbook-memory-leak.md) — leak suspeito,
  alerta `RSSAbove1GB` ou `HeapGrowthSustained`.
- [`docs/runbook-mcp-zombie.md`](docs/runbook-mcp-zombie.md) — alerta
  `McpSubprocessZombie`, subprocess solto sem supervisão.
- [`docs/runbook-vault-failure.md`](docs/runbook-vault-failure.md) — alerta
  `VaultGetFailureSpike`, "perdi minhas credenciais", mutex starvation.

Cada runbook lista sintomas, painéis a olhar, queries Loki/Tempo prontas e
critério de escalação. Alvo: dev/suporte plantão consegue triar em ≤5 min.

## Cloud deploy

- [`docs/cloud-deploy.md`](docs/cloud-deploy.md) — adaptação do mesmo
  `docker-compose` pra ECS Fargate, k8s (Helm Charts oficiais) e Grafana Cloud
  (managed).

## Dashboards

- `grafana/dashboards/g4os-overview.json` — KPIs do app (sessions, MCP, RSS).
- `grafana/dashboards/02-memory.json` — heap, RSS, listeners, GC pressure.
- `grafana/dashboards/03-mcp-subprocesses.json` — subprocess count, RSS por
  slug, tool latency, zumbis.
- `grafana/dashboards/04-credentials-vault.json` — vault ops, error rate por
  kind, mutex contention, refresh queue.
- `grafana/dashboards/05-ipc-trpc.json` — tRPC volume, latência, top procedures.

CI gate `pnpm check:grafana-dashboards` valida JSON + uid único + variáveis
`$service`/`$env` em cada dashboard.

## Status

- [x] OTel Collector (TASK-16-01)
- [x] Loki + Tempo + Grafana (TASK-16-02)
- [x] Prometheus + alerts (TASK-16-03)
- [x] Dashboards-as-code (TASK-16-04) — 5 dashboards versionados, CI gate
      `check:grafana-dashboards` valida JSON + uid + templating.
- [x] Runbook + cloud deploy doc (TASK-16-05) — 3 runbooks + cloud-deploy.md
      cobrindo ECS/k8s/Grafana Cloud.
