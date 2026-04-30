/**
 * Stubs dos steps ainda não implementados — `credentials`, `workspaces`,
 * `sessions`, `sources`, `skills`. Cada um retorna `Result.err` com mensagem
 * explícita do que precisa pra implementar (formato V1, fixture, decoder).
 *
 * Quando um stub for promovido a impl real, mover pra arquivo próprio
 * (`migrate-credentials.ts`, etc.) e remover daqui. Mantém o gate de teste
 * passando em CI sem que o executor crashe na primeira run real.
 *
 * Cada stub está marcado com `TODO` pra rastrear via grep.
 */

import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, type Result } from 'neverthrow';
import type { StepContext, StepResult } from './contract.ts';

function stub(reason: string): Result<StepResult, AppError> {
  return err(
    new AppError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: `migration step stub: ${reason}`,
    }),
  );
}

// TODO — delegar a `@g4os/credentials/migration`
// (já existe `v1-reader.ts` + `migrator.ts` lendo `credentials.enc` AES-GCM).
// Aqui só precisa: 1) ler masterKey do user (env ou prompt CLI), 2) chamar
// migrator com vault V2, 3) reportar contagem.
export function migrateCredentials(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  void ctx;
  return Promise.resolve(stub('credentials — wire @g4os/credentials/migration'));
}

// TODO — V1 workspaces vivem em `<v1>/workspaces/<uuid>/`
// com `workspace.json` na raiz. Migrar = ler metadata + criar workspace V2
// via `WorkspacesService.create({...})` preservando o UUID original (caso
// `lastWorkspaceId` referencie). Sources e sessions são steps separados;
// este aqui é só o registro do workspace + nome/cor/categoria.
export function migrateWorkspaces(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  void ctx;
  return Promise.resolve(stub('workspaces — V1 workspace.json reader pendente'));
}

// TODO — formato V1 sessão:
//   `<v1>/workspaces/<wid>/sessions/<sid>/session.json` (metadata)
//   `<v1>/workspaces/<wid>/sessions/<sid>/session.jsonl` (eventos legacy)
// V2 espera JSONL append-only com `SessionEvent` schema (Zod) — eventos V1
// precisam ser MAPEADOS, não copiados. Implementar `mapV1EventToV2(event)`
// cobrindo: `message.added`, `tool.invoked`, `tool.completed`. Eventos V1
// desconhecidos viram warning + skip (não-fatal).
export function migrateSessions(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  void ctx;
  return Promise.resolve(stub('sessions — V1 jsonl event mapper pendente'));
}

// TODO — V1 `sources.json` no root do install (vs V2
// que tem `<workspace>/sources.json` per-workspace). Migrar = parsear V1 +
// distribuir por workspace_id (V1 sources eram global; V2 são per-ws).
// Heurística: se V1 source tem `workspaceIds: [...]`, usa; senão, vai pra
// todos os workspaces (replicação) ou pra `lastWorkspaceId`.
export function migrateSources(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  void ctx;
  return Promise.resolve(stub('sources — V1 sources.json reader pendente'));
}

// TODO — V1 skills viviam em `<v1>/skills/<id>/skill.json`
// + `skill.md`. V2 ainda não tem feature de skills (11-features/10-skills-workflows
// não iniciada). Por enquanto: copiar bytes pra `<v2>/skills-legacy/` e
// emit warning instruindo user a re-importar quando feature subir.
export function migrateSkills(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  void ctx;
  return Promise.resolve(stub('skills — feature V2 ainda não disponível (11-features/10)'));
}
