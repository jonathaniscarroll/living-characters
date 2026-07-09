# Project: Art Camp — Living Characters & Virtual Worlds

**Context:** I'm building two things in parallel — a presentation page on the NSCAD website and a separate interactive tool repo. The tool repo is a direct evolution of my existing `spatial-narrative` project, reoriented from place-based passages to character-based interaction.

---

## The through-line: `spatial-narrative` → `living-characters`

`jonathaniscarroll/spatial-narrative` is a GPS + compass proximity viewer built in a Netscapecore aesthetic. It shows one passage at a time based on where you are physically, with a live compass pointing toward other unvisited nodes. Passages are authored in Twee format and tied to real-world coordinates with a trigger radius.

`jonathaniscarroll/living-characters` is the same idea but **characters replace locations as the primary unit.** Instead of walking to a place to unlock a passage, you tap a character on a shared map to open their card and interact with their dialogue tree. The spatial logic is still there — characters live at spots on a map, they have presence and context — but the authoring and interaction model is organized around **who** rather than **where.** The Twee passage structure follows the same convention, just keyed to character names and states instead of place names.

This means `living-characters` is essentially `spatial-narrative` for a room rather than a street, and for a group of kids making felt and clay figures rather than a solo walker with a phone.

---

## 1. Presentation page

**Location:** `jonathaniscarroll/nscadu.ca` → `jonathan-carroll/presentations/art-camp-living-characters/index.html`

Already complete. Describes the camp program in the Netscapecore style matching the other pages on the site. Covers:

- Mon–Tue: character sculpting in needle felt or air-dry clay
- Wed: backgrounds and spaces drawn by hand
- Thu: beach/swimming day — no participant computer work; facilitator quietly tidies the digital world
- Fri: final assembly and group walk-through presentation

Key decisions documented: no participant computers (one facilitator laptop + projector), photogrammetric 3D scanning via Polycam or Meshroom, Mixamo animations, Tamagotchi/Sims/Habbo Hotel/dress-up doll as aesthetic references. Audio/slide player section stubbed in for future recordings.

---

## 2. Interactive tool repo

**Location:** `jonathaniscarroll/living-characters`

Currently has a working dark-mode `index.html` with:
- Pannable/zoomable map canvas (2400×1600px) with six named zones
- Character pins with photo, mood ring (pulsing colour), animated GIF slot, items, dialogue
- Add/Edit modal with mini-map location picker
- Facilitator mode vs. Projector mode toggle
- `localStorage` persistence
- Three seeded demo characters on first load (Mop, Gravel, Biscuit)

### What it needs next — pulling directly from `spatial-narrative`

The `spatial-narrative` repo established the following patterns that should carry forward:

- **Netscapecore visual style** — the Windows 95/Netscape-era aesthetic (title bars, inset borders, button95 class, toolbar layout) used in `spatial-narrative/index.html`; `living-characters` currently uses a dark-mode aesthetic that should be harmonized or optionally toggled to match
- **Twee passage structure** — `spatial-narrative` authors content as Twee nodes; `living-characters` should do the same but organized per character:
  - `:: CharacterName`
  - `:: CharacterName-hello`
  - `:: CharacterName-question`
  - `:: CharacterName-secret`
  - `:: CharacterName-item-<thing>`
- **"One active thing at a time" interaction model** — in `spatial-narrative` one passage is active and the compass points to others; in `living-characters` one character is active and their card shows their full dialogue tree
- **The `story` object / passage data shape** — `spatial-narrative` keeps authored content in a flat JS array of passage objects with `name`, `body`, `lede`, `lat`, `lng`, `radius`; `living-characters` should use a parallel shape with `name`, `mood`, `x`, `y`, `dialogue` passages, `items`, `photoData`, `animData`

### New addition specific to the camp context

A **kid-friendly dialogue builder** — preset prompt types (hello, question, secret, reaction, item interaction) that kids fill in with short text or optional voice recording, generating Twee passages per character behind the scenes. No raw text editor exposed to participants. The facilitator can then export a `.twee` file for the whole world.

---

## Key constraints

- No individual computers for participants — facilitator input only on one machine
- Felt and clay as physical medium; photogrammetric scanning is a stretch goal
- Mixamo GIF animations in character cards
- Structured workshops ~1 hour to keep pacing gentle
- Thursday is always beach day
- Tool runs in any modern browser, no install, no backend

---

## Immediate next step

Extend `living-characters/index.html` to:

1. Optionally adopt the Netscapecore visual language from `spatial-narrative`
2. Add a **Twee-style dialogue builder** per character with kid-friendly prompt types
3. Store dialogue as structured passage data keyed to each character
4. Add a **Twee export button** generating a downloadable `.twee` file for the whole cast

---

## Repos

- **Presentation:** `github.com/jonathaniscarroll/nscadu.ca` → `jonathan-carroll/presentations/art-camp-living-characters/`
- **Tool:** `github.com/jonathaniscarroll/living-characters`
- **Source template:** `github.com/jonathaniscarroll/spatial-narrative`
