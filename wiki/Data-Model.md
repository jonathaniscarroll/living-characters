# Data Model

All data lives in a single JSON object in `localStorage['lc_data']` with three top-level arrays.

```json
{
  "rooms": [...],
  "characters": [...],
  "objects": [...]
}
```

---

## Room

```ts
{
  id: string,           // e.g. "room_1720000000000"
  name: string,
  lede: string,         // Short description shown in the room header
  lat: number,          // WGS-84 latitude
  lng: number,          // WGS-84 longitude
  radius: number,       // Proximity trigger radius in metres (default 30)
  backdrop: string,     // Key into BACKDROP_IMAGES / FLOOR_COLORS
  backdropData?: string,// base-64 data URL of uploaded backdrop image
  backdropUrl?: string, // Remote URL of backdrop image (from GitHub upload)
  cameraX: number,      // Three.js camera position X (default 9)
  cameraY: number,      // Three.js camera position Y (default 9)
  cameraZ: number       // Three.js camera position Z (default 9)
                        // Camera always looks at (0,0,0)
}
```

---

## Character

```ts
{
  id: string,           // e.g. "char_1720000000001"
  name: string,
  roomId: string,       // Primary room (legacy — kept for compatibility)
  roomIds: string[],    // All rooms this character inhabits
  mood: string,         // Label from MOODS array e.g. "Happy", "Sad"
  items: string[],      // Carried items e.g. ["small rock", "lucky leaf"]
  passages: Passage[],  // Dialogue tree
  photoData?: string,   // base-64 still photo
  animData?: string,    // base-64 GIF or animated image
  glbUrl?: string,      // Remote URL or base-64 GLB model
  sceneX?: number,      // Last dragged X position in Three.js scene
  sceneZ?: number       // Last dragged Z position in Three.js scene
}
```

### Passage

```ts
{
  type: string,   // Prompt key — must match a key in PROMPT_TYPES
  text: string    // What the character says
}
```

**Built-in prompt keys** (defined in `PROMPT_TYPES` in `main.js`):

| Key | Label shown to user |
|---|---|
| `hello` | Greeting |
| `question` | If you ask… |
| `secret` | Secret |
| `item` | About an item |

Adding new keys requires only a new entry in `PROMPT_TYPES` — see [Developer Reference](Developer-Reference.md).

---

## SceneObject

```ts
{
  id: string,           // e.g. "obj_1720000000002abc"
  roomId: string,       // Room this object belongs to
  name: string,
  desc: string,         // Description shown on tap
  glbUrl?: string,      // Remote URL or base-64 GLB model
  px: number,           // Floor X position (legacy)
  pz: number,           // Floor Z position (legacy)
  position?: { x, y, z }, // Full Three.js position (preferred)
  rotation?: { y },     // Y rotation in radians
  scale: number,        // Uniform scale multiplier
  interactable?: boolean// Whether tapping it triggers an inspect event
}
```

---

## MOODS

```js
[
  { label: 'Happy',    emoji: '😊', color: '#f5c842' },
  { label: 'Sad',      emoji: '😢', color: '#4a90d9' },
  { label: 'Angry',    emoji: '😠', color: '#e74c3c' },
  { label: 'Scared',   emoji: '😨', color: '#9b59b6' },
  { label: 'Curious',  emoji: '🤔', color: '#27ae60' },
  { label: 'Sleepy',   emoji: '😴', color: '#95a5a6' },
]
```

The `color` value is used for:
- The mood ring beneath the character in the 3-D scene
- The border of the character's map pin avatar
- The active border of the mood button in the character modal
- The fallback character mesh colour when no image or GLB is provided
