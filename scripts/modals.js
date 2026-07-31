function buildRoomChipPicker(selectedIds = []) {
  const container = document.getElementById('cf-room-chips');
  const hint = document.getElementById('cf-room-chips-hint');
  container.innerHTML = '';
  if (!rooms.length) { if (hint) hint.style.display = ''; return; }
  if (hint) hint.style.display = 'none';
  rooms.forEach(room => {
    const chip = document.createElement('button');
    chip.className = 'room-chip' + (selectedIds.includes(room.id) ? ' active' : '');
    chip.textContent = '\uD83C\uDFE0 ' + room.name;
    chip.dataset.roomId = room.id;
    chip.onclick = () => {
      chip.classList.toggle('active');
      const ids = getSelectedRoomIds();
      populateHomeWorkSelects(ids, document.getElementById('cf-home-room').value, document.getElementById('cf-work-room').value);
      rebuildObjectUsagePrompts();
    };
    container.appendChild(chip);
  });
}

function getSelectedRoomIds() {
  return Array.from(document.querySelectorAll('#cf-room-chips .room-chip.active')).map(c => c.dataset.roomId);
}

function populateHomeWorkSelects(selectedIds, homeRoomId, workRoomId) {
  const homeEl = document.getElementById('cf-home-room');
  const workEl = document.getElementById('cf-work-room');
  if (!homeEl || !workEl) return;
  [homeEl, workEl].forEach(el => {
    el.innerHTML = '<option value="">\u2014 choose a room \u2014</option>';
    selectedIds.forEach(id => {
      const room = rooms.find(r => r.id === id);
      if (!room) return;
      el.innerHTML += `<option value="${id}">${room.name}</option>`;
    });
  });
  homeEl.value = homeRoomId || selectedIds[0] || '';
  workEl.value = workRoomId || selectedIds[0] || '';
}

function readSchedule() {
  const schedule = {};
  document.querySelectorAll('.schedule-segment').forEach(seg => {
    const active = seg.querySelector('.sch-pill.active');
    schedule[seg.dataset.seg] = active ? active.dataset.val : 'home';
  });
  return schedule;
}

function rebuildObjectUsagePrompts() {
  const container = document.getElementById('cf-object-usage');
  if (!container) return;
  container.innerHTML = '';
  const homeId = document.getElementById('cf-home-room').value;
  const workId = document.getElementById('cf-work-room').value;
  const relevantRoomIds = [...new Set([homeId, workId].filter(Boolean))];
  const ch = editingCharId ? characters.find(c => c.id === editingCharId) : null;
  relevantRoomIds.forEach(roomId => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;
    const roomObjs = objects.filter(o => o.roomId === roomId);
    if (!roomObjs.length) return;
    const isHome = roomId === homeId;
    const label = isHome ? '\uD83C\uDFE0' : '\uD83D\uDCBC';
    roomObjs.forEach(obj => {
      const passageType = (isHome ? 'home' : 'work') + '-object-' + obj.name.toLowerCase().replace(/\s+/g, '-');
      const existing = ch ? (ch.passages || []).find(p => p.type === passageType) : null;
      const row = document.createElement('div');
      row.className = 'prompt-row';
      row.dataset.key = passageType;
      row.innerHTML = `
        <button class="prompt-pill ${existing?.text ? 'active' : ''}" onclick="togglePromptPill(this)">${label} ${obj.name}</button>
        <div style="flex:1;display:flex;flex-direction:column;gap:3px">
          <textarea class="prompt-input" placeholder="How does ${ch ? ch.name : 'this character'} use the ${obj.name}?" rows="2">${existing?.text || ''}</textarea>
          <div class="prompt-hint">Shown when tapping ${obj.name} in the ${room.name} scene.</div>
        </div>`;
      container.appendChild(row);
    });
  });
}

// Camera presets
const CAM_PRESETS = [
  { label: '\uD83C\uDFB2 Isometric', x: 9, y: 9, z: 9 },
  { label: '\uD83D\uDC41 Front',     x: 0, y: 4, z: 14 },
  { label: '\u2194 Side',      x: 14, y: 4, z: 0 },
  { label: '\u2B06 Top',       x: 0, y: 18, z: 0.01 },
  { label: '\uD83C\uDFAC Low',      x: 6, y: 2, z: 10 },
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
  document.getElementById('rf-cam-x').value = room?.cameraX ?? 9;
  document.getElementById('rf-cam-y').value = room?.cameraY ?? 9;
  document.getElementById('rf-cam-z').value = room?.cameraZ ?? 9;
  document.getElementById('rf-cam-tx').value = room?.cameraTargetX ?? 0;
  document.getElementById('rf-cam-ty').value = room?.cameraTargetY ?? 0;
  document.getElementById('rf-cam-tz').value = room?.cameraTargetZ ?? 0;
  const rawZoom2 = room?.cameraZoom;
  document.getElementById('rf-cam-zoom').value = rawZoom2 ?? 2;
  const bp = document.getElementById('rf-backdrop-preview');
  const existingPreview = (room && room.backdropData) ? room.backdropData : ((room && room.backdropUrl) ? room.backdropUrl : null);
  if (existingPreview) {
    bp.src = existingPreview; bp.style.display = 'block';
    if (room.backdropData) tempBackdropData = room.backdropData;
    document.getElementById('rf-backdrop-status').textContent = '\u2713 Your backdrop image is ready to save.';
  } else {
    bp.src = ''; bp.style.display = 'none';
    document.getElementById('rf-backdrop-status').textContent = '';
  }
  document.getElementById('room-modal-overlay').classList.add('open');
  setTimeout(initRoomPickerMap, 100);
}

function closeRoomModal() {
  document.getElementById('room-modal-overlay').classList.remove('open');
  editingRoomId = null; tempBackdropData = null;
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
  const cameraTargetX = parseFloat(document.getElementById('rf-cam-tx').value);
  const cameraTargetY = parseFloat(document.getElementById('rf-cam-ty').value);
  const cameraTargetZ = parseFloat(document.getElementById('rf-cam-tz').value);
  const rawZoom = parseFloat(document.getElementById('rf-cam-zoom').value);
  const cameraZoom = Number.isNaN(rawZoom) ? 2 : Math.min(5, Math.max(0.5, rawZoom));
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return alert('Needs a name and coordinates.');
  const data = {
    id: editingRoomId || ('room_' + Date.now()), name, lede, lat, lng, radius,
    cameraX: Number.isNaN(cameraX) ? 9 : cameraX,
    cameraY: Number.isNaN(cameraY) ? 9 : cameraY,
    cameraZ: Number.isNaN(cameraZ) ? 9 : cameraZ,
    cameraTargetX: Number.isNaN(cameraTargetX) ? 0 : cameraTargetX,
    cameraTargetY: Number.isNaN(cameraTargetY) ? 0 : cameraTargetY,
    cameraTargetZ: Number.isNaN(cameraTargetZ) ? 0 : cameraTargetZ,
    cameraZoom,
  };
  if (backdropData) data.backdropData = backdropData;
  if (backdropUrl) data.backdropUrl = backdropUrl;
  if (editingRoomId) {
    const existing = rooms.find(r => r.id === editingRoomId);
    if (existing) Object.assign(existing, data);
  } else { rooms.push(data); }
  tempBackdropUrl = undefined;
  closeRoomModal(); renderMapPins(); updateCompass(); save();
  if (activeRoomId === data.id) {
    const room = rooms.find(r => r.id === data.id);
    if (room) buildRoomScene(room);
  }
}

let roomPickerMap = null, roomPickerMarker = null;
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
    preview.src = e.target.result; preview.style.display = 'block';
    status.textContent = `\u2713 "${file.name}" is ready to use!`;
    status.style.color = 'var(--accent2)';
    tempBackdropUrl = e.target.result;
    const targetRoomId = editingRoomId || ('room_' + Date.now());
    if (window.lcStore && typeof window.lcStore.uploadRoomBackdropToGitHub === 'function') {
      window.lcStore.uploadRoomBackdropToGitHub(targetRoomId, file).then(url => {
        if (url) { tempBackdropUrl = url; status.textContent = `\u2713 "${file.name}" uploaded to repo!`; }
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