# Fix: Character Card Showing 🧸 Instead of Portrait

**Bug:** In `living-characters`, the character card modal (`#card-anim`) always shows the `🧸` placeholder instead of the character's portrait photo or GIF animation.

**Diagnosis:** In `scripts/card.js`, `openCard()` correctly checks `ch.sprites`, `ch.animData`, and `ch.photoData` in order. The fallback to `🧸` fires because `photoData` and `animData` are `null` or `undefined` on the character object at render time.

---

## Investigate and fix the following:

### 1. In `scripts/modals.js` → `saveCharacter()`

Confirm that when saving a character, the function reads from `tempPhotoData` and `tempAnimData` (the global temp variables set by `previewFile()`) and writes them into the character object like:

```js
photoData: tempPhotoData || existing.photoData || null,
animData: tempAnimData || existing.animData || null,
```

If this assignment is missing or the variable names don't match, add it. Also confirm `tempPhotoData` and `tempAnimData` are **reset to `null`** after save so stale data from a previous edit doesn't bleed into the next character.

---

### 2. In `scripts/modals.js` → `openCharModal(id)` (edit mode)

When opening the modal for an existing character, confirm it **pre-seeds** the temp variables:

```js
tempPhotoData = ch.photoData || null;
tempAnimData  = ch.animData  || null;
```

And also shows the preview images so the facilitator can see the current portrait:

```js
const photoPreview = document.getElementById('cf-photo-preview');
if (ch.photoData) { photoPreview.src = ch.photoData; photoPreview.style.display = 'block'; }
const animPreview = document.getElementById('cf-anim-preview');
if (ch.animData)  { animPreview.src = ch.animData;  animPreview.style.display = 'block'; }
```

---

### 3. Sanity check in `scripts/card.js` → `openCard()`

After the fix, add a temporary log to confirm data is present when the card opens:

```js
console.log('card portrait:', ch.name, !!ch.photoData, !!ch.animData);
```

Remove this log once confirmed working.

---

## Do not change

The portrait rendering priority order in `card.js` is correct and should not be touched:

```
sprites → animData → photoData → 🧸 fallback
```

Only fix the data flow: **upload → save → retrieve**.

---

## Verify after fix

- [ ] Upload a photo for a new character → save → tap pin → portrait appears
- [ ] Edit an existing character → portrait preview shows in modal, existing photo survives re-save
- [ ] Character with only a GIF (no static photo) → GIF shows in card
- [ ] Character with neither → `🧸` fallback still shows
