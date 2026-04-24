#!/usr/bin/env bash
#
# Assina o .app macOS para distribuição. Idempotente.
#
# Modo controlado por G4OS_MAC_SIGN_MODE:
#   adhoc  (default) — assina com identidade "-" (local, sem Apple Developer).
#                      Usuário precisa de right-click→Abrir na primeira vez.
#   signed           — exige APPLE_TEAM_ID + CSC_LINK + CSC_KEY_PASSWORD.
#                      Chama `codesign` com Developer ID e depois notariza.
#   skip             — pula sign. Quicklook/dev only.
#
# Uso: scripts/sign-macos.sh <path/to/G4 OS.app>

set -euo pipefail

APP_PATH="${1:-}"
if [ -z "$APP_PATH" ]; then
  echo "usage: sign-macos.sh <G4 OS.app>" >&2
  exit 1
fi

if [ ! -d "$APP_PATH" ]; then
  echo "[sign-macos] app bundle not found at $APP_PATH" >&2
  exit 1
fi

MODE="${G4OS_MAC_SIGN_MODE:-adhoc}"
ENTITLEMENTS="apps/desktop/resources/entitlements.mac.plist"

echo "[sign-macos] mode=$MODE app=$APP_PATH"

case "$MODE" in
  skip)
    echo "[sign-macos] skipping per G4OS_MAC_SIGN_MODE=skip"
    exit 0
    ;;

  adhoc)
    IDENTITY="-"
    ;;

  signed)
    : "${APPLE_TEAM_ID:?APPLE_TEAM_ID required for signed mode}"
    IDENTITY="Developer ID Application: G4 Educacao ($APPLE_TEAM_ID)"
    ;;

  *)
    echo "[sign-macos] invalid G4OS_MAC_SIGN_MODE=$MODE" >&2
    exit 1
    ;;
esac

# Helper bundles primeiro (codesign --deep é frágil em helpers aninhados)
if [ -d "$APP_PATH/Contents/Frameworks" ]; then
  while IFS= read -r -d '' helper; do
    echo "[sign-macos] signing helper: $(basename "$helper")"
    codesign --force --timestamp --options runtime \
      --entitlements "$ENTITLEMENTS" \
      --sign "$IDENTITY" "$helper"
  done < <(find "$APP_PATH/Contents/Frameworks" -name '*.app' -print0)
fi

# Main app
echo "[sign-macos] signing main app"
codesign --force --deep --timestamp --options runtime \
  --entitlements "$ENTITLEMENTS" \
  --sign "$IDENTITY" "$APP_PATH"

# Verificação estrutural (não garante trust, mas detecta corrupção)
echo "[sign-macos] verifying"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"

if [ "$MODE" = "signed" ]; then
  echo "[sign-macos] running Gatekeeper assessment"
  spctl -a -vv "$APP_PATH" || {
    echo "[sign-macos] spctl assessment failed — rode notarize-macos.ts após este script" >&2
    exit 2
  }
fi

echo "[sign-macos] done"
