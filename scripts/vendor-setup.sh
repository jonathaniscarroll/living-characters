#!/usr/bin/env bash
# vendor-setup.sh — Download Tweego + SugarCube 2 into vendor/ for CI builds
# Run from repo root: bash scripts/vendor-setup.sh

set -euo pipefail

TWEEGO_VERSION="2.1.1"
SUGARCUBE_VERSION="2.37.3"
OS="linux"
ARCH="amd64"

echo "==> Creating vendor directories"
mkdir -p vendor/tweego
mkdir -p vendor/storyformats

# ── Tweego ──────────────────────────────────────────────────────────────────
TWEEGO_URL="https://github.com/tmedwards/tweego/releases/download/v${TWEEGO_VERSION}/tweego-${TWEEGO_VERSION}-${OS}-${ARCH}.zip"
TWEEGO_ZIP="/tmp/tweego.zip"

echo "==> Downloading Tweego ${TWEEGO_VERSION} (${OS}-${ARCH})"
curl -fsSL "${TWEEGO_URL}" -o "${TWEEGO_ZIP}"

echo "==> Extracting Tweego"
cd /tmp && unzip -o tweego.zip && cd -
cp "/tmp/tweego-${TWEEGO_VERSION}-${OS}-${ARCH}/tweego" vendor/tweego/tweego
chmod +x vendor/tweego/tweego
echo "    ✓ vendor/tweego/tweego"

# ── SugarCube 2 ─────────────────────────────────────────────────────────────
SUGARCUBE_URL="https://github.com/tmedwards/sugarcube-2/releases/download/v${SUGARCUBE_VERSION}/sugarcube-2-${SUGARCUBE_VERSION}-for-twine-2.1+-local.zip"
SUGARCUBE_ZIP="/tmp/sugarcube.zip"

echo "==> Downloading SugarCube 2 v${SUGARCUBE_VERSION}"
curl -fsSL "${SUGARCUBE_URL}" -o "${SUGARCUBE_ZIP}"

echo "==> Extracting SugarCube 2"
cd /tmp && unzip -o sugarcube.zip && cd -
cp -r "/tmp/sugarcube-2" vendor/storyformats/sugarcube-2
echo "    ✓ vendor/storyformats/sugarcube-2/format.js"

echo ""
echo "==> Done! Vendor setup complete."
echo "    Now commit vendor/tweego/tweego and vendor/storyformats/sugarcube-2/"
echo "    so the GitHub Actions build can find them."
echo ""
echo "    git add vendor/"
echo "    git commit -m 'vendor: add Tweego and SugarCube 2 binaries'"
echo "    git push"
