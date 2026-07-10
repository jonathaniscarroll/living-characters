# media/

This folder holds all character and room assets referenced via passage directives.
Place files here and commit them — they are served alongside the compiled story on GitHub Pages.

---

## Room background images (`@bg`)

Room backgrounds are **isometric orthographic illustrations** drawn on a shared template.
All rooms use the same perspective so characters feel like they genuinely inhabit a consistent world.

### Template spec

| Property | Value |
|---|---|
| Canvas size | **2400 × 1600 px** |
| Projection | Orthographic, **45° isometric** (Habbo Hotel / Sims style) |
| Floor diamond | 2:1 width-to-height ratio |
| Vanishing point | None — parallel projection only |
| File format | PNG (transparency supported for ceiling-free rooms) |
| Naming | `roomname.png`, lowercase, matching the passage title |

### How the image is displayed

- Full-width banner above the character content, ~42% height ratio
- `object-fit: cover` with `object-position: center top` — top of the image is always visible
- On mobile the aspect ratio is slightly taller (56%) to keep the floor in view
- The room name appears as a badge in the bottom-left corner
- The image fades in with a 0.4s opacity transition when you visit a character

### Authoring workflow

1. Open the template file `media/room-template.png` (2400×1600 blank isometric grid)
2. Draw or paint your room on top — pencil, watercolour scan, digital paint all work
3. Export as PNG, name it to match the room passage title (e.g. `the-garden.png` or `garden.png`)
4. Copy into this `media/` folder
5. Add `@bg garden.png` to the room's `.twee` passage
6. Commit and push — GitHub Actions will rebuild and deploy automatically

### Isometric grid reference

```
Top-down view of floor tile:

        *
      *   *
    *       *     ← width  = 2 units
      *   *
        *         ← height = 1 unit

Walls rise vertically from the floor diamond edges.
Left wall is slightly darker than right wall (light from upper-right).
```

---

## Character assets

| Directive | Extension | How to make it |
|---|---|---|
| `@model filename.glb` | `.glb` | Photogrammetric scan (Polycam / Scaniverse / RealityCapture) → export as GLB |
| `@gif filename.gif`   | `.gif` | Mixamo animation → export FBX → convert to GIF (ezgif.com or ffmpeg) |
| `@image filename.png` | `.png` `.jpg` | Photo of felt/clay character — any camera |

---

## Passage directive usage

### Room
```twee
:: The Garden [room]
@room 44.648800,−63.575200
@radius 30
@bg   garden.png
@lede Sun-warm stones and overgrown paths.
```

### Character
```twee
:: Mop [char]
@room  The Garden
@model mop.glb
@gif   mop-wave.gif
@image mop.png
@mood  sleepy
@lede  Lives near the mossy wall.
```

Only one portrait asset type is shown at a time.
Priority: **3D model** > **GIF** > **static image** > CSS-animated emoji.

---

## Scan → commit pipeline

1. Scan your felt/clay character with Polycam or Scaniverse on a phone.
2. Export as **GLB** (not GLTF — GLB is a single self-contained file).
3. Rename to match the character name, e.g. `mop.glb`.
4. Copy into this `media/` folder.
5. Add `@model mop.glb` to the character’s Twee passage.
6. Commit and push.

---

## Mixamo GIF pipeline

1. Upload a scan or photo to [Mixamo](https://www.mixamo.com).
2. Choose an animation (Wave, Idle, Dance, etc.).
3. Download as FBX.
4. Convert FBX → GIF:
   ```bash
   ffmpeg -i mop-wave.fbx -vf "fps=15,scale=320:-1" mop-wave.gif
   ```
5. Copy into `media/`, add `@gif mop-wave.gif` to the passage, commit and push.

---

## Size guidance

- Room BG PNG: aim for under 1 MB (save for web, PNG-8 if flat art)
- GLB files: aim for under 5 MB per character
- GIF files: aim for under 2 MB
- PNG/JPG photos: under 500 KB
