# Living Characters

Living Characters is a browser-based facilitator tool for building a location-aware story world where characters, rooms, and objects can be composed into a live scene. The app runs entirely in the browser as a static web experience, so it can be used locally or hosted on a simple static server.

## What the site does

The current implementation supports a full loop for creating and presenting a small story world:

- Create and edit rooms with a name, description, GPS coordinates, trigger radius, and a custom uploaded backdrop image.
- Create and edit characters with room membership, mood, items, dialogue passages, and optional image/animation/GLB media.
- Add room objects with position, rotation, scale, and descriptive text.
- Open a room in a Three.js stage to inspect characters and objects in context.
- Open character cards and trigger prompt-based dialogue from the room scene or map.
- Import and export the world as Twee text.
- Sync the world to GitHub through a personal access token.
- Persist the working world in browser storage so it can be resumed later.

### Room Backdrops — upload only

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

**Backdrop persistence across GitHub save/load:**

`backdropUrl` is written into each room's Twee metadata on save and read back on load, so images survive a full GitHub round-trip. After uploading a backdrop and saving to GitHub for the first time, subsequent loads will restore each room's correct image via its `raw.githubusercontent.com` URL.

### Object Placement in Room Scenes

- Click **Move Objects** in the room toolbar to enable object movement mode.
- In move mode, click an object to select it (cursor changes to grabbing), then click a new floor position to place it.
- Objects are constrained to the floor plane (Y=0) for easy placement.

## Bugs Fixed (July 2026)

### +Room button not opening (July 16 2026)

**Root cause:** `openRoomModal()` in `modals.js` tried to set the value of a `#rf-backdrop` `<select>` element that had been removed from `index.html` when the preset backdrop dropdown was eliminated. `document.getElementById('rf-backdrop')` returned `null`, causing a `TypeError` that stopped the function before it could open the overlay. `saveRoom()` had the same dead reference.

**Fix:** Removed both `rf-backdrop` references from `openRoomModal` and `saveRoom` in `scripts/modals.js`.

### Backdrops all showing same image after GitHub load (July 16 2026)

**Root cause:** Two gaps in the save/load cycle:

1. `buildTweeSource` in `store.js` wrote `backdrop: room.backdrop` (the old named key) but never wrote `backdropUrl`, so the per-room GitHub image URL was silently dropped from the Twee file on every save.
2. `importTweeSource` did not read `backdropUrl` back when reconstructing room objects from the Twee file, so loaded rooms had no backdrop URL and all fell back to the same default.

**Fix:** `buildTweeSource` now writes `backdropUrl` into each room's Twee metadata when present. `importTweeSource` now reads `backdropUrl: meta.backdropUrl || null` back into each room on parse.

**Migration note:** Rooms saved before this fix won't have `backdropUrl` in their Twee file yet. Re-upload each room's backdrop via Edit Room → Upload, then do one Cloud Save to write the corrected metadata.

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

## Phased Implementation Plan: Home, Work, and Time-of-Day

Characters can have a **home room** and a **work room**, move between them as the day progresses, and interact with objects in a way that reflects whether they are living there or working there. This plan describes how to build that in three discrete phases.

### The through-line

Each character gets a designated home room and a designated work room, a simple day schedule (e.g. morning at home, afternoon at work), and per-room object-usage prompts so that the same space — or the same prop — reads differently at different times of day. Facilitators author all of this from the character modal. The Twee export/import carries the full picture across sessions and devices.

---

### Phase 1 — Data model and Twee extension

**Goal:** Extend the character data shape and Twee round-trip so that home/work rooms and a schedule can be stored, exported, and imported without breaking any existing worlds.

**Changes to `scripts/store.js`**

1. In `buildTweeSource`, extend the character meta block to include the new fields:

```js
const meta = {
  roomIds: ch.roomIds || [ch.roomId],
  homeRoomId: ch.homeRoomId || null,
  workRoomId: ch.workRoomId || null,
  schedule: ch.schedule || null,
  mood: ch.mood,
  items: ch.items || [],
  glbUrl: ch.glbUrl || null
};
```

2. In `importTweeSource`, read those fields back from meta when hydrating `newChars`:

```js
newChars.push({
  id: 'char_' + passName.replace(/\s+/g, '_'),
  name: passName,
  roomId: primaryRoomId,
  roomIds,
  homeRoomId: meta.homeRoomId || null,
  workRoomId: meta.workRoomId || null,
  schedule: meta.schedule || null,
  mood: meta.mood || 'Happy',
  items: meta.items || [],
  passages: [],
  photoData: null,
  animData: null,
  glbUrl: meta.glbUrl || null
});
```

3. In `loadLocal`, add a migration guard so existing saved characters without these fields still load cleanly:

```js
characters.forEach(ch => {
  if (!ch.roomIds || !Array.isArray(ch.roomIds)) ch.roomIds = ch.roomId ? [ch.roomId] : [];
  if (!ch.homeRoomId) ch.homeRoomId = ch.roomIds[0] || null;
  if (!ch.workRoomId) ch.workRoomId = ch.roomIds[0] || null;
  if (!ch.schedule) ch.schedule = { morning: 'home', midday: 'work', afternoon: 'work', evening: 'home', night: 'home' };
});
```

**New Twee passage types for home/work**

| Passage type | Twee name | Meaning |
|---|---|---|
| `home` | `:: CharName-home` | General talk when at home |
| `work` | `:: CharName-work` | General talk when at work |
| `home-object-<slug>` | `:: CharName-home-object-kettle` | How this character uses the kettle at home |
| `work-object-<slug>` | `:: CharName-work-object-toolbox` | How this character uses the toolbox at work |

**Object data extension**

```js
{
  context: 'home' | 'work' | 'both' | null,
  usageTags: ['cooking', 'resting', 'fixing']
}
```

**Acceptance criteria for Phase 1:**
- A world with home/work data exports to Twee and re-imports with all fields intact.
- Existing worlds without these fields load and save without any error or data loss.

---

### Phase 2 — Character modal authoring

**Goal:** Make all Phase 1 fields editable from the character modal.

**2a. Home and work room selectors** — two `<select>` elements below the room chip picker, populated from the character's selected rooms.

**2b. Time-of-day schedule editor** — a row of five segments (morning, midday, afternoon, evening, night) each with a Home / Work pill toggle.

**2c. Home/work object-usage prompts** — one textarea per object in the home/work rooms, generating `home-object-*` / `work-object-*` passages.

**Acceptance criteria for Phase 2:**
- All fields persist to localStorage and survive a page reload.
- Object-usage prompts appear only for objects in the chosen home/work rooms.

---

### Phase 3 — Time-of-day presence and object interaction at runtime

**Goal:** Use the schedule to drive which room each character appears in, and to surface context-aware dialogue.

**3a.** Day-segment control in the facilitator toolbar (🌅 ☀️ 🌤 🌇 🌙).

**3b.** `getActiveRoomId(character)` helper resolves the character's current room from their schedule.

**3c.** `renderMapPins` uses `getActiveRoomId` to show characters in their scheduled room.

**3d.** `buildRoomScene` only spawns characters scheduled to be in the active room.

**3e.** Character card defaults to `home` or `work` passage based on current context.

**3f.** Object tap in room scene surfaces the character's `home-object-*` / `work-object-*` passage if one exists.

---

### Summary of file changes

| File | Phase | What changes |
|---|---|---|
| `scripts/store.js` | 1 | Extend `buildTweeSource`, `importTweeSource`, `loadLocal` for `homeRoomId`, `workRoomId`, `schedule`; object meta for `context`, `usageTags` |
| `scripts/modals.js` | 2 | Home/work selects, schedule editor, object-usage prompt rows, extend `saveCharacter` |
| `index.html` | 2 | Home/work select markup, schedule editor markup, day-segment toolbar control |
| `scripts/map.js` | 3 | Add `getActiveRoomId` helper, apply to `renderMapPins` |
| `scripts/room.js` | 3 | Filter character spawns by active room, update object tap handler |
| `scripts/card.js` | 3 | Context-aware default passage, object-usage list |

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
    map.js                 # Leaflet map, pins, GPS, compass, simulation
    room.js                # Three.js room stage, object rendering, inspect overlay
    card.js                # character cards and talk panels
    modals.js              # room, character, and object editor workflows
  story/
    main.twee              # default target for GitHub-backed sync
  media/
    room-backdrops/        # per-room uploaded backdrop images (one file per roomId)
  author/                  # authoring notes and supporting materials
```

## Design intent

The app sits between a spatial story editor and a live facilitation tool. Rooms carry real-world coordinates and provide stage space, but characters are the primary unit of dramatic interaction. That makes it well suited to workshops, physical props, and facilitator-led experiences where the map and room scene are used as a shared stage.

### OBJ to GLB Conversion (Local Tool)

```bash
node scripts/obj-to-glb.js input.obj output.glb
```

Note: OBJ format does not store animation data. For textured or animated models, use Blender's GLB export instead.
