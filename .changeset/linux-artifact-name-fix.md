---
'@g4os/desktop': patch
---

Fix Linux .deb/.rpm: forçar `artifactName: 'g4os-${version}-${arch}.${ext}'`
para evitar slug `@g4os/desktop_*.deb` que vinha do package name e quebrava
fpm porque `@` e `/` não são válidos em paths debian (parent directory not
exists). `executableName: 'g4os'` sozinho não bastava — afeta o binário mas
não o filename do pacote.

Bump version para `0.0.3-beta` (canal beta no auto-update feed R2).
