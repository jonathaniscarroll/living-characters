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
// Sprite / Chroma Key state (module-level, reset on each openCharModal call)
// ---------------------------------------------------------------------------

let pendingSprites = { idle: [null, null], walk: [null, null], talk: [null, null], listen: [null, null] };
let chromaSettings = { h: 120, tolerance: 0.35, spill: 0.15 };
let eyedropperActive = false;

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

/** Hue (0-360) to CSS hex colour for the swatch */
function hueToHex(h) {
  const s = 1, l = 0.5;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return '#' + f(0) + f(8) + f(4);
}

/** Build and inject the Sprite Frames section into the char modal */
function buildSpriteSection(ch) {
  const existing = document.getElementById('sprite-frames-section');
  if (existing) existing.remove();

  // Reset state
  pendingSprites = { idle: [null, null], walk: [null, null], talk: [null, null], listen: [null, null] };
  chromaSettings = (ch && ch.chromaKey) ? { ...ch.chromaKey } : { h: 120, tolerance: 0.35, spill: 0.15 };
  eyedropperActive = false;

  // Seed existing sprites if editing a character
  if (ch && ch.sprites) {
    SPRITE_STATES.forEach(state => {
      if (ch.sprites[state]) {
        pendingSprites[state] = [ch.sprites[state][0] || null, ch.sprites[state][1] || null];
      }
    });
  }

  const section = document.createElement('div');
  section.id = 'sprite-frames-section';
  section.style.cssText = 'margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;';

  // Collapsible header
  section.innerHTML = `
    <button id="sprite-section-toggle" onclick="lcModals.toggleSpriteSection()" style="
      background:none;border:none;color:var(--text,#e0e0e0);font-size:13px;font-weight:600;
      cursor:pointer;padding:4px 0;display:flex;align-items:center;gap:6px;width:100%;text-align:left;
    ">
      <span id="sprite-section-arrow" style="display:inline-block;transition:transform .2s;">\u25B6</span>
      \uD83C\uDFAC Sprite Frames
    </button>
    <div id="sprite-section-body" style="display:none;margin-top:10px;">

      <!-- Chroma key controls -->
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
        <label style="font-size:11px;color:var(--text-muted,#999);width:100%;margin-bottom:2px;">\uD83D\uDD27 Chroma Key</label>

        <!-- Swatch + eyedropper -->
        <div style="display:flex;align-items:center;gap:6px;">
          <div id="chroma-swatch" style="width:28px;height:28px;border-radius:4px;border:2px solid rgba(255,255,255,0.2);background:${hueToHex(chromaSettings.h)};flex-shrink:0;"></div>
          <button id="chroma-eyedropper" onclick="lcModals.toggleEyedropper()" title="Pick colour from image" style="
            background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;
            color:var(--text,#e0e0e0);font-size:14px;padding:4px 8px;cursor:pointer;
          ">\uD83D\uDC41\uFE0F</button>
          <span id="chroma-eyedropper-hint" style="font-size:11px;color:var(--text-muted,#999);display:none;">Click a frame to sample colour</span>
        </div>

        <!-- Tolerance slider -->
        <div style="flex:1;min-width:140px;">
          <label style="font-size:11px;color:var(--text-muted,#999);">Amount removed: <span id="chroma-tolerance-val">${chromaSettings.tolerance.toFixed(2)}</span></label>
          <input type="range" id="chroma-tolerance" min="0" max="1" step="0.01" value="${chromaSettings.tolerance}"
            oninput="lcModals.onChromaTolerance(this.value)"
            style="width:100%;margin-top:3px;">
        </div>

        <!-- Spill slider -->
        <div style="flex:1;min-width:140px;">
          <label style="font-size:11px;color:var(--text-muted,#999);">Edge softness: <span id="chroma-spill-val">${chromaSettings.spill.toFixed(2)}</span></label>
          <input type="range" id="chroma-spill" min="0" max="1" step="0.01" value="${chromaSettings.spill}"
            oninput="lcModals.onChromaSpill(this.value)"
            style="width:100%;margin-top:3px;">
        </div>

        <!-- Apply all -->
        <button onclick="lcModals.applyChromaToAll()" style="
          background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:4px;
          color:var(--text,#e0e0e0);font-size:12px;padding:5px 10px;cursor:pointer;white-space:nowrap;
        ">Apply to all frames</button>
      </div>

      <!-- Sprite upload grid -->
      <div id="sprite-grid" style="display:flex;flex-direction:column;gap:8px;"></div>
    </div>
  `;

  // Insert before the first <hr> or at the bottom of the form
  const form = document.getElementById('char-modal-overlay');
  const target = form ? form.querySelector('.modal-actions, .char-save-btn, #char-modal-save') : null;
  if (target) {
    target.parentNode.insertBefore(section, target);
  } else {
    const modalBody = document.querySelector('#char-modal-overlay .modal-body, #char-modal-overlay .modal-scroll, #char-modal-overlay form');
    if (modalBody) modalBody.appendChild(section);
    else document.getElementById('char-modal-overlay').appendChild(section);
  }

  // Build grid rows
  buildSpriteGrid();
}

function buildSpriteGrid() {
  const grid = document.getElementById('sprite-grid');
  if (!grid) return;
  grid.innerHTML = '';

  SPRITE_STATES.forEach(state => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';

    const stateLabel = document.createElement('span');
    stateLabel.textContent = SPRITE_STATE_LABELS[state];
    stateLabel.style.cssText = 'font-size:11px;color:var(--text-muted,#999);width:36px;flex-shrink:0;text-transform:uppercase;letter-spacing:.5px;';
    row.appendChild(stateLabel);

    [0, 1].forEach(frameIdx => {
      const slot = buildSpriteSlot(state, frameIdx);
      row.appendChild(slot);
    });

    grid.appendChild(row);
  });
}

function buildSpriteSlot(state, frameIdx) {
  const dataUrl = pendingSprites[state][frameIdx];
  const slot = document.createElement('div');
  slot.id = `sprite-slot-${state}-${frameIdx}`;
  slot.style.cssText = `position:relative;width:64px;height:72px;border-radius:6px;border:1.5px dashed rgba(255,255,255,0.2);overflow:hidden;flex-shrink:0;cursor:pointer;${CHECKERBOARD_STYLE}`;

  if (dataUrl) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;';
    img.dataset.state = state;
    img.dataset.frame = frameIdx;
    img.addEventListener('click', onSpriteImgClick);
    slot.appendChild(img);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = '\u00D7';
    clearBtn.title = 'Remove frame';
    clearBtn.style.cssText = 'position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);border:none;color:#fff;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;';
    clearBtn.onclick = (e) => { e.stopPropagation(); clearSpriteSlot(state, frameIdx); };
    slot.appendChild(clearBtn);
  } else {
    const plus = document.createElement('span');
    plus.textContent = '+';
    plus.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:20px;color:rgba(255,255,255,0.3);pointer-events:none;';
    slot.appendChild(plus);

    const frameLabel = document.createElement('span');
    frameLabel.textContent = frameIdx === 0 ? 'A' : 'B';
    frameLabel.style.cssText = 'position:absolute;bottom:3px;left:0;right:0;text-align:center;font-size:9px;color:rgba(255,255,255,0.3);pointer-events:none;';
    slot.appendChild(frameLabel);
  }

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  fileInput.id = `sprite-input-${state}-${frameIdx}`;
  fileInput.addEventListener('change', () => onSpriteFileChange(fileInput, state, frameIdx));
  slot.appendChild(fileInput);

  slot.addEventListener('click', (e) => {
    if (eyedropperActive) return;
    if (e.target === slot || e.target.tagName === 'SPAN') {
      fileInput.click();
    }
  });

  return slot;
}

function onSpriteImgClick(e) {
  if (!eyedropperActive) return;
  const img = e.currentTarget;
  const rect = img.getBoundingClientRect();
  const scaleX = img.naturalWidth / rect.width;
  const scaleY = img.naturalHeight / rect.height;
  const x = Math.round((e.clientX - rect.left) * scaleX);
  const y = Math.round((e.clientY - rect.top) * scaleY);
  if (window.lcChroma && typeof window.lcChroma.sampleHue === 'function') {
    window.lcChroma.sampleHue(img.src, x, y).then(hue => {
      chromaSettings.h = Math.round(hue);
      updateChromaSwatch();
      deactivateEyedropper();
      const state = img.dataset.state;
      const frame = parseInt(img.dataset.frame, 10);
      rerunChromaOnSlot(state, frame);
    }).catch(() => deactivateEyedropper());
  } else {
    deactivateEyedropper();
  }
  e.stopPropagation();
}

function onSpriteFileChange(input, state, frameIdx) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const raw = e.target.result;
    let keyed = raw;
    if (window.lcChroma && typeof window.lcChroma.chromaKey === 'function') {
      try { keyed = await window.lcChroma.chromaKey(raw, chromaSettings); } catch (_) {}
    }
    pendingSprites[state][frameIdx] = keyed;
    refreshSpriteSlot(state, frameIdx);
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function refreshSpriteSlot(state, frameIdx) {
  const slot = document.getElementById(`sprite-slot-${state}-${frameIdx}`);
  if (!slot) return;
  const newSlot = buildSpriteSlot(state, frameIdx);
  slot.parentNode.replaceChild(newSlot, slot);
}

function clearSpriteSlot(state, frameIdx) {
  pendingSprites[state][frameIdx] = null;
  refreshSpriteSlot(state, frameIdx);
}

async function rerunChromaOnSlot(state, frameIdx) {
  const current = pendingSprites[state][frameIdx];
  if (!current || !window.lcChroma) return;
  try {
    const keyed = await window.lcChroma.chromaKey(current, chromaSettings);
    pendingSprites[state][frameIdx] = keyed;
    refreshSpriteSlot(state, frameIdx);
  } catch (_) {}
}

// --- Chroma UI event handlers ---

function onChromaTolerance(val) {
  chromaSettings.tolerance = parseFloat(val);
  const el = document.getElementById('chroma-tolerance-val');
  if (el) el.textContent = chromaSettings.tolerance.toFixed(2);
}

function onChromaSpill(val) {
  chromaSettings.spill = parseFloat(val);
  const el = document.getElementById('chroma-spill-val');
  if (el) el.textContent = chromaSettings.spill.toFixed(2);
}

async function applyChromaToAll() {
  if (!window.lcChroma) return;
  const btn = document.querySelector('#sprite-frames-section button[onclick*="applyChromaToAll"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Applying\u2026'; }
  for (const state of SPRITE_STATES) {
    for (let i = 0; i < 2; i++) {
      await rerunChromaOnSlot(state, i);
    }
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Apply to all frames'; }
}

function updateChromaSwatch() {
  const swatch = document.getElementById('chroma-swatch');
  if (swatch) swatch.style.background = hueToHex(chromaSettings.h);
}

function toggleEyedropper() {
  eyedropperActive = !eyedropperActive;
  const btn = document.getElementById('chroma-eyedropper');
  const hint = document.getElementById('chroma-eyedropper-hint');
  if (btn) btn.style.background = eyedropperActive ? 'rgba(255,200,0,.25)' : 'rgba(255,255,255,0.08)';
  if (hint) hint.style.display = eyedropperActive ? 'inline' : 'none';
}

function deactivateEyedropper() {
  eyedropperActive = false;
  const btn = document.getElementById('chroma-eyedropper');
  const hint = document.getElementById('chroma-eyedropper-hint');
  if (btn) btn.style.background = 'rgba(255,255,255,0.08)';
  if (hint) hint.style.display = 'none';
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
  eyedropperActive = false;
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

  // Build sprites object — only include states that have at least one frame
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

  // Persist sprites and chroma settings if any frames were uploaded
  if (hasAnySprite) {
    data.sprites   = sprites;
    data.chromaKey = { ...chromaSettings };
  } else if (editingCharId) {
    const existingChar = characters.find(c => c.id === editingCharId);
    if (existingChar && existingChar.sprites) {
      data.sprites   = existingChar.sprites;
      data.chromaKey = existingChar.chromaKey;
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
  save();

  if (savedId) {
    document.dispatchEvent(new CustomEvent('lc:character-saved', { detail: { id: savedId } }));
  }

  const charLabel   = isNew ? `Add character: ${name}` : `Update character: ${name}`;
  const commitInput = document.getElementById('gh-commit-input');
  const prevMsg     = commitInput ? commitInput.value : '';
  if (commitInput) commitInput.value = charLabel;
  if (window.lcStore && typeof window.lcStore.ghSave === 'function') {
    window.lcStore.ghSave().finally(() => { if (commitInput) commitInput.value = prevMsg; });
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
  // Sprite/chroma helpers (called from inline onclick in built HTML)
  toggleSpriteSection, toggleEyedropper, onChromaTolerance, onChromaSpill, applyChromaToAll,
};

export {
  buildRoomChipPicker, getSelectedRoomIds, populateHomeWorkSelects, readSchedule,
  rebuildObjectUsagePrompts,
  CAM_PRESETS, setCamPreset, openRoomModal, closeRoomModal, saveRoom, uploadRoomBackdrop,
  initRoomPickerMap, openCharModal, closeCharModal, togglePromptPill, previewFile, saveCharacter,
  openObjModal, closeObjModal, saveObject, deleteObject,
  toggleSpriteSection, toggleEyedropper, onChromaTolerance, onChromaSpill, applyChromaToAll,
};
