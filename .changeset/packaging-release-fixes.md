---
'@g4os/desktop': patch
'@g4os/agents': patch
'@g4os/ipc': patch
'@g4os/observability': patch
---

Fixes do release-desktop pipeline:

- Windows: uv.exe binário extraído na raiz do zip (não em subfolder)
- Linux: AppArmor profile via extraResources + postinst (resolve EACCES em build)
- macOS: workflow exporta vars de signing apenas quando secrets têm valor (evita CSC_LINK="")
- Bump @g4os/desktop para 0.1.0-beta.0 com Supabase URL+ANON_KEY embutidas em build time
- tsconfigs de agents/ipc/observability: types: ["node"] explícito para dts build limpo em CI
