---
'@g4os/desktop': patch
---

Fix Linux .rpm: passar `--name g4os` via `rpm.fpm` para evitar nome com
espaço ("G4 OS.spec") que rpmbuild rejeita. AppImage e .deb passaram no
build 0.0.3-beta; só RPM falhava neste último gate.

`productName: 'G4 OS'` continua sendo usado pelos demais alvos (DMG/NSIS/AppImage)
porque eles aceitam espaço — só rpmbuild quebra.

Bump version para `0.0.4-beta` (release nova com rpm incluído no R2).
