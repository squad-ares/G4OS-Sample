---
'@g4os/desktop': patch
---

Release pipeline fixes (round 4):

- Workflow aliasa `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` → `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` para electron-builder S3 publisher autenticar (NoCredentialProviders fix)
- package.json ganha `homepage` + `author` (FpmTarget exige para Linux)
- electron-builder.config.ts: `linux.executableName: 'g4os'` + `linux.maintainer` para .deb não rejeitar slug `@g4os/desktop_0.0.2_amd64.deb`
