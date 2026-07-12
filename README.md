# Living Characters

A GPS + proximity virtual world builder where **characters replace locations as the primary unit**. Built from the same spatial logic as [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) — but organised around *who* rather than *where*.

---

## ⚠️ Current status (July 2026 audit)

### Save bug — root cause

`ghSave()` uses the **file's SHA at time of last load** (`ghFileSha`) to write back to GitHub. The bug is:

1. **`ghFileSha` is never seeded on first load** — it stays `null` until `ghLoad()` is explicitly pressed. If the user skips `ghLoad()` and clicks `ghSave()`, GitHub receives a PUT with no SHA on a file that already exists → **409 Conflict → "Save failed"**.
2. **Stale SHA after a failed save** — if a save attempt throws before the SHA is updated, `ghFileSha` keeps the old value. The *next* save tries to overwrite a SHA that no longer exists → another conflict.
3. **`localStorage` photos/GIFs inflate the Twee payload** — `photoData` and `animData` are stored as full base64 data URIs and written verbatim into `story/main.twee`. With even a few characters the file easily exceeds GitHub's 1 MB API limit, returning a silent failure or a 422.

### Fix plan (in priority order)

| # | What | Why |
|---|---|---|
| 1 | On `DOMContentLoaded`, call the GitHub API to **HEAD-fetch `story/main.twee`** and seed `ghFileSha` automatically | Eliminates the "forgot to Load first" conflict |
| 2 | After every successful save, **update `ghFileSha` from the response** (already done) — but also **catch and show** the 409/422 body | Better error visibility |
| 3 | **Strip `photoData`/`animData` from the Twee export** — store media as files in `media/` and reference them by filename only | Keeps Twee small and text-diff-friendly |
| 4 | Seed `ghFileSha` at app start by hitting `GET /repos/.../contents/story/main.twee` once (unauthenticated if public, or with token) | Low-cost, no round-trip delay |

---

## Next feature: Talk to characters in rooms

When a character card is open inside the room view, show a **simple dialogue panel** that steps through their passage tree interactively:

```
[Hello] → passage text shown
[Ask a question] → passage text shown
[What's your secret?] → passage text shown
```

Implementation notes:
- Add a `#dialogue-panel` overlay inside `#room-stage` (not the card sidebar)
- Render passage-type buttons for every passage the character has authored
- Clicking a button animates the character (bounce/pulse) and displays the text in a speech-bubble `div`
- No backend needed — all data already lives in `character.passages[]`
- Close with Esc or a "← Back" tap; card stays open behind

---

## Architecture

```
living-characters/
  index.html               ← single-file tool (map + Three.js room + character editor)
  story/
    main.twee              ← cloud save/load target (☁ Save / ☁ Load buttons)
  media/                   ← character assets (GLB scans, GIFs, photos)
```

---

## Simplification targets (from audit)

The `index.html` is currently ~1 600 lines and grows with each feature. Recommended splits:

| File | Contents |
|---|---|
| `index.html` | Layout, header, modals, wiring only |
| `scripts/store.js` | `save()`, `loadLocal()`, `ghLoad()`, `ghSave()`, Twee encode/decode |
| `scripts/map.js` | Leaflet init, `renderMapPins()`, tooltip, proximity/GPS |
| `scripts/room.js` | Three.js scene, `buildRoomScene()`, `destroyRoomScene()`, `animate()` |
| `scripts/card.js` | `openCard()`, `closeCard()`, dialogue panel (talk-to-character) |
| `scripts/modals.js` | Character + room modals, file preview |

Until the split happens, keep all `const` data blocks (MOODS, PROMPT_TYPES, etc.) at the very top of the `<script>` so they're easy to find.

---

## The through-line: `spatial-narrative` → `living-characters`

`spatial-narrative` shows one passage at a time based on where you are physically, with a live compass pointing toward other unvisited nodes.

`living-characters` is the same idea but **characters replace locations as the primary unit.** Tap a character on a shared map to open their card and interact with their dialogue tree. Rooms live at real GPS coordinates — enter a room's radius and its character stage opens automatically.

---

## Twee passage format (export / import)

The tool exports and imports a single `.twee` file. The format is flat — one passage per room, then passages per character.

### Rooms

```twee
:: The Garden {"id":"room_1720123456789","lat":44.65,"lng":-63.59,"radius":30,"backdrop":"forest"}
A short description shown on entry.
```

> ⚠️ **`"id"` is required for correct round-trips.** The room's exact id is stored in the metadata so characters can link back to it by `roomId` after import.

### Characters

```twee
:: Pebble {"roomId":"room_1720123456789","mood":"Happy","items":["small rock","lucky leaf"]}

:: Pebble-hello
Oh! A visitor. Hello!

:: Pebble-secret
I found a tiny door under the big root.
```

### Passage types

| Key | Label | Prompt |
|---|---|---|
| `hello` | 👋 Hello | What do they say when you first meet them? |
| `question` | ❓ Question | Something they wonder about |
| `secret` | 🤫 Secret | Something only you know if you ask nicely |
| `reaction` | 😮 Reaction | How they feel about the world |
| `item` | 🎒 Item | What they say about one of their items |

---

## Room view: Three.js scene

When a room is entered (by GPS proximity or map tap) the room view renders a **Three.js scene**:

| Element | Details |
|---|---|
| Camera | `PerspectiveCamera(45°)` at `(0,3,9)` looking at `(0,1,0)` |
| Floor | `PlaneGeometry(20×20)` tinted from `backdrop` |
| Walls | Two back-wall planes meeting at a corner (when no backdrop image) |
| Character sprites | `Sprite` with `photoData` or `animData` texture |
| Mood rings | `RingGeometry` on the floor, coloured by mood |
| GLB models | `GLTFLoader` loads `.glb` URL, plays `AnimationMixer` clips |
| Name labels | HTML `<div>` elements projected to 2-D screen space each frame |
| Click detection | `Raycaster` — clicking a character opens their card |

Backdrop colours:

| Backdrop | Floor | Walls |
|---|---|---|
| forest | `#1a3a1a` | `#2d5a27` |
| stone | `#2a2a3a` | `#3a3a5a` |
| water | `#0a2a3a` | `#0f3d5c` |
| wood | `#3a2a1a` | `#5a3d1a` |
| grass | `#1a3a10` | `#2d5a20` |
| dark | `#0a0a0a` | `#1a1a1a` |

---

## Cloud save / load

The **☁ Save** and **☁ Load** buttons read/write `story/main.twee` on this repo via the GitHub API. A personal access token with `repo` scope is required — enter it once in the token bar and it is saved to `localStorage`.

**Workflow:**
1. On the facilitator machine, hit **☁ Load** first — this seeds the internal SHA so saves don't conflict.
2. Make edits, then **☁ Save**.
3. On any other machine, **☁ Load** will restore all rooms and characters.

> ⚠️ **Do not embed large photos in the Twee save** — store images in `media/` and reference by filename to stay under GitHub's 1 MB API limit.

---

## Key constraints

- No individual computers for participants — facilitator input only on one machine
- Felt and clay as physical medium; photogrammetric scanning supported
- Mixamo GIF animations as billboards in the Three.js scene
- Structured workshops ~1 hour
- Runs in any modern browser, no install, no backend
- Thursday is always beach day 🏖️
