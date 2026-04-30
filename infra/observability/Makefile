.PHONY: obs-up obs-down obs-clean obs-logs obs-smoke

# Sobe stack inteira em background. Volumes persistem entre re-ups.
obs-up:
	docker compose up -d
	@echo ""
	@echo "Grafana:    http://localhost:3000 (admin / admin)"
	@echo "Prometheus: http://localhost:9090"
	@echo "Loki:       http://localhost:3100"
	@echo "Tempo:      http://localhost:3200"
	@echo "Collector:  http://localhost:8889/metrics"

# Para containers, mantém volumes.
obs-down:
	docker compose down

# Para containers e remove volumes (perde dados).
obs-clean:
	docker compose down -v

obs-logs:
	docker compose logs -f --tail=100

# Smoke: app dev exporta para o stack local. Roda 30s e valida que ao
# menos uma métrica `g4os_*` aparece no Prometheus.
obs-smoke:
	@echo "Iniciando smoke — abra outro terminal e rode:"
	@echo "  G4OS_OTEL_ENDPOINT=http://localhost:4318 pnpm --filter @g4os/desktop dev"
	@echo "Aguardando métricas..."
	sleep 30
	curl -s http://localhost:8889/metrics | grep -q "g4os_" \
	  && echo "✓ métricas chegando" \
	  || (echo "✗ nenhuma métrica g4os_*"; exit 1)
