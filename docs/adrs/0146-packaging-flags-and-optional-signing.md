# ADR-0146: Packaging flags e signing opcional no MVP

- Status: Accepted
- Date: 2026-04-24

## Contexto

Epic 12 (Packaging & Distribution) bloqueia release, mas os pré-requisitos
externos com custo (Apple Developer US$ 99/ano, certificado Windows US$
200-800/ano, Azure Trusted Signing US$ 10/mês) não precisam estar contratados
para o MVP rodar.

Decisões históricas do V1 que queremos evitar:

- Signing inline em `electron-builder` causava dual-sign (sha1+sha256) no
  Windows KeyLocker, dobrando custo de assinatura.
- Ausência de flags tornava builds de dev/CI dependentes de secrets — PR
  quebrava em quem clonava o repo sem o cofre de secrets.

## Decisão

Todo bloco de signing/publish em packaging é **opt-in** por env var. Ausência
do secret correspondente resolve para comportamento MVP (ad-hoc/unsigned/skip),
não falha de build.

### Flags canônicas

| Env var | Valores | Default | Efeito |
|---|---|---|---|
| `G4OS_MAC_SIGN_MODE` | `adhoc` \| `signed` \| `skip` | `adhoc` | `adhoc` assina localmente sem notarização; `signed` exige `APPLE_ID` + `APPLE_TEAM_ID` + `CSC_LINK`; `skip` pula tudo |
| `WIN_SIGN_PROVIDER` | `none` \| `pfx` \| `keylocker` \| `azure` \| `auto` | `none` | `auto` detecta via `WIN_CSC_LINK` ou `SM_API_KEY`; `none` entrega installer não assinado (SmartScreen warn) |
| `G4OS_LINUX_SIGN_GPG` | `1` \| unset | unset | Assinatura GPG do AppImage e `.rpm` — opcional |
| `G4OS_PUBLISH_MODE` | `r2` \| `github` \| `none` | `none` | `r2` publica em Cloudflare R2 via env `R2_*`; `github` usa GitHub Releases |
| `G4OS_BUNDLE_PROFILE` | `light` \| `full` | `full` | `light` bundle só `node` + `pnpm`; `full` adiciona `uv` + `python3` + `git` |
| `G4OS_SKIP_RUNTIME_VALIDATION` | `1` \| unset | unset | Override de emergência para pular `verifyBundle` em CI — nunca usar em release |

### Signing Windows — signing post-build obrigatório

O V1 sofria dual-sign. No V2 o signing Windows **nunca** é feito via campo
`win.certificateFile` do electron-builder (que dispara dual `sha1+sha256`).
Em vez disso:

1. `electron-builder --win` gera installer sem assinar
2. Script `scripts/sign-windows.ts` é chamado separadamente
3. `scripts/regenerate-metadata.ts` reemite `latest.yml` + `.blockmap` com
   hash do binário assinado

### CI strategy para repo privado

GitHub Actions cobra 10x por minuto macOS em repos privados. A mitigação:

- **PRs + push main:** só typecheck, lint, test, architecture gates (Ubuntu)
- **Release builds (macOS + Win + Linux):** `workflow_dispatch` manual ou tag
  `v*.*.*` push. Nunca automático em main.
- **Job split por plataforma** com `if: env.APPLE_ID != ''` para macOS signing,
  `if: env.WIN_SIGN_PROVIDER != 'none'` para Windows signing — build sempre
  roda, signing condicional.

## Consequências

- Desenvolvedor clona repo e roda `pnpm dist:mac` sem nenhum secret — gera
  DMG ad-hoc signed que abre local via right-click.
- CI de PR é barato (~5 min, Ubuntu only).
- Upgrade para signing real é puro CI secret + mudar env — zero alteração de
  código ou config de build.
- Ausência de Apple Developer ou cert Windows não bloqueia release MVP; só
  muda UX (usuário vê aviso na primeira abertura).

## Upgrade path

1. Obter Apple Developer → setar `APPLE_ID`/`APPLE_TEAM_ID`/`CSC_LINK` em CI
   secrets → mudar `G4OS_MAC_SIGN_MODE=signed`. Código não muda.
2. Obter Azure Trusted Signing → setar `AZURE_TENANT_ID`/`AZURE_CLIENT_ID`/
   `AZURE_CLIENT_SECRET` → mudar `WIN_SIGN_PROVIDER=azure`.
3. Auto-update publish: setar `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/
   `R2_ENDPOINT`/`R2_BUCKET` → mudar `G4OS_PUBLISH_MODE=r2`.

## Referências

- `apps/desktop/electron-builder.config.ts` (source of truth dos flags)
- `scripts/sign-windows.ts`, `scripts/sign-macos.sh`, `scripts/notarize-macos.ts`
- `.github/workflows/release-desktop.yml`
