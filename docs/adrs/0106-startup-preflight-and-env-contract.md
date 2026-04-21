# ADR 0106: Startup preflight + env contract compartilhado para build e runtime

## Metadata

- **Numero:** 0106
- **Status:** Accepted
- **Data:** 2026-04-21
- **Autor(es):** @squad-ares
- **Stakeholders:** @tech-lead, @desktop-team
- **Task relacionada:** TASK-10A-04 e TASK-10A-09 (epic 10A-ajustes)

## Contexto

Dois problemas estavam abertos ao mesmo tempo na v2:

1. O login podia abrir em branco porque o renderer fazia `beforeLoad` com `trpc.auth.getMe` antes do `electron-trpc` estar registrado no main.
2. O contrato de ambiente do Supabase estava implícito. Dependendo da máquina, `dev` ou `build` seguiam adiante mesmo sem `.env`, e a falha só aparecia depois em tempo de uso.

Requisitos:

- Zod deve validar o contrato mínimo de env para desktop
- build/dev devem falhar cedo quando o contrato estiver incompleto
- runtime empacotado deve exibir erro claro em vez de subir uma build quebrada
- o preflight deve distinguir `fatal`, `recoverable` e `informational`
- a janela não pode carregar a UI antes de o IPC do Electron estar pronto

## Opções consideradas

### Opção A: manter boot permissivo e avisar só em runtime

**Rejeitada:** reproduz a sensação de app "quase pronto" que quebra só na primeira interação.

### Opção B: gatear apenas build/dev, sem preflight no runtime

**Rejeitada:** não protege builds empacotadas nem classifica corrupção/repair path no startup real.

### Opção C: contrato compartilhado + preflight determinístico + load do renderer só após IPC (escolhida)

Três peças:

- `apps/desktop/src/shared/desktop-env.ts` valida `SUPABASE_URL` + `SUPABASE_ANON_KEY | SUPABASE_PUBLISHABLE_KEY` com Zod
- `apps/desktop/src/main/startup-preflight-service.ts` executa env/runtime/config checks e classifica issues
- `WindowManager.create()` + `windowManager.load()` permitem registrar IPC antes do `loadURL`

## Decisão

Opção C.

`electron.vite.config.ts` chama `assertDesktopEnv(...)` e bloqueia `dev`/`build` incompletos. No runtime, `StartupPreflightService` roda antes de abrir a UI; se houver issue fatal, o app mostra `dialog.showErrorBox(...)` e encerra. Para problemas não fatais, o preflight retorna relatório estruturado e logável.

O boot do main agora segue esta ordem:

1. `app.whenReady()`
2. `StartupPreflightService.run()`
3. `windowManager.create(...)`
4. `initIpcServer(...)`
5. `windowManager.load(...)`

## Consequências

**Positivas:**

- blank login screen por race de IPC deixa de existir no caminho feliz
- build/dev falham cedo com mensagem acionável
- runtime empacotado não sobe silenciosamente em estado incompleto
- diretórios sempre seguros (`config/data/cache/state/logs`) passam a ser reparados no boot

**Negativas:**

- o setup local agora exige `.env` completo desde o primeiro `dev`
- em dev, runtimes opcionais ausentes aparecem como issue informativa até o bundle completo existir

**Neutras:**

- `AuthService` continua capaz de retornar erro tipado, mas o caminho principal agora falha antes com contrato explícito

## Armadilhas preservadas da v1

1. Falha tardia de ambiente só no uso real. v2: gate compartilhado em build + startup.
2. UI carregada antes do backend local. v2: IPC sobe antes do renderer navegar.
3. Repair silencioso sem classificação. v2: issues tipadas por severidade.

## Referências

- ADR-0020 (IPC tRPC)
- ADR-0091 (Supabase OTP flow)
- `apps/desktop/README.md`

---

## Histórico de alterações

- 2026-04-21: Proposta inicial e aceita.
