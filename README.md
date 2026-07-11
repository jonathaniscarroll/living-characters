# Living Characters

A GPS + proximity virtual world builder where **characters replace locations as the primary unit**. Built from the same spatial logic as [`spatial-narrative`](https://github.com/jonathaniscarroll/spatial-narrative) — but organised around *who* rather than *where*.

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

> ⚠️ **`"id"` is required for correct round-trips.** The room's exact id is stored in the metadata so characters can link back to it by `roomId` after import. Files exported before this fix (without `"id"`) fall back to a name-derived id and still import cleanly, but a fresh **☁ Save** will write the corrected format.

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

## Room view: Three.js isometric scene

When a room is entered (by GPS proximity or map tap) the room view renders a **Three.js scene**:

| Element | Details |
|---|---|
| Camera | `OrthographicCamera` at `(10,10,10)` — true 45° isometric |
| Floor | `PlaneGeometry(12×12)` tinted from `backdrop` |
| Walls | Two back-wall planes meeting at a corner |
| Character sprites | `Sprite` with `photoData` or `animData` texture |
| Mood rings | `RingGeometry` on the floor, coloured by mood |
| GLB models | `GLTFLoader` loads `.glb` URL, plays `AnimationMixer` clips |
| Name labels | HTML `<div>` elements projected to 2-D screen space each frame |
| Click detection | `Raycaster` — clicking a sprite opens the character card |

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

**Workflow after the roomId fix:**
1. On the facilitator machine, hit **☁ Save** once — this writes rooms with `"id"` fields.
2. **☁ Load** on any machine will now restore rooms and characters fully linked.

---

## Key constraints

- No individual computers for participants — facilitator input only on one machine
- Felt and clay as physical medium; photogrammetric scanning supported
- Mixamo GIF animations as billboards in the Three.js scene
- Structured workshops ~1 hour
- Runs in any modern browser, no install, no backend
- Thursday is always beach day 🏖️
