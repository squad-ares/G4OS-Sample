---
'@g4os/desktop': patch
---

Release pipeline fixes (round 2):

- Force `--publish=always` quando `G4OS_PUBLISH_MODE=r2` (default electron-builder onTagOrDraft ignorava workflow_dispatch)
- Removida config `appImage.license` que apontava pra arquivo inexistente em apps/desktop/
- Removido step redundante de sign-macos no CI (electron-builder assina inline via identity)
- Bump version para 0.0.2 (canal stable)
