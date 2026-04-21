export function readRuntimeEnv(name: string): string | undefined {
  // biome-ignore lint/style/noProcessEnv: ponto único auditável de leitura
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
