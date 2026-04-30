; G4 OS — NSIS customizations (TASK-12-07a)
;
; Detecta instalações legadas com identidade `@g4oselectron` (nome
; original do v1) e migra `config.json`, `credentials.enc` e
; `sessions/` para o caminho branded `G4 OS` antes de instalar.
;
; Sem isso, atalhos antigos no menu Iniciar / desktop continuam
; apontando pro path legado, e o usuário acaba com duas instalações
; concorrentes — exatamente o cenário de Dor 1 (runtime perdido pós
; update).
;
; Ordem de execução do electron-builder:
;   1. customInit  — antes da extração dos arquivos
;   2. customInstall — durante a instalação
;   3. customUnInit — antes da desinstalação
;
; Documentação:
;   https://www.electron.build/configuration/nsis#custom-nsis-script

!macro customInit
  ; Tenta resolver o caminho do install legado do registry. Sem entrada,
  ; salta a migração — primeiro install ou já migrado.
  ReadRegStr $0 HKCU "Software\@g4oselectron" "InstallLocation"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "Software\@g4oselectron" "InstallLocation"
  ${EndIf}

  ${If} $0 != ""
  ${AndIf} ${FileExists} "$0\*.*"
    DetailPrint "[G4 OS] legacy install detected at $0"
    DetailPrint "[G4 OS] migrating user data to %LOCALAPPDATA%\g4os..."

    ; Garante destino. `$LOCALAPPDATA` é onde o app branded armazena
    ; config/credentials/sessions (env-paths convention).
    CreateDirectory "$LOCALAPPDATA\g4os"

    ; Copia best-effort. `/SILENT` evita prompts em cima do installer.
    ; Falha em qualquer item NÃO aborta — install continua e o app cai
    ; em primeira-execução com config defaults se necessário.
    CopyFiles /SILENT "$0\config.json" "$LOCALAPPDATA\g4os\config.json"
    CopyFiles /SILENT "$0\config.backup.json" "$LOCALAPPDATA\g4os\config.backup.json"
    CopyFiles /SILENT "$0\credentials.enc" "$LOCALAPPDATA\g4os\credentials.enc"
    CopyFiles /SILENT "$0\sessions" "$LOCALAPPDATA\g4os\sessions"
    CopyFiles /SILENT "$0\workspaces" "$LOCALAPPDATA\g4os\workspaces"

    ; Remove o diretório legado apenas se a cópia subiu — caso contrário,
    ; preserva como fallback de recovery manual. RMDir /r tolera
    ; arquivos abertos com /REBOOTOK.
    ${If} ${FileExists} "$LOCALAPPDATA\g4os\config.json"
      RMDir /r /REBOOTOK "$0"
      DeleteRegKey HKCU "Software\@g4oselectron"
      DeleteRegKey HKLM "Software\@g4oselectron"
      DetailPrint "[G4 OS] legacy install removed"
    ${Else}
      DetailPrint "[G4 OS] migration partial — legacy preserved at $0"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ; Marca instalação branded no registry com versão para debugging
  ; cross-version.
  WriteRegStr HKCU "Software\G4OS" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\G4OS" "Version" "${VERSION}"
!macroend

!macro customUnInit
  ; Limpa registry branded. Não toca em $LOCALAPPDATA\g4os —
  ; `deleteAppDataOnUninstall: false` no electron-builder controla isso.
  DeleteRegKey HKCU "Software\G4OS"
!macroend
