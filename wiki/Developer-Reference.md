# Developer Reference

This document describes the architecture, module responsibilities, and extension points for contributors.

---

## Repository layout

```
living-characters/
  index.html          — Single-page app shell, all UI markup
  scripts/
    main.js           — App boot, global state, utility functions
    map.js            — Leaflet map, GPS, proximity, compass, sim
    room.js           — Three.js 3-D scene, backdrop, wander AI, drag-to-move
    card.js           — Character card panel, talk panel, mood ring pulse
    modals.js         — Add/Edit modals for rooms, characters, objects
    store.js          — localStorage persistence + GitHub API commits
    twee.js           — Twee export and import logic
  wiki/               — This wiki (Markdown)
  media/              — Optional hosted backdrop images
```

---

## Global state (`main.js`)

All shared mutable state lives as `let` declarations in `main.js` and is read/written by every module.

| Variable | Type | Description |
|---|---|---|
| `rooms` | `Room[]` | All authored rooms |
| `characters` | `Character[]` | All characters |
| `objects` | `SceneObject[]` | All in-room props |
| `activeRoomId` | `string\|null` | Currently open room |
| `selectedChar` | `Character\|null` | Character whose card is open |
| `editingCharId` | `string\|null` | Character being edited in modal |
| `editingRoomId` | `string\|null` | Room being edited in modal |
| `editingObjId` | `string\|null` | Object being edited in modal |
| `userLat/userLng` | `number\|null` | Current GPS or sim position |
| `facilitatorMode` | `boolean` | Whether proximity detection is paused |
| `threeScene/threeRenderer/threeCamera` | Three.js objects | Active 3-D scene |
| `glbMixers` | `AnimationMixer[]` | Active GLB animation mixers |
| `MOODS` | `Mood[]` | Mood definitions (label, emoji, hex colour) |
| `PROMPT_TYPES` | `PromptType[]` | Dialogue prompt definitions |
| `BACKDROP_IMAGES` | `Record<string,string>` | Maps backdrop key → image filename |
| `FLOOR_COLORS` / `WALL_COLORS` | `Record<string,string>` | Fallback colours per backdrop key |

---

## Module responsibilities

### `map.js`
- Initialises and owns the Leaflet map instance.
- Renders orange room circles and character avatar pins.
- Runs `checkProximity()` on every GPS update — compares `haversine()` distance against each room's radius to fire enter/exit events.
- `startSim()` cycles through rooms every 4 s for demos.
- `toggleMode()` switches facilitator ↔ visitor mode and clears `_insideRoomIds` so enter events re-fire cleanly.

### `room.js`
- `applyRoomBackdrop(room)` — applies CSS `background-image` to `#room-stage` from `backdropData`, `backdropUrl`, or the `BACKDROP_IMAGES` lookup. Called by both `openRoom()` and `buildRoomScene()` so backdrop is always consistent.
- `buildRoomScene(room)` — tears down any existing Three.js scene, re-applies backdrop, creates renderer (inserted as `firstChild` so CSS background stays visible), adds floor, walls, lighting, objects, and characters.
- `_initWanderAgent()` — sets up the wander AI for one character mesh (idle/walk state machine with random targets inside `WANDER_RADIUS`).
- `enableRoomEdit()` — toggles drag-to-move mode; freezes wander agents while active.
- `loadGlbUrl(url, onLoad, onError)` — handles both remote URLs and `data:` base-64 GLBs via `GLTFLoader.parse()`.

### `card.js`
- `openCard(charId)` — populates and shows the character summary card.
- `openTalkPanel(ch)` — renders prompt buttons; clicking one displays the passage text and pulses the mood ring.
- `spawnTalkCloseUp(ch)` / `dismissTalkCloseUp()` — creates/destroys a small secondary Three.js renderer in the bottom-left of the scene showing the character up close.

### `modals.js`
- `openRoomModal(roomId)` / `saveRoom()` — room CRUD. Includes a mini Leaflet picker map and camera preset buttons.
- `openCharModal(charId)` / `saveCharacter()` — character CRUD. After `save()`, automatically calls `window.lcStore.ghSave()` with a descriptive commit message.
- `buildRoomChipPicker(selectedIds)` — renders the room selection chips inside the character modal.

### `store.js`
- `save()` — serialises `{ rooms, characters, objects }` to `localStorage['lc_data']`.
- `load()` — deserialises on boot.
- `ghSave()` — commits current state to the GitHub repo via the REST API using the token stored in `localStorage['lc_gh_token']`.
- `uploadRoomBackdropToGitHub(roomId, file)` — uploads a backdrop image as a base-64 blob commit and returns the raw URL.

### `twee.js`
- `buildTweeSource()` — walks `rooms`, `objects`, and `characters` and emits a `.twee` text string.
- `importTweeSource(text)` — parses a `.twee` string and reconstructs `rooms`, `objects`, and `characters` arrays.
- See [Twee Export Format](Twee-Export.md) for passage structure.

---

## Adding a new dialogue prompt type

1. Open `main.js` and find the `PROMPT_TYPES` array.
2. Add an entry:
   ```js
   { key: 'mytag', label: 'My Prompt', placeholder: 'What do they say?', hint: 'A hint for the author.' }
   ```
3. That's it. The modal dialogue builder, the character card, and the Twee exporter all iterate `PROMPT_TYPES` dynamically — no other files need changing.

---

## Adding a new backdrop style

1. Add the image file to `/media/`.
2. In `main.js`, add to `BACKDROP_IMAGES`:
   ```js
   BACKDROP_IMAGES['mykey'] = 'my-backdrop.jpg';
   ```
3. Add a fallback colour to `FLOOR_COLORS` and `WALL_COLORS`.
4. Add `<option value="mykey">My Style</option>` to the `#rf-backdrop` select in `index.html`.

---

## Adding a new mood

In `main.js`, add to the `MOODS` array:
```js
{ label: 'Spooky', emoji: '👻', color: '#9b59b6' }
```
The mood picker, card display, wander ring colour, and map pin border colour all derive from this array.

---

## Three.js scene lifecycle

```
openRoom(roomId)
  └─ applyRoomBackdrop(room)      ← sets CSS immediately
  └─ setTimeout 360ms
       └─ buildRoomScene(room)
            └─ destroyRoomScene() ← disposes previous renderer
            └─ applyRoomBackdrop(room)  ← re-applies after destroy
            └─ new WebGLRenderer  ← inserted as stage.firstChild
            └─ spawn objects, characters, wander agents
            └─ animate() loop

closeRoom()
  └─ destroyRoomScene()
  └─ clears stage CSS background
```

The renderer canvas is always inserted as `stage.firstChild` (not appended) so the CSS `background-image` on `#room-stage` is never obscured by the canvas's z-order.

---

## GPS and proximity flow

```
startGPS() / startSim()
  └─ updates userLat, userLng
  └─ checkProximity()
       └─ for each room: haversine distance < radius?
            ├─ newly inside → showToast, openRoom()
            └─ newly outside → showToast, closeRoom()
  └─ updateCompass()
```

In **facilitator mode**, `checkProximity()` returns immediately, so rooms must be opened by clicking map pins.

---

## GitHub persistence

The tool stores data in two places:

| Store | What | When |
|---|---|---|
| `localStorage['lc_data']` | Full JSON of rooms + characters + objects | Every mutation |
| GitHub repo (`data/world.json` or similar) | Same JSON | On manual commit or auto-commit after character save |

To connect GitHub:
1. Generate a Personal Access Token with `repo` scope.
2. Paste it into the GitHub token field in the UI.
3. The token is stored only in `localStorage` — it is never sent anywhere other than the GitHub API.

---

## Running locally

```bash
git clone https://github.com/jonathaniscarroll/living-characters.git
cd living-characters
# No build step — just open index.html
open index.html
# Or serve it (required for GPS to work over HTTPS in production):
npx serve .
```

GPS requires HTTPS in production. For local development, `localhost` counts as a secure origin in all major browsers.

---

## Relationship to `spatial-narrative`

| Concept | spatial-narrative | living-characters |
|---|---|---|
| Primary unit | Place (lat/lng node) | Character |
| Passage key | Place name | Character name |
| Trigger | Walk within radius | Walk within radius OR tap map pin |
| Authored content | Twee passage body + lede | Dialogue passage tree per character |
| Visual layer | Netscapecore HTML | Three.js 3-D scene |
| Story object shape | `{ name, body, lede, lat, lng, radius }` | `{ name, mood, x, y, dialogue, items, photoData, animData }` |

The Twee passage structure follows the same conventions — see [Twee Export Format](Twee-Export.md).
