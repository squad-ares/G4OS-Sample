---
'@g4os/credentials': minor
'@g4os/ipc': minor
---

Credentials epic 05: `CredentialVault` gateway com mutex, backup rotation (3) e metadata por chave; backends in-memory, file+codec, e `safe-storage-codec` via dynamic import de `electron.safeStorage`; `createVault({ mode })` como factory única (`prod`/`dev`/`test`). Migrador v1→v2 (AES-256-GCM + PBKDF2) é dry-run, idempotente e não-destrutivo; tokens de renovação migram como `<key>.refresh_token`. `RotationOrchestrator` (DisposableBase + `setInterval`) + `OAuthRotationHandler` plugável. tRPC `credentials` expõe `get/set/delete/list/rotate`. ADRs 0050–0053.
