# Living Characters

Living Characters is a browser-based facilitator tool for building a location-aware story world where characters, rooms, and objects can be composed into a live scene. It is the character-centric evolution of the [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) project: instead of walking to a *place* to unlock a passage, you tap a *character* on a shared map to open their card and interact with their dialogue tree.

The repo has two halves that work together:

1. **The authoring app** — a static, no-build single-page app (`index.html` plus the ES modules in `scripts/`) used by a facilitator to compose the world. It runs entirely in the browser.
2. **A Twine/SugarCube build pipeline** — the authored world is exported as Twee, kept in `story/`, and compiled by [Tweego](https://www.motoslave.net/tweego/) into a playable Twine story that a GitHub Actions workflow deploys to GitHub Pages.

## What the authoring app does

`index.html` (loaded with the modules in `scripts/`) supports a full loop for creating and presenting a small story world:

- Create and edit **rooms** with a name, lede/description, GPS coordinates, trigger radius, and backdrop (a preset color style, an image, or an uploaded backdrop).
- Create and edit **characters** with membership in one or more rooms, a mood (from a fixed palette), items, prompt-based dialogue passages, and optional image / animated-GIF / GLB media.
- Add **room objects** with position, rotation, scale, GLB model, and descriptive text.
- Open a room in a **Three.js** stage to inspect characters and objects in context; click a character to talk, click an object to inspect it.
- Open **character cards** and trigger prompt-based dialogue (Hello / Question / Secret / Reaction / Item) from the room scene or the map.
- Drive the map with **live GPS** or a **simulate** walk-through, with a compass list ranking nearby rooms by distance; a **Facilitator/Projector** toggle controls whether proximity auto-opens rooms.
- **Import and export** the world as Twee text (with an in-app preview), and spawn a seeded **Test Room** for quick experimentation.
- **Sync** the world to GitHub through a personal access token, reading and writing `story/main.twee` via the GitHub Contents API.
- **Persist** the working world in browser `localStorage` so it can be resumed later.

### Room Backdrop Upload

When editing a room, you can upload a custom backdrop image:

1. Click **📸 Upload backdrop image** in the room modal.
2. Select an image file from your device.
3. If you have a GitHub token entered, the image will be uploaded to `media/room-backdrops/{roomId}.png` in the repository.
4. The image becomes the background of that room's Three.js scene when you open it.
5. The backdrop URL is stored on the room object as `backdropUrl` and persisted in localStorage.

**Priority order for room backgrounds:**
- Custom `backdropUrl` (uploaded or manually entered)
- Preset backdrop style (forest, stone, water, etc.)

### Object Placement in Room Scenes

- Click **Move Objects** in the room toolbar to enable object movement mode.
- In move mode, click an object to select it (cursor changes to grabbing), then click a new floor position to place it.
- Objects are constrained to the floor plane (Y=0) for easy placement.
- Lighting is now evened out with increased ambient light so materials render consistently regardless of angle.

## Quick start

### Run the authoring app locally

This half is a static web app, so there is no build step.

1. Open the repository root in a terminal.
2. Serve the folder over HTTP, for example with `python3 -m http.server 8000`.
3. Visit `http://localhost:8000/` in a browser.

A local static server is required (rather than opening the file directly) because the app uses module-based scripts and fetches remote assets. Leaflet and Three.js are loaded from CDNs, so an internet connection is needed for the map and 3D stage.

### Build the Twine story

The compiled story that ships to GitHub Pages is built from the `story/` folder with a vendored Tweego binary and story formats:

1. Run `scripts/vendor-setup.sh` to download Tweego and the story formats into `vendor/` (these are committed so CI does not need network access — see `.gitignore`).
2. Build locally with:
   ```bash
   TWEEGO_PATH=vendor/storyformats vendor/tweego/tweego --format=sugarcube-2 -o build/index.html story
   ```
3. On every push to `main`, `.github/workflows/build-and-deploy.yml` runs the same build and deploys `build/` to GitHub Pages. Note that the Pages deployment serves the **compiled Twine story**, not the authoring SPA — the SPA is the local/facilitator-side editor.

## Project structure

```text
living-characters/
  index.html                 # authoring app shell and UI entry point
  index_patched.html         # standalone/experimental variant of the app
  scripts/
    store.js                 # localStorage, Twee import/export, GitHub save/load
    map.js                   # Leaflet map, pins, GPS, compass, simulation, mode toggle
    room.js                  # Three.js room stage, object rendering, inspect overlay, object editor
    card.js                  # character cards and talk panels
    modals.js                # room and character editor workflows + dialogue builder
    vendor-setup.sh          # downloads Tweego + story formats into vendor/
    obj-to-glb.js            # local CLI to convert OBJ models to GLB
  story/                     # Twee sources compiled by Tweego
    main.twee                # default target for the app's GitHub-backed sync
    characters.twee          # sample character passages
    rooms.twee               # sample room / navigation passages
    StoryData.twee           # Twine StoryTitle + StoryData (format: SugarCube)
  vendor/
    tweego/tweego            # committed Tweego binary (used by CI)
    storyformats/            # committed Twine story formats (SugarCube, Harlowe, …)
  author/index.html          # placeholder page copied into the Pages build
  media/                     # backdrop/media assets + authoring notes (media/README.md)
  garden.png, room2.png      # sample backdrop images referenced by the app
  sample-model.glb, 2026-07-09.glb  # sample GLB models
  .github/workflows/build-and-deploy.yml  # Tweego build + GitHub Pages deploy
```

## Audit summary

### Strengths

- The app offers a coherent creative workflow for a single facilitator: map, room scene, character cards, and dialogue builder work together as a unified authoring experience.
- Twee import/export plus token-based GitHub sync make it practical to move work between devices or collaborators.
- Local `localStorage` persistence makes it easy to resume work without a backend.
- The Twine build and GitHub Pages deployment are automated and use a committed, offline-capable toolchain (Tweego + story formats vendored into `vendor/`).

### Current limitations

- The experience is intentionally single-user and facilitator-led; it is not a multi-user live server.
- Media handling is functional but fairly manual, especially for GLB and custom image assets, and large assets are inlined as base64 in `localStorage`, which can grow quickly.
- Object placement is basic (click-to-move within a room); richer direct manipulation such as rotate/scale handles is still missing.
- The authoring SPA and the deployed Twine story are two separate representations of the world; keeping them in sync is a manual, Twee-mediated step rather than a single source of truth.
- The project relies on browser storage and a GitHub token rather than a dedicated account or authentication system.
- There are no automated tests, linting, or type checks; correctness is verified by hand.

### Known inconsistencies worth cleaning up

These surfaced during the audit and are good candidates for follow-up fixes:

- Object data shape is inconsistent: the in-room editor (`saveObject` in `scripts/room.js`) writes `px`/`pz`/`desc`, while the Twee builder and one of the scene loaders read `position`/`rotation`/`description`. `scripts/room.js` also contains two object-rendering loops in `buildRoomScene`.
- `BACKDROP_IMAGES` maps only the `room`/`room2` keys (to root-relative paths), while the room editor exposes preset backdrop keys (`forest`, `stone`, `water`, `wood`, `grass`, `dark`) that fall back to solid colors; image backdrops chosen in the editor are stored as `backdropData` and handled separately.
- The GitHub-sync constants and several helpers are duplicated between the inline `<script>` in `index.html` and `scripts/store.js`.

## Suggested next steps

- Unify the object data model and remove the duplicate scene-building / GitHub-sync code paths.
- A more polished asset-library workflow for backdrops, character media, and GLB objects.
- Richer direct manipulation of objects in the room scene (rotate/scale handles, drag).
- Richer object-state interactions, such as item-linked reactions or conditional dialogue.
- Better validation and feedback for unsupported media files.
- Basic automated testing and a lightweight deployment checklist.

## Design intent

The app sits between a spatial story editor and a live facilitation tool. Rooms still matter because they carry real-world coordinates and provide stage space, but characters become the primary unit of dramatic interaction. That makes it well suited to workshops, physical props, and facilitator-led experiences (for example, art-camp participants making felt and clay figures) where the map and room scene are used as a shared stage.

### OBJ to GLB Conversion (Local Tool)

Use the included script to convert OBJ files to GLB for Three.js:

```bash
node scripts/obj-to-glb.js input.obj output.glb
```

Note: OBJ format does not store animation data. For textured or animated models, use Blender's export to GLB instead.
