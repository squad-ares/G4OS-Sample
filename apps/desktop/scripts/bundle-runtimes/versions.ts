/**
 * Versões pinadas dos runtimes bundled.
 *
 * Mudar aqui → rodar `pnpm prebundle -- --capture-checksums` → commitar
 * `checksums.json` atualizado.
 */
export const RUNTIME_VERSIONS = {
  // Node 24 LTS (piso permanente V2 — match com .nvmrc + .npmrc use-node-version)
  node: '24.10.0',
  pnpm: '10.33.0',
  // Astral UV — gerenciador Python moderno usado por MCPs stdio
  uv: '0.5.14',
  // python-build-standalone — Python portable de Astral (mesma stack do uv)
  // Formato da release: `<tag>` = `<date>`; version interno do Python vai no arquivo
  python: '3.12.13',
  pythonBuildTag: '20260414',
  // Git portable só no Windows; macOS/Linux usam sistema
  git: '2.47.0',
} as const;
