# Living Characters

**A browser-based tool for creating, placing, and talking to characters in shared virtual rooms — built for the NSCADU Art Camp program.**

Characters replace locations as the primary unit of interaction. Instead of walking to a place to unlock a passage, participants tap a character on a shared map to open their card, read their dialogue, and explore their world. Rooms are the stages — authored with an uploaded backdrop image and a Three.js 3D scene — and characters are placed inside them with drag-to-move positioning, wander AI, and a mood ring that pulses in their emotional colour.

> **Live tool:** [`index.html`](./index.html) — runs in any modern browser, no install, no backend.

---

## The through-line: `spatial-narrative` → `living-characters`

`jonathaniscarroll/spatial-narrative` is a GPS + compass proximity viewer. It shows one Twee passage at a time based on where you are physically, with a live compass pointing toward other unvisited nodes.

`jonathaniscarroll/living-characters` is the same idea but **characters replace locations as the primary unit.** The spatial logic is still there — characters live at spots on a map, they have presence and context — but the authoring and interaction model is organised around **who** rather than **where**. The Twee passage structure follows the same convention, just keyed to character names and states instead of place names.

---

## What's working right now

| Feature | Status |
|---|---|
| Pannable / zoomable map canvas (2400 × 1600 px), six named zones | ✅ |
| Character pins with photo, mood ring (pulsing colour), animated GIF slot, dialogue | ✅ |
| Add / Edit character modal with mini-map location picker | ✅ |
| GLB / GLTF upload → Three.js scene render | ✅ |
| FBX upload → in-browser conversion → GLB → Three.js render | ✅ (fixed Jul 2026) |
| Mixamo GIF animations in character cards | ✅ |
| Room modal — backdrop via **uploaded image only** (no preset options) | ✅ |
| Three.js room scene — floor, walls, ambient + directional light | ✅ |
| Character wander AI — idle / walk state machine, Mixamo animation blending | ✅ |
| Talk close-up panel — zoomed 3D view of character while dialogue plays | ✅ |
| Drag-to-move objects and characters in the room scene | ✅ |
| Objects with GLB models, labels, inspect panel | ✅ |
| Twee-style dialogue builder per character (hello / question / secret / item) | ✅ |
| Twee export button — downloadable `.twee` file for the whole cast | ✅ |
| Schedule editor — morning / midday / afternoon / evening / night | ✅ |
| Home room / work room assignment per character | ✅ |
| `localStorage` persistence | ✅ |
| GitHub-backed save / load (optional PAT) | ✅ |
| Camera angle presets (isometric, front, side, top, low) | ✅ |
| GPS user position marker — pulsing blue dot, "You are here" tooltip, `zIndexOffset` above character pins | ✅ |
| GPS accuracy circle — semi-transparent blue `L.circle` scaled to `coords.accuracy` metres | ✅ |
| Auto-center on load — `getCurrentPosition` fires on `initMap()`, snaps map to user before GPS button is pressed; falls back to Halifax default | ✅ |
| First-fix gate — map re-centers exactly once (on first GPS fix); user can pan freely after | ✅ |
| Simulation mode (`startSim`) — walks through all rooms every 4 s for indoor/offline testing | ✅ |
| Mobile pinch-zoom fix (`mobile-zoom-fix.css` / `.js`) | ✅ |

---

## Script architecture

```
index.html          — single-page app shell, all modals, toolbar
scripts/
  room.js           — Three.js room scene, backdrop, wander AI, drag-to-move
  modals.js         — character + room modal open/save/close logic
  upload-helpers.js — GLB passthrough + FBX→GLB conversion, writes window.tempGlbData
  fbx-to-glb.js     — FBX loader + GLTFExporter pipeline
  store.js          — localStorage + optional GitHub save/load
  twee.js           — Twee export builder
  map.js            — Leaflet map, character + room pins, GPS user marker (pulsing dot + accuracy
                       circle), first-fix re-center, compass panel, proximity checks, sim mode,
                       day-segment scheduling, facilitator/visitor mode toggle
media/              — default backdrop images (room2.png, garden.png)
story/              — exported .twee files
wiki/               — in-repo wiki pages (mirrored below)
```

---

## Room backdrops

Backdrops come exclusively from images you upload in the **Add a Room** modal. There are no preset style options (forest / cave / stone etc). If you don't upload an image the room shows a solid floor colour + simple walls.

---

## 3D character models

Characters support three visual modes, checked in this order:

1. **GLB / GLTF** — uploaded file or external URL stored on `ch.glbUrl`
2. **FBX** — uploaded, converted in-browser to GLB via `fbx-to-glb.js`, result stored on `ch.glbUrl`
3. **Photo / GIF sprite** — flat sprite plane from `ch.photoData` / `ch.animData`
4. **Fallback box** — coloured box in the character's mood colour

All Mixamo animations embedded in the GLB are supported. The wander AI blends between the `Idle` and `Walk` (or `Run`) clips automatically.

---

## Twee passage shape

Each character maps to a set of Twee nodes:

```
:: CharacterName
:: CharacterName-hello
:: CharacterName-question
:: CharacterName-secret
:: CharacterName-item-<thing>
:: CharacterName-home
:: CharacterName-work
```

The export button at the top of the tool generates a single `.twee` file for the whole cast.

---

## Key constraints (Art Camp context)

- No individual computers for participants — facilitator input only on one machine
- Felt and clay as physical medium; photogrammetric scanning produces the GLB files
- Mixamo GIF animations in character cards
- Structured workshops ~1 hour to keep pacing gentle
- Thursday is always beach day
- Tool runs in any modern browser, no install, no backend

---

## Related repos

| Repo | Purpose |
|---|---|
| [`jonathaniscarroll/living-characters`](https://github.com/jonathaniscarroll/living-characters) | This repo — the interactive tool |
| [`jonathaniscarroll/spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) | Source template — GPS Twee viewer |
| [`jonathaniscarroll/nscadu.ca`](https://github.com/jonathaniscarroll/nscadu.ca) | Presentation page at `jonathan-carroll/presentations/art-camp-living-characters/` |

---

## Wiki

Detailed documentation lives in [`wiki/`](./wiki/):

- [Architecture](./wiki/Architecture.md)
- [Authoring Guide](./wiki/Authoring-Guide.md)
- [3D Models & FBX](./wiki/3D-Models-and-FBX.md)
- [Rooms & Backdrops](./wiki/Rooms-and-Backdrops.md)
- [Dialogue & Twee](./wiki/Dialogue-and-Twee.md)
- [Saving & GitHub Sync](./wiki/Saving-and-GitHub-Sync.md)
- [Workshop Runsheet](./wiki/Workshop-Runsheet.md)
- [Changelog](./wiki/Changelog.md)
