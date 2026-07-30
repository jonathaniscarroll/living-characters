// map.js — Leaflet map, GPS, proximity, compass, sim, day-segment
// AR workflow:
//   Editor mode  : tap empty map → Add Character modal pre-filled with that lat/lng
//   Viewer mode  : tap character pin → if within AR_RANGE metres → Visit in AR
//                                     else → toast "Move closer to visit"

const AR_RANGE = 50; // metres — how close a visitor must be to enter AR

let _insideRoomIds = new Set();

// ── User position state ──────────────────────────────────────────────────────
let userMarker = null;
let userAccuracyCircle = null;
let _gpsFirstFix = false;

// ── Day segment ──────────────────────────────────────────────────────────────
let currentSegment = 'morning';

function setDaySegment(seg) {
  currentSegment = seg;
  document.querySelectorAll('.day-seg').forEach(b => b.classList.toggle('active', b.dataset.seg === seg));
  renderMapPins();
  if (activeRoomId) {
    const room = rooms.find(r => r.id === activeRoomId);
    if (room) window.lcRoom && window.lcRoom.buildRoomScene(room);
  }
}

function getActiveRoomId(character) {
  if (!character.schedule) return (character.roomIds && character.roomIds[0]) || character.roomId;
  const segValue = character.schedule[currentSegment] || 'home';
  if (segValue === 'home') return character.homeRoomId || (character.roomIds && character.roomIds[0]) || character.roomId;
  if (segValue === 'work') return character.workRoomId || (character.roomIds && character.roomIds[0]) || character.roomId;
  return segValue;
}

// ── User position marker helpers ─────────────────────────────────────────────

(function _injectPulseStyle() {
  if (document.getElementById('lc-user-pulse-style')) return;
  const style = document.createElement('style');
  style.id = 'lc-user-pulse-style';
  style.textContent = `
    @keyframes lc-pulse {
      0%   { transform: scale(1);   opacity: 1; }
      70%  { transform: scale(2.4); opacity: 0; }
      100% { transform: scale(1);   opacity: 0; }
    }
    .lc-user-dot {
      width: 16px; height: 16px; border-radius: 50%;
      background: #2979ff; border: 2.5px solid #fff;
      box-shadow: 0 0 0 2px rgba(41,121,255,0.4); position: relative;
    }
    .lc-user-dot::after {
      content: ''; position: absolute; inset: 0; border-radius: 50%;
      background: rgba(41,121,255,0.55);
      animation: lc-pulse 2s ease-out infinite;
    }
    @media (prefers-reduced-motion: reduce) { .lc-user-dot::after { animation: none; } }

    /* AR-range ring on character pins (viewer mode) */
    @keyframes lc-ar-ring {
      0%   { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.9); opacity: 0; }
    }
    .lc-ar-ring {
      position: absolute; inset: -6px; border-radius: 50%;
      border: 2px solid #01696f;
      animation: lc-ar-ring 2.2s ease-out infinite;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}());

function _makeUserIcon() {
  return L.divIcon({
    className: '', html: '<div class="lc-user-dot"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
}

function _updateUserMarker(lat, lng, accuracy) {
  if (!map) return;
  if (!userMarker) {
    userMarker = L.marker([lat, lng], {
      icon: _makeUserIcon(), zIndexOffset: 9999, interactive: true
    }).addTo(map);
    userMarker.bindTooltip('You are here', { permanent: false, direction: 'top', offset: [0, -10] });
  } else {
    userMarker.setLatLng([lat, lng]);
  }
  const acc = accuracy || 0;
  if (!userAccuracyCircle) {
    userAccuracyCircle = L.circle([lat, lng], {
      radius: acc, color: '#2979ff', fillColor: '#2979ff',
      fillOpacity: 0.08, weight: 1.5, opacity: 0.5, interactive: false
    }).addTo(map);
  } else {
    userAccuracyCircle.setLatLng([lat, lng]);
    userAccuracyCircle.setRadius(acc);
  }
}

// ── Map init ─────────────────────────────────────────────────────────────────

const DEFAULT_CENTER = [44.65, -63.59];
const DEFAULT_ZOOM   = 16;

function initMap() {
  map = L.map('map', { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);

  // ── Editor mode: tap empty map → Add Character at that position ──────────
  map.on('click', function (e) {
    if (!facilitatorMode) return;          // only in editor / facilitator mode
    // Ignore if a pin or room circle was clicked (they stop propagation)
    _openAddCharacterAt(e.latlng.lat, e.latlng.lng);
  });

  renderMapPins();

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        userLat = lat; userLng = lng;
        if (!_gpsFirstFix) { _gpsFirstFix = true; map.setView([lat, lng], map.getZoom()); }
        _updateUserMarker(lat, lng, accuracy);
        updateCompass();
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }
}

// ── Editor: open Add-Character modal pre-filled with map coords ───────────────

function _openAddCharacterAt(lat, lng) {
  // Prefer the existing addCharacter / openAddModal helpers if present
  if (typeof window.openAddCharacterModal === 'function') {
    window.openAddCharacterModal({ lat, lng });
    return;
  }
  // Fallback: find the Add Character button and click it, then inject coords
  const addBtn = document.querySelector(
    '#add-char-btn, [data-action="add-character"], .add-character-btn, button[onclick*="addChar"]'
  );
  if (addBtn) {
    addBtn.click();
    // After the modal renders, fill the lat/lng fields if they exist
    requestAnimationFrame(() => _injectCoordsIntoModal(lat, lng));
  } else {
    // Last resort: store pending coords and let the modal's own init pick them up
    window._pendingCharLat = lat;
    window._pendingCharLng = lng;
    // Try triggering a custom event modals.js can listen to
    document.dispatchEvent(new CustomEvent('lc:add-character-at', { detail: { lat, lng } }));
  }
}

function _injectCoordsIntoModal(lat, lng) {
  // Try explicit lat/lng inputs first
  const latInput = document.querySelector('#char-lat, input[name="lat"], input[placeholder*="lat"]');
  const lngInput = document.querySelector('#char-lng, input[name="lng"], input[placeholder*="lng"], input[placeholder*="lon"]');
  if (latInput) { latInput.value = lat.toFixed(6); latInput.dispatchEvent(new Event('input')); }
  if (lngInput) { lngInput.value = lng.toFixed(6); lngInput.dispatchEvent(new Event('input')); }
  // Store on window as fallback so form-save handlers can read them
  window._pendingCharLat = lat;
  window._pendingCharLng = lng;
}

// ── Pin rendering ─────────────────────────────────────────────────────────────

function _charLatLng(ch) {
  // Characters authored on the map have lat/lng stored directly.
  // Fallback: use their active room's position (legacy behaviour).
  if (typeof ch.lat === 'number' && typeof ch.lng === 'number') {
    return { lat: ch.lat, lng: ch.lng };
  }
  const activeRoom = rooms.find(r => r.id === getActiveRoomId(ch));
  if (activeRoom) return { lat: activeRoom.lat, lng: activeRoom.lng };
  return null;
}

function _isNearCharacter(ch) {
  if (userLat === null || userLng === null) return false;
  const pos = _charLatLng(ch);
  if (!pos) return false;
  return haversine(userLat, userLng, pos.lat, pos.lng) <= AR_RANGE;
}

function renderMapPins() {
  map.eachLayer(l => { if (l._lcPin) map.removeLayer(l); });

  // Room circles (facilitator context — kept for legacy room workflow)
  rooms.forEach(room => {
    const circle = L.circle([room.lat, room.lng], {
      radius: room.radius || 30, color: '#f5a623',
      fillColor: '#f5a623', fillOpacity: 0.08, weight: 1
    }).addTo(map);
    circle._lcPin = true;
    const charsHere = characters.filter(c => getActiveRoomId(c) === room.id);
    const objs = objects.filter(o => o.roomId === room.id);
    const icon = L.divIcon({ className: '', html:
      `<div style="background:#16213e;border:2px solid #f5a623;border-radius:8px;padding:4px 8px;
                  font-size:11px;font-weight:700;color:#f5a623;white-space:nowrap;cursor:pointer;">
        🏠 ${room.name}<br>
        <span style="font-size:9px;color:#a0a0b0">${charsHere.length} char${charsHere.length!==1?'s':''} · ${objs.length} obj${objs.length!==1?'s':''}</span>
      </div>`, iconAnchor: [0, 0] });
    const marker = L.marker([room.lat, room.lng], { icon }).addTo(map);
    marker._lcPin = true;
    marker.on('click', (e) => { L.DomEvent.stopPropagation(e); window.openRoom(room.id); });
  });

  // Character pins
  characters.forEach(ch => {
    const pos = _charLatLng(ch);
    if (!pos) return;

    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const near = _isNearCharacter(ch);
    const arEnabled = ch.arEnabled !== false;

    // AR pulse ring only shown in viewer mode when character is nearby
    const ringHTML = (!facilitatorMode && arEnabled && near)
      ? '<div class="lc-ar-ring"></div>' : '';

    // Small camera badge on pin when AR is available (viewer mode)
    const arBadge = (!facilitatorMode && arEnabled)
      ? `<div style="position:absolute;top:-4px;right:-4px;background:#01696f;color:#fff;
                    border-radius:50%;width:16px;height:16px;font-size:10px;
                    display:flex;align-items:center;justify-content:center;
                    border:1.5px solid #fff;" title="Visit in AR">📷</div>` : '';

    const icon = L.divIcon({ className: '', html:
      `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;position:relative;">
        <div style="position:relative;">
          ${ringHTML}
          <div style="width:44px;height:44px;border-radius:50%;border:3px solid ${mood.color};
                      overflow:hidden;background:#0a0f1e;
                      display:flex;align-items:center;justify-content:center;">
            ${ch.photoData
              ? `<img src="${ch.photoData}" style="width:100%;height:100%;object-fit:cover" alt="${ch.name}">`
              : '<span style="font-size:22px">🧸</span>'}
          </div>
          ${arBadge}
        </div>
        <div style="font-size:9px;font-weight:700;color:#eaeaea;background:rgba(10,15,30,.8);
                    padding:1px 5px;border-radius:10px;margin-top:2px;white-space:nowrap;">
          ${ch.name}
        </div>
      </div>`, iconAnchor: [22, 22] });

    const marker = L.marker([pos.lat, pos.lng], { icon }).addTo(map);
    marker._lcPin = true;

    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);

      if (facilitatorMode) {
        // Editor: open the character card as before
        window.openCard(ch.id);
        return;
      }

      // Viewer mode ──────────────────────────────────────────────────────────
      if (!arEnabled) {
        window.openCard(ch.id);
        return;
      }

      if (_isNearCharacter(ch)) {
        // Close any open card, then launch AR
        if (typeof window.closeCard === 'function') window.closeCard();
        window.ARView.open(ch);
      } else {
        const pos2 = _charLatLng(ch);
        const dist = (userLat !== null && pos2)
          ? Math.round(haversine(userLat, userLng, pos2.lat, pos2.lng)) + 'm away'
          : '';
        showToast(`📍 Move closer to visit ${ch.name}${dist ? ' (' + dist + ')' : ''}`);
        // Still open the card so they can read dialogue / items from afar
        window.openCard(ch.id);
      }
    });

    marker.on('mouseover', e => showTooltip(ch, e.originalEvent));
    marker.on('mouseout', hideTooltip);
  });
}

function showTooltip(ch, evt) {
  const tt   = document.getElementById('tooltip');
  const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
  const pos  = _charLatLng(ch);
  const near = _isNearCharacter(ch);
  document.getElementById('tt-name').textContent = ch.name;
  document.getElementById('tt-loc').textContent  = pos
    ? (near && !facilitatorMode ? '📷 Tap to visit in AR' : `${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`)
    : '';
  document.getElementById('tt-mood').textContent = mood.emoji + ' ' + mood.label;
  tt.style.left = (evt.clientX + 12) + 'px';
  tt.style.top  = (evt.clientY + 12) + 'px';
  tt.classList.add('show');
}

function hideTooltip() { document.getElementById('tooltip').classList.remove('show'); }

// ── GPS ───────────────────────────────────────────────────────────────────────

function startGPS() {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  document.getElementById('gps-status').textContent = 'GPS: acquiring…';
  gpsWatchId = navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    userLat = lat; userLng = lng;
    document.getElementById('gps-status').textContent = `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    if (!_gpsFirstFix) { _gpsFirstFix = true; map.setView([lat, lng], map.getZoom()); }
    _updateUserMarker(lat, lng, accuracy);
    checkProximity();
    updateCompass();
    // Re-render pins so AR rings appear / disappear as user moves
    renderMapPins();
  }, err => {
    const msgs = { 1: 'permission denied', 2: 'position unavailable', 3: 'timeout' };
    document.getElementById('gps-status').textContent = 'GPS: ' + (msgs[err.code] || err.message || 'error');
  }, { enableHighAccuracy: true });
}

function startSim() {
  if (simActive) {
    clearInterval(simInterval); simActive = false; _insideRoomIds.clear();
    document.getElementById('gps-status').textContent = 'Sim: stopped'; return;
  }
  if (!rooms.length && !characters.length) { alert('Add a room or character first.'); return; }
  simActive = true; let idx = 0;
  // Sim over character positions if they have lat/lng, else rooms
  const targets = characters.filter(c => typeof c.lat === 'number').length
    ? characters.filter(c => typeof c.lat === 'number')
    : rooms;
  const step = () => {
    const t = targets[idx % targets.length];
    userLat = t.lat + (Math.random() - 0.5) * 0.0002;
    userLng = t.lng + (Math.random() - 0.5) * 0.0002;
    document.getElementById('gps-status').textContent = `Sim: near ${t.name}`;
    map.panTo([userLat, userLng]);
    _updateUserMarker(userLat, userLng, 10);
    checkProximity(); updateCompass(); renderMapPins(); idx++;
  };
  step(); simInterval = setInterval(step, 4000);
}

// ── Proximity (viewer mode) ───────────────────────────────────────────────────

function checkProximity() {
  if (userLat === null || facilitatorMode) return;

  // Character proximity (AR workflow)
  characters.forEach(ch => {
    if (ch.arEnabled === false) return;
    const pos = _charLatLng(ch);
    if (!pos) return;
    const dist = haversine(userLat, userLng, pos.lat, pos.lng);
    const key  = 'ar_entered_' + ch.id;
    if (dist <= AR_RANGE && !window[key]) {
      window[key] = true;
      showToast(`📷 ${ch.name} is nearby — tap their pin to visit in AR`);
    } else if (dist > AR_RANGE) {
      window[key] = false;
    }
  });

  // Legacy room proximity
  const nowInside = new Set();
  rooms.forEach(room => {
    const dist = haversine(userLat, userLng, room.lat, room.lng);
    if (dist < (room.radius || 30)) nowInside.add(room.id);
  });
  nowInside.forEach(roomId => {
    if (!_insideRoomIds.has(roomId)) {
      const room = rooms.find(r => r.id === roomId);
      showToast('📍 Entering ' + (room ? room.name : 'room') + '…');
      if (activeRoomId !== roomId) window.openRoom(roomId);
    }
  });
  _insideRoomIds.forEach(roomId => {
    if (!nowInside.has(roomId)) {
      const room = rooms.find(r => r.id === roomId);
      showToast('🚶 Left ' + (room ? room.name : 'room'));
      if (activeRoomId === roomId) window.closeRoom();
    }
  });
  _insideRoomIds = nowInside;
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Compass ───────────────────────────────────────────────────────────────────

function updateCompass() {
  const list = document.getElementById('compass-list');
  list.innerHTML = '';
  if (userLat === null) return;

  // Show characters in compass if they have lat/lng, else fall back to rooms
  const sources = characters.filter(c => typeof c.lat === 'number').length
    ? characters.map(c => {
        const pos = _charLatLng(c);
        return pos ? { ...c, _pos: pos, dist: haversine(userLat, userLng, pos.lat, pos.lng) } : null;
      }).filter(Boolean)
    : rooms.map(r => ({ ...r, _pos: { lat: r.lat, lng: r.lng }, dist: haversine(userLat, userLng, r.lat, r.lng) }));

  sources.sort((a, b) => a.dist - b.dist).slice(0, 5).forEach(s => {
    const inside = s.dist <= AR_RANGE;
    const item = document.createElement('div');
    item.className = 'compass-list-item' + (inside ? ' inside' : '');
    item.innerHTML = `<span class="room-name">${s.name}</span><span>${inside ? '📷 here' : Math.round(s.dist) + 'm'}</span>`;
    list.appendChild(item);
  });
}

// ── Mode toggle ───────────────────────────────────────────────────────────────

function toggleMode() {
  facilitatorMode = !facilitatorMode;
  _insideRoomIds.clear();
  // Reset AR-entered flags
  characters.forEach(ch => { window['ar_entered_' + ch.id] = false; });
  document.getElementById('mode-label').textContent = facilitatorMode ? 'Facilitator' : 'Visitor';
  document.querySelector('.hbtn.toggle-mode').textContent = facilitatorMode ? 'Projector' : 'Facilitator';
  renderMapPins(); // re-render so AR badges / rings update
}

// ── Spawn test character at map centre ───────────────────────────────────────

function spawnTestRoom() {
  const centre = map.getCenter();
  const roomId = 'room_' + Date.now();
  rooms.push({ id: roomId, name: 'Test Room', lede: 'A sun-warm garden.', lat: centre.lat, lng: centre.lng, radius: 30 });
  const chId = 'char_' + Date.now();
  characters.push({
    id: chId, name: 'Pebble', roomId, roomIds: [roomId],
    homeRoomId: roomId, workRoomId: roomId,
    // Direct lat/lng for AR placement
    lat: centre.lat, lng: centre.lng,
    schedule: { morning: 'home', midday: 'work', afternoon: 'work', evening: 'home', night: 'home' },
    mood: 'Happy', items: ['small rock', 'lucky leaf'],
    passages: [
      { type: 'hello',  text: 'Oh! A visitor. Hello!' },
      { type: 'secret', text: 'I found a tiny door under the big root.' }
    ],
    photoData: null, animData: null, glbUrl: DEFAULT_GLB_URL,
    arEnabled: true, arScale: 1.0, arYOffset: 0
  });
  objects.push({
    id: 'obj_test_' + Date.now(), roomId, name: 'Old Chest', glbUrl: '',
    position: { x: 2, y: 0, z: 2 }, rotation: { y: 0.5 }, scale: 1,
    description: 'A battered wooden chest. Something rattles inside.',
    interactable: true, context: 'home', usageTags: []
  });
  renderMapPins(); updateCompass(); save(); map.panTo([centre.lat, centre.lng]);
}

// ── Expose to modals/store so newly saved characters pick up pending coords ───

document.addEventListener('lc:character-saved', (e) => {
  // If a character was just saved and we have pending map coords, apply them
  if (window._pendingCharLat !== undefined && e.detail && e.detail.id) {
    const ch = characters.find(c => c.id === e.detail.id);
    if (ch) {
      ch.lat = window._pendingCharLat;
      ch.lng = window._pendingCharLng;
      save();
      renderMapPins();
    }
    delete window._pendingCharLat;
    delete window._pendingCharLng;
  }
});

window.lcMap = {
  initMap, renderMapPins, showTooltip, hideTooltip,
  startGPS, startSim, checkProximity, haversine, updateCompass,
  toggleMode, spawnTestRoom, getActiveRoomId, setDaySegment,
  AR_RANGE
};

export {
  initMap, renderMapPins, showTooltip, hideTooltip,
  startGPS, startSim, checkProximity, haversine, updateCompass,
  toggleMode, spawnTestRoom, getActiveRoomId, setDaySegment
};
