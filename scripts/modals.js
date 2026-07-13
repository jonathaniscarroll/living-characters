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
  document.getElementById('rf-backdrop').value = room ? room.backdrop : 'forest';
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
  const backdrop = document.getElementById('rf-backdrop').value;
  const backdropData = tempBackdropData || undefined;
  const backdropUrl = typeof tempBackdropUrl !== 'undefined' ? tempBackdropUrl : undefined;
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return alert('Needs a name and coordinates.');
  const data = { id: editingRoomId || ('room_' + Date.now()), name, lede, lat, lng, radius, backdrop };
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
}

// ── Phase 2: Room picker map (Leaflet mini-map in room modal) ─────────────
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
  document.getElementById('cf-glb-url').value = ch ? (ch.glbUrl || '') : '';
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
  // Highlight room chips section if no rooms available (new character)
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
}

function uploadCharacterGlb() {
  const input = document.getElementById('cf-glb-input');
  const status = document.getElementById('cf-glb-status');
  const urlField = document.getElementById('cf-glb-url');
  const file = input.files && input.files[0];
  if (!file) return;
  const name = file.name.toLowerCase();
  if (!name.endsWith('.glb')) {
    status.textContent = 'That file does not look like a .glb model. Please try another one.';
    status.style.color = '#ff8a80';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    tempGlbData = e.target.result;
    urlField.value = '';
    status.textContent = `\u2713 "${file.name}" is ready to use!`;
    status.style.color = 'var(--accent2)';
  };
  reader.onerror = () => {
    tempGlbData = null;
    status.textContent = 'That file could not be read. Please try again.';
    status.style.color = '#ff8a80';
  };
  reader.readAsDataURL(file);
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

  // Room is mandatory when creating a new character
  if (!editingCharId && !roomIds.length) {
    // Visually highlight the room chips section
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
  if (editingCharId) {
    const ch = characters.find(c => c.id === editingCharId);
    if (ch) Object.assign(ch, data);
  } else {
    characters.push({ id: 'char_' + Date.now(), ...data });
  }
  closeCharModal();
  renderMapPins();
  save();
}

window.lcModals = {
  buildRoomChipPicker,
  getSelectedRoomIds,
  openRoomModal,
  closeRoomModal,
  saveRoom,
  uploadRoomBackdrop,
  initRoomPickerMap,
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  uploadCharacterGlb,
  saveCharacter
};

export {
  buildRoomChipPicker,
  getSelectedRoomIds,
  openRoomModal,
  closeRoomModal,
  saveRoom,
  uploadRoomBackdrop,
  initRoomPickerMap,
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  uploadCharacterGlb,
  saveCharacter
};
