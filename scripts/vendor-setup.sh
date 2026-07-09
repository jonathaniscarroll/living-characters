#!/usr/bin/env bash
set -euo pipefail

TWEEGO_VERSION="2.1.1"
OS="linux"
ARCH="x64"

mkdir -p vendor/tweego
mkdir -p vendor/storyformats

TWEEGO_URL="https://github.com/tmedwards/tweego/releases/download/v${TWEEGO_VERSION}/tweego-${TWEEGO_VERSION}-${OS}-${ARCH}.zip"
TWEEGO_ZIP="/tmp/tweego.zip"
TWEEGO_TMP="/tmp/tweego-extract"

echo "==> Creating vendor directories"
rm -rf "${TWEEGO_TMP}"
mkdir -p "${TWEEGO_TMP}"

echo "==> Downloading Tweego ${TWEEGO_VERSION} (${OS}-${ARCH})"
curl -fsSL "${TWEEGO_URL}" -o "${TWEEGO_ZIP}"

echo "==> Extracting Tweego"
unzip -o "${TWEEGO_ZIP}" -d "${TWEEGO_TMP}"

cp "${TWEEGO_TMP}/tweego" vendor/tweego/tweego
chmod +x vendor/tweego/tweego
cp -R "${TWEEGO_TMP}/storyformats/." vendor/storyformats/

echo "    ✓ vendor/tweego/tweego"
echo "    ✓ vendor/storyformats/sugarcube-2/format.js"