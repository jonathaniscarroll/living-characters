# Rooms & Backdrops

## What is a room?

A room is a named scene with a GPS coordinate, a backdrop image, a camera angle, and a set of characters and objects placed inside it. On the map it appears as a pin. Tapping the pin opens the Three.js scene.

## Backdrop images

Backdrops come **exclusively from images you upload** in the Add a Room modal. There are no preset style options.

- Accepted formats: JPG, PNG, WebP, GIF
- The image is read as a base64 data URL and stored on `room.backdropData`
- If you have a GitHub PAT configured, the image is also committed to the repo and `room.backdropUrl` is set to the raw GitHub URL
- On room open, `applyRoomBackdrop(room)` applies `backdropData` or `backdropUrl` as a CSS `background-image` on `#room-stage`

## Priority chain

```
room.backdropData   (uploaded data URL)  ← highest priority
room.backdropUrl    (GitHub raw URL)
solid colour        (FLOOR_COLORS[room.backdrop] or #1a1a2e)
```

Legacy rooms that were saved with a named backdrop key (grass / forest / wood / stone) still resolve through `ROOM_BACKDROP_FILES` for backwards compatibility.

## Camera angles

Set in the room modal using the preset buttons or manual X/Y/Z fields.

| Preset | X | Y | Z | Description |
|---|---|---|---|---|
| 🎲 Isometric | 9 | 9 | 9 | Default diagonal view |
| 👁 Front | 0 | 4 | 14 | Straight on |
| ↔ Side | 14 | 4 | 0 | Side view |
| ⬆ Top | 0 | 18 | 0.01 | Bird's eye |
| 🎬 Low | 6 | 2 | 10 | Dramatic low angle |

## Three.js scene composition

When a room opens, `buildRoomScene(room)` constructs:

1. `PlaneGeometry(20, 20)` floor — semi-transparent if a backdrop image is set, opaque otherwise
2. Two `BoxGeometry` walls (north + west) — only added if there is no backdrop image
3. `AmbientLight(0xffffff, 1.3)` + `DirectionalLight(0xffffff, 0.7)` with shadow casting
4. All objects assigned to this room, each loaded via `loadGlbUrl()` or a fallback box
5. All characters assigned to this room, each loaded via `loadGlbUrl()` or a sprite, each with a mood ring and wander agent
