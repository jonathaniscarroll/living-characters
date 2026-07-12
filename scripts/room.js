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
  // Priority: custom backdropUrl > BACKDROP_IMAGES preset > floor color
  if (room.backdropUrl) {
    stage.style.backgroundImage = `url('${room.backdropUrl}')`;
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
  if (!window.THREE || !window.GLTFLoader) {
    console.warn('3D viewer is still loading.');
    return;
  }
  setTimeout(() => buildRoomScene(room), 360);
}

function closeRoom() {
  closeTalkPanel();
  hideObjInspect();
  document.getElementById('room-view').classList.remove('open');
  destroyRoomScene();
  activeRoomId = null;
  const stage = document.getElementById('room-stage');
  stage.style.backgroundImage = '';
  stage.style.background = '';
}

function buildRoomScene(room) {
  destroyRoomScene();
  const stage = document.getElementById('room-stage');
  const W = stage.clientWidth || window.innerWidth;
  const H = stage.clientHeight || (window.innerHeight - 86 - 44);
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.OrthographicCamera(W / -200, H / 200, H / 200, H / -200, 1, 1000);
  camera.position.set(9, 9, 9);
  camera.lookAt(0, 1, 0);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  stage.addEventListener('mousemove', e => {
    const rect = stage.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  });
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.setSize(W, H);
  renderer.setPixelRatio(window.devicePixelRatio);
  stage.appendChild(renderer.domElement);
  // Custom backdropUrl or preset backdrop both count as "has background" for floor/wall transparency
  const hasBg = !!(room.backdropUrl || BACKDROP_IMAGES[room.backdrop]);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshLambertMaterial({ color: FLOOR_COLORS[room.backdrop] || '#1a3a1a', transparent: hasBg, opacity: hasBg ? 0.18 : 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Only draw walls if there's no background image (otherwise they obscure the backdrop)
  if (!hasBg) {
    const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLORS[room.backdrop] || '#2d5a27' });
    const wN = new THREE.Mesh(new THREE.BoxGeometry(20, 6, 0.2), wallMat);
    wN.position.set(0, 3, -8);
    scene.add(wN);
    const wW = new THREE.Mesh(new THREE.BoxGeometry(0.2, 6, 20), wallMat);
    wW.position.set(-8, 3, 0);
    scene.add(wW);
  }
  scene.add(new THREE.AmbientLight(0xffffff, 1.3)); // Even lighting for all materials
  const dl = new THREE.DirectionalLight(0xffffff, 0.7);
  dl.position.set(5, 12, 5);
  dl.castShadow = true;
  scene.add(dl);
  glbMixers = [];
  const clock = new THREE.Clock();
  const labels = [];
  const charObjects = [];
  const objMeshes = [];

  const objsInRoom = objects.filter(o => o.roomId === room.id);
  objsInRoom.forEach(obj => {
    if (obj.glbUrl && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      loader.load(obj.glbUrl, gltf => {
        const model = gltf.scene;
        model.scale.setScalar(obj.scale || 1);
        model.position.set(obj.px || 0, 0, obj.pz || 0);
        model.castShadow = true;
        scene.add(model);
        objMeshes.push({ mesh: model, objId: obj.id, name: obj.name, desc: obj.desc });
        const label = document.createElement('div');
        label.className = 'obj-label';
        label.textContent = obj.name;
        stage.appendChild(label);
        labels.push({ el: label, cx: obj.px || 0, cz: obj.pz || 0 });
      });
    }
  });

  const panel = document.getElementById('obj-list-panel');
  const listC = document.getElementById('obj-list-container');
  listC.innerHTML = '';
  if (objsInRoom.length === 0) {
    panel.classList.remove('show');
  } else {
    panel.classList.add('show');
    objsInRoom.forEach(o => {
      const row = document.createElement('div');
      row.className = 'obj-list-row';
      row.innerHTML = `<div class="obj-list-name">${o.name}</div><button class="obj-list-edit" onclick="openObjModal('${o.id}')">✏️</button>`;
      listC.appendChild(row);
    });
  }

  const charsInRoom = characters.filter(c => (c.roomIds || [c.roomId]).includes(room.id));
  charsInRoom.forEach((ch, i) => {
    const angle = (i / Math.max(charsInRoom.length, 1)) * Math.PI * 1.2 - 0.6;
    const cx = Math.cos(angle) * 3.5;
    const cz = Math.sin(angle) * 3.5;
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.7, 32), new THREE.MeshBasicMaterial({ color: mood.color, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.01, cz);
    ring._moodRingCharId = ch.id;
    scene.add(ring);
    if (ch.glbUrl && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      loader.load(ch.glbUrl, gltf => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scale = 2 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(scale);
        box.setFromObject(model);
        model.position.set(cx, 0, cz);
        model.castShadow = true;
        model.rotation.y = Math.PI;
        scene.add(model);
        charObjects.push({ obj: model, chId: ch.id, cx, cz });
        if (gltf.animations && gltf.animations.length) {
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
      }, undefined, err => {
        console.warn('GLB load failed for', ch.name, err);
        addFallbackBox(ch, cx, cz, mood, scene, stage, labels, charObjects);
      });
    } else if (ch.photoData || ch.animData) {
      const tex = new THREE.TextureLoader().load(ch.animData || ch.photoData);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(1.8, 1.8, 1);
      sprite.position.set(cx, 1.1, cz);
      scene.add(sprite);
      charObjects.push({ obj: sprite, chId: ch.id, cx, cz });
      const label = document.createElement('div');
      label.className = 'char-label';
      label.textContent = ch.name;
      stage.appendChild(label);
      labels.push({ label, obj: sprite, headY: 2.1 });
    } else {
      addFallbackBox(ch, cx, cz, mood, scene, stage, labels, charObjects);
    }
  });

  function addFallbackBox(ch, cx, cz, mood, scene, stage, labels, charObjects) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.3), new THREE.MeshLambertMaterial({ color: mood.color }));
    box.position.set(cx, 0.7, cz);
    box.castShadow = true;
    scene.add(box);
    charObjects.push({ obj: box, chId: ch.id, cx, cz });
    const label = document.createElement('div');
    label.className = 'char-label';
    label.textContent = ch.name;
    stage.appendChild(label);
    labels.push({ label, obj: box, headY: 1.6 });
  }

  const roomObjs = objects.filter(o => o.roomId === room.id);
  roomObjs.forEach(obj => {
    const px = (obj.position && obj.position.x != null) ? obj.position.x : 0;
    const py = (obj.position && obj.position.y != null) ? obj.position.y : 0;
    const pz = (obj.position && obj.position.z != null) ? obj.position.z : 0;
    const ry = (obj.rotation && obj.rotation.y != null) ? obj.rotation.y : 0;
    const sc = obj.scale || 1;

    function placeObject(mesh, heightForLabel) {
      mesh.position.set(px, py, pz);
      mesh.rotation.y = ry;
      mesh.scale.setScalar(sc);
      mesh.castShadow = true;
      mesh._objId = obj.id;
      scene.add(mesh);
      mesh.traverse(child => { if (child.isMesh) { child._objId = obj.id; objMeshes.push(child); } });
      if (!mesh.isMesh) objMeshes.push(mesh);
      const lbl = document.createElement('div');
      lbl.className = 'obj-label';
      lbl.textContent = '📦 ' + obj.name;
      stage.appendChild(lbl);
      labels.push({ label: lbl, obj: mesh, headY: heightForLabel });
    }

    if (obj.glbUrl && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      loader.load(obj.glbUrl, gltf => {
        const model = gltf.scene;
        const box3 = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box3.getSize(size);
        const autoScale = 1.2 / Math.max(size.x, size.y, size.z);
        model.scale.setScalar(sc * autoScale);
        model.position.set(px, py, pz);
        model.rotation.y = ry;
        model.castShadow = true;
        model._objId = obj.id;
        scene.add(model);
        model.traverse(child => { if (child.isMesh) { child._objId = obj.id; objMeshes.push(child); } });
        if (gltf.animations && gltf.animations.length) {
          const mixer = new THREE.AnimationMixer(model);
          mixer.clipAction(gltf.animations[0]).play();
          glbMixers.push(mixer);
        }
        const lbl = document.createElement('div');
        lbl.className = 'obj-label';
        lbl.textContent = '📦 ' + obj.name;
        stage.appendChild(lbl);
        const h = size.y * sc * autoScale + 0.2;
        labels.push({ label: lbl, obj: model, headY: h });
      }, undefined, err => {
        console.warn('Object GLB load failed for', obj.name, err);
        addFallbackObjBox(obj, px, py, pz, ry, sc);
      });
    } else {
      addFallbackObjBox(obj, px, py, pz, ry, sc);
    }

    function addFallbackObjBox(obj, px, py, pz, ry, sc) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b6914 }));
      placeObject(mesh, py + 0.6 * sc + 0.15);
    }
  });

  threeScene = scene;
  threeRenderer = renderer;
  threeCamera = camera;

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
    const dt = clock.getDelta();
    glbMixers.forEach(m => m.update(dt));
    renderer.render(scene, camera);
    updateLabels();
  }
  animate();

  renderer.domElement.addEventListener('click', e => {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);

    if (objMeshes.length) {
      const objHits = ray.intersectObjects(objMeshes, false);
      if (objHits.length) {
        const hitObj = objects.find(o => o.id === objHits[0].object._objId);
        if (hitObj) { showObjInspect(hitObj.name, hitObj.description); return; }
      }
    }

    const charMeshes = [];
    charObjects.forEach(({ obj }) => obj.traverse ? obj.traverse(c => { if (c.isMesh) charMeshes.push(c); }) : charMeshes.push(obj));
    const hits = ray.intersectObjects(charMeshes, false);
    if (hits.length) {
      const hitPos = hits[0].object.getWorldPosition(new THREE.Vector3());
      let closest = null;
      let minD = Infinity;
      charObjects.forEach(({ chId, cx, cz }) => {
        const d = Math.hypot(hitPos.x - cx, hitPos.z - cz);
        if (d < minD) { minD = d; closest = chId; }
      });
      if (closest && minD < 2) {
        const ch = characters.find(c => c.id === closest);
        if (ch) openTalkPanel(ch);
      }
    }
  });
}

function destroyRoomScene() {
  if (threeAnimFrameId) { cancelAnimationFrame(threeAnimFrameId); threeAnimFrameId = null; }
  if (threeRenderer) { threeRenderer.dispose(); const c = threeRenderer.domElement; if (c.parentNode) c.parentNode.removeChild(c); threeRenderer = null; }
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
    document.getElementById('of-glb').value = obj.glbUrl || '';
    document.getElementById('of-px').value = obj.px || 0;
    document.getElementById('of-pz').value = obj.pz || 0;
    document.getElementById('of-scale').value = obj.scale || 1;
    document.getElementById('of-delete').style.display = 'block';
  } else {
    document.getElementById('obj-modal-title').textContent = 'Add Object';
    document.getElementById('of-name').value = '';
    document.getElementById('of-desc').value = '';
    document.getElementById('of-glb').value = '';
    document.getElementById('of-px').value = '0';
    document.getElementById('of-pz').value = '0';
    document.getElementById('of-scale').value = '1';
    document.getElementById('of-delete').style.display = 'none';
  }
  overlay.classList.add('open');
}

function closeObjModal() {
  document.getElementById('obj-modal-overlay').classList.remove('open');
  editingObjId = null;
}

function saveObject() {
  const name = document.getElementById('of-name').value.trim();
  if (!name) return alert('Needs a name');
  if (!activeRoomId) return alert('Open a room first to add an object.');

  const obj = {
    id: editingObjId || ('obj_' + Date.now() + Math.random().toString(36).substr(2, 5)),
    roomId: activeRoomId,
    name,
    desc: document.getElementById('of-desc').value.trim(),
    glbUrl: document.getElementById('of-glb').value.trim(),
    px: parseFloat(document.getElementById('of-px').value) || 0,
    pz: parseFloat(document.getElementById('of-pz').value) || 0,
    scale: parseFloat(document.getElementById('of-scale').value) || 1
  };

  if (editingObjId) {
    objects = objects.map(o => o.id === editingObjId ? obj : o);
  } else {
    objects.push(obj);
  }

  save();
  closeObjModal();
  renderMapPins();
  const room = rooms.find(r => r.id === activeRoomId);
  if (room) buildRoomScene(room);
}

function deleteObject() {
  if (!editingObjId || !confirm('Remove object?')) return;
  objects = objects.filter(o => o.id !== editingObjId);
  save();
  closeObjModal();
  renderMapPins();
  const room = rooms.find(r => r.id === activeRoomId);
  if (room) buildRoomScene(room);
}

window.lcRoom = {
  openRoom,
  closeRoom,
  buildRoomScene,
  destroyRoomScene,
  editActiveRoom,
  openObjModal,
  closeObjModal,
  saveObject,
  deleteObject,
  showObjInspect,
  hideObjInspect
};

// ── Phase 2: Object dragging in room scene ─────────────────────────────────
let movingObjMesh = null;
function enableRoomEdit() {
  movingObjMesh = null;
}

function onRoomObjectClick(e) {
  if (!threeScene || !activeRoomId) return;
  const rect = threeRenderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, threeCamera);

  // Get all draggable object meshes
  const dragMeshes = [];
  threeScene.traverse(c => {
    if (c.isMesh && c._objId && !c._moodRingCharId) {
      dragMeshes.push(c);
    }
  });

  const hits = raycaster.intersectObjects(dragMeshes, false);
  if (hits.length > 0) {
    const hit = hits[0].object;
    if (!movingObjMesh) {
      // First click: select object to move
      movingObjMesh = hit;
      threeRenderer.domElement.style.cursor = 'grabbing';
    } else {
      // Second click: place object at new position
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, point)) {
        movingObjMesh.position.set(point.x, 0, point.z);
        // Update stored object
        const objId = movingObjMesh._objId;
        const obj = objects.find(o => o.id === objId);
        if (obj) {
          obj.px = point.x;
          obj.pz = point.z;
          obj.position = { x: point.x, y: 0, z: point.z };
          save();
          renderMapPins();
        }
      }
      movingObjMesh = null;
      threeRenderer.domElement.style.cursor = '';
    }
  } else if (movingObjMesh) {
    // Click on empty space: cancel move
    movingObjMesh = null;
    threeRenderer.domElement.style.cursor = '';
  }
}

export {
  openRoom,
  closeRoom,
  buildRoomScene,
  destroyRoomScene,
  editActiveRoom,
  openObjModal,
  closeObjModal,
  saveObject,
  deleteObject,
  showObjInspect,
  hideObjInspect,
  onRoomObjectClick,
  enableRoomEdit
};
