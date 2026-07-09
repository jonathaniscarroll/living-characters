# Vendored SugarCube 2 Story Format

This directory must contain `format.js` for Tweego to compile stories using SugarCube 2.

## Setup (one-time, run from repo root)

```bash
bash scripts/vendor-setup.sh
```

## Manual setup

1. Download SugarCube 2 from https://www.motoslave.net/sugarcube/2/
2. Extract the release zip
3. Copy the entire `sugarcube-2/` folder (containing `format.js`, `format.css`, etc.)
   into this `vendor/storyformats/` directory

## Structure expected by Tweego

```
vendor/storyformats/
  sugarcube-2/
    format.js      ← required
    format.css     ← included automatically
    LICENSE        ← optional but good practice
```

Tweego discovers this via the `TWEEGO_PATH=vendor/storyformats` environment variable
set in the GitHub Actions workflow.
