function buildRoomChipPicker(selectedIds = []) {
  const container = document.getElementById('cf-room-chips');
  container.innerHTML = '';
  rooms.forEach(room => {
    const chip = document.createElement('button');
    chip.className = 'room-chip' + (selectedIds.includes(room.id) ? ' active' : '');
    chip.textContent = '🏠 ' + room.name;
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
  const room = roomId ? rooms.find(r => r.id === roomId) : null;
  document.getElementById('room-modal-title').textContent = room ? 'Edit Room' : 'Add a Room';
  document.getElementById('rf-name').value = room ? room.name : '';
  document.getElementById('rf-lede').value = room ? room.lede : '';
  document.getElementById('rf-lat').value = room ? room.lat : '';
  document.getElementById('rf-lng').value = room ? room.lng : '';
  document.getElementById('rf-radius').value = room ? room.radius : '30';
  document.getElementById('rf-backdrop').value = room ? room.backdrop : 'forest';
  document.getElementById('room-modal-overlay').classList.add('open');
}

function closeRoomModal() {
  document.getElementById('room-modal-overlay').classList.remove('open');
  editingRoomId = null;
}

function saveRoom() {
  const name = document.getElementById('rf-name').value.trim();
  const lede = document.getElementById('rf-lede').value.trim();
  const lat = parseFloat(document.getElementById('rf-lat').value);
  const lng = parseFloat(document.getElementById('rf-lng').value);
  const radius = parseFloat(document.getElementById('rf-radius').value) || 30;
  const backdrop = document.getElementById('rf-backdrop').value;
  if (!name || Number.isNaN(lat) || Number.isNaN(lng)) return alert('Needs a name and coordinates.');
  const data = { id: editingRoomId || ('room_' + Date.now()), name, lede, lat, lng, radius, backdrop };
  if (editingRoomId) {
    rooms = rooms.map(r => r.id === editingRoomId ? data : r);
  } else {
    rooms.push(data);
  }
  closeRoomModal();
  renderMapPins();
  updateCompass();
  save();
}

function openCharModal(charId) {
  editingCharId = charId;
  tempPhotoData = null;
  tempAnimData = null;
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
  const roomIds = getSelectedRoomIds();
  const primaryRoomId = roomIds[0] || '';
  const items = document.getElementById('cf-items').value.split(',').map(s => s.trim()).filter(Boolean);
  const glbUrl = document.getElementById('cf-glb-url').value.trim();
  if (!name) { alert('Please give the character a name.'); return; }
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
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  saveCharacter
};

export {
  buildRoomChipPicker,
  getSelectedRoomIds,
  openRoomModal,
  closeRoomModal,
  saveRoom,
  openCharModal,
  closeCharModal,
  togglePromptPill,
  previewFile,
  saveCharacter
};
