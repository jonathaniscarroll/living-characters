# Room Bounds Fit to Screen — Implementation Prompt

## Problem

The wander AI uses a hardcoded `WANDER_RADIUS = 3.5` world-units and a fixed floor plane
(`PlaneGeometry(20, 20)`). Characters wander beyond what the camera can see because the
visible world-space rectangle is never calculated — it's only implied by the camera's
orthographic frustum.

Separately, the semi-transparent floor shading is no longer wanted (rooms always have a
backdrop image). Remove the floor mesh and wall meshes entirely.

---

## Fix: Compute Visible World Bounds from the Camera

The camera is an `OrthographicCamera`. Its visible rectangle in world space is exactly:

```
visible half-width  = (viewSize * aspect / 2) / camera.zoom
visible half-height = (viewSize / 2) / camera.zoom
```

where `viewSize = 10` (set at camera construction) and `aspect = W / H`.

After the camera is built in `buildRoomScene`, compute a **world bounds** object and use
it everywhere that currently uses the hardcoded floor size or wander radius:

```js
// After camera.updateProjectionMatrix():
const visHalfW = (viewSize * aspect / 2) / camera.zoom;
const visHalfH = (viewSize / 2)          / camera.zoom;

// Shrink slightly so characters never touch the edge
const EDGE_PAD  = 0.8;   // world units of padding inside screen edge
const worldBounds = {
  minX: -visHalfW + EDGE_PAD,
  maxX:  visHalfW - EDGE_PAD,
  minZ: -visHalfH + EDGE_PAD,
  maxZ:  visHalfH - EDGE_PAD,
};
```

> Note: the orthographic camera looks down from an angle so the visible *floor* rectangle
> isn't perfectly equal to the frustum rectangle — but for an isometric view it's close
> enough. If characters still drift slightly off-screen, increase `EDGE_PAD` to `1.2`.

---

## Changes to `buildRoomScene()`

### 1 — Remove the floor mesh and wall meshes

Delete (or comment out) the entire `floor` mesh block and both wall meshes (`wN`, `wW`).
The backdrop image on `#room-stage` already provides the visual floor; no Three.js
geometry is needed.

```js
// DELETE these blocks:
// const floor = new THREE.Mesh(...)
// floor.rotation.x = ...
// scene.add(floor)
// const wN = ...; scene.add(wN);
// const wW = ...; scene.add(wW);
// Also remove the hasBg conditional that wraps them — it is no longer needed.
```

### 2 — Pass `worldBounds` into `_initWanderAgent`

Change the call signature:
```js
// Before:
_initWanderAgent(ch.id, mesh, ring, cx, cz, null, null);

// After:
_initWanderAgent(ch.id, mesh, ring, cx, cz, null, null, worldBounds);
```

### 3 — Clamp spawn positions to bounds

When placing characters, clamp their initial position so they start on-screen:

```js
const cx = Math.max(worldBounds.minX, Math.min(worldBounds.maxX, ch.sceneX ?? 0));
const cz = Math.max(worldBounds.minZ, Math.min(worldBounds.maxZ, ch.sceneZ ?? 0));
```

---

## Changes to `_initWanderAgent()`

Add `bounds` as the last parameter and store it on the agent:

```js
function _initWanderAgent(chId, mesh, ring, homeX, homeZ, mixer, animations, bounds) {
  // ...existing code...
  const agent = {
    chId, mesh, ring, homeX, homeZ,
    state: 'idle',
    timer: _randBetween(IDLE_MIN, IDLE_MAX),
    targetX: homeX, targetZ: homeZ,
    speed: WANDER_SPEED * _randBetween(0.7, 1.3),
    mixer, idleClip, walkClip,
    _activeAction: null,
    frozen: false,
    bounds,   // <-- new
  };
  // ...rest unchanged...
}
```

---

## Changes to `_tickWander()`

Replace the hardcoded wander target logic with bounds-aware target picking, and clamp
the agent's position every tick:

```js
function _tickWander(agent, dt) {
  if (agent.frozen || (_dragTarget && _dragTarget.id === agent.chId)) return;
  agent.timer -= dt;

  const b = agent.bounds;  // may be undefined for legacy agents — guard below

  if (agent.state === 'idle') {
    if (agent.timer <= 0) {
      // Pick a random target within bounds (or fall back to old WANDER_RADIUS)
      if (b) {
        agent.targetX = _randBetween(b.minX, b.maxX);
        agent.targetZ = _randBetween(b.minZ, b.maxZ);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist  = _randBetween(1, WANDER_RADIUS);
        agent.targetX = agent.homeX + Math.cos(angle) * dist;
        agent.targetZ = agent.homeZ + Math.sin(angle) * dist;
      }
      agent.state = 'walking';
      agent.timer = _randBetween(WALK_MIN, WALK_MAX);
      _playAgentClip(agent, agent.walkClip || agent.idleClip);
    }
  } else {
    const dx = agent.targetX - agent.mesh.position.x;
    const dz = agent.targetZ - agent.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.05 || agent.timer <= 0) {
      agent.state = 'idle';
      agent.timer = _randBetween(IDLE_MIN, IDLE_MAX);
      _playAgentClip(agent, agent.idleClip);
    } else {
      const step = Math.min(agent.speed * dt, dist);
      let nx = agent.mesh.position.x + (dx / dist) * step;
      let nz = agent.mesh.position.z + (dz / dist) * step;

      // Clamp to bounds every tick so characters can never escape
      if (b) {
        nx = Math.max(b.minX, Math.min(b.maxX, nx));
        nz = Math.max(b.minZ, Math.min(b.maxZ, nz));
      }

      agent.mesh.position.x = nx;
      agent.mesh.position.z = nz;
      agent.mesh.rotation.y = Math.atan2(dx, dz);
      if (agent.ring) { agent.ring.position.x = nx; agent.ring.position.z = nz; }
    }
  }
}
```

---

## Remove now-unused constants

Once `worldBounds` is passed in, `WANDER_RADIUS = 3.5` is only used as a fallback for
agents without bounds. Keep it as a safety fallback but add a comment:

```js
const WANDER_RADIUS = 3.5;  // fallback only — normally overridden by worldBounds
```

---

## Files to Touch

| File | Change |
|---|---|
| `scripts/room.js` | All changes above: compute `worldBounds`, remove floor/walls, pass bounds to agents, clamp in tick |

No other files need changes.

---

## Key Constraints

- **No backend, no install** — pure geometry/math change, no new dependencies
- **Backdrop image provides all visual floor** — Three.js floor mesh is redundant and should go
- **`EDGE_PAD`** is the single tuning knob; start at `0.8`, increase if edge-clipping persists
- **Backward compatible** — agents without a `bounds` field fall back to old WANDER_RADIUS behaviour
