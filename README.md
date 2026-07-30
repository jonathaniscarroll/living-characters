# living-characters

> **Branch `living-characters-ar`** — AR camera edition.  
> Characters live at spots on a shared map. Tap a pin → open their card → **Visit in AR** → they appear standing in the real world through your camera.

---

## What it is

`living-characters` is a browser-based world-building tool for NSCAD Art Camp. Participants sculpt characters from felt and clay, photogrammetrically scan them, and give them a presence on a shared map. Facilitators author dialogue, moods, items, and Twee passages for each character. Participants then encounter those characters in an **augmented reality** view — overlaid on the live camera feed, standing on the actual floor in front of them.

The spatial through-line mirrors [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative): one active thing at a time, a compass (or map pin) pointing toward others.

---

## AR Interaction Model

### What happens when you tap "Visit in AR"

1. The device camera opens.
2. **On Android Chrome / WebXR-enabled browsers:** WebXR immersive-ar launches with hit-test. A white ring appears on detected surfaces. Tap the floor to anchor the character there.
3. **On iOS Safari / fallback browsers:** A simulated AR mode opens — the live camera feed plays behind a transparent Three.js canvas. The character is auto-placed at arm's length in front of you. Tap anywhere on the ground to reposition.
4. The character's GLB model loads and plays its Idle animation. Their mood-ring colour pulses at the top of the screen.
5. Tap **💬 Talk** to open the dialogue tree. Tap **🎒 Items** to inspect carried items.
6. Tap **✕ Exit AR** to return to the character card.

### Desktop fallback

On desktop browsers without camera access, the simulated AR path renders the character on a neutral dark background using the same Three.js scene, so the workshop can still be demonstrated.

---

## Library choices

| Library | Why |
|---|---|
| **Three.js r152** (CDN) | 3D rendering — already present in the repo for room.js |
| **`GLTFLoader`** (Three.js add-on) | GLB/GLTF model loading — already present |
| **WebXR Hit Test API** | Ground-plane detection on Android Chrome — built into the browser, zero bundle cost |
| **`getUserMedia`** | Camera feed for the simulated AR fallback — built-in, no library needed |
| **Leaflet** | 2D map — already present |

No new CDN dependencies are introduced. The AR feature is entirely contained in `scripts/ar.js` and `scripts/ar-patch.js`.

---

## File structure

```
living-characters/
├── index.html               ← main app shell (AR scripts injected here)
├── scripts/
│   ├── ar.js                ← NEW: WebXR + simulated AR view module
│   ├── ar-patch.js          ← NEW: runtime wiring — injects AR buttons into existing UI
│   ├── map.js               ← existing: Leaflet map, character pins, GPS marker
│   ├── modals.js            ← existing: add/edit character modal
│   ├── card.js              ← existing: character card display
│   ├── room.js              ← existing: Three.js room scene (legacy, preserved)
│   ├── twee.js              ← existing: Twee export builder (unchanged)
│   └── store.js             ← existing: localStorage + GitHub save/load (unchanged)
└── story/                   ← exported .twee files land here
```

---

## Character data model — new AR fields

The following fields are added to each character object and automatically persisted by `store.js` (JSON round-trip):

```js
{
  // … existing fields …
  name:      'Mira',
  mood:      'curious',
  glbUrl:    'https://…/mira.glb',
  photoData: 'data:image/…',
  dialogue:  { hello: '…', question: '…', secret: '…' },
  items:     [ { name: 'Blue Stone', description: 'Found near the tide pool' } ],
  lat: 44.6, lng: -63.6,

  // ── New AR fields ──
  arEnabled: true,   // show AR button and allow placement
  arScale:   1.0,    // scale multiplier for GLB in AR (default 1.0)
  arYOffset: 0,      // vertical offset on the ground plane (metres)
}
```

---

## Facilitator workflow

### Creating a character

1. Open the app on the facilitator machine.
2. Tap an empty spot on the map to open **Add Character**.
3. Fill in name, mood, upload a photo or GLB model, add dialogue lines and items.
4. Scroll down to **AR Settings** — confirm AR is enabled and adjust scale if needed.
5. Save. The character pin appears on the map with a 📷 badge.

### Giving participants access

- Share the URL (GitHub Pages) — all characters live in `localStorage` on the facilitator machine unless you use the **GitHub save** button to push to the repo.
- For multi-device use, use **GitHub save/load** (existing feature in `store.js`) to sync the character JSON to the repository, then participants load the same URL.

### Visiting a character in AR

1. Tap the character pin → tap **View Card**.
2. Tap **📷 Visit in AR**.
3. Point the camera at the floor. Tap to place the character.
4. Talk, inspect items, then tap **✕ Exit AR**.

---

## Twee export

The **Export Twee** button in the toolbar generates a `.twee` file for the whole cast using the existing `scripts/twee.js` pipeline — completely unchanged. Passage structure per character:

```twee
:: CharacterName
:: CharacterName-hello
:: CharacterName-question
:: CharacterName-secret
:: CharacterName-item-<thing>
:: CharacterName-home
:: CharacterName-work
```

The GitHub save flow writes this to the `story/` directory.

---

## Technical constraints

- **No backend** — all data in `localStorage` plus optional GitHub save/load.
- **No install** — runs in any modern browser from a URL.
- **No new bundle dependencies** — AR uses WebXR (built-in) + Three.js (already loaded).
- **Room scenes preserved** — `room.js` is not removed. "Visit Room" remains accessible; "Visit in AR" is the new default action on every card.

---

## Browser support for AR

| Browser | AR mode |
|---|---|
| Android Chrome 81+ | ✅ WebXR hit-test (true ground detection) |
| iOS Safari 16+ | ⚠️ Simulated AR (camera + Three.js overlay) |
| Desktop Chrome/Firefox | ⚠️ Simulated AR (no camera, dark background) |
| Any modern browser | ✅ Map, cards, dialogue, Twee export |

---

*living-characters is part of NSCAD's Mobile Media Lab. Thursday is always beach day.*
