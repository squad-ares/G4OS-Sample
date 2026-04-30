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

- `docs/runbook-memory-leak.md` (TODO sub-task)
- `docs/runbook-mcp-zombie.md` (TODO)
- `docs/runbook-vault-failure.md` (TODO)

## Status

- [x] OTel Collector (TASK-16-01)
- [x] Loki + Tempo + Grafana (TASK-16-02)
- [x] Prometheus + alerts (TASK-16-03)
- [ ] Dashboards-as-code (TASK-16-04) — provisionamento configurado mas
      JSON dos dashboards é sub-task dedicada (precisa baseline real)
- [ ] Runbook + cloud deploy doc (TASK-16-05) — sub-tasks dedicadas
