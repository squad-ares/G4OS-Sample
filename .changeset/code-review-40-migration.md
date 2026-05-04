---
'@g4os/migration': patch
---

Code Review 40 — packages/migration — auditoria exaustiva pré-canary (zero-margem-de-erro: perda de dados é inaceitável)

Foco: idempotência, atomicidade, rollback, backup, validation, sentinel, concorrência, paridade V1→V2, cobertura de testes por versão V1. ADRs consultados: 0011 (Result), 0012 (Disposable), 0040a (sqlite), 0042 (drizzle), 0043 (event store), 0045 (backup zip), 0052 (credential migration), 0123 (managed root), 0133 (project legacy import sentinel), 0153 (catalog).

---

### F-CR40-1 — `migrate-sessions` viola ADR-0043: writer V2 NÃO faz strip+recompute de `sequenceNumber` (CRITICAL — corrupção de checkpoint cross-consumer)

- **Severidade:** CRITICAL
- **Path:** `packages/migration/src/steps/migrate-sessions.ts:312-322` + `apps/desktop/src/main/services/migration/writers.ts:166-175`
- **ADR:** 0043 (event store: `sequenceNumber` monotônico, sem gaps, gerenciado pelo store; checkpoints `(consumer_name, session_id)` dependem disso)
- **Root cause:** `mapV1EventToV2` injeta `sequenceNumber: indexInJsonl` ou `v1Event.sequenceNumber` no candidate. O contrato em `contract.ts:78-83` documenta explicitamente que o writer **DEVE sobrescrever** sequence com a monotônica do `SessionEventStore.append`. **A implementação real em `writers.ts:166-175` faz cast direto `event as SessionEvent` e chama `store.append(sessionId, validated)` — ZERO strip de `sequenceNumber`**. `SessionEventStore.append` (`event-store.ts:75-81`) também não strippa nem reordena: passa o evento direto pro `appendFile`. Resultado: V1 com gaps/ordens irregulares de sequência produzem JSONL V2 com sequence quebrada (gaps, duplicatas, não-monotônico). Reducer `applyEvent` + checkpoints `messages-index` ficam permanentemente dessincronizados; replay/catchup pula eventos ou os reaplica. Contamina TODOS os consumers do event store (FTS5, telemetria) — não há recovery sem rebuild de projection do zero. CR-18 F-M5 reabriu mas não fechou: comentário foi adicionado, fix ainda não foi aplicado no writer.
- **Fix:** No writer (`writers.ts`), antes de `store.append`, strippar `sequenceNumber` E `eventId` do payload, deixando o store gerar/calcular: `const { sequenceNumber: _, ...stripped } = validated` + `store.append` deve aceitar evento sem seq e atribuir `(maxExistingSeq + 1)`. Alternativamente: `SessionEventStore.append` ganha overload `appendImported(sessionId, event)` que recompõe sequence a partir de `count(sessionId)`. **Adicionar teste regressivo**: V1 fixture com sequence `[3, 0, 1, 7, 2]` deve produzir JSONL V2 com `[0,1,2,3,4]`.

---

### F-CR40-2 — Paridade V1→V2: `projects/` legacy NÃO migrado (CRITICAL — dados de projeto perdidos)

- **Severidade:** CRITICAL
- **Path:** `packages/migration/src/types.ts:30-37` (MigrationStepKind enum) + `packages/migration/src/plan.ts:50-57` (steps array) + `executor.ts:40-47` (STEP_RUNNERS)
- **ADR:** 0133 (project legacy import — discovery em 3 candidatos)
- **Root cause:** ADR-0133 define que V1 armazenou projetos em três locais (`~/.g4os/workspaces/{id}/projects/`, `<workingDir>/projects/`, `<workingDir>/projetos/`). O migrator V1→V2 do `@g4os/migration` cobre `config | credentials | workspaces | sessions | sources | skills` — **`projects` é AUSENTE do enum `MigrationStepKind`**. ADR-0133 cobre apenas re-discovery PÓS-migração via `ProjectsService.discoverLegacyProjects` no renderer (sentinel `.legacy-import-done` per-workspace), mas isso assume que os arquivos `project.json` ainda estão em paths que o V2 conhece. O backup do executor (`createBackup`) preserva V1 in-place, mas:
  - Se `<workingDir>/projects/` está fora de `~/.g4os/`, NÃO é incluído no backup (cp em `sourcePath` raiz V1).
  - O V2 não tem step que mova/copie `~/.g4os/workspaces/<wid>/projects/` para `<v2 workspace root>/projects/`. Discovery do ADR-0133 só ajuda se o usuário aponta manualmente o `workingDirectory`.
- **Fix:** Adicionar `projects` step (`MigrationStepKind = '...| 'projects'`). Implementação: para cada workspace V1, copiar `<v1>/workspaces/<wid>/projects/<pid>/` para `<v2 workspace root>/<wid>/projects/<pid>/` preservando estrutura; deixar discovery do ADR-0133 cobrir os 2 candidatos restantes (workingDir). Documentar gap explicitamente caso decisão seja deliberada (ADR novo "v1→v2 projects são deferred ao discovery pós-migração").

---

### F-CR40-3 — `MigrationError` declarado mas nunca usado: TODOS os erros caem em `ErrorCode.UNKNOWN_ERROR` (MAJOR — perda de telemetria/error handling tipado)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/types.ts:60-71` (declarações) vs uso real em `executor.ts:78,99,116,154,203,259` + `migrate-config.ts:60,73` + `migrate-credentials.ts:39,48,84` + `migrate-sources.ts:73,87,103` + `migrate-skills.ts:43,109` + `migrate-workspaces.ts:57`
- **ADR:** 0011 (Result pattern: erros esperados são tipos, não exceptions; codes mapeiam pra exit codes do CLI conforme `MigrationErrorCode` doc)
- **Root cause:** `MigrationErrorCode` define 6 valores (`no_v1_install_found | v1_corrupted | backup_failed | step_failed | rollback_failed | already_migrated`) e o type `MigrationError extends AppError { readonly migrationCode: MigrationErrorCode }` exporta da public surface. Comentário em `types.ts:62` afirma "Mapeiam pra exit codes do CLI". Na prática, **toda construção de `AppError` na package usa `ErrorCode.UNKNOWN_ERROR`**. CLI/UI Wizard não consegue diferenciar "backup falhou" de "step falhou" de "marker presente" — todos chegam como `UNKNOWN_ERROR`. Telemetria de migration loga código genérico. Migration-router em apps/desktop não consegue mapear para mensagens UX específicas (CR-18 F-I1 falou de preservar `code/context/cause`, mas quando code é sempre `UNKNOWN_ERROR`, é equivalente a string genérica).
- **Fix:** Criar factory `migrationError({ migrationCode, message, cause })` em `types.ts` que retorna `AppError & { migrationCode }` com `code` mapeado para um valor específico de `ErrorCode` (adicionar `MIGRATION_BACKUP_FAILED`, `MIGRATION_STEP_FAILED`, `MIGRATION_ROLLBACK_FAILED`, `MIGRATION_ALREADY_DONE` no enum). Substituir todas as 11+ chamadas `new AppError({ code: UNKNOWN_ERROR })` para usar essa factory. CLI ganha exit codes consistentes; UI consegue mapear keys de tradução por código.

---

### F-CR40-4 — Backup do V1 NÃO valida tamanho/integridade após `cp`; falhas parciais silenciosas (MAJOR — risco de perda de dados se backup truncado)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/executor.ts:249-265`
- **ADR:** 0045 (backup/restore — manifest + verify; ADR-0052 backup-rotation requer integridade)
- **Root cause:** `createBackup` faz `cp(sourcePath, backupPath, { recursive: true })` e considera sucesso se a Promise não throws. **Não há verificação:** disco cheio mid-cp pode produzir backup truncado, simlinks podem ser corrompidos (`cp` default segue symlinks o que pode infinite-loop num cenário patológico), permissões podem mudar. Em ADR-0045, backups V2 têm manifest Zod + checksum SHA-256 — backup do V1 que protege contra perda total **não tem nenhuma garantia de integridade equivalente**. Se o disco encher durante o cp e o user tentar rollback: o backup-V1 está corrompido e o V2 produtivo já foi tocado (steps executaram). Single-point-of-failure.
- **Fix:** Após `cp`, comparar `dirSize(sourcePath) === dirSize(backupPath)`; se diferente, `rm -rf` no backup e retornar err. Idealmente: gerar manifest com {file, size, mtime} no backup-root, verificável posteriormente. Adicionar opção `cp(...{ verbatimSymlinks: true })` (Node 22+) para evitar loops em symlinks. Considerar `cp(...{ errorOnExist: true })` para detectar concorrência.

---

### F-CR40-5 — Lockfile NÃO sobrevive crash: pid stale bloqueia retry permanentemente (MAJOR — UX ruim, requer intervenção manual)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/executor.ts:88-108, 280-296`
- **ADR:** 0011 (erros propagados, não silenciosos), 0012 (lifecycle previsível)
- **Root cause:** `open(lockPath, 'wx')` cria arquivo com pid atual. Se o processo crasha mid-migration (OOM, kill -9, power loss), o lockfile permanece. Próxima invocação cai em `EEXIST` com mensagem "remova manualmente se for o caso". **Nenhuma checagem de pid liveness**: não tenta ler o pid e verificar se existe (`process.kill(pid, 0)`). Em CI matrix com retry rápido, ou usuário reabrindo após crash, o lockfile vira blocker silencioso. Pior: `releaseLock` faz `try { rm } catch { ignore }` — se o lockfile for read-only ou estiver em FS travado, o run sai "ok" mas o lockfile fica permanente para o próximo.
- **Fix:** Em `EEXIST`, ler conteúdo do lock (`pid=N`), `process.kill(N, 0)`. Se `ESRCH`, considerar lock stale (log warn + `unlink` + retry de `open wx`). Adicionar timestamp ao lockfile (`startedAt`) e considerar stale após N minutos (ex: 30min para migrações grandes). `releaseLock` deve propagar erro de `rm` como warn estruturado, não silenciar.

---

### F-CR40-6 — `existsSync` em hot path = TOCTOU: `.migration-done` e `lockfile` checks são race-prone (MAJOR — concorrência mal coberta)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/plan.ts:34` + `executor.ts:113, 75`
- **ADR:** 0011 (Result), 0012 (lifecycle), 0043 (single-writer per session — extensível para single-migrator)
- **Root cause:** `plan.ts:34` faz `existsSync(join(target, MIGRATION_DONE_MARKER))`. Entre essa chamada e o `execute()`, outro processo pode escrever/remover o marker. Mesmo com o re-check em `executor.ts:113` (CR-18 F-M2), essa segunda checagem TAMBÉM é `existsSync` — depois do lock acquired sim, mas se o lockfile já foi adquirido por mim, ainda há janela onde o marker é escrito por um caller que NÃO usou lock (ex: usuário fez `touch .migration-done` manualmente no meio do run). Em geral, todo `existsSync` no codepath de scrita deveria virar uma operação atômica (try-open com flags adequadas) ou ser substituído por leitura defensive do conteúdo. CR-18 F-M8 já trocou isso no `v1-detector` mas não propagou aqui.
- **Fix:** Substituir `existsSync(MIGRATION_DONE_MARKER)` por `try { await readFile(...) } catch (ENOENT) { ...}` para a checagem do plan, mantendo o re-check no executor mas usando `open(markerPath, 'r')` para distinguir ENOENT de erros reais. No re-check pós-lock: já temos lock exclusivo, então a janela é fechada — mas garantir que nenhum step grava marker é responsabilidade do executor (atualmente steps populam `writtenPaths` e o executor escreve marker DEPOIS — ok). Documentar invariante "marker só é escrito pelo executor sob lock" como teste regressivo.

---

### F-CR40-7 — `migrate-sessions` carrega JSONL inteiro em memória: OOM em sessões grandes (MAJOR — escala mata)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/steps/migrate-sessions.ts:268-295` (`readJsonlEvents`)
- **ADR:** 0043 (event store stream-friendly), 0063 (memory monitor)
- **Root cause:** `readJsonlEvents` faz `await readFile(path, 'utf-8')` carregando todo o JSONL em memória, depois `raw.split('\n')` duplica. Em V1, sessões com transcripts longos + base64 inline de anexos (referenciado em ADR-0043 contexto) podem ter dezenas de MB. Para múltiplas sessões grandes ou um usuário com 100+ sessões, o pico de memória fica O(maior_sessão). `MemoryMonitor` (ADR-0063) detecta o leak post-fact mas não previne. O event-store V2 já streamia (`createReadStream` em `event-store.ts:97`); o migrator é a única superfície que não streamia. Bloqueia migração de usuários V1 com transcripts grandes em máquinas de baixo recurso.
- **Fix:** Refatorar `readJsonlEvents` para retornar `AsyncGenerator<Record<string, unknown>>` usando `createReadStream` + `readline` ou `LineBuffer` (já existe em `@g4os/agents/codex/app-server/frame.ts`). Loop em `migrateOneSession` consome via `for await`. Bytes contabilizados via `stat(path)` antes do stream em vez de `Buffer.byteLength(raw)`.

---

### F-CR40-8 — `migrate-skills` skipa diretório inteiro se `skills-legacy/` existe: re-migração após falha parcial perde skills (MAJOR — idempotência quebrada parcial)

- **Severidade:** MAJOR
- **Path:** `packages/migration/src/steps/migrate-skills.ts:70-87`
- **ADR:** 0011, 0045 (idempotência em backup/restore — re-execução produz mesmo resultado)
- **Root cause:** Step verifica `existsSync(targetDir)` e se positivo: skipa TUDO com warning "já existe — assumindo migração anterior já copiou". Cenário: migração 1 começou, copiou metade das skills (cp falhou no meio com EACCES), step retorna err, executor faz rollback dos `writtenPaths`. Mas... o step **não popula `writtenPaths`** quando falha mid-cp (popula só na branch de sucesso, linha 130). O `targetDir = skills-legacy/` foi parcialmente criado pelo `cp` antes do erro. Próxima execução: `existsSync(skills-legacy)` é true → skipa tudo. Skills que faltaram NÃO são copiadas. Diferentemente de `migrate-workspaces` (que itera por entry) ou `migrate-sources` (idem), skills é all-or-nothing baseado num diretório raiz cuja existência é binária.
- **Fix:** Iterar entry-by-entry: para cada `<v1>/skills/<entry>/`, verificar se `<v2>/skills-legacy/<entry>/` existe; se sim skip apenas esse, se não fazer `cp` da subdir. Popular `writtenPaths` por entry para rollback granular. Preservar warning global sobre "feature V2 ainda não disponível", mas não dependa do diretório raiz como sentinel de idempotência.

---

### F-CR40-9 — Path safety: `target` aceita absoluto arbitrário sem validar boundary (MEDIUM — ADR-0123 ignorado para migration target)

- **Severidade:** MEDIUM
- **Path:** `packages/migration/src/executor.ts:90, 115, 219, 254` + `plan.ts:21` (CreatePlanInput.target)
- **ADR:** 0123 (managed root boundary — escritas só no managed root)
- **Root cause:** `CreatePlanInput.target` é `string` sem validação. Caller (apps/desktop service) usa `join(getAppPaths().data, 'v1-migrated')` (CR-18 F-DT-G), mas `@g4os/migration` é uma package **pública** e não valida que `target` está sob `getAppPaths()` ou outro managed root. Um caller alternativo (CLI custom, teste mal-feito, futuro consumidor) pode passar `/etc/passwd` ou `~`, e o executor faria `mkdir`, escreveria `migration-config.json`, `.migration-done`, `skills-legacy/`. Combinado com F-CR40-5 (rollback de skills sem `writtenPaths` granular), pode escrever fora do managed root e não conseguir desfazer. CR-18 F-M1 protegeu contra `rm -rf` no target completo, mas não impede escrita inicial fora do escopo seguro.
- **Fix:** Aceitar `target` apenas se relativo a um `managedRoot` (novo parâmetro obrigatório em `ExecuteOptions` ou `CreatePlanInput`); validar via `path.relative(managedRoot, target)` não começar com `..` nem ser absoluto. Documentar invariante: migration NÃO escreve fora de `managedRoot`. Caller `apps/desktop` passa `getAppPaths().data` como `managedRoot`.

---

### F-CR40-10 — `migrate-sessions`: `appendEvent` falha = warning silencioso, sessão V2 fica parcial sem sinal (MEDIUM)

- **Severidade:** MEDIUM
- **Path:** `packages/migration/src/steps/migrate-sessions.ts:209-215`
- **ADR:** 0011 (erros propagados), 0043 (event store consistency)
- **Root cause:** Loop `for (const line of events.lines)` chama `await writer.appendEvent(...)`. Em falha (catch línea 212), warning é adicionado e o loop continua. Resultado: sessão V2 criada com fração dos eventos, sem `session.created` ou com gaps. `applyEvent` no projection vai gerar messages_index incompleto. `existsSession` retorna true → próximo run skipa essa sessão. Não há flag "session is incomplete, retry". Um único disk-full mid-session pode deixar TODA a sessão V2 num estado quebrado permanente sem que o usuário perceba (warning vai pra stepResults mas executor não escala para err se "alguma" sessão teve appendEvent error).
- **Fix:** Se `appendEvent` falhar para um evento, tentar dois caminhos: (a) escalar para err e fazer rollback da sessão (deletar via `sessionsRepo.delete(sessionId)` + `unlink(eventsJsonl)`); (b) marcar a sessão como "partial" via metadata flag e re-tentar em retry. Decisão arquitetural — preferir (a) com flag `--continue-on-error` opt-in. Atualmente o caminho default (continue) viola "perda de dados é inaceitável".

---

### F-CR40-11 — Schema target NÃO validado pós-migration: SQLite/JSONL ficam sem health check (MEDIUM)

- **Severidade:** MEDIUM
- **Path:** `packages/migration/src/executor.ts:217-247` (post-step path)
- **ADR:** 0042 (drizzle migrations + backup pré-migration), 0043 (replay/rebuild contract), 0045 (manifest verification)
- **Root cause:** Após todos os steps passarem, executor escreve `MIGRATION_DONE_MARKER` e retorna `success: true`. **Não há validação de que o estado V2 produzido é coerente:**
  - Workspaces criados via writer existem em `workspaces` table?
  - Sessões criadas têm `messages_index` projection coerente (count(events) ≈ count(messages_index))?
  - Sources stores têm o slug → workspace mapping íntegro?
  - JSONL events.jsonl não tem linhas corrompidas?

  Em uma falha sutil (writer parcialmente quebrado, drizzle migration pendente, schema mismatch), a migração reporta sucesso, marker é escrito, e o usuário só descobre na primeira interação V2. Sem ADR-0045 manifest equivalente para migration target.
- **Fix:** Pós-loop de steps, antes de escrever marker, executar `validateMigrationTarget(plan.target, expectedCounts)` que: (a) faz `select count` em workspaces/sessions/sources e compara com `stepResults`; (b) chama `rebuildProjection` em modo dry para detectar inconsistência; (c) lê o JSONL via `SessionEventStore.read()` e verifica zero corruption. Se qualquer check falhar, retornar err sem escrever marker — usuário pode retry com `--force` ou rollback manual.

---

### F-CR40-12 — `flavor` "internal"/"public" inferido apenas pelo nome do dir: ambíguo se user renomeou (LOW)

- **Severidade:** LOW
- **Path:** `packages/migration/src/v1-detector.ts:38` + `types.ts:18-19`
- **ADR:** 0011 (validation explicit > heuristic)
- **Root cause:** `flavor: V1Flavor = dirName.includes('public') ? 'public' : 'internal'`. Usuário que renomeou `~/.g4os` para `~/.g4os-backup-public` por motivo qualquer detectaria como `public`. O flavor é informativo (não muda lógica de migração nesta package), mas se algum consumer usa para mapear paths V2 (config namespace, branding), erro silencioso.
- **Fix:** Ler campo `flavor` de `config.json` quando presente (V1 mais novo provavelmente já tem); fallback para nome do dir como heurística secundária com warning. Validar nome contra `V1_CANDIDATE_DIRS` exato (`'.g4os'` ou `'.g4os-public'`) — qualquer outro nome → flavor null + warning.

---

### F-CR40-13 — `migrate-config`: `migration-config.json` write-only sem consumer plug-in (LOW — débito técnico documentado)

- **Severidade:** LOW
- **Path:** `packages/migration/src/steps/migrate-config.ts:1-25` (header doc + comportamento)
- **ADR:** 0133 (sentinel pattern); ADR-0011 (Result over silent state)
- **Root cause:** Header explicita: "TASK-14-01 (consumer real) fica deferred até o wizard de migração consumir a API." Ou seja, o step grava JSON que ninguém lê. Step diz `itemsMigrated: 1` mas a UX pós-migration não reflete os fields (theme/locale não são aplicados). Não é regressão, é débito intencional. Mas para "perda de dados é inaceitável", os campos de `extras` (campos desconhecidos) viram lixo no disco — caller que esquecer de inspecionar perde theme/locale do user. CR-18 F-M4 já marcou.
- **Fix:** Criar TASK-14-01b (wire real do consumer) ou ADR documentando que `migration-config.json` é APENAS log/audit, não fonte de truth para preferences. Idealmente, o step deveria delegar para `PreferencesStore.applyImported(parsed)` na hora — mas esse contrato não existe ainda. Mínimo: adicionar warning estruturado no `MigrationReport` informando ao caller que ele precisa inspecionar manualmente.

---

### F-CR40-14 — Sem teste regressivo de fixtures por versão V1 (MEDIUM — paridade não validada empiricamente)

- **Severidade:** MEDIUM
- **Path:** `packages/migration/src/__tests__/*.test.ts` (TODOS)
- **ADR:** 0011 (Result), 0042 (drizzle migrations testadas)
- **Root cause:** Tests usam `JSON.stringify({ version: '0.1.0', ... })` ad hoc. **Não há fixture real de V1 (config.json + workspaces/ + sessions/ + sources.json) para versões diferentes** (0.1.x, 0.2.x, 0.3.x). Schemas Zod em `migrate-workspaces.ts` e `migrate-sessions.ts` são "permissivos" (campos opcionais), mas isso esconde regressões: se V1 0.3.x adicionou um campo obrigatório que o migrator não conhece, o teste passa porque o campo é optional, mas o V2 fica sem o campo na prática. Risco: usuário com V1 0.3.x faz upgrade, todos workspaces "migrados" mas sem dado X que ele esperava. Comentário pp em sessions.ts:308 admite "tentativa best-effort".
- **Fix:** Criar `__tests__/fixtures/v1-0.1/`, `v1-0.2/`, `v1-0.3/` com `config.json` + `credentials.enc` (gerado com PBKDF2 conhecido) + 2-3 workspaces + 2-3 sessions/jsonl + sources.json — tirados de instalações V1 reais ou stubs construídos. Cada fixture tem `expected.json` com counts esperados. Roundtrip test: detect → plan → execute (com writers stub) → asserts contra expected. Bumps de versão V1 forçam adição de fixture nova.

---

### F-CR40-15 — `migrate-credentials` step `bytesProcessed: 0` força mascara (LOW)

- **Severidade:** LOW
- **Path:** `packages/migration/src/steps/migrate-credentials.ts:91-96`
- **ADR:** N/A (cosmético, telemetria)
- **Root cause:** Step retorna `bytesProcessed: 0` com comentário "tamanho não é o que importa em creds". Mas `MigrationReport.stepResults[].bytesProcessed` agrega para report total — a credentials step "some" pra zero. UI Wizard que mostra "X MB migrados" subreporta. Pequeno, mas inconsistente.
- **Fix:** Reportar `bytes = stat(credPath).size` mesmo que não represente "decrypted size". Ou documentar no contrato de `bytesProcessed` que credentials sempre é zero.

---

### F-CR40-16 — `dryRun` em `execute` ainda chama `createMigrationPlan` no caller, mas `migrate-credentials` em dryRun chama `migrateV1ToV2(... dryRun: true)` que pode tentar acessar `vault` mesmo sem persistir (LOW)

- **Severidade:** LOW
- **Path:** `packages/migration/src/steps/migrate-credentials.ts:64-69` + comportamento em `@g4os/credentials/migration`
- **ADR:** 0052 (idempotente, dry-run)
- **Root cause:** Em dryRun, ainda exigimos `vault` (linha 38) e `v1MasterKey` (linha 47). Se o usuário roda `--dry-run` sem ter setado vault (ex: rodando antes do user logar), retorna err. Mas o `migrate-config` em dryRun **não exige** writers. Inconsistência: dryRun deveria ser zero-side-effect, sem requerer credenciais reais. Faz sentido pedir masterKey pra validar leitura, mas vault é só pra escrever; não deveria ser required em dryRun.
- **Fix:** Em dryRun, vault opcional — se ausente, ler V1 cred file (parse + count) e retornar stats sem tentar `migrateV1ToV2`. Step pode chamar `readV1Credentials` direto + count entries.

---

### F-CR40-17 — `MigrationReport.success: true` é set mesmo com `nonFatalWarnings` críticos (LOW — UI/CLI sem critério claro)

- **Severidade:** LOW
- **Path:** `packages/migration/src/executor.ts:243-246` (return)
- **ADR:** 0011 (Result — dois canais ok/err não capturam "ok com warnings")
- **Root cause:** `success: true` é set incondicionalmente quando o loop completa sem err. `stepResults[].nonFatalWarnings` pode estar cheio de mensagens tipo "credentials.enc missing", "20 workspaces malformados skipados", "session N has 0 events". UI renderer usa `success` boolean → "sucesso". Conceito "partial success" não existe — F-M3 (CR-18) cobre o caso TOTAL falha mas não a maioria-parcial. Cenário real: 100 workspaces, 80 skipados por malformed JSON → success=true mas 80% dos dados V1 não migraram.
- **Fix:** Adicionar `MigrationReport.degradedSteps: readonly { kind, skipRatio: number }[]` calculado no executor; `success` continua boolean, mas há `partialSuccess` flag separado quando `skipRatio > 0.1` em qualquer step. UI Wizard renderiza estado distinto (ícone amarelo).

---

## Áreas cobertas

- Idempotência: ok no `executor` (lockfile + marker re-check) e workspaces/sessions/sources (writer.exists). Skills tem buraco (F-CR40-8).
- Atomicidade: `writeAtomic` aplicado em config/marker (CR-32/33). `cp` recursivo em backup e skills NÃO é atômico (F-CR40-4, F-CR40-8).
- Rollback: cirúrgico via `writtenPaths` (CR-18 F-M1) — mas steps não populam consistentemente; sessions/credentials usam writers e dependem do caller.
- Backup pré-migração: existe (`createBackup`) mas SEM verificação (F-CR40-4).
- Validation pós-migration: AUSENTE (F-CR40-11).
- Sentinel ADR-0133: aplicado a `.migration-done` (cobertura completa do sentinel pattern); discovery de projetos legacy é responsabilidade SEPARADA do `ProjectsService` no main — gap V1→V2 separado (F-CR40-2).
- Erros como Result: TODOS via Result (ok). Mas com codes inúteis (F-CR40-3).
- Disposable: N/A (package puro funcional, sem listeners/timers).
- Path safety: parcial (F-CR40-9).
- Concorrência: lockfile + re-check ok; lock pode virar stale (F-CR40-5).
- Versão fonte/alvo: detectada com fallback null; nenhuma asserção de versão alvo.
- Multi-versão V1: schemas tolerantes; sem fixtures regressivos por versão (F-CR40-14).
- Logs estruturados: `logProgress` no service main; package em si não loga (delegado).
- Performance/streaming: NÃO há streaming (F-CR40-7).
- Boundary: importa de `@g4os/credentials`, `@g4os/kernel`, `@g4os/platform` — limpo.
- TS strict: zero `any`, zero `@ts-ignore` no src.
- TODO/FIXME/console.log: zero ocorrências em src.
- Catalog drift: dependências usam `catalog:` (ok).
- Paridade V1→V2: GAP CRÍTICO em projects (F-CR40-2).
- Tests: 8 arquivos, ~1000 LOC; cobertura unit ok mas sem fixtures multi-versão (F-CR40-14).

## Resumo

- **Total findings:** 17 (F-CR40-1..17)
- **Severidade:** 2 CRITICAL, 7 MAJOR, 5 MEDIUM, 3 LOW
- **Top 3:**
  1. **F-CR40-1** (CRITICAL) — `sequenceNumber` V1 contamina event store V2 via writer.appendEvent. Quebra ADR-0043, corrompe checkpoints multi-consumer permanentemente. Requer fix antes de qualquer release que migre sessions.
  2. **F-CR40-2** (CRITICAL) — `projects/` V1 não é migrado pelo package. ADR-0133 cobre apenas re-discovery PÓS-migração; arquivos em `~/.g4os/workspaces/<wid>/projects/` ficam órfãos sem step explícito. Decisão precisa ser ADR (deferral) ou implementação imediata.
  3. **F-CR40-3** (MAJOR) — `MigrationError` + `MigrationErrorCode` declarados mas nunca usados; todo erro vira `UNKNOWN_ERROR`. CLI/UI não consegue mapear UX por código.
