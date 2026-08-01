# Fetch Quest System — Implementation Prompt

## Feature Summary

Add a dynamic **fetch quest** layer to `living-characters`: characters can *want* items
that other characters currently *have*. The player collects items from characters (by
trading or receiving them) and delivers them to the character who wants them. The whole
system is driven by the existing `items` array already stored on each character object.

---

## Data Model Changes

### On each character object (already in `saveCharacter` / `data` shape)

Add two new optional fields alongside the existing `items` array:

```js
{
  // existing
  items: ['acorn', 'red thread'],   // items this character currently holds

  // NEW
  wantsItem: 'pine cone',           // single item this character is questing for (or null)
  questState: 'open',               // 'open' | 'offered' | 'complete' (default 'open')
  questReward: 'red thread',        // item they will give the player in exchange (or null)
  questSuccessLine: 'Oh thank you! Here, take this.',  // said on delivery
  questOfferLine:   'I would love a pine cone. Do you have one?',  // said when player has the item
  questWantLine:    'I\'m looking for a pine cone…',  // said when player does NOT have the item
}
```

Add to `saveCharacter()` in `scripts/modals.js` — read these from new form fields
alongside `items` (see UI section below).

### Player inventory (new module-level variable in `scripts/card.js` or `scripts/state.js`)

```js
// Top of file, alongside `characters`, `rooms`, etc.
let playerInventory = [];   // persisted via save() / load() in localStorage key 'lc_player_inv'
```

Add `playerInventory` to the `save()` and `load()` calls:
- `save()`: `lcData.playerInventory = playerInventory;`
- `load()`: `playerInventory = lcData.playerInventory || [];`

---

## Card Modal Changes (`scripts/card.js` → `openCard()`)

Inside `openCard(charId)`, after the dialogue/passage rendering, inject a **Quest Panel**:

### Logic

```
const ch = characters.find(c => c.id === charId);
const playerHasWantedItem = ch.wantsItem && playerInventory.includes(ch.wantsItem);
```

### Panel States

**State A — character wants an item, player does NOT have it**
```html
<div class="quest-panel quest-open">
  <span class="quest-icon">🔍</span>
  <p class="quest-line">{ch.questWantLine || `I'm looking for a ${ch.wantsItem}…`}</p>
</div>
```

**State B — character wants an item, player HAS it in inventory**
```html
<div class="quest-panel quest-offered">
  <span class="quest-icon">✨</span>
  <p class="quest-line">{ch.questOfferLine || `Oh! Is that a ${ch.wantsItem}? I've been looking for one!`}</p>
  <button class="quest-give-btn" onclick="lcCard.giveItem('${ch.id}')">
    Give ${ch.wantsItem} →
  </button>
</div>
```

**State C — quest already complete**
```html
<div class="quest-panel quest-complete">
  <span class="quest-icon">✅</span>
  <p class="quest-line">{ch.questSuccessLine || `Thanks so much!`}</p>
</div>
```

**State D — character has items the player can pick up (items array non-empty)**
```html
<div class="item-tray">
  {ch.items.map(item => `
    <button class="item-chip" onclick="lcCard.pickUpItem('${ch.id}', '${item}')">
      🎒 Take ${item}
    </button>
  `)}
</div>
```

---

## New Card Functions (add to `window.lcCard` / export)

### `giveItem(charId)`
Called when player taps "Give [item]" button.

```js
function giveItem(charId) {
  const ch = characters.find(c => c.id === charId);
  if (!ch || !ch.wantsItem) return;
  const idx = playerInventory.indexOf(ch.wantsItem);
  if (idx === -1) return;

  // Remove from player inventory
  playerInventory.splice(idx, 1);

  // Mark quest complete
  ch.questState = 'complete';

  // Give reward to player
  if (ch.questReward) {
    playerInventory.push(ch.questReward);
    showToast(`You gave the ${ch.wantsItem} and received: ${ch.questReward}!`);
  } else {
    showToast(`You gave the ${ch.wantsItem}.`);
  }

  save();
  openCard(charId); // re-render card in new state
  renderInventoryBar(); // update HUD
}
```

### `pickUpItem(charId, itemName)`
Called when player taps "Take [item]" in the item tray.

```js
function pickUpItem(charId, itemName) {
  const ch = characters.find(c => c.id === charId);
  if (!ch) return;
  const idx = ch.items.indexOf(itemName);
  if (idx === -1) return;

  // Move from character to player
  ch.items.splice(idx, 1);
  playerInventory.push(itemName);

  showToast(`You picked up: ${itemName}`);
  save();
  openCard(charId); // re-render
  renderInventoryBar();
}
```

---

## Inventory HUD

Add a persistent inventory bar to `index.html` (bottom of screen, above the map):

```html
<div id="inventory-bar" style="
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--surface, #1e1e1e);
  border-top: 1px solid rgba(255,255,255,0.1);
  padding: 8px 16px;
  display: flex; gap: 8px; align-items: center;
  font-size: 13px; z-index: 900;
  overflow-x: auto; min-height: 44px;
">
  <span style="opacity:0.5; flex-shrink:0;">🎒</span>
  <!-- chips injected by renderInventoryBar() -->
</div>
```

### `renderInventoryBar()`
```js
function renderInventoryBar() {
  const bar = document.getElementById('inventory-bar');
  if (!bar) return;
  // Remove all chips (keep the backpack icon)
  bar.querySelectorAll('.inv-chip').forEach(el => el.remove());

  if (!playerInventory.length) {
    const empty = document.createElement('span');
    empty.className = 'inv-chip';
    empty.style.opacity = '0.4';
    empty.textContent = 'nothing yet';
    bar.appendChild(empty);
    return;
  }

  playerInventory.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'inv-chip';
    chip.style.cssText = `
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 999px; padding: 3px 10px;
      font-size: 12px; white-space: nowrap; flex-shrink: 0;
    `;
    chip.textContent = item;
    bar.appendChild(chip);
  });
}
```

---

## Facilitator Modal Changes (`scripts/modals.js`)

In `openCharModal()`, add a **"Quest" section** to the dialogue builder — below the
existing `PROMPT_TYPES` rows, above the sprite section:

```js
// Inside openCharModal(), after the PROMPT_TYPES loop:

// Quest fields
const questSection = document.createElement('div');
questSection.style.cssText = 'margin-top:12px; border-top:1px solid rgba(255,255,255,0.1); padding-top:10px;';
questSection.innerHTML = `
  <div style="font-size:12px; color:var(--text-muted,#999); margin-bottom:8px; font-weight:600; letter-spacing:.5px;">
    🔍 FETCH QUEST
  </div>
  <div style="display:grid; gap:6px;">
    <label style="font-size:11px;color:var(--text-muted);">Wants item</label>
    <input id="cf-wants-item" class="modal-input" placeholder="pine cone"
      value="${ch?.wantsItem || ''}" />

    <label style="font-size:11px;color:var(--text-muted);">Reward they give</label>
    <input id="cf-quest-reward" class="modal-input" placeholder="red thread (leave blank for none)"
      value="${ch?.questReward || ''}" />

    <label style="font-size:11px;color:var(--text-muted);">Says when you don't have it</label>
    <textarea id="cf-quest-want-line" class="prompt-input" rows="2"
      placeholder="I'm looking for a pine cone…">${ch?.questWantLine || ''}</textarea>

    <label style="font-size:11px;color:var(--text-muted);">Says when you have it</label>
    <textarea id="cf-quest-offer-line" class="prompt-input" rows="2"
      placeholder="Oh! Is that a pine cone?">${ch?.questOfferLine || ''}</textarea>

    <label style="font-size:11px;color:var(--text-muted);">Says after you give it</label>
    <textarea id="cf-quest-success-line" class="prompt-input" rows="2"
      placeholder="Oh thank you! Here, take this.">${ch?.questSuccessLine || ''}</textarea>
  </div>
`;
document.getElementById('dialogue-builder').appendChild(questSection);
```

In `saveCharacter()`, read these fields into `data`:

```js
data.wantsItem        = document.getElementById('cf-wants-item')?.value.trim() || null;
data.questReward      = document.getElementById('cf-quest-reward')?.value.trim() || null;
data.questWantLine    = document.getElementById('cf-quest-want-line')?.value.trim() || null;
data.questOfferLine   = document.getElementById('cf-quest-offer-line')?.value.trim() || null;
data.questSuccessLine = document.getElementById('cf-quest-success-line')?.value.trim() || null;
// Preserve existing questState unless this is a new character
data.questState = editingCharId
  ? (characters.find(c => c.id === editingCharId)?.questState || 'open')
  : 'open';
```

---

## Twee Export Update (`scripts/twee.js` or wherever `exportTwee()` lives)

Add fetch quest passages to the Twee export per character:

```twee
:: CharacterName-quest-open
{ch.questWantLine || `I'm looking for a ${ch.wantsItem}…`}

:: CharacterName-quest-offered
{ch.questOfferLine || `Oh! Is that a ${ch.wantsItem}?`}
[[Give it → CharacterName-quest-complete]]
[[Keep it → CharacterName-hello]]

:: CharacterName-quest-complete
{ch.questSuccessLine || `Thank you so much!`}
```

---

## Reset for New Run (Facilitator Control)

Add a **"Reset all quests"** button to the facilitator toolbar (next to existing controls):

```js
function resetAllQuests() {
  if (!confirm('Reset all quests and clear player inventory?')) return;
  playerInventory = [];
  characters.forEach(ch => {
    if (ch.wantsItem) ch.questState = 'open';
    // Restore quest rewards back to original characters using a separate
    // `originalItems` snapshot saved at first load — or simply note this
    // is a facilitator responsibility to restore items manually if needed.
  });
  save();
  renderInventoryBar();
  showToast('All quests reset!');
}
```

---

## Key Constraints to Respect

- **No individual computers** — all interaction via the single facilitator machine; player taps on the facilitator's screen
- **No backend** — everything lives in `localStorage` + the existing `save()` / `load()` pattern
- **Single-page, no install** — all new code is additions to existing scripts, no new dependencies
- **Gentle pacing** — quest UI must be readable by a child; large tap targets (≥44px), plain language
- **Thursday is beach day** — don't schedule quest-heavy workshops on day 4

---

## Files to Touch

| File | Change |
|---|---|
| `scripts/modals.js` | Add quest fields to `openCharModal()` and `saveCharacter()` |
| `scripts/card.js` | Add quest panel rendering, `giveItem()`, `pickUpItem()`, `renderInventoryBar()` |
| `scripts/state.js` (or wherever `save`/`load` live) | Add `playerInventory` to persistence |
| `index.html` | Add `#inventory-bar` HUD div |
| `scripts/twee.js` | Add quest passage types to Twee export |
