# Room Object Sprite Frames — Implementation Prompt

## Feature Summary

Extend the **Add / Edit Object** modal (`openObjModal` / `saveObject` in `scripts/room.js`)
to support uploading **sprite frame images** for an object — identical UX to the character
sprite system in `scripts/modals.js`, but with a **single animation state** (objects don't
walk or talk; they just have one looping sprite strip).

Once frames are saved on the object, `buildRoomScene` renders them as an **animated
billboard sprite** in the Three.js scene instead of the brown fallback box, using the same
`SpriteAnimator` + `THREE.Texture` pattern already used for characters in `_buildCharSprite`.

---

## Data Model

### Existing object shape (do not change existing fields)

```js
{
  id, roomId, name, desc, glbUrl,
  px, pz, scale,
  position: { x, y, z } | null,
  rotation: { y } | null
}
```

### Add one new field

```js
frames: string[]   // array of base64 data-URL strings (PNG/JPEG), default []
```

In `saveObject()`, write: `frames: window._editingObjFrames || existing?.frames || []`

`window._editingObjFrames` is the module-level temp array (reset on each `openObjModal` call,
seeded from `obj.frames` when editing an existing object).

---

## Changes to `scripts/room.js`

### 1 — Module-level temp state (add near top of file, alongside `editingObjId`)

```js
let _objPendingFrames = [];  // working copy while modal is open
```

Expose it as `window._editingObjFrames` on open/save so `saveObject` can read it:
```js
// in openObjModal  → window._editingObjFrames = _objPendingFrames;
// in closeObjModal → _objPendingFrames = []; window._editingObjFrames = null;
```

---

### 2 — Extend `openObjModal(objId)`

After the existing field-population block, seed the frame array and inject the
sprite section:

```js
// Reset temp frames
_objPendingFrames = obj ? [...(obj.frames || [])] : [];
window._editingObjFrames = _objPendingFrames;

// Inject sprite section (or rebuild if already present)
buildObjSpriteSection();
```

---

### 3 — New function: `buildObjSpriteSection()`

Mirrors `buildSpriteSection` / `buildSpriteGrid` in `scripts/modals.js` but
for a single unnamed state. Insert it directly above `closeObjModal`.

```js
function buildObjSpriteSection() {
  // Remove stale section if re-opening modal
  const existing = document.getElementById('obj-sprite-section');
  if (existing) existing.remove();

  const section = document.createElement('div');
  section.id = 'obj-sprite-section';
  section.style.cssText = 'margin-top:14px;border-top:1px solid rgba(255,255,255,0.1);padding-top:10px;';
  section.innerHTML = `
    <button id="obj-sprite-toggle" onclick="lcRoom.toggleObjSpriteSection()"
      style="background:none;border:none;color:var(--text,#e0e0e0);font-size:13px;
             font-weight:600;cursor:pointer;padding:4px 0;display:flex;align-items:center;
             gap:6px;width:100%;text-align:left;">
      <span id="obj-sprite-arrow" style="display:inline-block;transition:transform .2s;">&#9658;</span>
      &#127974; Sprite Frames
    </button>
    <div id="obj-sprite-body" style="display:none;margin-top:10px;">
      <div style="font-size:11px;color:var(--text-muted,#999);margin-bottom:8px;">
        Upload image frames that animate on the object in the room. Replaces the 3D model.
      </div>
      <!-- Frame strip -->
      <div id="obj-sprite-strip"
           style="display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;
                  padding-bottom:4px;min-height:64px;align-items:flex-start;">
      </div>
      <!-- Add frames button -->
      <div style="margin-top:8px;display:flex;gap:6px;align-items:center;">
        <button onclick="lcRoom.triggerObjFrameUpload()"
          style="font-size:11px;padding:5px 12px;border-radius:999px;
                 border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);
                 color:var(--text,#e0e0e0);cursor:pointer;">+ Add frames</button>
        <input id="obj-frame-input" type="file" accept="image/*" multiple
               style="display:none;" onchange="lcRoom.onObjFrameFileChange(this)">
        <span id="obj-frame-count"
              style="font-size:11px;color:var(--text-muted,#999);"></span>
      </div>
    </div>
  `;

  // Insert before the modal action buttons
  const overlay = document.getElementById('obj-modal-overlay');
  const actions = overlay.querySelector('.modal-actions, #of-delete, .obj-save-btn');
  if (actions) actions.parentNode.insertBefore(section, actions);
  else overlay.appendChild(section);

  renderObjSpriteStrip();
}
```

---

### 4 — New functions: strip render, upload, remove, toggle

Add all four directly below `buildObjSpriteSection`.

#### `renderObjSpriteStrip()`

Reuse the exact same checkerboard constant and card pattern from `modals.js`:

```js
const OBJ_CHECKERBOARD = [
  'background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),',
  'linear-gradient(-45deg,#ccc 25%,transparent 25%),',
  'linear-gradient(45deg,transparent 75%,#ccc 75%),',
  'linear-gradient(-45deg,transparent 75%,#ccc 75%);',
  'background-size:12px 12px;',
  'background-position:0 0,0 6px,6px -6px,-6px 0;',
  'background-color:#fff;'
].join('');

function renderObjSpriteStrip() {
  const strip = document.getElementById('obj-sprite-strip');
  const counter = document.getElementById('obj-frame-count');
  if (!strip) return;
  strip.innerHTML = '';
  const frames = _objPendingFrames;

  frames.forEach((dataUrl, index) => {
    const card = document.createElement('div');
    card.style.cssText = `position:relative;width:64px;height:80px;border-radius:6px;
      border:1px solid rgba(255,255,255,0.18);overflow:hidden;flex-shrink:0;
      ${OBJ_CHECKERBOARD}`;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;';
    card.appendChild(img);

    const del = document.createElement('button');
    del.textContent = '\u00D7';
    del.title = 'Remove frame';
    del.style.cssText = 'position:absolute;top:2px;right:2px;width:16px;height:16px;
      border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;
      font-size:11px;cursor:pointer;display:flex;align-items:center;
      justify-content:center;padding:0;';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      _objPendingFrames.splice(index, 1);
      renderObjSpriteStrip();
    });
    card.appendChild(del);

    const num = document.createElement('div');
    num.textContent = String(index + 1);
    num.style.cssText = 'position:absolute;bottom:0;left:0;right:0;text-align:center;
      font-size:9px;color:rgba(255,255,255,.65);text-shadow:0 0 4px rgba(0,0,0,.7);
      padding-bottom:2px;';
    card.appendChild(num);

    strip.appendChild(card);
  });

  if (counter) counter.textContent = frames.length ? `${frames.length} frame${frames.length > 1 ? 's' : ''}` : '';
}
```

#### `triggerObjFrameUpload()`
```js
function triggerObjFrameUpload() {
  document.getElementById('obj-frame-input')?.click();
}
```

#### `onObjFrameFileChange(input)`

Same async chroma-key pipeline as `onSpriteMultiFileChange` in `modals.js`:

```js
function onObjFrameFileChange(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;
  const readers = files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let data = e.target.result;
      // Optionally run chroma key if window.lcChroma is available
      if (window.lcChroma && typeof window.lcChroma.chromaKey === 'function') {
        try { data = await window.lcChroma.chromaKey(data, { h: 120, tolerance: 0.3, spill: 0.15 }); }
        catch (_) {}
      }
      resolve(data);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  }));
  Promise.all(readers).then(results => {
    results.forEach(r => { if (r) _objPendingFrames.push(r); });
    renderObjSpriteStrip();
    input.value = '';
  });
}
```

#### `toggleObjSpriteSection()`
```js
function toggleObjSpriteSection() {
  const body  = document.getElementById('obj-sprite-body');
  const arrow = document.getElementById('obj-sprite-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(90deg)';
}
```

---

### 5 — Update `saveObject()`

Add frames to the saved object data (one line, after `rotation`):

```js
frames: (_objPendingFrames.length ? [..._objPendingFrames] : (existing?.frames || [])),
```

---

### 6 — Update `closeObjModal()`

Reset temp state:

```js
_objPendingFrames = [];
window._editingObjFrames = null;
const spriteSection = document.getElementById('obj-sprite-section');
if (spriteSection) spriteSection.remove();
```

---

### 7 — Update `buildRoomScene()` — object rendering

In the `objsInRoom.forEach` block, check for frames **before** the GLB branch:

```js
objsInRoom.forEach(obj => {
  const px = obj.position?.x ?? obj.px ?? 0;
  const pz = obj.position?.z ?? obj.pz ?? 0;

  // ── SPRITE BILLBOARD (frames array present) ──────────────────
  if (obj.frames && obj.frames.length) {
    const animator = new window.SpriteAnimator({ default: obj.frames }, null);
    // SpriteAnimator expects { stateName: [frames] }; use 'default' state.
    // If SpriteAnimator requires a flat array, pass: new window.SpriteAnimator(null, obj.frames[0])
    // and manually cycle frames via setInterval or the existing _tickAllSprites hook.
    // See "Fallback" note below.

    const texture = new THREE.Texture();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    texture.image = img;
    img.onload = () => { texture.needsUpdate = true; };
    img.src = obj.frames[0];

    const geo = new THREE.PlaneGeometry(1.0, 1.0);
    const mat = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    // Lift sprite off floor by half its height
    mesh.position.set(px, 0.5, pz);
    mesh.castShadow = false;
    mesh._objId = obj.id;
    scene.add(mesh);
    mesh.traverse(c => { if (c.isMesh) c._objId = obj.id; });

    // Register in a new _objSpriteMap for ticking (see step 8)
    _objSpriteMap.set(obj.id, { animator, texture, mesh, frames: obj.frames, frameIdx: 0, elapsed: 0 });

    // Label
    const lbl = document.createElement('div');
    lbl.className = 'obj-label';
    lbl.textContent = '\uD83D\uDCE6 ' + obj.name;
    stage.appendChild(lbl);
    labels.push({ label: lbl, obj: mesh, headY: 1.0 + 0.1 });
    return; // skip GLB / fallback box
  }

  // ── GLB or fallback box (existing logic unchanged) ────────────
  // ... existing glbUrl branch and fallbackObjBox() remain here unchanged
});
```

---

### 8 — Object sprite map + tick (add alongside `_spriteMap`)

```js
// Near top of room.js, alongside _spriteMap:
const _objSpriteMap = new Map();  // objId → { texture, mesh, frames, frameIdx, elapsed }
const OBJ_FRAME_MS = 150;         // ms per frame — tweak for desired animation speed
```

In the `animate()` loop inside `buildRoomScene`, add after `_tickAllSprites`:

```js
_tickObjSprites(dt * 1000, camera);
```

New function:

```js
function _tickObjSprites(deltaMs, camera) {
  _objSpriteMap.forEach((entry) => {
    const { texture, mesh, frames } = entry;
    if (frames.length > 1) {
      entry.elapsed += deltaMs;
      if (entry.elapsed >= OBJ_FRAME_MS) {
        entry.elapsed = 0;
        entry.frameIdx = (entry.frameIdx + 1) % frames.length;
        texture.image.src = frames[entry.frameIdx];
      }
    }
    // Billboard: always face camera
    if (mesh && camera) mesh.lookAt(camera.position);
  });
}
```

In `destroyRoomScene()`, clear the map:

```js
_objSpriteMap.forEach(({ texture }) => { try { texture.dispose(); } catch (_) {} });
_objSpriteMap.clear();
```

---

### 9 — Export additions

Add the new public functions to both `window.lcRoom` and the `export {}` block:

```js
triggerObjFrameUpload, onObjFrameFileChange,
toggleObjSpriteSection, buildObjSpriteSection
```

---

## SpriteAnimator Compatibility Note

The existing `window.SpriteAnimator` in `scripts/sprite.js` may expect `{ stateName: frames[] }`
or may work with a flat fallback array — check its constructor signature before using it for
objects. If the constructor doesn't support arbitrary state names:

- **Option A**: pass `new SpriteAnimator({ idle: obj.frames }, null)` and call `.setState('idle')`
- **Option B**: skip `SpriteAnimator` entirely and use the manual `_tickObjSprites` loop
  (which cycles `frameIdx` via `elapsed`) — this is simpler and sufficient for static objects

**Recommendation**: use Option B (manual loop) for objects. It avoids coupling to character
animation state logic and is easier to explain to kids.

---

## Files to Touch

| File | Change |
|---|---|
| `scripts/room.js` | All changes above: modal UI, temp state, sprite section, save, render, tick, destroy |
| `index.html` | None required — `obj-modal-overlay` DOM is already present; sprite section is injected by JS |

---

## Key Constraints to Respect

- **No backend, no install** — frames are base64 data URLs persisted in localStorage via existing `save()`
- **Single facilitator machine** — tap-friendly UI, 44px min touch targets
- **Reuse existing patterns** — checkerboard preview, FileReader pipeline, chroma-key hook, billboard lookAt — all already in the codebase
- **Graceful degradation** — if `frames` is empty, existing GLB → fallback box logic runs unchanged
