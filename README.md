# Living Characters

A GPS + proximity virtual world builder where **characters replace locations as the primary unit**. Built from the same spatial logic as [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) — but organised around *who* rather than *where*.

Runs in any modern browser. No install. No backend. One facilitator machine.

---

## ✅ What's working now (July 2026)

| Feature | Status |
|---|---|
| Pannable/zoomable Leaflet map with room circles and character pins | ✅ |
| Add / edit rooms with GPS coordinates, radius, backdrop | ✅ |
| Add / edit characters with photo, Mixamo GIF, GLB URL, mood, items, dialogue | ✅ |
| Three.js room scene — floor, walls, mood rings, name labels | ✅ |
| GLB model loading via `window.GLTFLoader` with `AnimationMixer` (idle clip) | ✅ |
| Fallback: sprite (photo/GIF) → coloured box when no model | ✅ |
| Click character in room → talk panel with dialogue passage buttons | ✅ |
| Mood ring pulse when a character speaks | ✅ |
| Twee export (`.twee` download) and import (drag-drop or file picker) | ✅ |
| GitHub cloud save / load (`story/main.twee`) via token | ✅ |
| SHA auto-seeded on load — no more 409 conflicts | ✅ |
| Binary media stripped from Twee export (kept in `localStorage` only) | ✅ |
| GPS proximity → auto-open room | ✅ |
| Simulate mode (cycles through rooms) | ✅ |
| Compass panel showing nearest rooms | ✅ |
| Facilitator / Visitor mode toggle | ✅ |
| Drag-drop `.twee` import | ✅ |

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

---

## Architecture (current)

```
living-characters/
  index.html               ← single-file tool: map + Three.js + editor
  story/
    main.twee              ← cloud save/load target (rooms + characters, no binary media)
  media/                   ← character assets (GLB scans, GIFs, backdrop images)
  2026-07-09.glb           ← photogrammetry scan (root-level, referenced by glbUrl)
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

**Room Object** (in `objects[]` — Phase 2):
```js
{ id, roomId, name, glbUrl, position:{x,y,z}, rotation:{y}, scale, description, interactable }
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

### 🔧 Phase 2 — Room objects (placeable GLB props) ← CURRENT

**Goal:** Add placeable objects to rooms — physical props (a table, a door, a treasure chest) that exist independently of characters. Characters can reference objects in dialogue; clicking an object shows its description; eventually objects have state.

**New data shape:**

```js
// Room object
{
  id: 'obj_...',
  roomId: 'room_...',
  name: 'The Old Chest',
  glbUrl: 'chest.glb',
  position: { x: 1.5, y: 0, z: -2 },
  rotation: { y: 0.4 },
  scale: 1.0,
  description: 'A locked wooden chest.',
  interactable: true
}
```

**Twee format:**

```twee
:: TheOldChest-object {"roomId":"room_...","glbUrl":"chest.glb","x":1.5,"z":-2,"scale":1.0}
A locked wooden chest.
```

**Implementation steps:**

| Step | What | Status |
|---|---|---|
| 1 | Add `objects[]` to app state; extend `loadLocal()` / `save()` | 🔲 |
| 2 | Extend `buildRoomScene` to load object GLBs at `position` | 🔲 |
| 3 | **+ Object** button in room-view toolbar (facilitator mode only) | 🔲 |
| 4 | Object modal: name, GLB URL, position picker (click floor), scale slider | 🔲 |
| 5 | Raycaster: clicking an object shows its description overlay | 🔲 |
| 6 | Extend Twee export/import for `*-object` passages | 🔲 |
| 7 | Character × object: `itemRef` field — speaking a passage highlights the referenced object | 🔲 |

**Stretch goals:**
- Objects have mood/state (`locked` → `open`)
- Characters comment on object state (`:: Pebble-item-chest`)
- Drag-to-reposition in facilitator mode

---

### Phase 3 — Code modularisation

The `index.html` is ~1 800 lines. Recommended splits (non-breaking):

| File | Contents |
|---|---|
| `scripts/store.js` | `save()`, `loadLocal()`, `ghLoad()`, `ghSave()`, Twee encode/decode |
| `scripts/map.js` | Leaflet init, `renderMapPins()`, tooltip, proximity/GPS |
| `scripts/room.js` | Three.js scene, `buildRoomScene()`, `destroyRoomScene()`, `animate()` |
| `scripts/card.js` | `openCard()`, `closeCard()`, talk panel |
| `scripts/modals.js` | Character + room + object modals, file preview |

---

## The through-line: `spatial-narrative` → `living-characters`

`spatial-narrative` shows one passage at a time based on where you are physically — a live compass points toward unvisited nodes.

`living-characters` is the same idea but **characters replace locations as the primary unit.** Tap a character on a shared map to open their card and interact with their dialogue tree. Rooms live at real GPS coordinates — enter a room's radius and its Three.js character stage opens automatically.
