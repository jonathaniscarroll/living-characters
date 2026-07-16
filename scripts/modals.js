function buildRoomChipPicker(selectedIds = []) {
  const container = document.getElementById('cf-room-chips');
  const hint = document.getElementById('cf-room-chips-hint');
  container.innerHTML = '';
  if (!rooms.length) {
    if (hint) hint.style.display = '';
    return;
  }
  if (hint) hint.style.display = 'none';
  rooms.forEach(room => {
    const chip = document.createElement('button');
    chip.className = 'room-chip' + (selectedIds.includes(room.id) ? ' active' : '');
    chip.textContent = '\uD83C\uDFE0 ' + room.name;
    chip.dataset.roomId = room.id;
    chip.onclick = () => chip.classList.toggle('active');
    container.appendChild(chip);
  });
}

function getSelectedRoomIds() {
  return Array.from(document.querySelectorAll('#cf-room-chips .room-chip.active')).map(c => c.dataset.roomId);
}

// Camera presets — (X, Y, Z) positions that all lookAt(0,0,0)
const CAM_PRESETS = [
  { label: '🎲 Isometric', x: 9,  y: 9,  z: 9  },
  { label: '👁 Front',     x: 0,  y: 4,  z: 14 },
  { label: '↔ Side',      x: 14, y: 4,  z: 0  },
  { label: '⬆ Top',       x: 0,  y: 18, z: 0.01 },
  { label: '🎬 Low',      x: 6,  y: 2,  z: 10 },
];

function setCamPreset(x, y, z) {
  document.getElementById('rf-cam-x').value = x;
  document.getElementById('rf-cam-y').value = y;
  document.getElementById('rf-cam-z').value = z;
}

function openRoomModal(roomId) {
  editingRoomId = roomId;
  tempBackdropData = null;
  const room = roomId ? rooms.find(r => r.id === roomId) : null;
  document.getElementById('room-modal-title').textContent = room ? 'Edit Room' : 'Add a Room';
  document.getElementById('rf-name').value = room ? room.name : '';
  document.getElementById('rf-lede').value = room ? room.lede : '';
  document.getElementById('rf-lat').value = room ? room.lat : '';
  document.getElementById('rf-lng').value = room ? room.lng : '';
  document.getElementById('rf-radius').value = room ? room.radius : '30';
  // Camera position
  document.getElementById('rf-cam-x').value = room?.cameraX ?? 9;
  document.getElementById('rf-cam-y').value = room?.cameraY ?? 9;
  document.getElementById('rf-cam-z').value = room?.cameraZ ?? 9;
  const bp = document.getElementById('rf-backdrop-preview');
  const existingPreview = (room && room.backdropData) ? room.backdropData : ((room && room.backdropUrl) ? room.backdropUrl : null);
  if (existingPreview) {
    bp.src = existingPreview;
    bp.style.display = 'block';
    if (room.backdropData) tempBackdropData = room.backdropData;
    document.getElementById('rf-backdrop-status').textContent = '\u2713 Your backdrop image is ready to save.';
  } else {
    bp.src = '';
    bp.style.display = 'none';
    document.getElementById('rf-backdrop-status').textContent = '';
  }
  document.getElementById('room-modal-overlay').classList.add('open');
  setTimeout(initRoomPickerMap, 100);
}

function closeRoomModal() {
  document.getElementById('room-modal-overlay').classList.remove('open');
  editingRoomId = null;
  tempBackdropData = null;
  document.getElementById('rf-backdrop-status').textContent = '';
}

function saveRoom() {
  const name = document.getElementById('rf-name').value.trim();
  const lede = document.getElementById('rf-lede').value.trim();
  const lat = parseFloat(document.getElementById('rf-lat').value);
  const lng = parseFloat(document.getElementById('rf-lng').value);
  const radius = parseFloat(document.getElementById('rf-radius').value) || 30;
  const backdropData = tempBackdropData || undefined;
  const backdropUrl = typeof tempBackdropUrl !== 'undefined' ? tempBackdropUrl : undefined;
  const cameraX = parseFloat(document.getElementById('rf-cam-x').value);
  const cameraY = parseFloat(document.getElementById('rf-cam-y').value);
  const cameraZ = parseFloat(document.getElementById('rf-cam-z').value);
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return alert('Needs a name and coordinates.');
  const data = {
    id: editingRoomId || ('room_' + Date.now()),
    name, lede, lat, lng, radius,
    cameraX: Number.isNaN(cameraX) ? 9 : cameraX,
    cameraY: Number.isNaN(cameraY) ? 9 : cameraY,
    cameraZ: Number.isNaN(cameraZ) ? 9 : cameraZ,
  };
  if (backdropData) data.backdropData = backdropData;
  if (backdropUrl) data.backdropUrl = backdropUrl;
  if (editingRoomId) {
    const existing = rooms.find(r => r.id === editingRoomId);
    if (existing) Object.assign(existing, data);
  } else {
    rooms.push(data);
  }
  tempBackdropUrl = undefined;
  closeRoomModal();
  renderMapPins();
  updateCompass();
  save();
  // If this room is currently open, rebuild the scene with new camera
  if (activeRoomId === data.id) {
    const room = rooms.find(r => r.id === data.id);
    if (room) buildRoomScene(room);
  }
}

// ── Room picker map ────────────────────────────────────────────────────
let roomPickerMap = null;
let roomPickerMarker = null;
function initRoomPickerMap() {
  const el = document.getElementById('room-latlng-map');
  if (!el || el._leaflet_id) return;
  roomPickerMap = L.map(el, { zoomControl: true, attributionControl: false }).setView([44.65, -63.59], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(roomPickerMap);
  roomPickerMap.on('click', e => {
    document.getElementById('rf-lat').value = e.latlng.lat.toFixed(6);
    document.getElementById('rf-lng').value = e.latlng.lng.toFixed(6);
    if (roomPickerMarker) roomPickerMarker.setLatLng(e.latlng);
    else roomPickerMarker = L.marker(e.latlng).addTo(roomPickerMap);
  });
  document.getElementById('rf-lat').addEventListener('input', updateRoomPickerMarker);
  document.getElementById('rf-lng').addEventListener('input', updateRoomPickerMarker);
  setTimeout(() => roomPickerMap.invalidateSize(), 300);
}
function updateRoomPickerMarker() {
  const lat = parseFloat(document.getElementById('rf-lat').value);
  const lng = parseFloat(document.getElementById('rf-lng').value);
  if (!Number.isNaN(lat) && !Number.isNaN(lng) && roomPickerMap) {
    if (roomPickerMarker) roomPickerMarker.setLatLng([lat, lng]);
    else roomPickerMarker = L.marker([lat, lng]).addTo(roomPickerMap);
    roomPickerMap.panTo([lat, lng]);
  }
}

function uploadRoomBackdrop() {
  const input = document.getElementById('rf-backdrop-input');
  const status = document.getElementById('rf-backdrop-status');
  const preview = document.getElementById('rf-backdrop-preview');
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = e => {
    tempBackdropData = e.target.result;
    preview.src = e.target.result;
    preview.style.display = 'block';
    status.textContent = `\u2713 "${file.name}" is ready to use!`;
    status.style.color = 'var(--accent2)';
    tempBackdropUrl = e.target.result;
    const targetRoomId = editingRoomId || ('room_' + Date.now());
    if (window.lcStore && typeof window.lcStore.uploadRoomBackdropToGitHub === 'function') {
      window.lcStore.uploadRoomBackdropToGitHub(targetRoomId, file).then(url => {
        if (url) {
          tempBackdropUrl = url;
          status.textContent = `\u2713 "${file.name}" uploaded to repo!`;
        }
      }).catch(() => {});
    }
  };
  reader.onerror = () => {
    tempBackdropData = null;
    status.textContent = 'That file could not be read. Please try again.';
    status.style.color = '#ff8a80';
  };
  reader.readAsDataURL(file);
}

function openCharModal(charId) {
  editingCharId = charId;
  tempPhotoData = null;
  tempAnimData = null;
  tempGlbData = null;
  const ch = charId ? characters.find(c => c.id === charId) : null;
  document.getElementById('char-modal-title').textContent = ch ? 'Edit Character' : 'Add a Character';
  document.getElementById('cf-name').value = ch ? ch.name : '';
  document.getElementById('cf-items').value = ch ? (ch.items || []).join(', ') : '';
  document.getElementById('cf-glb-url').value = ch ? (ch.glbUrl && !ch.glbUrl.startsWith('data:') ? ch.glbUrl : '') : '';
  const currentIds = ch ? (ch.roomIds || (ch.roomId ? [ch.roomId] : [])) : [];
  buildRoomChipPicker(currentIds);
  const pp = document.getElementById('cf-photo-preview');
  if (ch && ch.photoData) { pp.src = ch.photoData; pp.style.display = 'block'; tempPhotoData = ch.photoData; }
  else { pp.src = ''; pp.style.display = 'none'; }
  const ap = document.getElementById('cf-anim-preview');
  if (ch && ch.animData) { ap.src = ch.animData; ap.style.display = 'block'; tempAnimData = ch.animData; }
  else { ap.src = ''; ap.style.display = 'none'; }
  const glbStatus = document.getElementById('cf-glb-status');
  if (ch && ch.glbUrl && ch.glbUrl.startsWith('data:')) {
    tempGlbData = ch.glbUrl;
    glbStatus.textContent = '\u2713 Your 3D model is ready to save.';
  } else if (ch && ch.glbUrl) {
    glbStatus.textContent = '\u2713 Using a web link for this character.';
  } else {
    glbStatus.textContent = '';
  }
  const wrap = document.getElementById('cf-fbx-progress');
  const bar  = document.getElementById('cf-fbx-progress-bar');
  if (wrap) wrap.style.display = 'none';
  if (bar)  bar.style.width = '0%';
  const mp = document.getElementById('mood-picker');
  mp.innerHTML = '';
  MOODS.forEach(m => {
    const btn = document.createElement('button');
    const isActive = ch ? ch.mood === m.label : m.label === 'Happy';
    btn.className = 'mood-opt' + (isActive ? ' active' : '');
    btn.textContent = m.emoji + ' ' + m.label;
    btn.style.borderColor = isActive ? m.color : 'transparent';
    btn.onclick = () => {
      mp.querySelectorAll('.mood-opt').forEach(b => { b.classList.remove('active'); b.style.borderColor = 'transparent'; });
      btn.classList.add('active');
      btn.style.borderColor = m.color;
    };
    mp.appendChild(btn);
  });
  const db = document.getElementById('dialogue-builder');
  db.innerHTML = '';
  PROMPT_TYPES.forEach(pt => {
    const existing = ch && ch.passages ? ch.passages.find(p => p.type === pt.key) : null;
    const row = document.createElement('div');
    row.className = 'prompt-row';
    row.dataset.key = pt.key;
    row.innerHTML = `
      <button class="prompt-pill ${existing?.text ? 'active' : ''}" onclick="togglePromptPill(this)">${pt.label}</button>
      <div style="flex:1;display:flex;flex-direction:column;gap:3px">
        <textarea class="prompt-input" placeholder="${pt.placeholder}" rows="2">${existing?.text || ''}</textarea>
        <div class="prompt-hint">${pt.hint}</div>
      </div>`;
    db.appendChild(row);
  });
  const hint = document.getElementById('cf-room-chips-hint');
  if (hint && !rooms.length) {
    hint.style.display = '';
    hint.style.color = 'var(--accent)';
    hint.textContent = '\u26A0\uFE0F Create a room first before adding a character.';
  }
  document.getElementById('char-modal-overlay').classList.add('open');
}

function togglePromptPill(btn) {
  btn.classList.toggle('active');
}

function closeCharModal() {
  document.getElementById('char-modal-overlay').classList.remove('open');
  editingCharId = null;
  tempPhotoData = null;
  tempAnimData = null;
  tempGlbData = null;
  document.getElementById('cf-glb-status').textContent = '';
  const wrap = document.getElementById('cf-fbx-progress');
  const bar  = document.getElementById('cf-fbx-progress-bar');
  if (wrap) wrap.style.display = 'none';
  if (bar)  bar.style.width = '0%';
}

function previewFile(inputId, previewId, dataKey) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result;
    preview.style.display = 'block';
    if (dataKey === 'photoData') tempPhotoData = e.target.result;
    if (dataKey === 'animData') tempAnimData = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function saveCharacter() {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { alert('Please give the character a name.'); return; }

  const roomIds = getSelectedRoomIds();
  if (!editingCharId && !roomIds.length) {
    const chips = document.getElementById('cf-room-chips');
    const hint = document.getElementById('cf-room-chips-hint');
    if (chips) {
      chips.style.outline = '2px solid var(--accent)';
      chips.style.borderRadius = '8px';
      chips.style.padding = '6px';
      setTimeout(() => { chips.style.outline = ''; chips.style.padding = ''; }, 2000);
    }
    if (hint) {
      hint.style.display = '';
      hint.style.color = 'var(--accent)';
      hint.textContent = '\u26A0\uFE0F Please choose at least one room for this character.';
      setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 3000);
    }
    alert('Please choose at least one room before saving.');
    return;
  }

  const primaryRoomId = roomIds[0] || '';
  const items = document.getElementById('cf-items').value.split(',').map(s => s.trim()).filter(Boolean);
  const glbUrl = tempGlbData || document.getElementById('cf-glb-url').value.trim();
  const activeMoodBtn = document.querySelector('#mood-picker .mood-opt.active');
  const moodLabel = MOODS.find(m => activeMoodBtn && activeMoodBtn.textContent.includes(m.emoji))?.label || 'Happy';
  const passages = [];
  document.querySelectorAll('#dialogue-builder .prompt-row').forEach(row => {
    const text = row.querySelector('.prompt-input').value.trim();
    if (text) passages.push({ type: row.dataset.key, text });
  });
  const data = { name, roomId: primaryRoomId, roomIds, mood: moodLabel, items, passages, glbUrl, photoData: tempPhotoData, animData: tempAnimData };
  const isNew = !editingCharId;
  if (editingCharId) {
    const ch = characters.find(c => c.id === editingCharId);
    if (ch) Object.assign(ch, data);
  } else {
    characters.push({ id: 'char_' + Date.now(), ...data });
  }
  closeCharModal();
  renderMapPins();
  save();

  // Auto-commit to GitHub after every character save (new or edited)
  const charLabel = isNew ? `Add character: ${name}` : `Update character: ${name}`;
  const commitInput = document.getElementById('gh-commit-input');
  const prevMsg = commitInput ? commitInput.value : '';
  if (commitInput) commitInput.value = charLabel;
  if (window.lcStore && typeof window.lcStore.ghSave === 'function') {
    window.lcStore.ghSave().finally(() => {
      if (commitInput) commitInput.value = prevMsg;
    });
  }
}

window.lcModals = {
  buildRoomChipPicker,
  getSelectedRoomIds,
  CAM_PRESETS,
  setCamPreset,
  openRoomModal,
  closeRoomModal,
  saveRoom,
  uploadRoomBackdrop,
  initRoomPickerMap,
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  saveCharacter
};

export {
  buildRoomChipPicker,
  getSelectedRoomIds,
  CAM_PRESETS,
  setCamPreset,
  openRoomModal,
  closeRoomModal,
  saveRoom,
  uploadRoomBackdrop,
  initRoomPickerMap,
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  saveCharacter
};
