# Changelog

## July 2026

### Fix: FBX/GLB characters not rendering in rooms

**Problem:** When a character's 3D model was uploaded as an FBX or GLB, it uploaded successfully (status showed ✓) but the character appeared as a coloured box in the room scene.

**Root cause:** `upload-helpers.js` and `modals.js` run as separate ES modules. The upload helper wrote the converted data URL to `window.tempGlbData` (the global), but `saveCharacter()` in `modals.js` read a module-local variable `tempGlbData` that was never updated by the upload helper. The two variables were distinct.

**Fix (`scripts/upload-helpers.js`):** `storeResult()` now explicitly sets `window.tempGlbData = dataUrl` in addition to `window[dataKey]`, ensuring the result is always on the global regardless of which key was requested.

**Fix (`scripts/modals.js`):**
- `openCharModal()` now clears `window.tempGlbData = null` on open and seeds it alongside the local `tempGlbData` when an existing character already has a data URL model.
- `closeCharModal()` also clears `window.tempGlbData = null` on close, preventing stale uploads from bleeding into a subsequent character save.
- `saveCharacter()` now resolves GLB as `tempGlbData || window.tempGlbData || cf-glb-url field`.

---

### Change: Room backdrops — upload only, no presets

**Before:** The Add a Room modal had a dropdown with preset backdrop styles (forest, cave, stone, water, wood, grass, dark).

**After:** The dropdown is removed. Backdrops come exclusively from the file picker in the modal. If no image is uploaded, the room shows a solid floor colour and simple walls.

Legacy rooms with named backdrop keys (grass / forest / wood / stone) continue to resolve through `ROOM_BACKDROP_FILES` for backwards compatibility.

---

### 2026-07-28
- **GPS user marker** — pulsing blue dot (`DivIcon` + CSS `@keyframes lc-pulse`) placed at user's real-world coordinates. "You are here" tooltip. `zIndexOffset: 9999` keeps it above character pins.
- **Accuracy circle** — `L.circle` with radius = `coords.accuracy` metres; semi-transparent blue ring, non-interactive.
- **Auto-center on load** — `initMap()` now calls `getCurrentPosition` before any user interaction. Map snaps to user position on the first successful fix.
- **First-fix gate** — `_gpsFirstFix` boolean ensures the map re-centers exactly once; subsequent `watchPosition` updates do not override manual panning.
- **Sim mode marker** — `startSim` now also moves the user marker and accuracy circle through each room waypoint.

---

## Earlier

- Initial implementation: map canvas, character pins, Three.js room scene, wander AI, mood rings, dialogue builder, Twee export, schedule editor, GitHub sync, drag-to-move.
