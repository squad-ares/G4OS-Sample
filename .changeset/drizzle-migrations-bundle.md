---
'@g4os/desktop': patch
---

Fix crítico: app empacotado crashava em initDatabase com ENOENT porque
packages/data/drizzle/ não estava sendo copiado para process.resourcesPath/drizzle.
Adicionado ao extraResources de electron-builder.config.ts.

Descoberto ao rodar app local com Developer Mode + Gatekeeper disabled
(contornando AMFI de macOS 15) — trace logger capturou o stack trace em
$TMPDIR/g4os-startup-error.log.
