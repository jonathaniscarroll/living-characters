# Living Characters — Wiki

Welcome to the **Living Characters** wiki. Use the links below to navigate.

| Section | Who it's for |
|---|---|
| [User Guide](User-Guide.md) | Facilitators and campers running a session |
| [Developer Reference](Developer-Reference.md) | Programmers extending or remixing the tool |
| [Data Model](Data-Model.md) | The shape of rooms, characters, objects, and passages |
| [Twee Export Format](Twee-Export.md) | How the story export works and how to use it in Twine |

---

## What is this?

**Living Characters** is a browser-based storytelling tool for collaborative world-building. Participants place characters on a shared map, give each character a personality, a mood, items, and dialogue — then walk (or simulate walking) through the world to discover and talk to them.

It is the character-first companion to [spatial-narrative](https://github.com/jonathaniscarroll/spatial-narrative), which organises the same GPS-proximity model around *places* rather than *people*.

## Key ideas

- **Rooms** are real-world locations (latitude / longitude + radius). Walking into one opens its 3-D scene.
- **Characters** live in one or more rooms. They have a mood, items, and a tree of dialogue passages.
- **Objects** are props inside a room. They can hold 3-D GLB models and a description that appears on tap.
- **Everything is authored from a single browser tab** — no install, no server, no individual devices needed for participants.
- **Twee export** turns the whole cast into a portable `.twee` file compatible with Twine / Chapbook.
