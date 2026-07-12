# Living Characters

A GPS + proximity virtual world builder where **characters replace locations as the primary unit**. Built from the same spatial logic as [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) — but organised around *who* rather than *where*.

Runs in any modern browser. No install. No backend. One facilitator machine.

---

## ✅ Current progress (July 2026)

The project is now a working browser-based world builder with a full facilitator workflow for rooms, characters, objects, export/import, and cloud sync. The main app shell has also been split into modular scripts to make future work easier to maintain.

### What works now

| Feature | Status |
|---|---|
| Pannable/zoomable Leaflet map with room circles and character pins | ✅ |
| Add / edit rooms with GPS coordinates, radius, and backdrop | ✅ |
| Add / edit characters with photo, Mixamo GIF, GLB URL, mood, items, and dialogue | ✅ |
| Add / edit room objects with names, descriptions, position, rotation, scale, and GLB URL | ✅ |
| Three.js room scene with floor, walls, mood rings, and room labels | ✅ |
| GLB model loading via `window.GLTFLoader` with `AnimationMixer` support | ✅ |
| Fallback rendering for photos/GIFs and simple placeholder objects | ✅ |
| Click character in room → talk panel with dialogue passage buttons | ✅ |
| Mood ring pulse when a character speaks | ✅ |
| Twee export (`.twee` download) and import (drag-drop or file picker) | ✅ |
| GitHub cloud save / load (`story/main.twee`) via token | ✅ |
| SHA auto-seeded on load to avoid GitHub sync conflicts | ✅ |
| Binary media stripped from Twee export and kept in browser storage | ✅ |
| GPS proximity → auto-open room | ✅ |
| Simulate mode (cycles through rooms) | ✅ |
| Compass panel showing nearest rooms | ✅ |
| Facilitator / Visitor mode toggle | ✅ |
| Modular app structure via `scripts/` modules for storage, map, room, cards, and modals | ✅ |

### Recent implementation milestones

- Phase 2 room-object support is now in place, including clickable object descriptions and object placement in the room scene.
- The app no longer relies on a single large inline script block; core runtime logic has been split into dedicated modules.
- The GitHub sync path is working with a token-based save/load workflow and Twee-based persistence.

### ✅ Phase 0 — GLTFLoader bug fix
`buildRoomScene` now uses `window.GLTFLoader` (not `THREE.GLTFLoader`). 3D scanned characters load correctly.

### ✅ Phase 1 — Modular characters (multi-room)

| Step | What | Status |
|---|---|---|
| 1 | Backwards-compatible `roomIds[]` migration on load | ✅ |
| 2 | `roomIds[]` written by `saveCharacter()` alongside legacy `roomId` | ✅ |
| 3 | All render paths (`buildRoomScene`, pins, tooltips, card) use `roomIds\|\|[roomId]` | ✅ |
| 4 | Twee export writes `roomIds`; import reads both `roomId` and `roomIds` | ✅ |
| 5 | Multi-room chip-picker replaces single `<select>` in character modal | ✅ |

Characters now carry `roomIds[]` (canonical) + `roomId` (first entry, backwards-compat anchor). Card location shows all rooms joined by `·`.

### ✅ Phase 2 — Room objects (placeable GLB props)

| Step | What | Status |
|---|---|---|
| 1 | `objects[]` in app state; extended `loadLocal()` / `save()` | ✅ |
| 2 | `buildRoomScene` loads object GLBs at `position`; raycaster shows description overlay | ✅ |
| 3 | **+ Object** button in room-view toolbar (facilitator mode only, hides in Visitor mode) | ✅ |
| 4 | Object modal: name, room picker, GLB URL, description, X/Y/Z position, rotation Y, scale, interactable toggle | ✅ |
| 5 | Raycaster: clicking an object shows its description overlay | ✅ |
| 6 | Twee export/import for `*-object` passages | ✅ |
| 7 | Character × object: `itemRef` field — speaking a passage highlights the referenced object | 🔲 |

**How to use objects:**
1. Open a room in **Facilitator** mode — the **+ Object** button appears in the room header.
2. Click it → fill in name, paste a `.glb` URL (or leave blank for a placeholder box), set position and scale.
3. Save → the object appears in the room scene. Click it to read its description.
4. Twee export includes `TheObjectName-object` passages; import restores them.

---

## Architecture (current)

```
living-characters/
  index.html               ← app shell + UI entry point
  scripts/
    store.js               ← persistence, Twee encode/decode, GitHub sync
    map.js                 ← Leaflet map, pins, GPS, compass, simulation
    room.js                ← Three.js room scene, object rendering, inspect overlay
    card.js                ← character card and talk panel logic
    modals.js              ← room, character, and object modal workflows
  story/
    main.twee              ← cloud save/load target (rooms + characters + objects, no binary media)
  media/                   ← uploaded content such as backdrop images, GLBs, and media assets
```

### Data shapes

**Room** (in `rooms[]` and Twee metadata):
```js
{ id, name, lede, lat, lng, radius, backdrop }
```

**Character** (in `characters[]` and Twee metadata):
```js
{ id, name, roomId, roomIds[], mood, items[], passages[], glbUrl, photoData, animData }
```

**Room Object** (in `objects[]` and Twee metadata):
```js
{
  id, roomId, name,
  glbUrl,                          // optional .glb URL; null = placeholder box
  position: { x, y, z },
  rotation: { y },
  scale,                           // uniform scale, default 1.0
  description,                     // shown in overlay on click
  interactable                     // bool — whether clicking triggers description
}
```

**Passage** (inside `character.passages[]`):
```js
{ type: 'hello' | 'question' | 'secret' | 'reaction' | 'item', text }
```

### Twee passage format

```twee
:: The Garden {"id":"room_1720123456789","lat":44.65,"lng":-63.59,"radius":30,"backdrop":"forest"}
A short description shown on entry.

:: Pebble {"roomIds":["room_1720123456789"],"mood":"Happy","items":["small rock"],"glbUrl":"2026-07-09.glb"}

:: Pebble-hello
Oh! A visitor. Hello!

:: TheOldChest-object {"roomId":"room_1720123456789","glbUrl":"chest.glb","x":1.5,"z":-2,"scale":1.0}
A locked wooden chest.
```

> `roomIds` is the canonical field. `roomId` (single) is accepted on import for backwards compat.

---

## Cloud save / load

**☁ Save** and **☁ Load** read/write `story/main.twee` via the GitHub API.
Token with `repo` scope — entered once, stored in `localStorage`.

**Workflow:**
1. Hit **☁ Load** on the facilitator machine first (seeds the SHA)
2. Make edits → **☁ Save**
3. Any machine can **☁ Load** to restore the world

---

## Key constraints

- One facilitator machine — no per-participant computers
- Felt and clay as physical medium; photogrammetric scanning supported
- Mixamo GIF animations as billboard sprites; GLB for 3-D scanned models
- Workshops run ~1 hour
- Thursday is always beach day 🏖️

---

## Roadmap

### Stepped plan for the next features

1. Make asset uploads simple and friendly for children and facilitators
   - Add tap-to-upload buttons for character GLBs, room backdrops, and object GLBs
   - Use big, friendly labels and short helper text
   - Keep the flow visual and encouraging, not technical

2. Add a simple content library panel
   - Show uploaded files in one easy list
   - Let the facilitator pick an asset and attach it to a room, character, or object
   - Preview thumbnails where possible

3. Support room backdrop images
   - Upload a picture for each room backdrop
   - Let facilitators swap the room look with one tap

4. Support object and character GLBs
   - Upload a .glb file once and reuse it across characters or props
   - Keep the same friendly picker workflow in the editor

5. Add cloud-safe asset storage
   - Store uploaded assets alongside the world data
   - Make sure the same world can be opened on another device with its assets intact

### Phase 2 remaining — Room objects

| Step | What | Status |
|---|---|---|
| 7 | Character × object: `itemRef` field — speaking a passage highlights the referenced object | 🔲 |

**Stretch goals:**
- Objects have mood/state (`locked` → `open`)
- Characters comment on object state (`:: Pebble-item-chest`)
- Drag-to-reposition in facilitator mode

### Phase 5 — Content-driven world polish

- Better preview thumbnails for uploaded assets
- Asset reuse across multiple rooms/characters
- Validation for unsupported file types and oversized uploads
- Simple import/export of asset bundles

---

## The through-line: `spatial-narrative` → `living-characters`

`spatial-narrative` shows one passage at a time based on where you are physically — a live compass points toward unvisited nodes.

`living-characters` is the same idea but **characters replace locations as the primary unit.** Tap a character on a shared map to open their card and interact with their dialogue tree. Rooms live at real GPS coordinates — enter a room's radius and its Three.js character stage opens automatically.
