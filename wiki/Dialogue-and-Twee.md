# Dialogue & Twee

## Passage types

Each character has a set of structured dialogue passages. The built-in prompt types are:

| Key | Label | Prompt hint |
|---|---|---|
| `hello` | 👋 Say hello | What do they say when you first meet? |
| `question` | ❓ Answer a question | What do they know about this place? |
| `secret` | 🤫 Share a secret | What do they only tell trusted people? |
| `item-<name>` | 📦 Describe an item | What does each item mean to them? |
| `home` | 🏠 At home they say… | What do they talk about at home? |
| `work` | 💼 At work they say… | What do they talk about at work? |

Additional `home-object-<name>` and `work-object-<name>` passages are generated automatically for each object in the character's home / work rooms.

## Twee export format

Clicking **Export Twee** generates a `.twee` file with this structure:

```twee
:: CharacterName [character]
Hello. I am CharacterName.

[[Say hello->CharacterName-hello]]
[[Ask a question->CharacterName-question]]
[[Hear a secret->CharacterName-secret]]

:: CharacterName-hello
What do they say when you first meet?

:: CharacterName-question
What do they know about this place?

:: CharacterName-secret
What do they only tell trusted people?
```

Passages without text are omitted from the export.

## Editing dialogue

1. Open the character modal (tap the character card on the map or the ✏️ button in the room's object list).
2. Scroll to the **Dialogue** section.
3. Click a prompt pill to toggle it active (highlighted = will export).
4. Type the passage text in the textarea.
5. Save the character.

## Schedule

Each character has a five-slot schedule (morning / midday / afternoon / evening / night) set to either `home` or `work`. This determines which room they appear in during each time period when the schedule system is active.
