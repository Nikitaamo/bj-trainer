#!/bin/bash
# Builds "European Black Jack.app" (macOS) into dist/.
# Needs Xcode Command Line Tools (swiftc) and Node.
set -euo pipefail
cd "$(dirname "$0")"

APP_NAME="European Black Jack"
DIST="dist"
APP="$DIST/$APP_NAME.app"

echo "→ building web pages"
node build-game.js
node build-html.js

echo "→ compiling native shell"
mkdir -p "$DIST"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
swiftc -swift-version 5 -O -o "$APP/Contents/MacOS/bjtrainer" app/main.swift -framework Cocoa -framework WebKit
cp app/Info.plist "$APP/Contents/Info.plist"
cp zaidimas.html strategija.html "$APP/Contents/Resources/"

echo "→ rendering icon"
swiftc -swift-version 5 -O -o "$DIST/make-icon" app/make-icon.swift -framework AppKit
"$DIST/make-icon" "$DIST/icon-1024.png" > /dev/null
ICONSET="$DIST/AppIcon.iconset"
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s "$DIST/icon-1024.png" --out "$ICONSET/icon_${s}x${s}.png" > /dev/null
  d=$((s * 2))
  sips -z $d $d "$DIST/icon-1024.png" --out "$ICONSET/icon_${s}x${s}@2x.png" > /dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"

echo "→ signing (ad hoc)"
xattr -cr "$APP"   # strip Finder/quarantine attributes, codesign refuses them
codesign --force --deep --sign - "$APP"
codesign --verify --strict "$APP" && echo "  signature OK"

echo "✓ built: $APP"

# ./build-app.sh install  → also copy to /Applications (re-signed there)
if [[ "${1:-}" == "install" ]]; then
  TARGET="/Applications/$APP_NAME.app"
  pkill -f "/Contents/MacOS/bjtrainer" 2>/dev/null || true
  rm -rf "$TARGET" "/Applications/Black Jack treniruoklis.app"
  cp -R "$APP" "$TARGET"
  xattr -cr "$TARGET"
  codesign --force --deep --sign - "$TARGET" 2>/dev/null
  codesign --verify --strict "$TARGET" && echo "✓ installed: $TARGET"
fi
