#!/bin/sh
# Coffee Note installer / updater for macOS / Linux
# Usage: curl -fsSL https://note.coffeecli.com/install.sh | sh

set -e

CYAN=$(printf '\033[0;36m')
GREEN=$(printf '\033[0;32m')
GRAY=$(printf '\033[0;90m')
YELLOW=$(printf '\033[0;33m')
RED=$(printf '\033[0;31m')
RESET=$(printf '\033[0m')

echo ""
echo "  ${CYAN}Coffee Note Installer${RESET}"
echo "  ${GRAY}------------------------${RESET}"
echo "  Checking the latest release..." "${GRAY}"

OS=$(uname -s)
ARCH=$(uname -m)

# Resolve the platform slug the download server expects.
PLATFORM=""
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) PLATFORM="darwin-aarch64" ;;
      *)     PLATFORM="darwin-x64" ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      x86_64) PLATFORM="linux-x64" ;;
      aarch64|arm64) PLATFORM="linux-aarch64" ;;
      *)      PLATFORM="linux-x64" ;;
    esac
    ;;
  *)
    echo "  ${RED}Unsupported OS: $OS${RESET}"
    exit 1
    ;;
esac

LATEST_VERSION=""
DOWNLOAD_URL=""
# Primary source: the static version.json on the site.
LATEST_VERSION=$(curl -fsSL --max-time 10 "https://note.coffeecli.com/version.json?platform=$PLATFORM" 2>/dev/null | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
if [ -n "$LATEST_VERSION" ]; then
  DOWNLOAD_URL="https://note.coffeecli.com/download/$PLATFORM"
fi

if [ -z "$LATEST_VERSION" ] || [ -z "$DOWNLOAD_URL" ]; then
  echo ""
  echo "  ${YELLOW}An installer is not available yet. Please try again in about 10 minutes.${RESET}"
  exit 0
fi

echo "  Latest   : v$LATEST_VERSION"

TMP_FILE="$(mktemp -t coffee-note-XXXXXX)"
trap 'rm -f "$TMP_FILE"' EXIT

echo "  Downloading..." "${GRAY}"
curl -fsSL --max-time 300 "$DOWNLOAD_URL" -o "$TMP_FILE" || {
  echo ""
  echo "  ${RED}Download failed. Please check your network and try again.${RESET}"
  exit 1
}
if [ ! -s "$TMP_FILE" ]; then
  echo ""
  echo "  ${RED}The downloaded file is empty.${RESET}"
  exit 1
fi

if [ "$OS" = "Darwin" ]; then
  echo "  Installing..." "${GRAY}"
  # Expected a .dmg on macOS.
  MOUNT_POINT="$(mktemp -d)"
  hdiutil attach "$TMP_FILE" -nobrowse -mountpoint "$MOUNT_POINT" >/dev/null
  APP=$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" | head -1)
  if [ -z "$APP" ]; then
    hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
    echo "  ${RED}No Coffee Note.app found in the installer.${RESET}"
    exit 1
  fi
  ditto "$APP" "/Applications/Coffee Note.app"
  hdiutil detach "$MOUNT_POINT" >/dev/null 2>&1 || true
  echo ""
  echo "  ${GREEN}Coffee Note v$LATEST_VERSION is installed.${RESET}"
  echo "  First launch: right-click Coffee Note in /Applications and choose Open."
else
  echo "  Opening the downloaded package..." "${GRAY}"
  # Linux: the asset is a deb/rpm/AppImage; hand it to the user's tooling.
  FILE_NAME="$(basename "$TMP_FILE")"
  cp "$TMP_FILE" "./$FILE_NAME" 2>/dev/null || true
  rm -f "$TMP_FILE"
  case "$FILE_NAME" in
    *.deb)
      echo "  Installing with dpkg... (sudo)"
      sudo dpkg -i "./$FILE_NAME" || { sudo apt-get install -f -y >/dev/null 2>&1; sudo dpkg -i "./$FILE_NAME"; }
      rm -f "./$FILE_NAME"
      echo ""
      echo "  ${GREEN}Coffee Note v$LATEST_VERSION is installed.${RESET}"
      ;;
    *.rpm)
      echo "  Installing with rpm... (sudo)"
      sudo rpm -i "./$FILE_NAME" 2>/dev/null || sudo rpm -U "./$FILE_NAME"
      rm -f "./$FILE_NAME"
      echo ""
      echo "  ${GREEN}Coffee Note v$LATEST_VERSION is installed.${RESET}"
      ;;
    *)
      echo ""
      echo "  ${GREEN}Downloaded: ./$FILE_NAME${RESET}"
      echo "  Make it executable and run it:  chmod +x ./$FILE_NAME && ./$FILE_NAME"
      ;;
  esac
fi
