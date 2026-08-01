# Room Fullscreen Backdrop + Horizontal Pan — Implementation Prompt

## Problem

The room view modal currently:
- Only covers the area **below** the top bar (`inset: var(--map-top) 0 0 0`), so the header and GitHub bar remain visible above it.
- Uses `background-size: cover` on `#room-stage`, which **crops** the backdrop image to fill the stage — the image's natural aspect ratio is lost.
- Has a fixed `viewSize = 10` world-units for the orthographic camera, so the visible width is **not** tied to the backdrop image's aspect ratio.
- Has no way to pan left/right to see the full width of a wide backdrop image.

## Desired Behaviour

1. **Fullscreen modal** — the room view covers the **entire viewport**, including the top bar and GitHub bar. The "← Map" button moves to the **top-left corner of the whole screen**.
2. **Backdrop fits to height** — the backdrop image is scaled so its **height** fills the room stage's height exactly, preserving aspect ratio. Its **width** is then determined by the image's aspect ratio (a wide image → a wide room).
3. **Wander space = image width** — the visible world-space width (and thus the wander bounds) corresponds to the **width of the fitted backdrop image**. Characters can wander across the full width of the image.
4. **Click-drag horizontal pan** — the user can click and drag left/right to pan the camera across the image. Panning is clamped so the user can never pan past the image's left or right edge. Vertical panning is not needed (image is fit to height, so it always fills vertically).

---

## Part 1 — Fullscreen Modal (CSS)

### Current state (`index.html`)

```css
#room-view{position:fixed;inset:var(--map-top) 0 0 0;z-index:1200;background:var(--bg);display:flex;flex-direction:column;transform:translateY(100%);transition:transform .35s cubic-bezier(.16,1,.3,1);}
#room-view.open{transform:translateY(0);}
```

The header is `z-index:1100` and the GitHub bar is `z-index:1090`. The room view is `z-index:1200` but starts at `var(--map-top)` (80px), leaving the header/gh-bar visible.

### Change

Make `#room-view` cover the whole viewport:

```css
#room-view{position:fixed;inset:0;z-index:1200;background:var(--bg);display:flex;flex-direction:column;transform:translateY(100%);transition:transform .35s cubic-bezier(.16,1,.3,1);}
#room-view.open{transform:translateY(0);}
```

- `inset:0` (instead of `inset:var(--map-top) 0 0 0`) makes it cover the full screen including the header.
- `z-index:1200` is already above the header (`1100`) and gh-bar (`1090`), so no z-index change is needed.

### Move the "← Map" button to the top-left of the whole screen

The `#room-header` currently sits at the top of the room view. Since the room view now covers the whole screen, the header is already at the top-left of the screen. Keep `#room-back` as the first element in `#room-header` — it will naturally be at the top-left corner.

If you want the back button to float **over** the stage (rather than in a header bar), you can make it absolutely positioned:

```css
#room-back{position:absolute;top:10px;left:10px;z-index:60;background:rgba(10,15,30,.85);border:1px solid var(--border);border-radius:8px;color:var(--accent2);font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;padding:6px 12px;white-space:nowrap;backdrop-filter:blur(4px);}
```

> **Recommendation:** Keep the existing `#room-header` bar (it holds the title, lede, and toolbar buttons). Just change `#room-view` to `inset:0`. The back button is already the first item in the header, so it lands at the top-left of the whole screen automatically.

---

## Part 2 — Backdrop Fit to Height + Width from Aspect Ratio

### Current state (`scripts/room.js`)

```js
function applyRoomBackdrop(room) {
  const stage = document.getElementById('room-stage');
  if (!stage) return;
  const uploadedSrc = room.backdropData || room.backdropUrl || null;
  if (uploadedSrc) {
    stage.style.cssText += [
      `background-image:url('${uploadedSrc}')`,
      'background-size:cover',          // <-- crops, loses aspect ratio
      'background-position:center',
    ].join(';');
    return;
  }
  // ...fallback to ROOM_BACKDROP_FILES...
}
```

### Change

Use `background-size: auto 100%` so the image's **height** fills the stage and the **width** is determined by the image's aspect ratio:

```js
stage.style.cssText += [
  `background-image:url('${uploadedSrc}')`,
  'background-size:auto 100%',          // fit height, width follows aspect ratio
  'background-position:center',
  'background-repeat:no-repeat',
].join(';');
```

> `background-size: auto 100%` scales the image so its height equals the stage height, and the width is `imageWidth * (stageHeight / imageHeight)`. This is exactly "fit to height, width from aspect ratio."

### Fallback backdrop files

For the built-in `ROOM_BACKDROP_FILES` (grass/forest/wood/stone), apply the same `auto 100%` sizing:

```js
stage.style.backgroundImage    = `url('${bgFile}')`;
stage.style.backgroundSize     = 'auto 100%';
stage.style.backgroundPosition = 'center';
stage.style.backgroundRepeat   = 'no-repeat';
stage.style.backgroundColor    = '';
```

---

## Part 3 — Wander Space Width = Backdrop Image Width

### The core idea

The orthographic camera's visible width must equal the **fitted backdrop image's width** in world units. Since the image is fit to height, and the camera's visible height is fixed by `viewSize` (10 world units), the visible width is:

```
visibleHeight = viewSize = 10  (world units, fixed)
visibleWidth  = visibleHeight * imageAspectRatio
```

where `imageAspectRatio = imageWidth / imageHeight`.

### How to get the image aspect ratio

The backdrop image is either:
- An uploaded data URL (`room.backdropData` / `room.backdropUrl`), or
- A built-in file (`ROOM_BACKDROP_FILES[room.backdrop]`)

Load the image to get its natural dimensions:

```js
function getBackdropAspectRatio(room) {
  return new Promise((resolve) => {
    const src = room.backdropData || room.backdropUrl || ROOM_BACKDROP_FILES[room.backdrop] || null;
    if (!src) { resolve(1); return; }
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
    img.onerror = () => resolve(1);
    img.src = src;
  });
}
```

### Update `buildRoomScene` to use the aspect ratio

Currently `buildRoomScene` is synchronous and uses a fixed `viewSize = 10`. To make the width depend on the image aspect ratio, you need the aspect ratio **before** building the scene.

**Option A — async build (recommended):** Make `buildRoomScene` async and await the aspect ratio:

```js
async function buildRoomScene(room) {
  destroyRoomScene();
  _wanderAgents = [];

  applyRoomBackdrop(room);

  const stage = document.getElementById('room-stage');
  const W = stage.clientWidth  || window.innerWidth;
  const H = stage.clientHeight || (window.innerHeight - 86 - 44);

  const aspectRatio = await getBackdropAspectRatio(room);

  const scene = new THREE.Scene();
  scene.background = null;
  const viewSize = 10;
  const viewH = viewSize;
  const viewW = viewSize * aspectRatio;   // <-- width from image aspect ratio

  const camera = new THREE.OrthographicCamera(
    -viewW / 2, viewW / 2,
     viewH / 2, -viewH / 2, 1, 1000
  );
  // ...rest unchanged...
}
```

> **Note:** `openRoom` already calls `buildRoomScene(room)` inside a `setTimeout`. Since `buildRoomScene` becomes async, the call site still works (it just returns a promise that's ignored). No other call-site changes are strictly required, but you may want to `await` it in `saveObject`/`deleteObject` for cleanliness.

**Option B — synchronous with cached aspect ratio:** Cache the aspect ratio when the backdrop is set (in `applyRoomBackdrop` or the room modal), and read it synchronously in `buildRoomScene`. This avoids making the function async but requires the ratio to be known before the scene builds.

> **Recommendation:** Use **Option A** (async). It's the cleanest and handles the case where the image loads after the room opens.

### Update `worldBounds` to match the new width

The `worldBounds` computed in Phase 1 must now use the new `viewW`:

```js
const halfW = (viewW / 2) / camera.zoom;
const halfH = (viewH / 2) / camera.zoom;
const targetX = room.cameraTargetX ?? 0;
const targetZ = room.cameraTargetZ ?? 0;
const worldBounds = {
  minX: targetX - halfW,
  maxX: targetX + halfW,
  minZ: targetZ - halfH,
  maxZ: targetZ + halfH,
};
```

This makes the wander space exactly as wide as the fitted backdrop image.

---

## Part 4 — Click-Drag Horizontal Pan

### Goal

The user can click and drag left/right to pan the camera across the image. Panning is clamped so the camera never shows beyond the image's left or right edge.

### Approach

Use custom pointer handlers on the renderer's canvas (no OrbitControls needed — we only need horizontal pan). Convert pixel drag deltas into world-space offsets using the orthographic frustum width.

### State

Add module-level state near the other room state:

```js
let _panDragging = false;
let _panStartX = 0;
let _panStartCamX = 0;
let _panStartTargetX = 0;
let _panMinX = 0;   // camera x when panned fully left
let _panMaxX = 0;   // camera x when panned fully right
```

### Compute pan limits

The camera can pan so that the visible rectangle stays within the image's world width. The image spans `[targetX - viewW/2, targetX + viewW/2]` in world X. The camera's visible half-width is `viewW / (2 * zoom)`. So:

```js
function _computePanLimits(camera, viewW, targetX) {
  const halfVisW = (viewW / 2) / camera.zoom;
  const imgMinX = targetX - viewW / 2;
  const imgMaxX = targetX + viewW / 2;
  _panMinX = imgMinX + halfVisW;   // camera x when left edge of image is at left of screen
  _panMaxX = imgMaxX - halfVisW;   // camera x when right edge of image is at right of screen
  if (_panMaxX < _panMinX) { _panMinX = _panMaxX = targetX; }  // image narrower than view — center it
}
```

### Pointer handlers

Add these to the renderer's `domElement` in `buildRoomScene`:

```js
dom.addEventListener('pointerdown', (e) => {
  if (_roomEditMode) return;   // don't pan while in edit mode
  _panDragging = true;
  _panStartX = e.clientX;
  _panStartCamX = camera.position.x;
  _panStartTargetX = (room.cameraTargetX ?? 0);
  dom.setPointerCapture?.(e.pointerId);
});

dom.addEventListener('pointermove', (e) => {
  if (!_panDragging) return;
  const dx = e.clientX - _panStartX;
  const viewW = (viewSize * aspectRatio);   // world width of the image
  const worldDx = (dx / dom.clientWidth) * viewW;
  const newCamX = THREE.MathUtils.clamp(_panStartCamX - worldDx, _panMinX, _panMaxX);
  camera.position.x = newCamX;
  // Keep the look-at target aligned with the camera's x so the view direction stays vertical
  camera.lookAt(newCamX, room.cameraTargetY ?? 0, room.cameraTargetZ ?? 0);
});

function _endPan(e) {
  _panDragging = false;
  dom.releasePointerCapture?.(e.pointerId);
}
dom.addEventListener('pointerup', _endPan);
dom.addEventListener('pointercancel', _endPan);
```

> **Important:** The existing `mousemove`/`touchmove` handlers set `_lastRoomPointer` for drag-to-move. The new `pointermove` handler must **not** conflict with edit-mode dragging. The `if (_roomEditMode) return;` guard on `pointerdown` prevents panning while in edit mode.

### Call `_computePanLimits` after the camera is set up

In `buildRoomScene`, after `camera.updateProjectionMatrix()` and after `worldBounds` is computed:

```js
_computePanLimits(camera, viewW, targetX);
```

### Reset pan state on scene destroy

In `destroyRoomScene`, reset the pan state:

```js
_panDragging = false;
_panMinX = 0;
_panMaxX = 0;
```

---

## Part 5 — Files to Touch

| File | Change |
|---|---|
| `index.html` | Change `#room-view` to `inset:0` (fullscreen). Optionally restyle `#room-back` to float at top-left. |
| `scripts/room.js` | `applyRoomBackdrop` → `background-size:auto 100%`. Add `getBackdropAspectRatio`. Make `buildRoomScene` async, compute `viewW` from aspect ratio, update `worldBounds`. Add pan state + pointer handlers + `_computePanLimits`. Reset pan in `destroyRoomScene`. |

---

## Part 6 — Key Constraints

- **No backend, no install** — pure CSS + Three.js math, no new dependencies.
- **Backdrop fit to height** — `background-size:auto 100%`; width follows aspect ratio.
- **Wander space = image width** — `viewW = viewSize * aspectRatio`; `worldBounds` uses `viewW`.
- **Horizontal pan only** — vertical panning is not needed (image always fills height).
- **Pan clamped** — user can never pan past the image's left/right edge.
- **Edit mode guard** — panning is disabled while `_roomEditMode` is true (so drag-to-move still works).
- **Backward compatible** — rooms without a backdrop fall back to `aspectRatio = 1` (square), preserving current behaviour.
- **Fullscreen modal** — `#room-view` covers the whole viewport; back button at top-left of the whole screen.

---

## Part 7 — Test Sequence

1. Open a room with a **wide** backdrop image. Confirm:
   - The modal covers the whole screen (header and gh-bar hidden behind it).
   - The backdrop fills the stage height; its width is wider than the stage (image is cropped horizontally by the stage edges).
   - The "← Map" button is at the top-left of the whole screen.
2. Click and drag left/right. Confirm:
   - The camera pans horizontally.
   - Panning stops at the image's left and right edges (can't pan past them).
   - Characters wander across the full width of the image and never leave the visible area.
3. Open a room with a **square** backdrop. Confirm:
   - The image fits height, width equals height (square).
   - Panning is limited (or disabled if the image is narrower than the view).
4. Open a room with **no** backdrop. Confirm it falls back to `aspectRatio = 1` and behaves as before.
5. Enter **Move Objects** edit mode. Confirm:
   - Panning is disabled.
   - Drag-to-move still works.
6. Close and reopen the room. Confirm pan state resets to center.

---

## Commit Message

`feat: fullscreen room modal, backdrop fit-to-height, horizontal pan`