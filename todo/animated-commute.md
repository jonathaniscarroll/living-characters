# Feature: Characters Animate Between Rooms on Day Segment Change

**Goal:** When the facilitator taps a day-segment button (🌅 Morning, ☀️ Midday, etc.), characters whose scheduled room changes should have their map pin smoothly animate/travel from their old room's lat/lng to their new room's lat/lng, like a little commute.

**Verdict: Fully feasible.** The schedule system already works — `getActiveRoomId(ch)` returns the correct room per segment. Pins already snap to the right position on `renderMapPins()`. This feature just adds a tween between the old and new position before the pin settles.

---

## How It Works (Design)

1. When `setDaySegment(seg)` is called, **before** re-rendering pins, snapshot every character's current lat/lng position.
2. Compute each character's new position (their destination room's lat/lng).
3. For characters whose position has changed, run a short lat/lng tween (e.g. 1.5–2s, ease-in-out) updating the Leaflet marker position on each frame.
4. After the tween completes, `renderMapPins()` does its final re-render to clean up.

---

## Implementation Plan

### Step 1 — Snapshot positions before segment change

In `scripts/map.js`, at the top of `setDaySegment(seg)`, capture current positions:

```js
function setDaySegment(seg) {
  // Snapshot where everyone is NOW (before segment changes)
  const prevPositions = {};
  characters.forEach(ch => {
    const pos = _charLatLng(ch);
    if (pos) prevPositions[ch.id] = { lat: pos.lat, lng: pos.lng };
  });

  currentSegment = seg;
  document.querySelectorAll('.day-seg').forEach(b =>
    b.classList.toggle('active', b.dataset.seg === seg));

  // Animate commutes, then re-render
  _animateCommutes(prevPositions, () => {
    renderMapPins();
    if (activeRoomId) {
      const room = rooms.find(r => r.id === activeRoomId);
      if (room) window.lcRoom && window.lcRoom.buildRoomScene(room);
    }
  });
}
```

---

### Step 2 — Add `_animateCommutes(prevPositions, onDone)`

Add this function to `map.js`. It creates temporary travelling markers for each character that moves, tweens them, then calls `onDone` when all are finished:

```js
function _animateCommutes(prevPositions, onDone) {
  const DURATION = 1800; // ms
  const FPS = 30;
  const interval = 1000 / FPS;

  // Find characters that are actually moving to a different room
  const movers = characters.map(ch => {
    const prev = prevPositions[ch.id];
    const next = _charLatLng(ch); // uses new currentSegment
    if (!prev || !next) return null;
    if (Math.abs(prev.lat - next.lat) < 0.000001 && Math.abs(prev.lng - next.lng) < 0.000001) return null;
    return { ch, prev, next };
  }).filter(Boolean);

  if (!movers.length) { onDone(); return; }

  // Hide the static pins during commute so we don't see double
  map.eachLayer(l => { if (l._lcPin) l.setOpacity(0); });

  const startTime = performance.now();
  const travelMarkers = movers.map(({ ch }) => {
    const prev = prevPositions[ch.id];
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const imgSrc = ch.photoData || ch.photoUrl || null;
    const icon = L.divIcon({ className: '', html:
      `<div style="width:32px;height:32px;border-radius:50%;border:2.5px solid ${mood.color};
                  overflow:hidden;background:#0a0f1e;display:flex;align-items:center;
                  justify-content:center;opacity:0.9;">
        ${imgSrc
          ? `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover" alt="${ch.name}">`
          : '<span style="font-size:18px">🧸</span>'}
      </div>`, iconSize: [32, 32], iconAnchor: [16, 16]
    });
    return L.marker([prev.lat, prev.lng], { icon, zIndexOffset: 500 }).addTo(map);
  });

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  const ticker = setInterval(() => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const e = easeInOut(t);

    movers.forEach(({ prev, next }, i) => {
      const lat = prev.lat + (next.lat - prev.lat) * e;
      const lng = prev.lng + (next.lng - prev.lng) * e;
      travelMarkers[i].setLatLng([lat, lng]);
    });

    if (t >= 1) {
      clearInterval(ticker);
      travelMarkers.forEach(m => map.removeLayer(m));
      onDone();
    }
  }, interval);
}
```

---

### Step 3 — Respect `prefers-reduced-motion`

Before running the animation, check for reduced motion and skip straight to `onDone()` if set:

```js
function _animateCommutes(prevPositions, onDone) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onDone(); return;
  }
  // ... rest of function
}
```

---

### Step 4 — Add a travel trail (optional enhancement)

For extra charm, draw a faint dashed polyline from start to destination for each mover, fade it out as the character arrives:

```js
const trail = L.polyline([[prev.lat, prev.lng], [next.lat, next.lng]], {
  color: mood.color, weight: 1.5, opacity: 0.25,
  dashArray: '4 6'
}).addTo(map);
// remove trail in the same clearInterval block:
map.removeLayer(trail);
```

---

## Files to Change

| File | Change |
|---|---|
| `scripts/map.js` | Refactor `setDaySegment()`, add `_animateCommutes()` |
| No other files needed | Schedule data and room positions are already correct |

---

## Edge Cases to Handle

- **Character has no home or work room set** → `getActiveRoomId()` already falls back gracefully; skip animation for that character
- **Two characters share the same destination** → each gets their own travel marker, they just converge
- **Segment clicked rapidly** → cancel any in-progress tween (clear the interval, remove travel markers, call `onDone` immediately) before starting the new one. Track the active interval in a module-level variable `let _commuteInterval = null`
- **Room view is open during commute** → commute plays behind the room view; no conflict since the room view sits at `z-index:1200` above the map

---

## Verify After Implementation

- [ ] Tap 🌅 → ☀️: characters with a different midday room visibly travel across the map
- [ ] Characters at the same room for both segments don't move
- [ ] Travel takes ~1.8s with smooth ease-in-out curve
- [ ] After travel completes, pins look exactly as `renderMapPins()` normally produces them
- [ ] Rapid segment switching doesn't leave orphaned travel markers on the map
- [ ] Works with `prefers-reduced-motion` (instant snap, no animation)
