# Vendored Tweego Binary

This directory must contain the `tweego` executable for the GitHub Actions build.

## Why vendored?

The `spatial-narrative` pipeline vendors Tweego directly in the repo so the CI build is
self-contained and reproducible — no downloading from external servers during the build,
no version drift.

## Setup (one-time, run from repo root)

```bash
bash scripts/vendor-setup.sh
```

This will:
1. Download the latest Tweego Linux amd64 release from GitHub
2. Place the `tweego` binary at `vendor/tweego/tweego`
3. Download SugarCube 2 and place `format.js` at `vendor/storyformats/sugarcube-2/format.js`

## Manual setup

1. Download Tweego from https://github.com/tmedwards/tweego/releases
2. Extract and copy the `tweego` binary (Linux amd64) to this directory
3. `chmod +x vendor/tweego/tweego`

The binary is gitignored by default — add `-force` or remove from `.gitignore` once you
have confirmed it works, then commit it so CI has it available.

> **Note for CI:** The binary must be committed into the repo (not gitignored) for the
> GitHub Actions workflow to find it at `vendor/tweego/tweego`.
