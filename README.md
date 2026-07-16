# Living Characters

Living Characters is a browser-based facilitator tool for building a location-aware story world where characters, rooms, and objects can be composed into a live scene. The app runs entirely in the browser as a static web experience, so it can be used locally or hosted on a simple static server.

## What the site does

The current implementation supports a full loop for creating and presenting a small story world:

- Create and edit rooms with a name, description, GPS coordinates, trigger radius, and a custom uploaded backdrop image.
- Create and edit characters with room membership, mood, items, dialogue passages, home/work rooms, a daily schedule, and optional image/animation/GLB media.
- Add room objects with position, rotation, scale, descriptive text, and optional context/usageTags.
- Open a room in a Three.js stage to inspect characters and objects in context.
- Open character cards and trigger prompt-based dialogue from the room scene or map.
- Use the day-segment toolbar (🌅 ☀️ 🌤 🌇 🌙) to move the time of day forward, shifting characters between their home and work rooms.
- Import and export the world as Twee text.
- Sync the world to GitHub through a personal access token.
- Persist the working world in browser storage so it can be resumed later.

---

## Day-segment system

Each character has a **home room**, a **work room**, and a five-segment daily schedule (morning, midday, afternoon, evening, night). The toolbar emoji buttons set the current segment for the whole world. When a segment is active:

- `getActiveRoomId(character)` returns the room that character is in right now (home or work, based on their schedule).
- Map pins show each character at their scheduled room.
- Opening a character card labels their location with 🏠 or 💼 and bubbles the matching home/work dialogue to the top.
- The Talk panel auto-opens the context-appropriate passage and highlights its button.

### Authoring a character's home/work context

Inside the **Add/Edit Character** modal:

1. Toggle room chips to select all rooms this character visits.
2. Use the **🏠 Home room** and **💼 Work room** dropdowns (populated from the selected chips) to designate which is which.
3. Use the **🕐 Daily schedule** section to set each time segment to Home or Work.
4. Write **💬 What do they say?** prompts as usual for general dialogue.
5. Write **🏠 At home they say…** and **💼 At work they say…** context passages — these appear automatically when visiting the character at the right room.
6. The **🛠️ How do they use their space?** section auto-generates one textarea per object in their home/work rooms; these become `home-object-*` / `work-object-*` passages in the Twee export.

---

## Room Backdrops — upload only

Room backgrounds come **only** from images you upload. There are no preset named backdrop styles (forest, cave, stone, etc.). The room modal shows a single upload control:

1. Click **📸 Upload backdrop image** in the room modal.
2. Select any image file from your device.
3. The image is stored immediately as `backdropData` (base64) on the room and shown right away — no GitHub token required.
4. If you have a GitHub token entered, the image is also uploaded to `media/room-backdrops/{roomId}.png` in the repository and the room's `backdropUrl` is updated once that completes.
5. If you skip the upload entirely, the room uses a flat floor colour and simple walls.

**Priority order for room backgrounds (in `applyRoomBackdrop`):**
- `backdropData` — local base64 (set immediately on upload, works offline)
- `backdropUrl` — committed GitHub URL (set after successful upload)
- Flat colour + walls (fallback when no image has been uploaded)

---

## Object Placement in Room Scenes

- Click **Move Objects** in the room toolbar to enable object movement mode.
- In move mode, click an object to select it (cursor changes to grabbing), then click a new floor position to place it.
- Objects are constrained to the floor plane (Y=0) for easy placement.

---

## Twee passage structure

| Passage name | Meaning |
|---|---|
| `:: RoomName {meta}` | Room node with GPS, radius, backdropUrl |
| `:: CharName {meta}` | Character node with roomIds, homeRoomId, workRoomId, schedule |
| `:: CharName-hello` | Greeting dialogue |
| `:: CharName-question` | Wonder/question dialogue |
| `:: CharName-secret` | Secret dialogue |
| `:: CharName-reaction` | Reaction dialogue |
| `:: CharName-item` | Item dialogue |
| `:: CharName-home` | What they say when visited at their home room |
| `:: CharName-work` | What they say when visited at their work room |
| `:: CharName-home-object-kettle` | How they use the kettle at home |
| `:: CharName-work-object-toolbox` | How they use the toolbox at work |
| `:: ObjectName-object {meta}` | Object node with roomId, position, scale, glbUrl |

---

## Bugs Fixed (July 2026)

### +Room button not opening (July 16 2026)

**Root cause:** `openRoomModal()` in `modals.js` tried to set the value of a `#rf-backdrop` `<select>` element that had been removed from `index.html` when the preset backdrop dropdown was eliminated. `document.getElementById('rf-backdrop')` returned `null`, causing a `TypeError` that stopped the function before it could open the overlay. `saveRoom()` had the same dead reference.

**Fix:** Removed both `rf-backdrop` references from `openRoomModal` and `saveRoom` in `scripts/modals.js`.

### Backdrops all showing same image after GitHub load (July 16 2026)

**Root cause:** Two gaps in the save/load cycle:

1. `buildTweeSource` in `store.js` wrote `backdrop: room.backdrop` (the old named key) but never wrote `backdropUrl`, so the per-room GitHub image URL was silently dropped from the Twee file on every save.
2. `importTweeSource` did not read `backdropUrl` back when reconstructing room objects from the Twee file, so loaded rooms had no backdrop URL and all fell back to the same default.

**Fix:** `buildTweeSource` now writes `backdropUrl` into each room's Twee metadata when present. `importTweeSource` now reads `backdropUrl: meta.backdropUrl || null` back into each room on parse.

### Image upload button crash (prior fix)

**Root cause:** `uploadRoomBackdrop()` called `window.lcStore.uploadRoomBackdropToGitHub()` unconditionally. If no GitHub token was set, or if the module hadn't registered `lcStore` yet, this threw a `TypeError` before the file was even read.

**Fix:** The function now checks that `window.lcStore` exists and that `uploadRoomBackdropToGitHub` is a function before calling it. Base64 preview and `tempBackdropData`/`tempBackdropUrl` are always set from the `FileReader` first.

### Backdrop images not displaying in Three.js room scenes (prior fix)

**Two root causes:**

1. `openRoom()` only checked `room.backdropUrl` for the CSS background. Locally-uploaded images are stored as `room.backdropData` — `backdropUrl` is only set after a GitHub upload completes, so local images never appeared.
2. `buildRoomScene()` used a broken `OrthographicCamera` frustum that mixed up `W` and `H` with `/200` as scale, producing a skewed or clipped view.

**Fixes:**
- `openRoom()` now checks `room.backdropData || room.backdropUrl`.
- `buildRoomScene()` uses a correct aspect-ratio frustum: `OrthographicCamera(-viewSize*aspect/2, viewSize*aspect/2, viewSize/2, -viewSize/2, 1, 1000)`.
- `hasBg` in `buildRoomScene` now also checks `room.backdropData`.

---

## Quick start

This is a static web app — no build step required.

1. Open the repository root in a terminal.
2. Serve the folder over HTTP: `python3 -m http.server 8000`
3. Visit `http://localhost:8000/` in a browser.

A direct file open may work in some environments, but a local static server is safer because the app uses ES modules.

## Project structure

```text
living-characters/
  index.html               # app shell and UI entry point
  scripts/
    store.js               # persistence, Twee import/export, GitHub save/load
    map.js                 # Leaflet map, pins, GPS, compass, simulation, day-segment
    room.js                # Three.js room stage, object rendering, inspect overlay
    card.js                # character cards and talk panels (context-aware)
    modals.js              # room, character, and object editor workflows
  story/
    main.twee              # default target for GitHub-backed sync
  media/
    room-backdrops/        # per-room uploaded backdrop images (one file per roomId)
  author/                  # authoring notes and supporting materials
```

## Design intent

The app sits between a spatial story editor and a live facilitation tool. Rooms carry real-world coordinates and provide stage space, but characters are the primary unit of dramatic interaction. Characters now also have a time-of-day presence — they live somewhere and work somewhere, and the world shifts around them as the day progresses. That makes it well suited to workshops, physical props, and facilitator-led experiences where the map and room scene are used as a shared stage.

### OBJ to GLB Conversion (Local Tool)

```bash
node scripts/obj-to-glb.js input.obj output.glb
```

Note: OBJ format does not store animation data. For textured or animated models, use Blender's GLB export instead.
