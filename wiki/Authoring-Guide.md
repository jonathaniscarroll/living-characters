# Authoring Guide

This guide is for the facilitator running the tool on the single shared machine during Art Camp workshops.

## Workflow overview

```
1. Create rooms        (Add a Room button)
2. Add characters      (Add a Character button)
3. Open a room         (tap a room pin on the map)
4. Interact            (tap a character in the scene)
5. Export Twee         (Export button, top toolbar)
```

---

## 1. Create a room

1. Click **Add a Room** in the toolbar.
2. Give the room a name and an optional lede (one-sentence scene description).
3. **Upload a backdrop image** — tap the file picker, choose a JPG/PNG. This becomes the room's background. There are no preset style choices.
4. Pick a **camera angle** using the preset buttons (Isometric is the default).
5. Drop a pin on the map or type coordinates.
6. Click **Save Room**.

> If you skip the backdrop upload the room will show a plain floor and walls.

---

## 2. Add a character

1. Click **Add a Character**.
2. Enter their **name**.
3. Assign them to one or more **rooms** using the room chips.
4. Set their **home room** and **work room**.
5. Choose a **mood** — this controls the colour of their mood ring in the scene.
6. Upload a **3D model** (GLB, GLTF, or FBX) — or a **photo** / **GIF** for a flat sprite.
7. Fill in **dialogue prompts** — hello, question, secret, item responses.
8. Click **Save Character**.

---

## 3. Enter a room

Tap a room pin on the map. The room scene opens with:
- The backdrop image as the CSS background
- A Three.js canvas layered on top with the floor, optional walls, and all characters and objects placed in 3D
- Characters wander automatically using the idle/walk AI

---

## 4. Talk to a character

Tap a character in the room scene. Their dialogue card opens on the right with:
- A talk close-up — a small 3D render of just the character
- Their passages listed as tappable buttons
- Their items listed below

---

## 5. Move objects and characters

1. Press **Move Objects** in the room toolbar.
2. Tap an object or character to select it (cursor changes to grabbing).
3. Tap the destination on the floor to drop it there.
4. Press **✅ Done Moving** to exit edit mode.

Positions are saved automatically.

---

## 6. Export Twee

Click **Export Twee** in the top toolbar. A `.twee` file downloads with all character passages formatted as Twee nodes keyed to character names.
