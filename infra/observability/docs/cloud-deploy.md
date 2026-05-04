# Cloud deploy — observability stack

O `docker-compose.yml` em `infra/observability/` é o ponto de partida pra dev
local (5 containers, ~500 MB RAM). Este doc descreve como o **mesmo** set de
configs vira um deploy em ECS Fargate, k8s, ou Grafana Cloud sem reescrever
os configs do zero.

---

## Premissas

- Telemetria exportada via OTLP (`@g4os/observability/sdk` → OTel Collector).
- Cada componente (Loki/Tempo/Prometheus/Grafana) é stateless ou state-on-volume.
- Retention default em dev: 7 dias. Em prod: 30-90 dias (ajustar via
  `loki/config.yaml` + `tempo/config.yaml`).
- TLS termina no load balancer (em prod). Em dev é HTTP plain.

---

## Opção 1 — AWS ECS Fargate

Vantagem: managed, sem cluster pra operar. Desvantagem: tarefas com volumes
EFS exigem networking VPC + security groups. Custo médio (1 task de cada):
~$60/mês com EFS standard.

### Conversão do compose

Use `docker-compose-to-ecs` (parte do AWS CLI) pra gerar task definitions:

```bash
ecs-cli compose -f infra/observability/docker-compose.yml convert
```

Isto produz um arquivo `task-definition.json` por serviço. Edições obrigatórias:

| Serviço | O que substituir |
|---|---|
| Loki | `volumes` local → EFS access point. `storage_config.aws.s3` em vez de filesystem. |
| Tempo | `volumes` local → EFS. Storage backend `s3` em vez de `local`. |
| Prometheus | `volumes` local → EFS access point. Considerar `remote_write` pra Mimir/Cortex se métricas crescerem. |
| Grafana | EFS pra `/var/lib/grafana` (state de dashboards customizados — embora dashboards-as-code já cubra os defaults). |
| OTel Collector | Sem volume necessário (stateless). |

### Networking

- Todos os serviços no mesmo cluster ECS, mesma VPC.
- Security group permitindo:
  - Cliente OTLP → Collector na porta 4318.
  - Grafana → Loki/Tempo/Prometheus nas portas 3100/3200/9090.
  - Public ALB → Grafana na porta 3000 (com TLS termination).
- Provisionar Route 53 record + ACM cert pra subdomain `grafana.<env>.<dominio>`.

### Auth

- Grafana: configurar OIDC via env vars (`GF_AUTH_GENERIC_OAUTH_*`).
- OTel Collector: trust IAM role da ECS task — sem auth explícita; Collector é
  privado dentro da VPC.
- Loki/Tempo/Prometheus: idem, trust by VPC isolation.

### Retention

```yaml
# loki/config.yaml — produção
limits_config:
  retention_period: 720h  # 30 dias
chunk_store_config:
  max_look_back_period: 720h
table_manager:
  retention_period: 720h
  retention_deletes_enabled: true
```

Idem `tempo/config.yaml` (`compactor.compaction.block_retention: 720h`).

---

## Opção 2 — Kubernetes (qualquer cloud)

Vantagem: portável, cresce melhor com volume. Desvantagem: precisa operar k8s.

### Helm Charts oficiais

Não reinvente — use Grafana Helm Charts oficiais:

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm install loki grafana/loki -f infra/observability/k8s/loki-values.yaml
helm install tempo grafana/tempo -f infra/observability/k8s/tempo-values.yaml
helm install prometheus prometheus-community/prometheus
helm install grafana grafana/grafana -f infra/observability/k8s/grafana-values.yaml
```

**A criar:** `infra/observability/k8s/` com valores customizados que espelham o
`docker-compose.yml`. Hoje não existe — primeiro deploy real materializa o doc.

### Storage

- Loki/Tempo: PV via `StorageClass` cloud-managed (gp3 na AWS, pd-ssd no GCP).
- Para >100 GB de logs/traces: migrar pro backend object storage do chart
  (S3 / GCS / Azure Blob). Helm chart suporta nativo.

### Ingress + TLS

- `cert-manager` com Let's Encrypt pra cert auto-renewing.
- `ingress-nginx` apontando `grafana.<env>.<dominio>` pro service Grafana.

### Auth

- Grafana via OIDC (Auth0, Okta, Google Workspace — qualquer OIDC provider).
- Multi-tenant Loki/Tempo se múltiplos projetos compartilham (header
  `X-Scope-OrgID`).

---

## Opção 3 — Grafana Cloud (managed)

Vantagem: zero ops. Desvantagem: custo escala com volume (free tier: 50 GB
logs/mês, 50 GB traces, 10k metrics).

### Setup

1. Criar conta em `grafana.com/auth/sign-up`.
2. Provisionar instance Loki + Tempo + Prometheus (Cloud Free).
3. Pegar endpoints OTLP + API key da console.
4. Editar `infra/observability/otel-collector/config.yaml`:
   ```yaml
   exporters:
     otlphttp/grafana:
       endpoint: https://otlp-gateway-prod-us-east-0.grafana.net/otlp
       headers:
         Authorization: Basic <base64(instance_id:api_key)>
   ```

5. Apontar app desktop pro Collector hosted (ou run Collector local exportando
   pro Grafana Cloud).

Dashboards `dashboards-as-code` (TASK-16-04) importam direto via API:

```bash
make obs-import-dashboards GRAFANA_URL=https://<stack>.grafana.net \
  GRAFANA_API_KEY=<key>
```

---

## Diferenças vs dev

| Aspecto | Dev | Prod |
|---|---|---|
| TLS | HTTP plain | HTTPS obrigatório (LB ou ingress) |
| Retention | 7d | 30-90d |
| Auth Grafana | admin:admin | OIDC |
| Storage | volumes locais | EFS/S3/GCS/object storage |
| Multi-tenant | não | Loki/Tempo `X-Scope-OrgID` se >1 projeto |
| Alertas | print no log | Slack/PagerDuty/OpsGenie via `alertmanager` |
| Collector | 1 instance | 3+ replicas com load balancer |

## Como evoluir este doc

Cada deploy real substitui um bullet "TBD" por config concreta. Não inventar
configs hipotéticas — melhor doc curto e correto do que doc longo e errado.
Quando algum cloud target for deployado pela primeira vez, este doc ganha:
- Link pro repo IaC (Terraform, Pulumi, k8s manifests) que materializa.
- Custo real medido (não estimativa).
- Lessons learned (o que quebrou, como recuperou).

## Referências

- ADR-0066 — retention policy
- TASK-16-01 a 16-05 (este epic)
- [Grafana Cloud free tier](https://grafana.com/products/cloud/)
- [Loki S3 storage config](https://grafana.com/docs/loki/latest/storage/)
- [Tempo object storage](https://grafana.com/docs/tempo/latest/configuration/#storage)
