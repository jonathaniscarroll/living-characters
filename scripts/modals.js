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

// ---------------------------------------------------------------------------
// Sprite state (module-level, reset on each openCharModal call)
// ---------------------------------------------------------------------------

let pendingSprites = { idle: [null, null], walk: [null, null], talk: [null, null], listen: [null, null] };
let _uploadedFrames = [];

const SPRITE_STATES = ['idle', 'walk', 'talk', 'listen'];
const SPRITE_STATE_LABELS = { idle: 'Idle', walk: 'Walk', talk: 'Talk', listen: 'Listen' };

/** CSS checkerboard pattern for transparent-bg thumbnails */
const CHECKERBOARD_STYLE = [
  'background-image:linear-gradient(45deg,#ccc 25%,transparent 25%),',
  'linear-gradient(-45deg,#ccc 25%,transparent 25%),',
  'linear-gradient(45deg,transparent 75%,#ccc 75%),',
  'linear-gradient(-45deg,transparent 75%,#ccc 75%);',
  'background-size:12px 12px;',
  'background-position:0 0,0 6px,6px -6px,-6px 0px;',
  'background-color:#fff;'
].join('');

// ---------------------------------------------------------------------------
// Sprite ORDER mapping (shared by auto-assign and seed)
// ---------------------------------------------------------------------------
const SPRITE_ORDER = ['idle-0','idle-1','walk-0','walk-1','talk-0','talk-1','listen-0','listen-1'];

/** Auto-assign _uploadedFrames into pendingSprites in ORDER sequence */
function _autoAssignFrames() {
  SPRITE_ORDER.forEach((key, i) => {
    if (i >= _uploadedFrames.length) return;
    const [state, idx] = key.split('-');
    pendingSprites[state][+idx] = _uploadedFrames[i];
  });
}

/** Render the thumbnail strip from _uploadedFrames */
function _renderStrip() {
  const strip = document.getElementById('sprite-strip');
  if (!strip) return;
  strip.innerHTML = '';
  _uploadedFrames.forEach((url, i) => {
    const thumb = document.createElement('div');
    thumb.draggable = true;
    thumb.title = `Frame ${i + 1} \u2014 drag to a slot`;
    thumb.style.cssText = [
      'position:relative;width:52px;height:58px;border-radius:6px;overflow:hidden;flex-shrink:0;',
      'background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.18);cursor:grab;',
      CHECKERBOARD_STYLE,
    ].join('');
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
    thumb.appendChild(img);
    const lbl = document.createElement('span');
    lbl.textContent = i + 1;
    lbl.style.cssText = 'position:absolute;bottom:2px;left:0;right:0;text-align:center;font-size:9px;color:rgba(255,255,255,0.5);pointer-events:none;';
    thumb.appendChild(lbl);
    thumb.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', url);
      e.dataTransfer.effectAllowed = 'copy';
    });
    strip.appendChild(thumb);
  });
}

/** Process files array (from input or drop) \u2014 up to 8 total */
function _ingestFiles(files) {
  const remaining = 8 - _uploadedFrames.length;
  if (remaining <= 0) return;
  const toRead = Array.from(files).slice(0, remaining);
  let loaded = 0;
  toRead.forEach(file => {
    if (!file.type.startsWith('image/')) { loaded++; return; }
    const reader = new FileReader();
    reader.onload = e => {
      _uploadedFrames.push(e.target.result);
      loaded++;
      if (loaded === toRead.length) {
        _autoAssignFrames();
        _renderStrip();
        _renderAssignmentGrid();
      }
    };
    reader.readAsDataURL(file);
  });
}

/** Build and inject the Sprite Frames section into the char modal */
function buildSpriteSection(ch) {
  const existing = document.getElementById('sprite-frames-section');
  if (existing) existing.remove();

  // Reset state
  pendingSprites = { idle: [null, null], walk: [null, null], talk: [null, null], listen: [null, null] };
  _uploadedFrames = [];

  // Seed from existing character sprites
  if (ch && (ch.sprites || ch.spriteUrls)) {
    const src = ch.sprites || ch.spriteUrls;
    SPRITE_ORDER.forEach(key => {
      const [state, idx] = key.split('-');
      const url = (src[state] && src[state][+idx]) || null;
      if (url) {
        pendingSprites[state][+idx] = url;
        if (!_uploadedFrames.includes(url)) _uploadedFrames.push(url);
      }
    });
  }

  const section = document.createElement('div');
  section.id = 'sprite-frames-section';
  section.style.cssText = 'margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;';

  section.innerHTML = `
    <button id="sprite-section-toggle" onclick="lcModals.toggleSpriteSection()" style="
      background:none;border:none;color:var(--text,#e0e0e0);font-size:13px;font-weight:600;
      cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:6px;width:100%;text-align:left;
    ">
      <span id="sprite-section-arrow" style="display:inline-block;transition:transform .2s;">\u25B6</span>
      \uD83C\uDFAC Sprite Frames
    </button>
    <div id="sprite-section-body" style="display:none;margin-top:10px;">

      <!-- Step 1: Drop zone -->
      <div id="sprite-dropzone" style="
        border:2px dashed rgba(255,255,255,0.2);border-radius:8px;
        padding:20px;text-align:center;cursor:pointer;
        background:rgba(255,255,255,0.04);margin-bottom:12px;
        transition:border-color 0.2s;
      ">
        <div style="font-size:24px;margin-bottom:6px;">\uD83D\uDCC1</div>
        <div style="font-size:13px;color:var(--text-muted,#999);">
          Drop images here or tap to browse<br>
          <span style="font-size:11px;">Up to 8 \u00B7 PNG / JPG / WebP \u00B7 no background needed</span>
        </div>
        <input type="file" id="sprite-bulk-input" multiple accept="image/*" style="display:none">
      </div>

      <!-- Uploaded thumbnail strip -->
      <div id="sprite-strip" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;min-height:0;"></div>

      <!-- Step 2: Assignment grid (2\u00D74) -->
      <div id="sprite-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;"></div>

    </div>
  `;

  // Insert before modal actions or at bottom of modal body
  const form = document.getElementById('char-modal-overlay');
  const target = form ? form.querySelector('.modal-actions, .char-save-btn, #char-modal-save') : null;
  if (target) {
    target.parentNode.insertBefore(section, target);
  } else {
    const modalBody = document.querySelector('#char-modal-overlay .modal-body, #char-modal-overlay .modal-scroll, #char-modal-overlay form');
    if (modalBody) modalBody.appendChild(section);
    else document.getElementById('char-modal-overlay').appendChild(section);
  }

  // Wire drop zone after injection
  const dropzone = document.getElementById('sprite-dropzone');
  const bulkInput = document.getElementById('sprite-bulk-input');
  if (dropzone && bulkInput) {
    dropzone.onclick = () => bulkInput.click();
    bulkInput.addEventListener('change', () => {
      if (bulkInput.files && bulkInput.files.length) {
        _ingestFiles(bulkInput.files);
        bulkInput.value = '';
      }
    });
    dropzone.addEventListener('dragover', e => {
      e.preventDefault();
      dropzone.style.borderColor = 'var(--accent,#a855f7)';
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255,255,255,0.2)';
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        _ingestFiles(e.dataTransfer.files);
      }
    });
  }

  // Render initial strip + grid (will show seeded frames if editing)
  _renderStrip();
  _renderAssignmentGrid();
}

function _renderAssignmentGrid() {
  const grid = document.getElementById('sprite-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // 2\u00D74: row 0 = Idle1,Idle2,Walk1,Walk2 | row 1 = Talk1,Talk2,Listen1,Listen2
  SPRITE_ORDER.forEach(key => {
    const [state, idx] = key.split('-');
    const frameIdx = +idx;
    const dataUrl = pendingSprites[state][frameIdx];
    const label = SPRITE_STATE_LABELS[state] + '\u00A0' + (frameIdx + 1);

    const slot = document.createElement('div');
    slot.id = `sprite-slot-${state}-${frameIdx}`;
    slot.style.cssText = [
      'position:relative;border-radius:6px;overflow:hidden;cursor:pointer;',
      'aspect-ratio:1/1.2;display:flex;flex-direction:column;align-items:center;justify-content:center;',
      dataUrl
        ? 'border:2px solid var(--accent,#a855f7);background:rgba(255,255,255,0.08);'
        : 'border:1.5px dashed rgba(255,255,255,0.2);background:rgba(255,255,255,0.05);',
      CHECKERBOARD_STYLE,
    ].join('');

    if (dataUrl) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
      slot.appendChild(img);

      const clearBtn = document.createElement('button');
      clearBtn.textContent = '\u00D7';
      clearBtn.title = 'Remove frame';
      clearBtn.style.cssText = 'position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.7);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;z-index:2;';
      clearBtn.onclick = e => { e.stopPropagation(); clearSpriteSlot(state, frameIdx); };
      slot.appendChild(clearBtn);
    } else {
      const plus = document.createElement('span');
      plus.textContent = '+';
      plus.style.cssText = 'font-size:18px;color:rgba(255,255,255,0.25);pointer-events:none;';
      slot.appendChild(plus);
    }

    // State label at bottom
    const lbl = document.createElement('span');
    lbl.textContent = label;
    lbl.style.cssText = [
      'position:absolute;bottom:0;left:0;right:0;text-align:center;',
      'font-size:9px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;',
      'padding:2px 0;color:rgba(255,255,255,0.55);',
      dataUrl ? 'background:rgba(0,0,0,0.45);' : '',
    ].join('');
    slot.appendChild(lbl);

    // Drag-over: accept URLs from strip thumbs
    slot.addEventListener('dragover', e => {
      e.preventDefault();
      slot.style.borderColor = 'var(--accent,#a855f7)';
    });
    slot.addEventListener('dragleave', () => {
      slot.style.borderColor = dataUrl
        ? 'var(--accent,#a855f7)'
        : 'rgba(255,255,255,0.2)';
    });
    slot.addEventListener('drop', e => {
      e.preventDefault();
      const url = e.dataTransfer.getData('text/plain');
      if (url) {
        pendingSprites[state][frameIdx] = url;
        _renderAssignmentGrid();
      }
    });

    grid.appendChild(slot);
  });
}

function clearSpriteSlot(state, frameIdx) {
  pendingSprites[state][frameIdx] = null;
  _renderAssignmentGrid();
}

function toggleSpriteSection() {
  const body = document.getElementById('sprite-section-body');
  const arrow = document.getElementById('sprite-section-arrow');
  if (!body) return;
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (arrow) arrow.style.transform = open ? '' : 'rotate(90deg)';
}

// ---------------------------------------------------------------------------
// Character modal open / close / save
// ---------------------------------------------------------------------------

function openCharModal(charId) {
  editingCharId = charId;
  tempPhotoData = null;
  tempAnimData  = null;
  const ch = charId ? characters.find(c => c.id === charId) : null;
  document.getElementById('char-modal-title').textContent = ch ? 'Edit Character' : 'Add a Character';
  document.getElementById('cf-name').value = ch ? ch.name : '';
  document.getElementById('cf-items').value = ch ? (ch.items || []).join(', ') : '';
  const currentIds = ch ? (ch.roomIds || (ch.roomId ? [ch.roomId] : [])) : [];
  buildRoomChipPicker(currentIds);

  populateHomeWorkSelects(currentIds, ch?.homeRoomId || null, ch?.workRoomId || null);

  const segs = ['morning', 'midday', 'afternoon', 'evening', 'night'];
  const schedule = ch?.schedule || { morning: 'home', midday: 'work', afternoon: 'work', evening: 'home', night: 'home' };
  segs.forEach(seg => {
    const segEl = document.querySelector(`.schedule-segment[data-seg="${seg}"]`);
    if (!segEl) return;
    segEl.querySelectorAll('.sch-pill').forEach(pill => {
      pill.classList.toggle('active', pill.dataset.val === schedule[seg]);
    });
  });

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
      btn.classList.add('active'); btn.style.borderColor = m.color;
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

  const contextTypes = [
    { key: 'home', label: '\uD83C\uDFE0 At home they say\u2026', placeholder: 'What do they talk about at home?', hint: 'Shown when visiting this character at their home room.' },
    { key: 'work', label: '\uD83D\uDCBC At work they say\u2026', placeholder: 'What do they talk about at work?', hint: 'Shown when visiting this character at their work room.' },
  ];
  contextTypes.forEach(pt => {
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

  rebuildObjectUsagePrompts();

  // Build sprite section (always, since it manages its own state)
  buildSpriteSection(ch);

  const hint = document.getElementById('cf-room-chips-hint');
  if (hint) {
    if (window._pendingCharLat !== undefined) {
      hint.style.display = '';
      hint.style.color = 'var(--accent2)';
      hint.textContent = `\uD83D\uDCCD Placing at ${window._pendingCharLat.toFixed(4)}, ${window._pendingCharLng.toFixed(4)} \u2014 rooms are optional.`;
    } else if (!rooms.length) {
      hint.style.display = ''; hint.style.color = 'var(--accent)';
      hint.textContent = '\u26A0\uFE0F Create a room first before adding a character.';
    } else {
      hint.style.display = 'none';
    }
  }

  document.getElementById('char-modal-overlay').classList.add('open');
}

function togglePromptPill(btn) { btn.classList.toggle('active'); }

function closeCharModal() {
  document.getElementById('char-modal-overlay').classList.remove('open');
  editingCharId = null;
  tempPhotoData = null;
  tempAnimData  = null;
  // Reset sprite state
  pendingSprites = { idle: [null, null], walk: [null, null], talk: [null, null], listen: [null, null] };
  _uploadedFrames = [];
  delete window._pendingCharLat;
  delete window._pendingCharLng;
}

function previewFile(inputId, previewId, dataKey) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input.files || !input.files[0]) return;
  const reader = new FileReader();
  reader.onload = e => {
    preview.src = e.target.result; preview.style.display = 'block';
    if (dataKey === 'photoData') tempPhotoData = e.target.result;
    if (dataKey === 'animData')  tempAnimData  = e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}

function saveCharacter() {
  const name = document.getElementById('cf-name').value.trim();
  if (!name) { alert('Please give the character a name.'); return; }
  const roomIds = getSelectedRoomIds();

  const hasMapCoords = (window._pendingCharLat !== undefined) ||
    (editingCharId && (() => { const ch = characters.find(c => c.id === editingCharId); return ch && typeof ch.lat === 'number'; })());

  if (!editingCharId && !roomIds.length && !hasMapCoords) {
    const chips = document.getElementById('cf-room-chips');
    const hint  = document.getElementById('cf-room-chips-hint');
    if (chips) {
      chips.style.outline = '2px solid var(--accent)';
      chips.style.borderRadius = '8px';
      chips.style.padding = '6px';
      setTimeout(() => { chips.style.outline = ''; chips.style.padding = ''; }, 2000);
    }
    if (hint) {
      hint.style.display = ''; hint.style.color = 'var(--accent)';
      hint.textContent = '\u26A0\uFE0F Please choose at least one room for this character.';
      setTimeout(() => { hint.textContent = ''; hint.style.color = ''; }, 3000);
    }
    alert('Please choose at least one room before saving.'); return;
  }

  const primaryRoomId = roomIds[0] || '';
  const items = document.getElementById('cf-items').value.split(',').map(s => s.trim()).filter(Boolean);

  const activeMoodBtn = document.querySelector('#mood-picker .mood-opt.active');
  const moodLabel = MOODS.find(m => activeMoodBtn && activeMoodBtn.textContent.includes(m.emoji))?.label || 'Happy';
  const homeRoomId = document.getElementById('cf-home-room').value || roomIds[0] || null;
  const workRoomId = document.getElementById('cf-work-room').value || roomIds[0] || null;
  const schedule   = readSchedule();

  const passages = [];
  document.querySelectorAll('#dialogue-builder .prompt-row, #cf-object-usage .prompt-row').forEach(row => {
    const text = row.querySelector('.prompt-input').value.trim();
    if (text) passages.push({ type: row.dataset.key, text });
  });

  // Build sprites object \u2014 only include states that have at least one frame
  const sprites = {};
  let hasAnySprite = false;
  SPRITE_STATES.forEach(state => {
    const frames = pendingSprites[state].filter(Boolean);
    if (frames.length) { sprites[state] = pendingSprites[state]; hasAnySprite = true; }
  });

  const data = {
    name, roomId: primaryRoomId, roomIds,
    homeRoomId, workRoomId, schedule,
    mood: moodLabel, items, passages,
    photoData: tempPhotoData,
    animData:  tempAnimData,
  };

  // Persist sprites if any frames were uploaded
  if (hasAnySprite) {
    data.sprites = sprites;
  } else if (editingCharId) {
    const existingChar = characters.find(c => c.id === editingCharId);
    if (existingChar && existingChar.sprites) {
      data.sprites = existingChar.sprites;
    }
  }

  if (window._pendingCharLat !== undefined) {
    data.lat = window._pendingCharLat;
    data.lng = window._pendingCharLng;
    delete window._pendingCharLat;
    delete window._pendingCharLng;
  } else if (editingCharId) {
    const existing = characters.find(c => c.id === editingCharId);
    if (existing && typeof existing.lat === 'number') {
      data.lat = existing.lat;
      data.lng = existing.lng;
    }
  }

  const isNew = !editingCharId;
  let savedId;
  if (editingCharId) {
    const ch = characters.find(c => c.id === editingCharId);
    if (ch) { Object.assign(ch, data); savedId = ch.id; }
  } else {
    savedId = 'char_' + Date.now();
    characters.push({ id: savedId, ...data });
  }

  closeCharModal();
  renderMapPins();

  // Always save locally first \u2014 this never fails and requires no token.
  save();

  if (savedId) {
    document.dispatchEvent(new CustomEvent('lc:character-saved', { detail: { id: savedId } }));
  }

  // Only attempt GitHub save if a token is present.
  const token = window.lcStore && typeof window.lcStore.getToken === 'function'
    ? window.lcStore.getToken()
    : (document.getElementById('gh-token-input')?.value.trim() || localStorage.getItem('lc_gh_token') || '');

  if (token) {
    const charLabel   = isNew ? `Add character: ${name}` : `Update character: ${name}`;
    const commitInput = document.getElementById('gh-commit-input');
    const prevMsg     = commitInput ? commitInput.value : '';
    if (commitInput) commitInput.value = charLabel;
    window.lcStore.ghSave().finally(() => { if (commitInput) commitInput.value = prevMsg; });
  } else {
    if (window.lcStore && typeof window.lcStore.showToast === 'function') {
      window.lcStore.showToast('Saved locally \u2014 add a GitHub token to sync to the repo', '');
    }
    if (window.lcStore && typeof window.lcStore.setGhStatus === 'function') {
      window.lcStore.setGhStatus('Saved locally (no token)', '');
    }
  }
}

function openObjModal(objId) {
  editingObjId = objId;
  const obj = objId ? objects.find(o => o.id === objId) : null;
  document.getElementById('obj-modal-title').textContent = obj ? 'Edit Object' : 'Add an Object';
  document.getElementById('of-name').value = obj ? obj.name : '';
  document.getElementById('of-desc').value = obj ? (obj.desc || '') : '';
  document.getElementById('of-px').value = obj ? (obj.x ?? 0) : 0;
  document.getElementById('of-pz').value = obj ? (obj.z ?? 0) : 0;
  document.getElementById('of-scale').value = obj ? (obj.scale ?? 1) : 1;
  const delBtn = document.getElementById('of-delete');
  if (delBtn) delBtn.style.display = obj ? '' : 'none';
  document.getElementById('obj-modal-overlay').classList.add('open');
}

function closeObjModal() {
  document.getElementById('obj-modal-overlay').classList.remove('open');
  editingObjId = null;
}

function saveObject() {
  const name  = document.getElementById('of-name').value.trim();
  const desc  = document.getElementById('of-desc').value.trim();
  const x     = parseFloat(document.getElementById('of-px').value) || 0;
  const z     = parseFloat(document.getElementById('of-pz').value) || 0;
  const scale = parseFloat(document.getElementById('of-scale').value) || 1;
  if (!name) { alert('Please give the object a name.'); return; }
  const roomId = activeRoomId;
  if (!roomId) { alert('No active room.'); return; }
  const data = { name, desc, x, z, scale, roomId };
  if (editingObjId) {
    const obj = objects.find(o => o.id === editingObjId);
    if (obj) Object.assign(obj, data);
  } else {
    objects.push({ id: 'obj_' + Date.now(), ...data });
  }
  closeObjModal();
  const room = rooms.find(r => r.id === roomId);
  if (room) buildRoomScene(room);
  save();
}

function deleteObject() {
  if (!editingObjId) return;
  if (!confirm('Remove this object?')) return;
  objects = objects.filter(o => o.id !== editingObjId);
  closeObjModal();
  const room = rooms.find(r => r.id === activeRoomId);
  if (room) buildRoomScene(room);
  save();
}

window.lcModals = {
  buildRoomChipPicker, getSelectedRoomIds, populateHomeWorkSelects, readSchedule,
  rebuildObjectUsagePrompts,
  CAM_PRESETS, setCamPreset, openRoomModal, closeRoomModal, saveRoom, uploadRoomBackdrop,
  initRoomPickerMap, openCharModal, closeCharModal, togglePromptPill, previewFile, saveCharacter,
  openObjModal, closeObjModal, saveObject, deleteObject,
  // Sprite helpers (called from inline onclick in built HTML)
  toggleSpriteSection,
};

export {
  buildRoomChipPicker, getSelectedRoomIds, populateHomeWorkSelects, readSchedule,
  rebuildObjectUsagePrompts,
  CAM_PRESETS, setCamPreset, openRoomModal, closeRoomModal, saveRoom, uploadRoomBackdrop,
  initRoomPickerMap, openCharModal, closeCharModal, togglePromptPill, previewFile, saveCharacter,
  openObjModal, closeObjModal, saveObject, deleteObject,
  toggleSpriteSection,
};
