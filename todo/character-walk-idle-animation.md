# Character Walk/Idle Animation — Implementation Prompt

## Problem

The wander AI currently switches animation clips, but the implementation is fragile and
doesn't reliably play the **walk** clip while a character is moving and the **idle** clip
when they stop. The current `_playAgentClip` uses a manual `fadeOut`/`fadeIn` pair that
can restart clips unnecessarily and doesn't guard against redundant switches (calling the
same transition every frame).

The goal: a clean, state-based animation system where:
- **walk** plays while the character is moving (state = `walking`)
- **idle** plays when the character stops (state = `idle`)
- Transitions are smooth (crossfade) and only fire on actual state changes

---

## Current State (`scripts/room.js`)

### `_initWanderAgent` — finds clips and stores them on the agent

```js
function _initWanderAgent(chId, mesh, ring, homeX, homeZ, mixer, animations, bounds) {
  const idleClip = animations
    ? (THREE.AnimationClip.findByName(animations, 'Idle')
    || THREE.AnimationClip.findByName(animations, 'idle')
    || animations[0] || null) : null;
  const walkClip = animations
    ? (THREE.AnimationClip.findByName(animations, 'Walk')
    || THREE.AnimationClip.findByName(animations, 'walk')
    || THREE.AnimationClip.findByName(animations, 'Run')
    || THREE.AnimationClip.findByName(animations, 'run')
    || null) : null;

  const agent = {
    chId, mesh, ring, homeX, homeZ,
    bounds,
    state: 'idle',
    timer: _randBetween(IDLE_MIN, IDLE_MAX),
    targetX: homeX, targetZ: homeZ,
    speed: WANDER_SPEED * _randBetween(0.7, 1.3),
    mixer, idleClip, walkClip,
    _activeAction: null,
    frozen: false,
  };
  _playAgentClip(agent, idleClip);
  _wanderAgents.push(agent);
  return agent;
}
```

### `_playAgentClip` — manual fade out/in (fragile)

```js
function _playAgentClip(agent, clip) {
  if (!agent.mixer || !clip) return;
  if (agent._activeAction) agent._activeAction.fadeOut(0.3);
  const action = agent.mixer.clipAction(clip);
  action.reset().fadeIn(0.3).play();
  agent._activeAction = action;
}
```

### `_tickWander` — switches clips at state transitions

```js
function _tickWander(agent, dt) {
  if (agent.frozen || (_dragTarget && _dragTarget.id === agent.chId)) return;
  agent.timer -= dt;

  if (agent.state === 'idle') {
    if (agent.timer <= 0) {
      // ...pick target...
      agent.state = 'walking';
      agent.timer = _randBetween(WALK_MIN, WALK_MAX);
      _playAgentClip(agent, agent.walkClip || agent.idleClip);   // <-- walk
    }
  } else {
    // ...move toward target...
    if (dist < 0.05 || agent.timer <= 0) {
      agent.state = 'idle';
      agent.timer = _randBetween(IDLE_MIN, IDLE_MAX);
      _playAgentClip(agent, agent.idleClip);                     // <-- idle
    } else {
      // ...move...
    }
  }
}
```

---

## Proposed Change — State-Based Animation with Crossfade

### 1. Replace `_playAgentClip` with a state-aware `_setAgentState`

Add a `_animState` field to the agent (distinct from the wander `state`), and a helper
that only switches clips when the animation state actually changes:

```js
function _setAgentState(agent, animState) {
  if (!agent.mixer) return;
  if (agent._animState === animState) return;   // no redundant switch

  const clip = animState === 'walk' ? (agent.walkClip || agent.idleClip) : agent.idleClip;
  if (!clip) return;

  const nextAction = agent.mixer.clipAction(clip);
  nextAction.reset();
  nextAction.enabled = true;
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  nextAction.play();

  if (agent._activeAction && agent._activeAction !== nextAction) {
    agent._activeAction.crossFadeTo(nextAction, 0.2, true);
  }

  agent._activeAction = nextAction;
  agent._animState = animState;
}
```

> **Why `crossFadeTo`?** It smoothly blends from the current clip to the next over
> `0.2s`, avoiding the hard snap of manual `fadeOut`/`fadeIn`. The `if (agent._animState === animState) return;`
> guard prevents restarting the same clip every frame.

### 2. Initialize the agent with `_animState: 'idle'`

In `_initWanderAgent`, add `_animState: 'idle'` to the agent object and call
`_setAgentState(agent, 'idle')` instead of `_playAgentClip(agent, idleClip)`:

```js
const agent = {
  chId, mesh, ring, homeX, homeZ,
  bounds,
  state: 'idle',
  _animState: 'idle',          // <-- new
  timer: _randBetween(IDLE_MIN, IDLE_MAX),
  targetX: homeX, targetZ: homeZ,
  speed: WANDER_SPEED * _randBetween(0.7, 1.3),
  mixer, idleClip, walkClip,
  _activeAction: null,
  frozen: false,
};
_setAgentState(agent, 'idle');   // <-- replaces _playAgentClip(agent, idleClip)
```

### 3. Update `_tickWander` to use `_setAgentState`

Replace the two `_playAgentClip` calls with `_setAgentState`:

```js
if (agent.state === 'idle') {
  if (agent.timer <= 0) {
    // ...pick target...
    agent.state = 'walking';
    agent.timer = _randBetween(WALK_MIN, WALK_MAX);
    _setAgentState(agent, 'walk');   // <-- walk while moving
  }
} else {
  // ...move toward target...
  if (dist < 0.05 || agent.timer <= 0) {
    agent.state = 'idle';
    agent.timer = _randBetween(IDLE_MIN, IDLE_MAX);
    _setAgentState(agent, 'idle');   // <-- idle when stopped
  } else {
    // ...move...
  }
}
```

### 4. Handle the "frozen" / drag case

When a character is frozen (edit mode) or being dragged, they should be idle. In
`_tickWander`, the early return currently skips everything. Add an idle state set there:

```js
function _tickWander(agent, dt) {
  if (agent.frozen || (_dragTarget && _dragTarget.id === agent.chId)) {
    _setAgentState(agent, 'idle');   // <-- ensure idle when frozen/dragged
    return;
  }
  agent.timer -= dt;
  // ...rest unchanged...
}
```

### 5. (Optional) Sync walk speed with movement

If the walk clip plays too fast or slow relative to `agent.speed`, you can set the
action's time scale to match the movement speed:

```js
// In _setAgentState, when animState === 'walk':
nextAction.setEffectiveTimeScale(agent.speed / WANDER_SPEED);
```

This makes the walk animation speed match the character's actual movement speed.

---

## Files to Touch

| File | Change |
|---|---|
| `scripts/room.js` | Replace `_playAgentClip` with `_setAgentState`. Add `_animState` to agent. Update `_initWanderAgent` and `_tickWander` call sites. Add idle state for frozen/drag. |

No other files need changes.

---

## Key Constraints

- **No backend, no install** — pure Three.js animation API, no new dependencies.
- **State-based** — only switch clips on actual state changes (no redundant restarts).
- **Smooth transitions** — use `crossFadeTo(0.2)` instead of manual fade out/in.
- **Backward compatible** — agents without a `walkClip` fall back to `idleClip` (they just stay idle).
- **Frozen/drag → idle** — characters show idle animation when frozen or dragged.
- **Optional speed sync** — walk clip time scale can match movement speed.

---

## Test Sequence

1. Open a room with a character that has both `Idle` and `Walk` clips in its GLB.
2. Watch the character wander. Confirm:
   - **Walk** clip plays while the character is moving.
   - **Idle** clip plays when the character stops.
   - Transitions are smooth (no snapping).
3. Enter **Move Objects** edit mode. Confirm the character switches to idle and stays idle.
4. Drag a character. Confirm it stays idle while being dragged.
5. Open a room with a character that has **only** an Idle clip (no Walk). Confirm it stays idle and doesn't error.
6. Leave the room running for 30+ seconds. Confirm the walk/idle switching stays correct through many wander cycles.

---

## Commit Message

`feat: state-based walk/idle animation for wander characters`