# Living Characters

Living Characters is a browser-based facilitator tool for building a location-aware story world where characters, rooms, and objects can be composed into a live scene. The app runs entirely in the browser as a static web experience, so it can be used locally or hosted on a simple static server.

## What the site does

The current implementation supports a full loop for creating and presenting a small story world:

- Create and edit rooms with a name, description, GPS coordinates, trigger radius, and backdrop style.
- Create and edit characters with room membership, mood, items, dialogue passages, and optional image/animation/GLB media.
- Add room objects with position, rotation, scale, and descriptive text.
- Open a room in a Three.js stage to inspect characters and objects in context.
- Open character cards and trigger prompt-based dialogue from the room scene or map.
- Import and export the world as Twee text.
- Sync the world to GitHub through a personal access token.
- Persist the working world in browser storage so it can be resumed later.

### Room Backdrop Upload

When editing a room, you can upload a custom backdrop image:

1. Click **📸 Upload backdrop image** in the room modal.
2. Select an image file from your device.
3. The image is immediately stored as `backdropData` (base64) on the room and used right away — no GitHub token required.
4. If you have a GitHub token entered, the image will also be uploaded to `media/room-backdrops/{roomId}.png` in the repository and the `backdropUrl` will be updated once that completes.
5. The backdrop becomes the background of that room's Three.js scene when you open it.

**Priority order for room backgrounds:**
- `backdropData` — local base64 (set immediately on upload, works offline)
- `backdropUrl` — remote URL (set after successful GitHub upload)
- Preset backdrop style (forest, stone, water, etc.)

### Object Placement in Room Scenes

- Click **Move Objects** in the room toolbar to enable object movement mode.
- In move mode, click an object to select it (cursor changes to grabbing), then click a new floor position to place it.
- Objects are constrained to the floor plane (Y=0) for easy placement.
- Lighting is evened out with increased ambient light so materials render consistently regardless of angle.

## Known Issues Fixed (July 2026)

### Image upload button crash
**Root cause:** `uploadRoomBackdrop()` in `modals.js` called `window.lcStore.uploadRoomBackdropToGitHub()` unconditionally. If no GitHub token was set, or if the module hadn't fully registered `lcStore` yet, this threw a `TypeError` and crashed the upload flow before the file was even read.

**Fix:** The function now checks that `window.lcStore` exists and that `uploadRoomBackdropToGitHub` is a function before calling it. It also guards against an empty file input (e.g. user opens the picker and cancels). The base64 preview and `tempBackdropData` / `tempBackdropUrl` are always set first from the `FileReader`, so the room works immediately regardless of GitHub status.

### Backdrop images not displaying in Three.js room scenes
**Two root causes:**

1. `openRoom()` only checked `room.backdropUrl` for the CSS background on `#room-stage`. Locally-uploaded images are stored as `room.backdropData` (base64) — `backdropUrl` is only set after a GitHub upload completes. So locally-uploaded backdrops never appeared.

2. `buildRoomScene()` used a broken `OrthographicCamera` frustum: `new THREE.OrthographicCamera(W/-200, H/200, H/200, H/-200, ...)`. The right/left bounds mixed up `W` and `H` with `/200` as a scale, which produced a skewed or clipped view. The canvas still rendered, but the scene geometry was distorted.

**Fixes:**
- `openRoom()` now checks `room.backdropData || room.backdropUrl` as the CSS `backgroundImage` source, with `backdropData` taking priority.
- `buildRoomScene()` uses a correct aspect-ratio frustum: `OrthographicCamera(-viewSize*aspect/2, viewSize*aspect/2, viewSize/2, -viewSize/2, 1, 1000)`.
- `hasBg` in `buildRoomScene` now also checks `room.backdropData` so floor transparency is correctly applied for locally-uploaded images.

## Quick start

This is a static web app, so there is no build step.

1. Open the repository root in a terminal.
2. Serve the folder over HTTP, for example with `python3 -m http.server 8000`.
3. Visit `http://localhost:8000/` in a browser.

A direct file open may work in some environments, but a local static server is the safer option because the app uses module-based scripts.

## Project structure

```text
living-characters/
  index.html               # app shell and UI entry point
  scripts/
    store.js               # persistence, Twee import/export, GitHub save/load
    map.js                 # Leaflet map, pins, GPS, compass, simulation
    room.js                # Three.js room stage, object rendering, inspect overlay
    card.js                # character cards and talk panels
    modals.js              # room, character, and object editor workflows
  story/
    main.twee              # default target for GitHub-backed sync
  media/                   # optional backdrop and media assets
  author/                  # authoring notes and supporting materials
```

## Audit summary

### Strengths

- The app already offers a coherent creative workflow for a single facilitator.
- The map, room scene, character cards, and dialogue builder work together as a unified authoring experience.
- Twee import/export and GitHub sync make it practical to move work between devices or collaborators.
- Local persistence makes it easy to resume work without a backend.

### Current limitations

- The experience is intentionally single-user and facilitator-led; it is not a multi-user live server.
- Media handling is functional but still fairly manual, especially for GLB and custom image assets.
- Object placement and scene editing are basic; drag-and-drop and richer interactions are still missing.
- The project currently relies on browser storage and a GitHub token rather than a dedicated account or authentication system.
- There are no automated tests or a formal build pipeline yet.

## Suggested next steps

The most valuable improvements would be:

- A more polished asset-library workflow for backdrops, character media, and GLB objects.
- Direct manipulation of objects in the room scene.
- Richer object-state interactions, such as item-linked reactions or conditional dialogue.
- Better validation and feedback for unsupported media files.
- Basic automated testing and a lightweight deployment checklist.

## Design intent

The app sits between a spatial story editor and a live facilitation tool. Rooms still matter because they carry real-world coordinates and provide stage space, but characters become the primary unit of dramatic interaction. That makes it well suited to workshops, physical props, and facilitator-led experiences where the map and room scene are used as a shared stage.

### OBJ to GLB Conversion (Local Tool)

Use the included script to convert OBJ files to GLB for Three.js:

```bash
node scripts/obj-to-glb.js input.obj output.glb
```

Note: OBJ format does not store animation data. For textured or animated models, use Blender's export to GLB instead.
