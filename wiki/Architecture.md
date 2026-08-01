# Architecture

## Overview

`living-characters` is a single-page application that runs entirely in the browser with no build step and no backend. All state is held in memory and persisted to `localStorage`; an optional GitHub PAT enables cloud save/load.

## File map

```
index.html
│  All markup: map view, room view, modals, toolbars
│  Loads Three.js, GLTFLoader, Leaflet from CDN/vendor
│  Imports scripts as ES modules
│  Declares DEFAULT_GLB_URL (fallback 3D model) and MOODS[]
│
scripts/
├── room.js           Three.js room scene
│     loadGlbUrl()    — handles both data: URLs and https: URLs
│     buildRoomScene()— floor, walls, lights, characters, objects, wander AI
│     applyRoomBackdrop()— uploaded image > GitHub URL > solid colour
│     spawnTalkCloseUp()— mini Three.js canvas for dialogue panel
│     enableRoomEdit() — drag-to-move mode for characters and objects
│
├── modals.js         Character + room modal logic
│     openCharModal() — seeds tempGlbData + window.tempGlbData from ch.glbUrl
│     saveCharacter() — resolves glbUrl as tempGlbData || window.tempGlbData || url field
│     openRoomModal() — backdrop preview, camera presets
│     saveRoom()      — writes backdropData / backdropUrl to room object
│
├── upload-helpers.js  File upload pipeline
│     handleModelUpload()— GLB passthrough or FBX→GLB conversion
│     storeResult()      — writes result to window[dataKey] AND window.tempGlbData
│     uploadCharacterGlb()— wired to #cf-glb-input
│     uploadObjectGlb()  — wired to #of-glb-input
│
├── fbx-to-glb.js     FBX loader + GLTFExporter (lazy-loaded on first FBX upload)
├── store.js          localStorage + GitHub save/load
├── twee.js           Twee export builder
└── map.js            Leaflet map, pins, compass

author/
└── index.html        Entry-point stub for the GitHub Pages / build deployment.
                   In production the full editor UI is copied here by CI.
                   In development it redirects to the repo-root index.html.

mobile-zoom-fix.css  CSS rules that prevent unwanted browser zoom on mobile
mobile-zoom-fix.js   JS counterpart: intercepts pinch-zoom events for fine-grained
                     control on iOS/Android when Leaflet’s default handling is
                     insufficient.

story/               Destination folder for Twee export downloads.
                     The “Export Twee” button writes .twee files here via
                     the GitHub save path. Safe to delete between sessions.

media/               Default backdrop images shipped with the repo
                     (room2.png, garden.png). Used as fallbacks when a room
                     has no uploaded backdrop.
```

## Constants (index.html)

```js
const DEFAULT_GLB_URL = 'https://threejs.org/examples/models/gltf/Soldier.glb';
```

This URL is the **fallback 3D character model** used whenever a character has no uploaded GLB/FBX and no photo/GIF. The Three.js Soldier model ships Mixamo-compatible walk and idle animations, so wander AI works out-of-the-box for test characters. It is also used by `spawnTestRoom()` in `map.js`. To swap the default, change `DEFAULT_GLB_URL` in `index.html` before the ES module imports.

## Data shapes

### Character
```js
{
  id: 'char_1234567890',
  name: 'Ada',
  mood: 'Happy',            // matches MOODS[].label
  roomId: 'room_abc',       // primary room (legacy)
  roomIds: ['room_abc'],    // all assigned rooms
  homeRoomId: 'room_abc',
  workRoomId: 'room_def',
  schedule: { morning: 'home', midday: 'work', ... },
  items: ['lantern', 'key'],
  passages: [
    { type: 'hello', text: 'Hi there!' },
    { type: 'secret', text: 'I know where the treasure is.' },
  ],
  glbUrl: 'data:model/gltf-binary;base64,...',  // or https:// URL
  photoData: 'data:image/png;base64,...',
  animData:  'data:image/gif;base64,...',
  sceneX: 1.5,   // position within the Three.js room scene
  sceneZ: -2.0,
}
```

### Room
```js
{
  id: 'room_1234567890',
  name: 'The Library',
  lede: 'Dusty shelves line every wall.',
  lat: 44.65,
  lng: -63.59,
  radius: 30,
  backdropData: 'data:image/jpeg;base64,...',  // uploaded image
  backdropUrl:  'https://raw.githubusercontent.com/...',  // GitHub-committed URL
  cameraX: 9, cameraY: 9, cameraZ: 9,
}
```

### Object
```js
{
  id: 'obj_1234567890',
  name: 'Old Chest',
  roomId: 'room_abc',
  glbUrl: 'data:model/gltf-binary;base64,...',
  px: 2, pz: -1,
  scale: 1,
  rotation: { y: 0 },
  position: { x: 2, y: 0, z: -1 },
}
```

## Global state

```js
window.rooms       // Room[]
window.characters  // Character[]
window.objects     // Object[]
window.tempGlbData         // set by upload-helpers, read by saveCharacter()
window.tempObjectGlbData   // set by upload-helpers, read by saveObject()
window.tempBackdropData    // set by uploadRoomBackdrop, read by saveRoom()
```

## Module boundary problem (fixed Jul 2026)

`upload-helpers.js` runs as a separate ES module. When it finished converting an FBX it wrote to `window.tempGlbData` but the old `modals.js` read a module-local `tempGlbData` variable that was never updated by the upload helper. Fix: `storeResult()` in upload-helpers now always writes `window.tempGlbData` explicitly; `saveCharacter()` resolves `tempGlbData || window.tempGlbData || url-field`.

### GPS subsystem (`map.js`)

**Startup flow:**
1. `initMap()` calls `navigator.geolocation.getCurrentPosition()`.
2. On success the map snaps to the user's coords via `map.setView()` and `_updateUserMarker()` places the blue dot + accuracy circle. `_gpsFirstFix` is set to `true`.
3. On permission denial / unavailability the map stays on the `DEFAULT_CENTER` ([44.65, −63.59], zoom 16).

**Live tracking (`startGPS`):**
- Uses `watchPosition`. Each callback updates `userLat`/`userLng` (global proximity variables), calls `_updateUserMarker()`, and refreshes the compass.
- The map only re-centers on the **very first** fix (`_gpsFirstFix` gate). After that the user pans freely.

**User marker styling:**
- `L.divIcon` with class `.lc-user-dot` — a 16 × 16 px blue circle, white border, `::after` pseudo-element with `@keyframes lc-pulse` (scale 1 → 2.4, opacity 1 → 0, 2 s ease-out loop).
- `zIndexOffset: 9999` ensures it always renders above character pins.
- Accuracy ring: `L.circle` with `fillOpacity: 0.08`, `weight: 1.5`, `interactive: false`.

**Simulation mode (`startSim`):**
- Cycles through all rooms at 4-second intervals, setting `userLat`/`userLng` to near each room's centre (±0.0002° jitter).
- Also moves the user marker and accuracy circle so the blue dot tracks the sim position.
- Toggling `startSim` again stops the interval and clears `_insideRoomIds`.

**Facilitator / Visitor mode (`toggleMode`):**
- In **Facilitator** mode `checkProximity()` is a no-op — proximity toasts and room auto-open are suppressed.
- In **Visitor** mode normal proximity logic runs.
