// room.js — Three.js room scene, object/character placement, drag-to-move, talk-close-up

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

function openRoom(roomId) {
  const room = rooms.find(r => r.id === roomId);
  if (!room) return;
  activeRoomId = roomId;
  document.getElementById('room-title').textContent = room.name;
  document.getElementById('room-lede').textContent = room.lede || '';
  const stage = document.getElementById('room-stage');
  const backdropSrc = room.backdropData || room.backdropUrl || null;
  if (backdropSrc) {
    stage.style.backgroundImage = `url('${backdropSrc}')`;
    stage.style.backgroundSize = 'cover';
    stage.style.backgroundPosition = 'center';
  } else {
    const bgFile = BACKDROP_IMAGES[room.backdrop];
    if (bgFile) {
      stage.style.backgroundImage = `url('${MEDIA_URL}${bgFile}')`;
      stage.style.backgroundSize = 'cover';
      stage.style.backgroundPosition = 'center';
    } else {
      stage.style.backgroundImage = '';
      stage.style.background = FLOOR_COLORS[room.backdrop] || '#1a1a2e';
    }
  }
  document.getElementById('room-view').classList.add('open');
  if (!window.THREE || !window.GLTFLoader) { console.warn('3D viewer still loading.'); return; }
  setTimeout(() => buildRoomScene(room), 360);
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
// TALK CLOSE-UP: spawn a character's GLB right in front of camera
// ─────────────────────────────────────────────────────────────
let _talkCloseUpRenderer = null;
let _talkCloseUpFrameId = null;
let _talkCloseUpMixers = [];

function spawnTalkCloseUp(ch) {
  dismissTalkCloseUp();
  const glbUrl = ch.glbUrl || ch.animData || ch.photoData || null;
  if (!glbUrl) return;

  // Overlay container
  const overlay = document.createElement('div');
  overlay.id = 'talk-closeup-overlay';
  overlay.style.cssText = [
    'position:absolute;inset:0;z-index:45;pointer-events:none;',
    'display:flex;align-items:flex-end;justify-content:flex-start;',
    'padding:0 0 80px 24px;'
  ].join('');

  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 300;
  canvas.style.cssText = 'width:200px;height:300px;border-radius:16px;filter:drop-shadow(0 4px 24px #000a);';
  overlay.appendChild(canvas);
  document.getElementById('room-stage').appendChild(overlay);

  const scene = new THREE.Scene();
  scene.background = null;
  const cam = new THREE.PerspectiveCamera(45, 200 / 300, 0.1, 100);
  cam.position.set(0, 1.2, 3.5);
  cam.lookAt(0, 1, 0);
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
    // sprite fallback for photo/gif chars
    const tex = new THREE.TextureLoader().load(glbUrl);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sprite.scale.set(1.6, 2.4, 1);
    sprite.position.set(0, 1.2, 0);
    scene.add(sprite);
  } else if (window.GLTFLoader) {
    const loader = new window.GLTFLoader();
    loader.load(glbUrl, gltf => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const sc = 2 / Math.max(size.x, size.y, size.z);
      model.scale.setScalar(sc);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.set(-center.x * sc, -center.y * sc + 0.1, -center.z * sc);
      model.rotation.y = Math.PI;
      scene.add(model);
      if (gltf.animations && gltf.animations.length) {
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
// DRAG-TO-MOVE state
// ─────────────────────────────────────────────────────────────
let _dragTarget = null;   // { type:'obj'|'char', id, mesh, origY }
let _roomEditMode = false;

function enableRoomEdit() {
  _roomEditMode = !_roomEditMode;
  const btn = document.querySelector('.room-tbtn.move-obj');
  if (btn) {
    btn.style.background = _roomEditMode ? '#7a3090' : '';
    btn.textContent = _roomEditMode ? '✅ Done Moving' : 'Move Objects';
  }
  if (!_roomEditMode) _dragTarget = null;
}
window.roomEditMode = false; // kept for compat — actual state is _roomEditMode

function _screenToFloor(e, renderer, camera) {
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
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
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, threeCamera);

  if (_dragTarget) {
    // Drop: place at floor intersection
    const point = _screenToFloor(e, threeRenderer, threeCamera);
    if (point) {
      _dragTarget.mesh.position.set(point.x, _dragTarget.origY, point.z);
      if (_dragTarget.type === 'obj') {
        const obj = objects.find(o => o.id === _dragTarget.id);
        if (obj) { obj.px = point.x; obj.pz = point.z; obj.position = { x: point.x, y: _dragTarget.origY, z: point.z }; }
      } else {
        const ch = characters.find(c => c.id === _dragTarget.id);
        if (ch) { ch.sceneX = point.x; ch.sceneZ = point.z; }
      }
      save();
    }
    _dragTarget = null;
    if (threeRenderer) threeRenderer.domElement.style.cursor = 'crosshair';
    return;
  }

  // Pick: find clicked object or character
  const pickable = [];
  threeScene.traverse(c => { if (c.isMesh && (c._objId || c._charId)) pickable.push(c); });
  const hits = ray.intersectObjects(pickable, false);
  if (hits.length) {
    const h = hits[0].object;
    const mesh = h.parent && h.parent._objId ? h.parent : h.parent && h.parent._charId ? h.parent : h;
    const id = mesh._objId || h._objId || mesh._charId || h._charId;
    const type = (mesh._objId || h._objId) ? 'obj' : 'char';
    _dragTarget = { type, id, mesh, origY: mesh.position.y };
    if (threeRenderer) threeRenderer.domElement.style.cursor = 'grabbing';
  }
}

// ─────────────────────────────────────────────────────────────
// BUILD ROOM SCENE
// ─────────────────────────────────────────────────────────────
function buildRoomScene(room) {
  destroyRoomScene();
  const stage = document.getElementById('room-stage');
  const W = stage.clientWidth || window.innerWidth;
  const H = stage.clientHeight || (window.innerHeight - 86 - 44);

  const scene = new THREE.Scene();
  scene.background = null;
  const aspect = W / H;
  const viewSize = 10;
  const camera = new THREE.OrthographicCamera(
    -viewSize * aspect / 2, viewSize * aspect / 2,
    viewSize / 2, -viewSize / 2, 1, 1000
  );
  camera.position.set(9, 9, 9);
  camera.lookAt(0, 1, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);
  stage.appendChild(renderer.domElement);

  const hasBg = !!(room.backdropData || room.backdropUrl || BACKDROP_IMAGES[room.backdrop]);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshLambertMaterial({ color: FLOOR_COLORS[room.backdrop] || '#1a3a1a', transparent: hasBg, opacity: hasBg ? 0.18 : 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  if (!hasBg) {
    const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLORS[room.backdrop] || '#2d5a27' });
    const wN = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 0.2), wallMat);
    wN.position.set(0, 3, -8); scene.add(wN);
    const wW = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 20), wallMat);
    wW.position.set(-8, 3, 0); scene.add(wW);
  }

  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7);
  dl.position.set(5, 12, 5);
  dl.castShadow = true;
  scene.add(dl);

  glbMixers = [];
  const clock = new THREE.Clock();
  const labels = [];
  const charObjects = [];  // { obj, chId, cx, cz }

  // ── Objects ──
  const objsInRoom = objects.filter(o => o.roomId === room.id);
  objsInRoom.forEach(obj => {
    const px = obj.position?.x ?? obj.px ?? 0;
    const py = obj.position?.y ?? 0;
    const pz = obj.position?.z ?? obj.pz ?? 0;
    const ry = obj.rotation?.y ?? 0;
    const sc = obj.scale || 1;

    function placeObjMesh(model, autoScale) {
      model.scale.setScalar(sc * (autoScale || 1));
      model.position.set(px, py, pz);
      model.rotation.y = ry;
      model.castShadow = true;
      model._objId = obj.id;
      scene.add(model);
      model.traverse(child => { if (child.isMesh) child._objId = obj.id; });
      const lbl = document.createElement('div');
      lbl.className = 'obj-label';
      lbl.textContent = '📦 ' + obj.name;
      stage.appendChild(lbl);
      labels.push({ label: lbl, obj: model, headY: py + sc * (autoScale || 1) + 0.2 });
    }

    if (obj.glbUrl && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      loader.load(obj.glbUrl, gltf => {
        const model = gltf.scene;
        const box3 = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3(); box3.getSize(size);
        const autoScale = 1.2 / Math.max(size.x, size.y, size.z);
        placeObjMesh(model, autoScale);
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          glbMixers.push(mixer);
        }
      }, undefined, () => fallbackObjBox());
    } else { fallbackObjBox(); }

    function fallbackObjBox() {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
      placeObjMesh(mesh, 1);
    }
  });

  // Object list panel
  const panel = document.getElementById('obj-list-panel');
  const listC = document.getElementById('obj-list-container');
  listC.innerHTML = '';
  if (!objsInRoom.length) { panel.classList.remove('show'); }
  else {
    panel.classList.add('show');
    objsInRoom.forEach(o => {
      const row = document.createElement('div');
      row.className = 'obj-list-row';
      row.innerHTML = `<div class="obj-list-name">${o.name}</div><button class="obj-list-edit" onclick="openObjModal('${o.id}')">✏️</button>`;
      listC.appendChild(row);
    });
  }

  // ── Characters ──
  const charsInRoom = characters.filter(c => (c.roomIds || [c.roomId]).includes(room.id));
  charsInRoom.forEach((ch, i) => {
    const angle = (i / Math.max(charsInRoom.length, 1)) * Math.PI * 1.2 - 0.6;
    // Use saved sceneX/sceneZ if available, otherwise spread by angle
    const cx = ch.sceneX ?? Math.cos(angle) * 3.5;
    const cz = ch.sceneZ ?? Math.sin(angle) * 3.5;
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.7, 32),
      new THREE.MeshBasicMaterial({ color: mood.color, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.01, cz);
    ring._moodRingCharId = ch.id;
    scene.add(ring);

    if (ch.glbUrl && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      loader.load(ch.glbUrl, gltf => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3(); box.getSize(size);
        const scale = 2 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        model.position.set(cx, 0, cz);
        model.rotation.y = Math.PI;
        model.castShadow = true;
        model._charId = ch.id;
        scene.add(model);
        model.traverse(child => { if (child.isMesh) child._charId = ch.id; });
        charObjects.push({ obj: model, chId: ch.id, cx, cz });
        if (gltf.animations?.length) {
          const mixer = new THREE.AnimationMixer(model);
          const clip = THREE.AnimationClip.findByName(gltf.animations, 'Idle') || gltf.animations[0];
          mixer.clipAction(clip).play();
          glbMixers.push(mixer);
        }
        const label = document.createElement('div');
        label.className = 'char-label';
        label.textContent = ch.name;
        stage.appendChild(label);
        labels.push({ label, obj: model, headY: size.y * scale + 0.3 });
      }, undefined, () => fallbackChar());
    } else if (ch.photoData || ch.animData) {
      const tex = new THREE.TextureLoader().load(ch.animData || ch.photoData);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(1.8, 1.8, 1);
      sprite.position.set(cx, 1.1, cz);
      sprite._charId = ch.id;
      scene.add(sprite);
      charObjects.push({ obj: sprite, chId: ch.id, cx, cz });
      const label = document.createElement('div');
      label.className = 'char-label'; label.textContent = ch.name;
      stage.appendChild(label);
      labels.push({ label, obj: sprite, headY: 2.1 });
    } else { fallbackChar(); }

    function fallbackChar() {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 1.4, 0.3),
        new THREE.MeshLambertMaterial({ color: mood.color })
      );
      box.position.set(cx, 0.7, cz);
      box.castShadow = true;
      box._charId = ch.id;
      scene.add(box);
      charObjects.push({ obj: box, chId: ch.id, cx, cz });
      const label = document.createElement('div');
      label.className = 'char-label'; label.textContent = ch.name;
      stage.appendChild(label);
      labels.push({ label, obj: box, headY: 1.6 });
    }
  });

  threeScene = scene;
  threeRenderer = renderer;
  threeCamera = camera;

  // Label projection
  function updateLabels() {
    labels.forEach(({ label, obj, headY }) => {
      const pos = obj.position.clone();
      pos.y = headY;
      pos.project(camera);
      label.style.left = ((pos.x * 0.5 + 0.5) * W) + 'px';
      label.style.top = ((-pos.y * 0.5 + 0.5) * H) + 'px';
    });
  }

  function animate() {
    threeAnimFrameId = requestAnimationFrame(animate);
    glbMixers.forEach(m => m.update(clock.getDelta()));
    // In drag mode: if dragging, follow mouse on floor plane
    if (_roomEditMode && _dragTarget && _lastRoomPointer) {
      const point = _screenToFloor(_lastRoomPointer, renderer, camera);
      if (point) _dragTarget.mesh.position.set(point.x, _dragTarget.origY, point.z);
    }
    renderer.render(scene, camera);
    updateLabels();
  }
  animate();

  // ── Pointer handling ──
  const dom = renderer.domElement;

  // Track last pointer for smooth drag
  let _lastRoomPointer = null;
  dom.addEventListener('mousemove', e => { _lastRoomPointer = e; }, { passive: true });
  dom.addEventListener('touchmove', e => { _lastRoomPointer = e; e.preventDefault(); }, { passive: false });

  // Click / tap
  dom.addEventListener('click', e => {
    if (_roomEditMode) { onRoomObjectClick(e); return; }
    handleRoomTap(e, renderer, camera, charObjects);
  });
  dom.addEventListener('touchend', e => {
    if (_roomEditMode && e.changedTouches?.length) {
      onRoomObjectClick({ clientX: e.changedTouches[0].clientX, clientY: e.changedTouches[0].clientY });
    }
  }, { passive: true });
}

function handleRoomTap(e, renderer, camera, charObjects) {
  const stage = document.getElementById('room-stage');
  const rect = renderer.domElement.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const mouse = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(mouse, camera);

  // Check objects first
  const objMeshes = [];
  threeScene.traverse(c => { if (c.isMesh && c._objId) objMeshes.push(c); });
  if (objMeshes.length) {
    const hits = ray.intersectObjects(objMeshes, false);
    if (hits.length) {
      const hitObj = objects.find(o => o.id === hits[0].object._objId);
      if (hitObj) { showObjInspect(hitObj.name, hitObj.desc || hitObj.description); return; }
    }
  }

  // Check characters
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
    charObjects.forEach(({ chId, cx, cz }) => {
      const d = Math.hypot(hitPos.x - cx, hitPos.z - cz);
      if (d < minD) { minD = d; closest = chId; }
    });
    if (closest && minD < 2) {
      const ch = characters.find(c => c.id === closest);
      if (ch) {
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
  threeScene = null;
  threeCamera = null;
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
    document.getElementById('of-name').value = obj.name;
    document.getElementById('of-desc').value = obj.desc || '';
    document.getElementById('of-glb').value = obj.glbUrl && !obj.glbUrl.startsWith('data:') ? obj.glbUrl : '';
    document.getElementById('of-px').value = obj.px || 0;
    document.getElementById('of-pz').value = obj.pz || 0;
    document.getElementById('of-scale').value = obj.scale || 1;
    document.getElementById('of-delete').style.display = 'block';
    window._editingObjGlbData = obj.glbUrl?.startsWith('data:') ? obj.glbUrl : null;
  } else {
    document.getElementById('obj-modal-title').textContent = 'Add Object';
    document.getElementById('of-name').value = '';
    document.getElementById('of-desc').value = '';
    document.getElementById('of-glb').value = '';
    document.getElementById('of-px').value = '0';
    document.getElementById('of-pz').value = '0';
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
    roomId: activeRoomId,
    name,
    desc: document.getElementById('of-desc').value.trim(),
    glbUrl,
    px: parseFloat(document.getElementById('of-px').value) || 0,
    pz: parseFloat(document.getElementById('of-pz').value) || 0,
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
  openRoom, closeRoom, buildRoomScene, destroyRoomScene,
  editActiveRoom, openObjModal, closeObjModal, saveObject, deleteObject,
  showObjInspect, hideObjInspect, enableRoomEdit, onRoomObjectClick,
  spawnTalkCloseUp, dismissTalkCloseUp
};

export {
  openRoom, closeRoom, buildRoomScene, destroyRoomScene,
  editActiveRoom, openObjModal, closeObjModal, saveObject, deleteObject,
  showObjInspect, hideObjInspect, enableRoomEdit, onRoomObjectClick,
  spawnTalkCloseUp, dismissTalkCloseUp
};
