# Living Characters

A character-first interactive world built on [SugarCube 2](https://www.motoslave.net/sugarcube/2/), forked from the [spatial-narrative](https://github.com/jonathaniscarroll/spatial-narrative) geo-passage system.

Instead of passages that unlock by GPS location, **passages are characters**. Each character lives in a shared world and can be visited, talked to, and animated. The whole world lives in a single `.twee` file. A browser-based authoring tool lets participants add their own character, write dialogue, pick an animation, and upload a photo — no coding needed.

**Live reader:** `index.html` (root) — compiled SugarCube story  
**Kid-friendly authoring tool:** `author/index.html` — character card editor  
**Story source:** `story/main.twee` — single-file Twee source of record  
**Media:** `media/` — character photos and audio files  

---

## How It Works

The system runs entirely in the browser. No server needed. Each character is a SugarCube passage tagged `[character]`. The reader shows the active character's photo, animation loop (a CSS class mapped from a Mixamo animation name), a short lede, and their dialogue. Clicking a character's name in the sidebar navigates to them.

### Character passage format

```twee
:: CharacterName [character]
@image charactername.jpg
@lede A short sentence about this character.
@animation wave
@mood happy

Dialogue or description goes here. This is what the character says or does when you visit them.

[[FriendName]]
[[AnotherFriend]]
```

### Directive reference

| Directive | Description | Example |
|---|---|---|
| `@image file` | Photo filename in `media/` | `@image milo.jpg` |
| `@lede text` | One-line character intro | `@lede A tiny owl who loves puzzles.` |
| `@animation name` | Mixamo animation class | `@animation wave` |
| `@mood name` | Sets a mood colour ring | `@mood happy` |

### Available animations (Mixamo)

| Class name | What it looks like |
|---|---|
| `wave` | Friendly wave |
| `idle` | Gentle breathing idle |
| `dance` | Happy dance |
| `think` | Thinking pose |
| `jump` | Excited jump |
| `bow` | Polite bow |
| `sleep` | Sleeping / resting |
| `point` | Pointing at something |

### Mood colours

`happy` → yellow · `sad` → blue · `excited` → orange · `sleepy` → purple · `shy` → pink · `grumpy` → red

---

## Repository Structure

```
/
├── index.html          # Compiled SugarCube reader
├── story/
│   └── main.twee       # All character content — source of truth
├── author/
│   └── index.html      # Kid-friendly character editor
├── media/              # Character photos and audio files
├── vendor/             # SugarCube 2 runtime
└── README.md
```

---

## Authoring Tool (author/index.html)

A standalone HTML file — no build step, no account needed for reading. To save characters back to the repo, paste a GitHub Personal Access Token (repo scope) into the token field.

### Workflow
1. Open `author/index.html` in a browser
2. Paste your GitHub token and click **Load World**
3. Click **+ Add My Character** to create a new character card
4. Fill in: name, one-sentence description (lede), pick an animation, pick a mood
5. Upload a photo — it goes into `media/`
6. Write what your character says in the big text box
7. Click **Friends** to link to other characters (those links appear as buttons in the reader)
8. Click **Save Character** — done!

> **For facilitators:** The authoring tool is intentionally simple. Fields are labelled in plain language. Participants never see raw Twee syntax — the tool generates it behind the scenes.

---

## Deploying / Compiling

The reader is a compiled SugarCube `.html` file. After editing `story/main.twee`:

1. Open `story/main.twee` in [Twine desktop](https://twinery.org/) or compile with [Tweego](https://www.motoslave.net/tweego/)
2. Output to `index.html` in the repo root
3. Push to `main` — GitHub Pages serves it automatically

---

## Design Notes

- **Based on spatial-narrative** — same SugarCube engine, same Netscape 95 aesthetic, same `@directive` passage syntax. Passages = characters instead of geo nodes.
- **No GPS required** — characters are navigated by clicking, not by walking.
- **Mixamo animations** — each character has a CSS animation class that mimics a Mixamo motion-capture loop. When 3D `.glb` files are added to `media/`, `<model-viewer>` can replace the CSS fallback.
- **Links drive the sidebar** — `[[FriendName]]` in a character's passage is what builds the "friends" list in the reader, same as the compass in spatial-narrative.
- **GitHub Issues for dialogue** — participants can leave in-world messages at each character using the same comments system as spatial-narrative, backed by GitHub Issues with a `character-note` label.
