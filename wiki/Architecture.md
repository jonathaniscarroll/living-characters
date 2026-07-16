# Architecture

## Overview

`living-characters` is a single-page application that runs entirely in the browser with no build step and no backend. All state is held in memory and persisted to `localStorage`; an optional GitHub PAT enables cloud save/load.

## File map

```
index.html
│  All markup: map view, room view, modals, toolbars
│  Loads Three.js, GLTFLoader, Leaflet from CDN/vendor
│  Imports scripts as ES modules
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
```

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
