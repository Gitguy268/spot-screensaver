#!/usr/bin/env bash
# Builds SpotScreensaver.saver (arm64 + x86_64, ad-hoc signed) from macos/ and ./index.html.
#   bash macos/build.sh            → dist/SpotScreensaver.saver.zip
#   bash macos/build.sh --install  → also copies it to ~/Library/Screen Savers
# Needs the Xcode Command Line Tools (clang, lipo, codesign). The bundle is built in a temp folder,
# because codesign refuses bundles with the ._ files macOS writes on exFAT/FAT drives.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version" 2>/dev/null || echo 1.0.0)"
WORK="$(mktemp -d)"
SAVER="$WORK/SpotScreensaver.saver"
mkdir -p "$SAVER/Contents/MacOS" "$SAVER/Contents/Resources/web"
for arch in arm64 x86_64; do
  clang -arch "$arch" -mmacosx-version-min=12.0 -bundle -fobjc-arc -O2 -Wall -Werror \
    -framework Cocoa -framework ScreenSaver -framework WebKit \
    "$ROOT/macos/SpotSaverView.m" -o "$WORK/SpotScreensaver-$arch"
done
lipo -create "$WORK/SpotScreensaver-arm64" "$WORK/SpotScreensaver-x86_64" -output "$SAVER/Contents/MacOS/SpotScreensaver"
sed "s/@VERSION@/$VERSION/g" "$ROOT/macos/Info.plist" > "$SAVER/Contents/Info.plist"
plutil -lint "$SAVER/Contents/Info.plist" >/dev/null
cat "$ROOT/index.html" > "$SAVER/Contents/Resources/web/index.html"
for f in thumbnail.png thumbnail@2x.png; do [ -f "$ROOT/macos/$f" ] && cat "$ROOT/macos/$f" > "$SAVER/Contents/Resources/$f"; done
xattr -cr "$SAVER"
codesign --force --deep --sign - "$SAVER"
codesign --verify --strict "$SAVER"
mkdir -p "$ROOT/dist"
(cd "$WORK" && COPYFILE_DISABLE=1 ditto -c -k --norsrc --keepParent SpotScreensaver.saver SpotScreensaver.saver.zip)
cat "$WORK/SpotScreensaver.saver.zip" > "$ROOT/dist/SpotScreensaver.saver.zip"
lipo -archs "$SAVER/Contents/MacOS/SpotScreensaver"
echo "built dist/SpotScreensaver.saver.zip ($VERSION, $(du -h "$ROOT/dist/SpotScreensaver.saver.zip" | cut -f1))"
if [ "${1:-}" = "--install" ]; then
  mkdir -p "$HOME/Library/Screen Savers"
  rm -rf "$HOME/Library/Screen Savers/SpotScreensaver.saver"
  ditto "$SAVER" "$HOME/Library/Screen Savers/SpotScreensaver.saver"
  echo "installed to ~/Library/Screen Savers"
fi
rm -rf "$WORK"
