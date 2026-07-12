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
| GLB model loading via `GLTFLoader` with `AnimationMixer` (idle clip) | ✅ |
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

### Known issue — GLTFLoader reference

`index.html` loads `GLTFLoader` as `window.GLTFLoader` (via ES module import) but
`buildRoomScene` checks `THREE.GLTFLoader` — which is always `undefined`.

**Fix:** In `buildRoomScene`, change:
```js
if (glbUrl && THREE.GLTFLoader) {
  const loader = new THREE.GLTFLoader();
```
to:
```js
if (glbUrl && window.GLTFLoader) {
  const loader = new window.GLTFLoader();
```

---

## Architecture (current)

```
living-characters/
  index.html               ← single-file tool (~1 800 lines): map + Three.js + editor
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
{ id, name, roomId, mood, items[], passages[], glbUrl, photoData, animData }
```

**Passage** (inside `character.passages[]`):
```js
{ type: 'hello' | 'question' | 'secret' | 'reaction' | 'item', text }
```

### Twee passage format

```twee
:: The Garden {"id":"room_1720123456789","lat":44.65,"lng":-63.59,"radius":30,"backdrop":"forest"}
A short description shown on entry.

:: Pebble {"roomId":"room_1720123456789","mood":"Happy","items":["small rock","lucky leaf"],"glbUrl":"2026-07-09.glb"}

:: Pebble-hello
Oh! A visitor. Hello!

:: Pebble-secret
I found a tiny door under the big root.
```

> ⚠️ `"id"` is required on rooms for correct character → room linkage on re-import.
> `glbUrl` is a plain URL/path — safe to store in Twee. `photoData`/`animData` are base64 and stay in `localStorage` only.

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

### Phase 1 — Modular characters (decouple from rooms)

**Goal:** Characters exist independently of rooms. A character can be present in multiple rooms, move between rooms, or exist without a room entirely. This opens up roaming, visiting characters, and cross-room story arcs — while keeping everything that currently works.

**What changes:**

| Layer | Current | After |
|---|---|---|
| Data model | `character.roomId` (one room, required) | `character.roomIds[]` (list, optional) — or a separate `placements[]` array |
| Twee format | Character passage has `roomId` in metadata | Character passage has `roomIds` array; placements stored separately |
| Map pins | Character pinned to `room.lat/lng + jitter` | Character has its own `x, y` on map (or explicit `lat, lng`) |
| Room scene | Characters filtered by `roomId` | Room has a `characterIds[]` list; scene loads from that |
| Editor | "Which room?" single select | Multi-room assign, or drag-to-place on a mini-map |

**Migration plan (zero-breakage):**

1. Keep `roomId` reading in `importTweeSource` — treat single `roomId` as `roomIds: [roomId]` on load
2. Add `roomIds[]` to the character data shape alongside `roomId` (keep both during transition)
3. Update `buildRoomScene` to filter `characters.filter(c => (c.roomIds||[c.roomId]).includes(room.id))`
4. Update Twee export to write `roomIds` array; keep reading `roomId` for backwards compat
5. Add a "Rooms" multi-select to the character edit modal
6. Once stable, deprecate the single `roomId` field

**Stretch goals for this phase:**
- Character `position: { x, y }` within a room (place them on the stage, not just auto-arranged)
- Roaming: a character can be flagged as `roaming: true` and appears in whatever room the player is currently in
- "Visiting" flag: character shows as a guest pin on rooms they aren't assigned to

---

### Phase 2 — Room objects (placeable GLB props)

**Goal:** Add objects to rooms — physical props (a table, a door, a treasure chest) that exist independently of characters. Characters can reference objects in their dialogue, and eventually interact with them.

**New data shape:**

```js
// Room object
{
  id: 'obj_...',
  roomId: 'room_...',
  name: 'The Old Chest',
  glbUrl: 'chest.glb',          // path in media/ or full URL
  position: { x: 1.5, y: 0, z: -2 },   // scene placement
  rotation: { y: 0.4 },
  scale: 1.0,
  description: 'A locked wooden chest.',
  interactable: true
}
```

**Twee format (proposed):**

```twee
:: TheOldChest-object {"roomId":"room_...","glbUrl":"chest.glb","x":1.5,"z":-2,"scale":1.0}
A locked wooden chest.
```

**Implementation steps:**

1. Add `objects[]` array to app state alongside `rooms[]` and `characters[]`
2. Extend `buildRoomScene` to load object GLBs at their `position` (same GLTFLoader path as characters)
3. Add an **+ Object** button in the room view toolbar (facilitator mode only)
4. Object placement modal: name, GLB URL, position picker (click floor to place), scale slider
5. Extend Raycaster click detection to include object meshes — clicking an object shows its description
6. Extend Twee export/import to include `*-object` passages
7. **Character × object interactions:** add an optional `itemRef` field to character passages — if a passage references an object by name, clicking that dialogue button highlights the object in the scene (scale pulse, colour flash)

**Stretch goals:**
- Objects can have their own mood/state (e.g. chest: `locked` → `open`)
- Characters comment on object state (`:: Pebble-item-chest` passage fires when chest is opened)
- Drag-to-reposition objects in facilitator mode

---

### Phase 3 — Code modularisation

The `index.html` is ~1 800 lines. Recommended splits (non-breaking, move one file at a time):

| File | Contents |
|---|---|
| `scripts/store.js` | `save()`, `loadLocal()`, `ghLoad()`, `ghSave()`, Twee encode/decode |
| `scripts/map.js` | Leaflet init, `renderMapPins()`, tooltip, proximity/GPS |
| `scripts/room.js` | Three.js scene, `buildRoomScene()`, `destroyRoomScene()`, `animate()` |
| `scripts/card.js` | `openCard()`, `closeCard()`, talk panel |
| `scripts/modals.js` | Character + room + object modals, file preview |

Keep all `const` data blocks (MOODS, PROMPT_TYPES, etc.) at the top of the shared scope until the split lands.

---

## The through-line: `spatial-narrative` → `living-characters`

`spatial-narrative` shows one passage at a time based on where you are physically — a live compass points toward unvisited nodes.

`living-characters` is the same idea but **characters replace locations as the primary unit.** Tap a character on a shared map to open their card and interact with their dialogue tree. Rooms live at real GPS coordinates — enter a room's radius and its Three.js character stage opens automatically.
