# User Guide

This guide covers everything a facilitator or camper needs to run a Living Characters session.

---

## Getting started

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).
2. You will see a **dark map** centred on Halifax by default.
3. The top toolbar gives you access to every feature.

---

## Toolbar buttons

| Button | What it does |
|---|---|
| **+ Room** | Opens the Add Room form |
| **+ Character** | Opens the Add Character form |
| **GPS** | Asks for your device's real location and starts proximity detection |
| **Sim** | Cycles through rooms automatically every 4 seconds — useful for demos without moving |
| **Facilitator / Projector** | Toggles between author mode (can edit everything) and visitor mode (proximity-triggered rooms only) |
| **Test Room** | Spawns a sample room + character + object at the centre of the current map view |
| **Export Twee** | Downloads a `.twee` file of everything for use in Twine |
| **Save to GitHub** | Commits the current state to the connected GitHub repo |

---

## Creating a room

1. Click **+ Room**.
2. Give it a **name** and an optional **description** (lede).
3. Set its **location** — type latitude/longitude or click on the mini-map inside the form.
4. Set the **trigger radius** (default 30 m). Entering this circle opens the room automatically.
5. Pick a **backdrop style** from the dropdown, *or* upload your own backdrop image.
6. Adjust the **camera angle** using one of the presets (Isometric, Front, Side, Top, Low) or type custom X/Y/Z values.
7. Click **Save**.

The room appears on the map as an orange labelled pin.

---

## Creating a character

1. Click **+ Character**.
2. Give the character a **name**.
3. **Choose at least one room** using the room chips (required).
4. Pick a **mood** — this sets the colour of the ring that glows beneath the character in the 3-D scene.
5. Add **items** (comma-separated — things the character carries or owns).
6. Upload a **photo** (still image), **GIF/animation**, or paste/upload a **3-D GLB model URL**.
7. Fill in **dialogue prompts** — each prompt type becomes a button in the talk panel:
   - *Greeting* — what they say when you first arrive
   - *If you ask…* — an answer to a question
   - *Secret* — something only you know
   - *About an item* — what they say about something they carry
8. Click **Save**. The character is saved to localStorage and **automatically committed to GitHub**.

---

## Entering a room

When you (or the GPS simulator) step inside a room's trigger radius, the **room scene opens automatically**.

Alternatively, click any room pin on the map.

Inside the room you will see:

- A **3-D scene** with the backdrop image behind it.
- **Character figures** (GLB models, sprites, or coloured stand-ins) wandering inside the space.
- **Object labels** floating above any props.
- A **toolbar** at the top of the scene with:
  - **Edit Room** — open the room editor
  - **Add Object** — place a new prop in this room
  - **Move Objects** — drag characters and objects to new positions
  - **Close** — exit the room

---

## Talking to a character

1. **Tap a character** in the 3-D scene (or click their pin on the map and press **Talk**).
2. The **talk panel** slides up from the bottom.
3. Tap any prompt button to see what the character says.
4. A **close-up 3-D figure or image** of the character appears in the lower-left corner of the scene.
5. Their mood ring **pulses** when they speak.
6. Tap **✕** to close the panel.

---

## Inspecting objects

Tap an object in the 3-D scene to see its **name and description** in a small pop-up that fades after 3.5 seconds.

---

## Moving things around

1. Inside a room, tap **Move Objects** in the scene toolbar.
2. Tap a character or object to select it (cursor changes to a grab hand).
3. Tap somewhere else on the floor to drop it there.
4. Tap **✅ Done Moving** to save positions.

Positions are saved to localStorage and committed on the next GitHub save.

---

## The compass panel

The **compass** (bottom of the screen) lists the five nearest rooms by distance and shows a ✓ next to any room you are currently inside. It updates live as you move.

---

## Modes

### Visitor mode (default)
Proximity detection is active. Walking into a room's radius opens it automatically. Good for participants exploring the world.

### Facilitator mode
Proximity detection is paused. You can edit anything, open any room by clicking the map, and run the GPS simulator. Good for building and presenting.

### Projector mode
Same as Facilitator but the UI labels shift to reflect that you are presenting to an audience on a shared screen.

---

## Saving and GitHub sync

All data is stored in **localStorage** instantly on every change.

To also save to GitHub:

1. Enter your **GitHub token** in the GitHub panel (gear icon or visible input).
2. Every time you **save a character**, it auto-commits with a message like `Add character: Pebble`.
3. You can manually trigger a commit with a custom message using the **Save to GitHub** button.

---

## Exporting to Twine

Click **Export Twee** to download a `.twee` file. Open it in [Twine](https://twinery.org) or the [Tweego](https://www.motoslave.net/tweego/) compiler. Every room, character, and object becomes a named passage. See [Twee Export Format](Twee-Export.md) for full details.
