---
'@g4os/desktop': patch
---

Fix "Page not found" ao abrir o app empacotado: TanStack Router default
usa `createBrowserHistory()` que lê `window.location.pathname`. Em Electron
com `file://...index.html`, esse pathname vira o caminho absoluto do bundle,
que não bate com nenhuma rota → 404.

Trocado para `createHashHistory()` que sobrevive a `file://` URLs e
mantém compatibilidade com dev server (HMR continua funcionando). URLs
em runtime ficam `file://...index.html#/sessions`, `#/projects`, etc.

Bump 0.0.5-beta — primeiro release que abre a UI no app empacotado.
