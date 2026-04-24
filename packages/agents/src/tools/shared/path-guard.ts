/**
 * Cross-platform path guard compartilhado pelos tool handlers de filesystem
 * (`list_dir`, `read_file`, `write_file`). Substitui o padrão V1
 * `startsWith(`${base}/`)` que quebra no Windows (separador `\`).
 *
 * Usa `path.relative()` — se o relativo começa com `..` ou é absoluto, o
 * target está FORA da base e devolvemos Err. Funciona em ambos POSIX e
 * Windows porque `relative` usa o separador nativo.
 */

import { isAbsolute, relative, resolve, sep } from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import type { ToolFailure } from '../types.ts';

export interface PathGuardOptions {
  /** Código do erro (prefixado com `tool.<name>.path_escape`). */
  readonly code: string;
}

/**
 * Resolve `requested` (absoluto ou relativo) contra `workingDirectory` e
 * devolve o path absoluto se ele estiver DENTRO de `workingDirectory`.
 * Qualquer tentativa de escape (`..`, path absoluto fora, etc) vira Err.
 */
export function resolveInside(
  workingDirectory: string,
  requested: string,
  options: PathGuardOptions,
): Result<string, ToolFailure> {
  const base = resolve(workingDirectory);
  const target = isAbsolute(requested) ? resolve(requested) : resolve(base, requested);
  const rel = relative(base, target);
  const escaped = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (escaped) {
    return err({
      code: options.code,
      message: 'path resolves outside the working directory',
      context: { base, target },
    });
  }
  return ok(target);
}

/**
 * Converte um path absoluto DENTRO de `base` em path relativo limpo,
 * usando `/` como separador para exibição (consistente entre plataformas).
 * Se o path for igual à base, retorna `.`.
 */
export function relativeInside(base: string, target: string): string {
  const resolvedBase = resolve(base);
  const resolvedTarget = resolve(target);
  if (resolvedBase === resolvedTarget) return '.';
  const rel = relative(resolvedBase, resolvedTarget);
  return rel.split(sep).join('/');
}
