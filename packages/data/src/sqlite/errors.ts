/**
 * Erros tipados do subsistema de SQLite. `node:sqlite` é stdlib, então
 * não existe classe de "binding faltando" — removemos o erro legado de
 * ADR-0040. Mantemos apenas open/closed para sinalizar estado inválido.
 */

export class SqliteOpenError extends Error {
  override readonly name = 'SqliteOpenError';

  constructor(filename: string, cause: unknown) {
    super(`Failed to open SQLite database at ${filename}`, { cause });
  }
}

export class SqliteClosedError extends Error {
  override readonly name = 'SqliteClosedError';

  constructor() {
    super('Operation attempted on a closed SQLite database');
  }
}
