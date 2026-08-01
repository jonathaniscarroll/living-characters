// room.js — Three.js room scene, object/character placement, drag-to-move, wander AI

function showObjInspect(name, desc) {
  const el = document.getElementById('obj-inspect');
  document.getElementById('oi-name').textContent = name;
  document.getElementById('oi-desc').textContent = desc || '';
  el.classList.add('show');
  clearTimeout(window.objInspectTimeout);
  window.objInspectTimeout = setTimeout(() => el.classList.remove('show'), 3500);
}
function hideObjInspect() {
  clearTimeout(window.objInspectTimeout);
  document.getElementById('obj-inspect').classList.remove('show');
}

// ─────────────────────────────────────────────────────────────
// GLTFLoader wrapper that handles data: URLs reliably
// ─────────────────────────────────────────────────────────────
function loadGlbUrl(url, onLoad, onError) {
  if (!window.GLTFLoader) { if (onError) onError(new Error('GLTFLoader not ready')); return; }
  const loader = new window.GLTFLoader();
  if (url.startsWith('data:')) {
    try {
      const base64 = url.split(',')[1];
      const binary = atob(base64);
      const buf = new ArrayBuffer(binary.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
      loader.parse(buf, '', onLoad, onError);
    } catch (e) { if (onError) onError(e); }
  } else {
    loader.load(url, onLoad, undefined, onError);
  }
}

// ─────────────────────────────────────────────────────────────
// Backdrop image map
// ─────────────────────────────────────────────────────────────
const ROOM_BACKDROP_FILES = {
  grass:  './media/garden.png',
  forest: './media/garden.png',
  wood:   './media/room2.png',
  stone:  './media/room2.png',
};

function applyRoomBackdrop(room) {
  const stage = document.getElementById('room-stage');
  if (!stage) return;
  const uploadedSrc = room.backdropData || room.backdropUrl || null;
  if (uploadedSrc) {
    stage.style.cssText += [
      `background-image:url('${uploadedSrc}')`,
      'background-size:cover',
      'background-position:center',
    ].join(';');
    return;
  }
  const bgFile = ROOM_BACKDROP_FILES[room.backdrop];
  if (bgFile) {
    stage.style.backgroundImage    = `url('${bgFile}')`;
    stage.style.backgroundSize     = 'cover';
    stage.style.backgroundPosition = 'center';
    stage.style.backgroundColor    = '';
    return;
  }
  stage.style.backgroundImage = '';
  stage.style.background = FLOOR_COLORS[room.backdrop] || '#1a1a2e';
}

function openRoom(roomId) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;
  activeRoomId = roomId;
  document.getElementById('room-title').textContent = room.name;
  document.getElementById('room-lede').textContent = room.lede || '';
  applyRoomBackdrop(room);
  document.getElementById('room-view').classList.add('open');

  let attempts = 0;
  function tryBuild() {
    if (window.THREE && window.GLTFLoader) {
      setTimeout(() => buildRoomScene(room), 360);
    } else if (attempts++ < 20) {
      setTimeout(tryBuild, 250);
    } else {
      console.warn('3D viewer failed to load after timeout.');
    }
  }
  tryBuild();
}

function closeRoom() {
  closeTalkPanel();
  hideObjInspect();
  dismissTalkCloseUp();
  document.getElementById('room-view').classList.remove('open');
  destroyRoomScene();
  activeRoomId = null;
  const stage = document.getElementById('room-stage');
  stage.style.backgroundImage = '';
  stage.style.background = '';
}

// ─────────────────────────────────────────────────────────────
// TALK CLOSE-UP
// ─────────────────────────────────────────────────────────────
let _talkCloseUpRenderer = null;
let _talkCloseUpFrameId  = null;
let _talkCloseUpMixers   = [];

function spawnTalkCloseUp(ch) {
  dismissTalkCloseUp();
  const glbUrl = ch.glbUrl || ch.animData || ch.photoData || null;
  if (!glbUrl) return;

  const activeRoom = rooms.find(r => r.id === activeRoomId);
  const roomZoom   = activeRoom?.cameraZoom ?? 2;
  const closeUpZoom = Math.min(3.5, Math.max(1.5, roomZoom));

  const overlay = document.createElement('div');
  overlay.id = 'talk-closeup-overlay';
  overlay.style.cssText = [
    'position:absolute;inset:0;z-index:45;pointer-events:none;',
    'display:flex;align-items:flex-end;justify-content:flex-start;',
    'padding:0 0 80px 24px;'
  ].join('');

  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 300;
  canvas.style.cssText = 'width:200px;height:300px;border-radius:16px;filter:drop-shadow(0 4px 24px #000a);';
  overlay.appendChild(canvas);
  document.getElementById('room-stage').appendChild(overlay);

  const scene = new THREE.Scene();
  scene.background = null;
  const cam = new THREE.OrthographicCamera(45, 200 / 300, 0.1, 100);
  cam.position.set(0, 1.2, 3.5);
  cam.lookAt(0, 0.8, 0);
  cam.zoom = closeUpZoom;
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8);
  dl.position.set(2, 5, 3);
  scene.add(dl);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(200, 300);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  _talkCloseUpRenderer = renderer;
  _talkCloseUpMixers = [];

  if (glbUrl.startsWith('data:image') || glbUrl.match(/\.(gif|png|jpe?g)$/i)) {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const tex = loader.load(glbUrl);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(1.6, 2.4, 1);
    sprite.position.set(0, 1.2, 0);
    scene.add(sprite);
  } else {
    loadGlbUrl(glbUrl, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3(); box.getSize(size);
      const sc = 2 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(sc);
      const center = new THREE.Vector3(); box.getCenter(center);
      model.position.set(-center.x * sc, -center.y * sc + 0.1, -center.z * sc);
      model.rotation.y = Math.PI;
      scene.add(model);
      if (gltf.animations?.length) {
        const mixer = new THREE.AnimationMixer(model);
        const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
        mixer.clipAction(clip).play();
        _talkCloseUpMixers.push(mixer);
      }
    });
  }

  const clock = new THREE.Clock();
  function animate() {
    _talkCloseUpFrameId = requestAnimationFrame(animate);
    _talkCloseUpMixers.forEach(m => m.update(clock.getDelta()));
    renderer.render(scene, cam);
  }
  animate();
}

function dismissTalkCloseUp() {
  if (_talkCloseUpFrameId) { cancelAnimationFrame(_talkCloseUpFrameId); _talkCloseUpFrameId = null; }
  if (_talkCloseUpRenderer) { _talkCloseUpRenderer.dispose(); _talkCloseUpRenderer = null; }
  _talkCloseUpMixers = [];
  const el = document.getElementById('talk-closeup-overlay');
  if (el) el.remove();
}

// ─────────────────────────────────────────────────────────────
// DRAG-TO-MOVE state (objects AND characters)
// ─────────────────────────────────────────────────────────────
let _dragTarget   = null;
let _roomEditMode = false;
let _lastRoomPointer = null;

function enableRoomEdit() {
  _roomEditMode = !_roomEditMode;
  const btn = document.querySelector('.room-tbtn.move-obj');
  if (btn) {
    btn.style.background = _roomEditMode ? '#7a3090' : '';
    btn.textContent = _roomEditMode ? '\u2705 Done Moving' : 'Move Objects';
  }
  if (!_roomEditMode) {
    if (_dragTarget) _commitDrag(_dragTarget);
    _dragTarget = null;
    _wanderAgents.forEach(agent => { agent.frozen = false; });
  } else {
    _wanderAgents.forEach(agent => { agent.frozen = true; });
  }
}

function _commitDrag(target) {
  const pos = target.mesh.position;
  if (target.type === 'obj') {
    const obj = objects.find(o => o.id === target.id);
    if (obj) {
      obj.px = pos.x; obj.pz = pos.z;
      obj.position = { x: pos.x, y: pos.y, z: pos.z };
    }
  } else {
    const ch = characters.find(c => c.id === target.id);
    if (ch) { ch.sceneX = pos.x; ch.sceneZ = pos.z; }
    const agent = _wanderAgents.find(a => a.chId === target.id);
    if (agent) {
      agent.homeX = pos.x; agent.homeZ = pos.z;
      agent.targetX = pos.x; agent.targetZ = pos.z;
      agent.state = 'idle';
    }
    if (target.ring) { target.ring.position.x = pos.x; target.ring.position.z = pos.z; }
  }
  save();
}

function _screenToFloor(e, renderer, camera) {
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width)  * 2 - 1,
    -((clientY - rect.top)  / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  ray.ray.intersectPlane(plane, point);
  return point;
}

function onRoomObjectClick(e) {
  if (!_roomEditMode || !threeScene || !activeRoomId) return;
  const rect = threeRenderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width)  * 2 - 1,
    -((clientY - rect.top)  / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, threeCamera);

  if (_dragTarget) {
    const point = _screenToFloor(e, threeRenderer, threeCamera);
    if (point) {
      _dragTarget.mesh.position.set(point.x, _dragTarget.floorY, point.z);
      if (_dragTarget.ring) { _dragTarget.ring.position.x = point.x; _dragTarget.ring.position.z = point.z; }
    }
    _commitDrag(_dragTarget);
    _dragTarget = null;
    if (threeRenderer) threeRenderer.domElement.style.cursor = 'crosshair';
    return;
  }

  const pickable = [];
  threeScene.traverse(c => { if (c.isMesh && (c._objId || c._charId)) pickable.push(c); });
  const hits = ray.intersectObjects(pickable, false);
  if (hits.length) {
    const h = hits[0].object;
    const id   = h._objId || h._charId;
    const type = h._objId ? 'obj' : 'char';
    let mesh = h;
    while (mesh.parent && !mesh.parent.isScene) mesh = mesh.parent;
    let ring = null;
    if (type === 'char') {
      threeScene.traverse(c => { if (c._moodRingCharId === id) ring = c; });
    }
    _dragTarget = { type, id, mesh, ring, floorY: mesh.position.y };
    if (threeRenderer) threeRenderer.domElement.style.cursor = 'grabbing';
  }
}

// ─────────────────────────────────────────────────────────────
// WANDER AI
// ─────────────────────────────────────────────────────────────
const WANDER_RADIUS = 3.5;
const WANDER_SPEED  = 0.8;
const IDLE_MIN = 2, IDLE_MAX = 6;
const WALK_MIN = 1.5, WALK_MAX = 4;

let _wanderAgents = [];

function _randBetween(a, b) { return a + Math.random() * (b - a); }

function _initWanderAgent(chId, mesh, ring, homeX, homeZ, mixer, animations) {
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

function _playAgentClip(agent, clip) {
  if (!agent.mixer || !clip) return;
  if (agent._activeAction) agent._activeAction.fadeOut(0.3);
  const action = agent.mixer.clipAction(clip);
  action.reset().fadeIn(0.3).play();
  agent._activeAction = action;
}

function _tickWander(agent, dt) {
  if (agent.frozen || (_dragTarget && _dragTarget.id === agent.chId)) return;
  agent.timer -= dt;

  if (agent.state === 'idle') {
    if (agent.timer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = _randBetween(1, WANDER_RADIUS);
      agent.targetX = agent.homeX + Math.cos(angle) * dist;
      agent.targetZ = agent.homeZ + Math.sin(angle) * dist;
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
      const nx = agent.mesh.position.x + (dx / dist) * step;
      const nz = agent.mesh.position.z + (dz / dist) * step;
      agent.mesh.position.x = nx;
      agent.mesh.position.z = nz;
      agent.mesh.rotation.y = Math.atan2(dx, dz);
      if (agent.ring) { agent.ring.position.x = nx; agent.ring.position.z = nz; }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// SPRITE BILLBOARD STATE
// Map<charId, { animator, texture, mesh }>
// ─────────────────────────────────────────────────────────────
const _spriteMap = new Map();

function _buildCharSprite(ch, cx, cz, scene) {
  const THREE = window.THREE;
  const fallbackSrc = ch.animData || ch.photoData || null;
  const hasAnimator  = window.SpriteAnimator && (ch.sprites || fallbackSrc);

  let mesh;

  if (hasAnimator) {
    const animator = new window.SpriteAnimator(ch.sprites || null, fallbackSrc);
    const texture  = new THREE.Texture();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    texture.image = img;
    texture.image.onload = () => { texture.needsUpdate = true; };
    const firstFrame = animator.currentFrame();
    if (firstFrame) texture.image.src = firstFrame;

    const geo = new THREE.PlaneGeometry(1.0, 1.6);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0.8, cz);
    mesh._charId = ch.id;
    scene.add(mesh);

    _spriteMap.set(ch.id, { animator, texture, mesh });
  } else {
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const geo  = new THREE.PlaneGeometry(1.0, 1.6);
    const mat  = new THREE.MeshBasicMaterial({ color: mood.color, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0.8, cz);
    mesh._charId = ch.id;
    scene.add(mesh);
    _spriteMap.set(ch.id, { animator: null, texture: null, mesh });
  }

  return mesh;
}

function _tickAllSprites(deltaMs, camera) {
  _spriteMap.forEach(({ animator, texture, mesh }) => {
    if (animator && texture) {
      const frame = animator.tick(deltaMs);
      if (frame !== null) {
        texture.image.src = frame;
      }
    }
    if (mesh && camera) mesh.lookAt(camera.position);
  });
}

function setRoomCharacterState(chId, state) {
  const entry = _spriteMap.get(chId);
  if (entry && entry.animator) entry.animator.setState(state);
}

function _destroyAllSprites() {
  _spriteMap.forEach(({ texture }) => {
    if (texture) { try { texture.dispose(); } catch (_) {} }
  });
  _spriteMap.clear();
}

// ─────────────────────────────────────────────────────────────
// BUILD ROOM SCENE
// ─────────────────────────────────────────────────────────────
function buildRoomScene(room) {
  destroyRoomScene();
  _wanderAgents = [];

  applyRoomBackdrop(room);

  const stage = document.getElementById('room-stage');
  const W = stage.clientWidth  || window.innerWidth;
  const H = stage.clientHeight || (window.innerHeight - 86 - 44);

  const scene = new THREE.Scene();
  scene.background = null;
  const aspect   = W / H;
  const viewSize = 10;
  const camera   = new THREE.OrthographicCamera(
    -viewSize * aspect / 2, viewSize * aspect / 2,
     viewSize / 2, -viewSize / 2, 1, 1000
  );

  const camX = room.cameraX ?? 9;
  const camY = room.cameraY ?? 9;
  const camZ = room.cameraZ ?? 9;
  camera.position.set(camX, camY, camZ);
  camera.zoom = Math.min(5, Math.max(0.5, room.cameraZoom ?? 2));
  camera.lookAt(
    room.cameraTargetX ?? 0,
    room.cameraTargetY ?? 0,
    room.cameraTargetZ ?? 0
  );
  camera.updateProjectionMatrix();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);

  stage.insertBefore(renderer.domElement, stage.firstChild);

  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7);
  dl.position.set(5, 12, 5); dl.castShadow = true;
  scene.add(dl);

  glbMixers = [];
  const clock = new THREE.Clock();
  const labels = [];
  const charObjects = [];

  // ── Objects ──
  const objsInRoom = objects.filter(o => o.roomId === room.id);
  objsInRoom.forEach(obj => {
    const px = obj.position?.x ?? obj.px ?? 0;
    const pz = obj.position?.z ?? obj.pz ?? 0;
    const ry = obj.rotation?.y ?? 0;
    const sc = obj.scale || 1;

    function placeObjMesh(model, autoScale) {
      const s = autoScale || 1;
      model.scale.setScalar(sc * s);
      const bbox2 = new THREE.Box3().setFromObject(model);
      const floorY = -bbox2.min.y;
      model.position.set(px, floorY, pz);
      model.rotation.y = ry;
      model.castShadow = true;
      model._objId = obj.id;
      scene.add(model);
      model.traverse(c => { if (c.isMesh) c._objId = obj.id; });
      const lbl = document.createElement('div');
      lbl.className = 'obj-label';
      lbl.textContent = '\uD83D\uDCE6 ' + obj.name;
      stage.appendChild(lbl);
      const bbox3 = new THREE.Box3().setFromObject(model);
      labels.push({ label: lbl, obj: model, headY: bbox3.max.y + 0.2 });
    }

    if (obj.glbUrl) {
      loadGlbUrl(obj.glbUrl, gltf => {
        const model = gltf.scene;
        const b = new THREE.Box3().setFromObject(model);
        const s = new THREE.Vector3(); b.getSize(s);
        placeObjMesh(model, 1.2 / Math.max(s.x, s.y, s.z));
        if (gltf.animations?.length) {
          const mx = new THREE.AnimationMixer(model);
          mx.clipAction(gltf.animations[0]).play();
          glbMixers.push(mx);
        }
      }, () => fallbackObjBox());
    } else { fallbackObjBox(); }

    function fallbackObjBox() {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.6, 0.6),
        new THREE.MeshLambertMaterial({ color: 0x8b6914 })
      );
      mesh.position.set(px, 0.3, pz);
      mesh.castShadow = true;
      mesh._objId = obj.id;
      scene.add(mesh);
      mesh.traverse(c => { if (c.isMesh) c._objId = obj.id; });
      const lbl = document.createElement('div');
      lbl.className = 'obj-label';
      lbl.textContent = '\uD83D\uDCE6 ' + obj.name;
      stage.appendChild(lbl);
      labels.push({ label: lbl, obj: mesh, headY: 0.6 + 0.2 });
    }
  });

  const panel = document.getElementById('obj-list-panel');
  const listC = document.getElementById('obj-list-container');
  listC.innerHTML = '';
  if (!objsInRoom.length) { panel.classList.remove('show'); }
  else {
    panel.classList.add('show');
    objsInRoom.forEach(o => {
      const row = document.createElement('div');
      row.className = 'obj-list-row';
      row.innerHTML = `<div class="obj-list-name">${o.name}</div><button class="obj-list-edit" onclick="openObjModal('${o.id}')">\u270F\uFE0F</button>`;
      listC.appendChild(row);
    });
  }

  // ── Characters (sprite billboard) ──
  // Keep charsInRoom in scope here and pass it into handleRoomTap
  const charsInRoom = characters.filter(c => (c.roomIds || [c.roomId]).includes(room.id));
  charsInRoom.forEach((ch) => {
    const hasStoredPos = ch.sceneX != null && ch.sceneZ != null;
    const cx = hasStoredPos ? ch.sceneX : 0;
    const cz = hasStoredPos ? ch.sceneZ : 0;
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: mood.color, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.01, cz);
    ring._moodRingCharId = ch.id;
    scene.add(ring);

    const mesh = _buildCharSprite(ch, cx, cz, scene);
    charObjects.push({ obj: mesh, chId: ch.id, cx, cz });
    _initWanderAgent(ch.id, mesh, ring, cx, cz, null, null);

    const lbl = document.createElement('div');
    lbl.className = 'char-label';
    lbl.textContent = ch.name;
    stage.appendChild(lbl);
    labels.push({ label: lbl, obj: mesh, headY: 1.6 + 0.1 });
  });

  threeScene    = scene;
  threeRenderer = renderer;
  threeCamera   = camera;

  function updateLabels() {
    labels.forEach(({ label, obj, headY }) => {
      const pos = obj.position.clone();
      pos.y = headY;
      pos.project(camera);
      label.style.left = ((pos.x *  0.5 + 0.5) * W) + 'px';
      label.style.top  = ((-pos.y * 0.5 + 0.5) * H) + 'px';
    });
  }

  function animate() {
    threeAnimFrameId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    glbMixers.forEach(m => m.update(dt));
    _wanderAgents.forEach(agent => _tickWander(agent, dt));
    _tickAllSprites(dt * 1000, camera);
    if (_roomEditMode && _dragTarget && _lastRoomPointer) {
      const point = _screenToFloor(_lastRoomPointer, renderer, camera);
      if (point) {
        _dragTarget.mesh.position.set(point.x, _dragTarget.floorY, point.z);
        if (_dragTarget.ring) { _dragTarget.ring.position.x = point.x; _dragTarget.ring.position.z = point.z; }
      }
    }
    renderer.render(scene, camera);
    updateLabels();
  }
  animate();

  const dom = renderer.domElement;
  dom.addEventListener('mousemove', e => { _lastRoomPointer = e; }, { passive: true });
  dom.addEventListener('touchmove', e => { _lastRoomPointer = e; e.preventDefault(); }, { passive: false });
  // Pass charsInRoom into handleRoomTap so it is in scope
  dom.addEventListener('click', e => {
    if (_roomEditMode) { onRoomObjectClick(e); return; }
    handleRoomTap(e, renderer, camera, charObjects, charsInRoom);
  });
  dom.addEventListener('touchend', e => {
    if (_roomEditMode && e.changedTouches?.length) {
      onRoomObjectClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
    }
  }, { passive: true });
}

// charsInRoom is now received as a parameter instead of being
// captured from the outer buildRoomScene closure (which caused
// "charsInRoom is not defined" when called as a standalone fn).
function handleRoomTap(e, renderer, camera, charObjects, charsInRoom) {
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width)  * 2 - 1,
    -((clientY - rect.top)  / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, camera);

  const objMeshes = [];
  threeScene.traverse(c => { if (c.isMesh && c._objId) objMeshes.push(c); });
  if (objMeshes.length) {
    const hits = ray.intersectObjects(objMeshes, false);
    if (hits.length) {
      const hitObj = objects.find(o => o.id === hits[0].object._objId);
      if (hitObj) { showObjInspect(hitObj.name, hitObj.desc || hitObj.description); return; }
    }
  }

  const charMeshes = [];
  charObjects.forEach(({ obj }) => obj.traverse
    ? obj.traverse(c => { if (c.isMesh) charMeshes.push(c); })
    : charMeshes.push(obj)
  );
  if (!charMeshes.length) return;
  const hits = ray.intersectObjects(charMeshes, false);
  if (hits.length) {
    const hitPos = hits[0].object.getWorldPosition(new THREE.Vector3());
    let closest = null, minD = Infinity;
    charObjects.forEach(({ chId, obj }) => {
      const d = obj.position.distanceTo(hitPos);
      if (d < minD) { minD = d; closest = chId; }
    });
    if (closest && minD < 3) {
      const ch = characters.find(c => c.id === closest);
      if (ch) {
        (charsInRoom || []).forEach(c => setRoomCharacterState(c.id, 'idle'));
        setRoomCharacterState(closest, 'talk');
        openTalkPanel(ch);
        spawnTalkCloseUp(ch);
      }
    }
  }
}

function destroyRoomScene() {
  if (threeAnimFrameId) { cancelAnimationFrame(threeAnimFrameId); threeAnimFrameId = null; }
  if (threeRenderer) {
    threeRenderer.dispose();
    const c = threeRenderer.domElement;
    if (c.parentNode) c.parentNode.removeChild(c);
    threeRenderer = null;
  }
  document.getElementById('room-stage').querySelectorAll('.char-label,.obj-label').forEach(el => el.remove());
  glbMixers = [];
  _wanderAgents = [];
  _dragTarget = null;
  _roomEditMode = false;
  threeScene = null;
  threeCamera = null;
  _destroyAllSprites();
}

function editActiveRoom() {
  if (!activeRoomId) return;
  openRoomModal(activeRoomId);
}

function openObjModal(objId) {
  editingObjId = objId;
  const overlay = document.getElementById('obj-modal-overlay');
  if (objId) {
    const obj = objects.find(o => o.id === objId);
    document.getElementById('obj-modal-title').textContent = 'Edit Object';
    document.getElementById('of-name').value  = obj.name;
    document.getElementById('of-desc').value  = obj.desc || '';
    document.getElementById('of-glb').value   = obj.glbUrl && !obj.glbUrl.startsWith('data:') ? obj.glbUrl : '';
    document.getElementById('of-px').value    = obj.px || 0;
    document.getElementById('of-pz').value    = obj.pz || 0;
    document.getElementById('of-scale').value = obj.scale || 1;
    document.getElementById('of-delete').style.display = 'block';
    window._editingObjGlbData = obj.glbUrl?.startsWith('data:') ? obj.glbUrl : null;
  } else {
    document.getElementById('obj-modal-title').textContent = 'Add Object';
    ['of-name','of-desc','of-glb'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('of-px').value    = '0';
    document.getElementById('of-pz').value    = '0';
    document.getElementById('of-scale').value = '1';
    document.getElementById('of-delete').style.display = 'none';
    window._editingObjGlbData = null;
  }
  overlay.classList.add('open');
}

function closeObjModal() {
  document.getElementById('obj-modal-overlay').classList.remove('open');
  editingObjId = null;
  window._editingObjGlbData = null;
}

function saveObject() {
  const name = document.getElementById('of-name').value.trim();
  if (!name) return alert('Needs a name');
  if (!activeRoomId) return alert('Open a room first to add an object.');
  const glbUrl = window._editingObjGlbData || window.tempObjectGlbData || document.getElementById('of-glb').value.trim();
  const existing = editingObjId ? objects.find(o => o.id === editingObjId) : null;
  const obj = {
    id: editingObjId || ('obj_' + Date.now() + Math.random().toString(36).substr(2, 5)),
    roomId: activeRoomId, name,
    desc:  document.getElementById('of-desc').value.trim(),
    glbUrl,
    px:    parseFloat(document.getElementById('of-px').value)    || 0,
    pz:    parseFloat(document.getElementById('of-pz').value)    || 0,
    scale: parseFloat(document.getElementById('of-scale').value) || 1,
    position: existing?.position || null,
    rotation: existing?.rotation || null
  };
  if (editingObjId) objects = objects.map(o => o.id === editingObjId ? obj : o);
  else objects.push(obj);
  save(); closeObjModal(); renderMapPins();
  const room = rooms.find(r => r.id === activeRoomId);
  if (room) buildRoomScene(room);
}

function deleteObject() {
  if (!editingObjId || !confirm('Remove object?')) return;
  objects = objects.filter(o => o.id !== editingObjId);
  save(); closeObjModal(); renderMapPins();
  const room = rooms.find(r => r.id === activeRoomId);
  if (room) buildRoomScene(room);
}

window.lcRoom = {
  openRoom, closeRoom, buildRoomScene, destroyRoomScene, applyRoomBackdrop,
  editActiveRoom, openObjModal, closeObjModal, saveObject, deleteObject,
  showObjInspect, hideObjInspect, enableRoomEdit, onRoomObjectClick,
  spawnTalkCloseUp, dismissTalkCloseUp, setRoomCharacterState,
};

export {
  openRoom, closeRoom, buildRoomScene, destroyRoomScene, applyRoomBackdrop,
  editActiveRoom, openObjModal, closeObjModal, saveObject, deleteObject,
  showObjInspect, hideObjInspect, enableRoomEdit, onRoomObjectClick,
  spawnTalkCloseUp, dismissTalkCloseUp, setRoomCharacterState,
};
