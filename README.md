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

---

## Phased Implementation Plan: Home, Work, and Time-of-Day

Characters can now have a **home room** and a **work room**, move between them as the day progresses, and interact with objects in a way that reflects whether they are living there or working there. This plan describes how to build that in three discrete phases.

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

Alongside the existing prompt-keyed passages (`hello`, `question`, `secret`, `item`), add:

| Passage type | Twee name | Meaning |
|---|---|---|
| `home` | `:: CharName-home` | General talk when at home |
| `work` | `:: CharName-work` | General talk when at work |
| `home-object-<slug>` | `:: CharName-home-object-kettle` | How this character uses the kettle at home |
| `work-object-<slug>` | `:: CharName-work-object-toolbox` | How this character uses the toolbox at work |

These follow the same flat passage array shape (`{ type, text }`) already in use, so no structural change is needed.

**Object data extension**

Extend object records with two optional fields:

```js
{
  // …existing fields…
  context: 'home' | 'work' | 'both' | null,  // which kind of room this object belongs to
  usageTags: ['cooking', 'resting', 'fixing'] // activity hints for matching character passages
}
```

These are stored in the object's Twee meta block:

```js
const meta = { roomId: obj.roomId, scale: obj.scale || 1, context: obj.context || null, usageTags: obj.usageTags || [] };
out += `:: ${obj.name}-object ${JSON.stringify(meta)}\n`;
```

**Acceptance criteria for Phase 1:**
- A world with home/work data exports to Twee and re-imports with all fields intact.
- Existing worlds without these fields load and save without any error or data loss.
- New passage types appear correctly in the Twee export alongside existing dialogue passages.

---

### Phase 2 — Character modal authoring

**Goal:** Make all of the Phase 1 fields editable from the character modal, with kid-friendly UI language.

**Changes to `scripts/modals.js` and the character modal in `index.html`**

**2a. Home and work room selectors**

Below the existing room chip picker, add two `<select>` elements:

```html
<label>🏠 Home room</label>
<select id="cf-home-room">
  <option value="">— choose a room —</option>
</select>

<label>💼 Work room</label>
<select id="cf-work-room">
  <option value="">— choose a room —</option>
</select>
```

In `openCharModal`, populate both selects from the character's currently selected rooms (re-run after chip toggling). Default to the first selected room if none is set:

```js
function populateHomeWorkSelects(selectedIds, homeRoomId, workRoomId) {
  const homeEl = document.getElementById('cf-home-room');
  const workEl = document.getElementById('cf-work-room');
  [homeEl, workEl].forEach(el => {
    el.innerHTML = '<option value="">— choose a room —</option>';
    selectedIds.forEach(id => {
      const room = rooms.find(r => r.id === id);
      if (!room) return;
      el.innerHTML += `<option value="${id}">${room.name}</option>`;
    });
  });
  homeEl.value = homeRoomId || selectedIds[0] || '';
  workEl.value = workRoomId || selectedIds[0] || '';
}
```

Wire chip toggles to call `populateHomeWorkSelects` every time a chip is toggled so the dropdowns always reflect the current selection.

**2b. Time-of-day schedule editor**

Add a row of five segments with a pill selector under each:

```html
<div id="schedule-editor">
  <div class="schedule-segment" data-seg="morning">
    <span>🌅 Morning</span>
    <div class="schedule-pills">
      <button class="sch-pill active" data-val="home">🏠 Home</button>
      <button class="sch-pill" data-val="work">💼 Work</button>
    </div>
  </div>
  <!-- repeat for midday, afternoon, evening, night -->
</div>
```

Each pill toggles within its segment (only one active at a time). On save, read the schedule as:

```js
const schedule = {};
document.querySelectorAll('.schedule-segment').forEach(seg => {
  const active = seg.querySelector('.sch-pill.active');
  schedule[seg.dataset.seg] = active ? active.dataset.val : 'home';
});
```

**2c. Home/work object-usage prompts**

In the dialogue builder, add two new prompt rows after the existing types:

```js
const ROOM_PROMPT_TYPES = [
  { key: 'home', label: '🏠 At home they say…', placeholder: 'What do they talk about at home?', hint: 'Appears when the character is visited at their home room.' },
  { key: 'work', label: '💼 At work they say…', placeholder: 'What do they talk about at work?', hint: 'Appears when the character is visited at their work room.' },
];
```

Below those, add a dynamic section that lists objects in the home room and work room. For each object, render a compact input:

```html
<div class="object-usage-row">
  <span>🏠 How do they use the <strong>Kettle</strong>?</span>
  <textarea data-passage-type="home-object-kettle" rows="2" placeholder="They boil water for their morning tea…"></textarea>
</div>
```

Populate this section after the user sets their home/work rooms — a `change` listener on both `<select>` elements rebuilds the object list.

**Changes to `saveCharacter`**

Extend the data object saved from the modal:

```js
const data = {
  name, roomId: primaryRoomId, roomIds,
  homeRoomId: document.getElementById('cf-home-room').value || roomIds[0] || null,
  workRoomId: document.getElementById('cf-work-room').value || roomIds[0] || null,
  schedule: readSchedule(),
  mood: moodLabel, items, passages, glbUrl, photoData: tempPhotoData, animData: tempAnimData
};
```

**Acceptance criteria for Phase 2:**
- A facilitator can assign home and work rooms to a character from the modal.
- The schedule editor defaults sensibly and updates cleanly when rooms are changed.
- Object-usage prompts appear only for objects that exist in the chosen home/work rooms.
- All fields persist correctly to localStorage and survive a page reload.

---

### Phase 3 — Time-of-day presence and object interaction at runtime

**Goal:** Use the schedule to drive which room each character appears in on the map and in room scenes, and to surface context-aware dialogue when a character or object is tapped.

**3a. Day-segment control**

Add a simple segment control to the facilitator toolbar (visible on the main map view):

```html
<div id="day-control">
  <button class="day-seg active" data-seg="morning">🌅</button>
  <button class="day-seg" data-seg="midday">☀️</button>
  <button class="day-seg" data-seg="afternoon">🌤</button>
  <button class="day-seg" data-seg="evening">🌇</button>
  <button class="day-seg" data-seg="night">🌙</button>
</div>
```

Store the current segment in a module-level variable: `let currentSegment = 'morning';`. On click, update it and call `renderMapPins()` and, if a room is open, `buildRoomScene(activeRoom)`.

**3b. Active room resolution**

Add a helper in `scripts/map.js` (or a shared utility):

```js
function getActiveRoomId(character) {
  if (!character.schedule) return character.roomIds?.[0] || character.roomId;
  const segValue = character.schedule[currentSegment] || 'home';
  if (segValue === 'home') return character.homeRoomId || character.roomIds?.[0];
  if (segValue === 'work') return character.workRoomId || character.roomIds?.[0];
  return segValue; // explicit roomId
}
```

**3c. Map pin filtering**

In `renderMapPins`, use `getActiveRoomId(ch)` to determine whether to show each character pin on the currently viewed map area. Optionally, dim rather than hide characters who are in a different room so facilitators can always see the full cast.

**3d. Room scene character filtering**

In `scripts/room.js`, in `buildRoomScene`, only spawn character meshes and cards for characters whose `getActiveRoomId(ch) === activeRoomId`. Characters in a different room at this time of day are simply absent from the scene.

**3e. Context-aware card dialogue**

In `scripts/card.js`, when opening a character card:

1. Determine current context: if `getActiveRoomId(ch) === ch.homeRoomId`, context is `'home'`; if `=== ch.workRoomId`, context is `'work'`.
2. Look for a passage with `type === context` (`home` or `work`) and display it as the primary talk text.
3. Fall back to `hello` if no context-specific passage exists.
4. In the card's object list, show only objects from the active room that have a matching `home-object-*` or `work-object-*` passage. Tapping one of those objects shows its usage passage.

**3f. Object tap in room scene**

In `scripts/room.js`, in the object inspect/click handler:

1. Check if the active room's tapped object has a matching passage on the currently highlighted character (`home-object-<slug>` or `work-object-<slug>`).
2. If yes, open the character card at that passage.
3. If no, fall back to showing the object's own `description`.

**Acceptance criteria for Phase 3:**
- Changing the day segment on the map relocates character pins to their scheduled rooms.
- Opening a room only shows characters who are scheduled to be there right now.
- A character's card defaults to their home or work dialogue based on which room they are currently in.
- Tapping an object in the room surfaces that character's personal usage passage if one exists.
- The Twee export captures all of this so a `.twee` file fully describes a world with daily rhythms.

---

### Summary of file changes

| File | Phase | What changes |
|---|---|---|
| `scripts/store.js` | 1 | Extend `buildTweeSource`, `importTweeSource`, `loadLocal` for `homeRoomId`, `workRoomId`, `schedule`; extend object meta for `context`, `usageTags` |
| `scripts/modals.js` | 2 | Add home/work selects, schedule editor, object-usage prompt rows, extend `saveCharacter` |
| `index.html` | 2 | Add home/work select markup, schedule editor markup, day-segment control to toolbar |
| `scripts/map.js` | 3 | Add `getActiveRoomId` helper, apply to `renderMapPins` |
| `scripts/room.js` | 3 | Filter character spawns by active room, update object tap handler |
| `scripts/card.js` | 3 | Context-aware default passage, object-usage list |

---

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

## Design intent

The app sits between a spatial story editor and a live facilitation tool. Rooms still matter because they carry real-world coordinates and provide stage space, but characters become the primary unit of dramatic interaction. That makes it well suited to workshops, physical props, and facilitator-led experiences where the map and room scene are used as a shared stage.

### OBJ to GLB Conversion (Local Tool)

Use the included script to convert OBJ files to GLB for Three.js:

```bash
node scripts/obj-to-glb.js input.obj output.glb
```

Note: OBJ format does not store animation data. For textured or animated models, use Blender's export to GLB instead.
