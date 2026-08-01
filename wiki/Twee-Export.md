# Twee Export Format

Clicking **Export Twee** downloads a `.twee` file that encodes the entire world — rooms, objects, and characters — as a flat list of named passages compatible with [Twine](https://twinery.org) and the [Tweego](https://www.motoslave.net/tweego/) compiler.

---

## File structure

```
:: StoryTitle
Living Characters Export

:: StoryData
{ "ifid": "...", "format": "Chapbook", "format-version": "1.x.x" }

:: RoomName {"id":"room_...","lat":44.65,"lng":-63.59,"radius":30,...}

Room description / lede text.

:: ObjectName-object {"id":"obj_...","roomId":"room_...","scale":1,...}

Object description.

:: CharacterName {"roomIds":["room_..."],"mood":"Happy","items":[...],...}

(character meta passage — no body)

:: CharacterName-hello

Oh! A visitor. Hello!

:: CharacterName-question

You want to know about the big root? Ask Pebble.

:: CharacterName-secret

I found a tiny door under the big root.

:: CharacterName-item

This is my lucky leaf. I carry it everywhere.
```

---

## Passage naming conventions

### Rooms
`:: RoomName` — metadata in the passage tag as JSON, lede text in the body.

### Objects
`:: ObjectName-object` — metadata in the tag, description in the body. The `-object` suffix distinguishes props from characters with similar names.

### Characters
`:: CharacterName` — metadata only (no body). Contains `roomIds`, `mood`, `items`, `glbUrl`, etc.

`:: CharacterName-<promptKey>` — one passage per filled-in dialogue prompt. The prompt key matches the `type` field in the `passages` array (e.g. `hello`, `question`, `secret`, `item`).

---

## Importing

The **Import Twee** function (in the GitHub/Store panel) parses a `.twee` file and rebuilds the `rooms`, `characters`, and `objects` arrays. It:

1. Splits the file on `:: ` passage delimiters.
2. Classifies each passage as room, object, character-meta, or character-dialogue by name suffix.
3. Reconstructs full objects from the JSON tags and body text.
4. Calls `save()` and `renderMapPins()` to make the imported world live.

Meta fields present in the JSON tag survive the round-trip intact — so a `.twee` file exported from Living Characters can be re-imported without data loss.

---

## Using the export in Twine

1. Open [Twine](https://twinery.org/2) in your browser.
2. Click **Import** → **Import from File** → select the `.twee` file.
3. Each passage appears as a node in the story graph.
4. The `StoryData` passage sets the format to **Chapbook** — you can change this to Harlowe, Sugarcube, etc. by editing that passage.
5. Link passages together using `[[passage name]]` syntax inside any passage body to build a navigable story.

---

## Extending the format

To add new passage types per character (e.g. `home`, `work`, `home-object-Kettle`):

1. Add the new `type` key to `PROMPT_TYPES` in `main.js`.
2. In `twee.js → buildTweeSource()`, the loop over `ch.passages` will automatically emit `:: CharacterName-<type>` for any passage with that key.
3. On import, `importTweeSource()` matches the suffix after the last `-` against known character IDs — new passage types are stored as-is in the `passages` array and round-trip correctly.
