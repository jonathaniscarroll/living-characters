# media/

This folder holds all character assets referenced via passage directives.
Place files here and commit them — they are served alongside the compiled story on GitHub Pages.

---

## File types

| Directive | Extension | How to make it |
|---|---|---|
| `@model filename.glb` | `.glb` | Photogrammetric scan (Polycam / Scaniverse / RealityCapture) → export as GLB |
| `@gif filename.gif`   | `.gif` | Mixamo animation → export FBX → convert to GIF (ezgif.com or ffmpeg) |
| `@image filename.png` | `.png` `.jpg` | Photo of felt/clay character — any camera |

---

## Passage directive usage

```twee
:: Mop [character]
@model  mop.glb
@gif    mop-wave.gif
@image  mop.png
@mood   sleepy
@lede   Lives near the mossy wall.
```

Only one asset type is shown in the portrait at a time.
Priority: **3D model** > **GIF** > **static image** > CSS-animated emoji.

---

## Scan → commit pipeline

1. Scan your felt/clay character with Polycam or Scaniverse on a phone.
2. Export as **GLB** (not GLTF — GLB is a single self-contained file).
3. Rename to match the character name, e.g. `mop.glb`.
4. Copy into this `media/` folder.
5. Add `@model mop.glb` to the character's Twee passage.
6. Commit and push — GitHub Actions will rebuild and deploy automatically.

---

## Mixamo GIF pipeline

1. Upload a scan or photo to [Mixamo](https://www.mixamo.com).
2. Choose an animation (Wave, Idle, Dance, etc.).
3. Download as FBX.
4. Convert FBX → GIF using [ezgif.com/video-to-gif](https://ezgif.com/video-to-gif) or ffmpeg:
   ```bash
   ffmpeg -i mop-wave.fbx -vf "fps=15,scale=320:-1" mop-wave.gif
   ```
5. Copy into `media/`, add `@gif mop-wave.gif` to the passage, commit and push.

---

## Size guidance

- GLB files: aim for under 5 MB per character (Polycam "optimised" export is fine)
- GIF files: aim for under 2 MB (reduce fps or scale if needed)
- PNG/JPG: under 500 KB
