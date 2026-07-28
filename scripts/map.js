// map.js — Leaflet map, GPS, proximity, compass, sim, day-segment

let _insideRoomIds = new Set();

// ── User position state ──────────────────────────────────────────────────────
let userMarker = null;       // L.marker / L.circleMarker for "You are here"
let userAccuracyCircle = null; // L.circle showing accuracy radius
let _gpsFirstFix = false;    // true after the very first fix snaps the map

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

// Returns the room ID a character is currently occupying given the day segment
function getActiveRoomId(character) {
  if (!character.schedule) return (character.roomIds && character.roomIds[0]) || character.roomId;
  const segValue = character.schedule[currentSegment] || 'home';
  if (segValue === 'home') return character.homeRoomId || (character.roomIds && character.roomIds[0]) || character.roomId;
  if (segValue === 'work') return character.workRoomId || (character.roomIds && character.roomIds[0]) || character.roomId;
  return segValue;
}

// ── User position marker helpers ─────────────────────────────────────────────

// Inject the pulse keyframes once into the document <head>
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
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #2979ff;
      border: 2.5px solid #fff;
      box-shadow: 0 0 0 2px rgba(41,121,255,0.4);
      position: relative;
    }
    .lc-user-dot::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: rgba(41,121,255,0.55);
      animation: lc-pulse 2s ease-out infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .lc-user-dot::after { animation: none; }
    }
  `;
  document.head.appendChild(style);
}());

function _makeUserIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="lc-user-dot"></div>',
    iconSize:   [16, 16],
    iconAnchor: [8, 8]
  });
}

/**
 * Place or move the "You are here" marker and accuracy circle.
 * @param {number} lat
 * @param {number} lng
 * @param {number} accuracy  metres (from coords.accuracy)
 */
function _updateUserMarker(lat, lng, accuracy) {
  if (!map) return;

  if (!userMarker) {
    userMarker = L.marker([lat, lng], {
      icon: _makeUserIcon(),
      zIndexOffset: 9999,  // always on top of character pins
      interactive: true
    }).addTo(map);
    userMarker.bindTooltip('You are here', { permanent: false, direction: 'top', offset: [0, -10] });
  } else {
    userMarker.setLatLng([lat, lng]);
  }

  const acc = accuracy || 0;
  if (!userAccuracyCircle) {
    userAccuracyCircle = L.circle([lat, lng], {
      radius: acc,
      color:       '#2979ff',
      fillColor:   '#2979ff',
      fillOpacity: 0.08,
      weight:      1.5,
      opacity:     0.5,
      interactive: false
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
  renderMapPins();

  // Try to center the map on the user's real position at startup.
  // The map is already visible with the default center; we silently
  // snap it once the browser returns a fix (or do nothing on error).
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        // Update global proximity variables (declared in index.html)
        userLat = lat;
        userLng = lng;
        // Snap map to user and place marker
        if (!_gpsFirstFix) {
          _gpsFirstFix = true;
          map.setView([lat, lng], map.getZoom());
        }
        _updateUserMarker(lat, lng, accuracy);
        // Refresh compass now that we have a position
        updateCompass();
      },
      () => { /* Geolocation denied or unavailable — stay on default center */ },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }
}

function renderMapPins() {
  map.eachLayer(l => { if (l._lcPin) map.removeLayer(l); });
  rooms.forEach(room => {
    const circle = L.circle([room.lat, room.lng], {
      radius: room.radius || 30, color: '#f5a623', fillColor: '#f5a623', fillOpacity: 0.08, weight: 1
    }).addTo(map);
    circle._lcPin = true;
    // Count characters scheduled to be in this room right now
    const charsHere = characters.filter(c => getActiveRoomId(c) === room.id);
    const objs = objects.filter(o => o.roomId === room.id);
    const icon = L.divIcon({ className: '', html:
      `<div style="background:#16213e;border:2px solid #f5a623;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;color:#f5a623;white-space:nowrap;cursor:pointer;">
        🏠 ${room.name}<br><span style="font-size:9px;color:#a0a0b0">${charsHere.length} char${charsHere.length !== 1 ? 's' : ''} · ${objs.length} obj${objs.length !== 1 ? 's' : ''}</span>
      </div>`, iconAnchor: [0, 0] });
    const marker = L.marker([room.lat, room.lng], { icon }).addTo(map);
    marker._lcPin = true;
    marker.on('click', () => window.openRoom(room.id));
  });
  characters.forEach(ch => {
    const activeRoom = rooms.find(r => r.id === getActiveRoomId(ch));
    if (!activeRoom) return;
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const jitter = (Math.random() - 0.5) * 0.0004;
    const icon = L.divIcon({ className: '', html:
      `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        <div style="width:44px;height:44px;border-radius:50%;border:3px solid ${mood.color};overflow:hidden;background:#0a0f1e;display:flex;align-items:center;justify-content:center;">
          ${ch.photoData ? `<img src="${ch.photoData}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:22px">🧸</span>'}
        </div>
        <div style="font-size:9px;font-weight:700;color:#eaeaea;background:rgba(10,15,30,.8);padding:1px 5px;border-radius:10px;margin-top:2px;white-space:nowrap;">${ch.name}</div>
      </div>`, iconAnchor: [22, 22] });
    const marker = L.marker([activeRoom.lat + jitter, activeRoom.lng + jitter], { icon }).addTo(map);
    marker._lcPin = true;
    marker.on('click', () => window.openCard(ch.id));
    marker.on('mouseover', e => showTooltip(ch, e.originalEvent));
    marker.on('mouseout', hideTooltip);
  });
}

function showTooltip(ch, evt) {
  const tt = document.getElementById('tooltip');
  const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
  const activeRoom = rooms.find(r => r.id === getActiveRoomId(ch));
  document.getElementById('tt-name').textContent = ch.name;
  document.getElementById('tt-loc').textContent = activeRoom ? activeRoom.name : '';
  document.getElementById('tt-mood').textContent = mood.emoji + ' ' + mood.label;
  tt.style.left = (evt.clientX + 12) + 'px';
  tt.style.top = (evt.clientY + 12) + 'px';
  tt.classList.add('show');
}

function hideTooltip() { document.getElementById('tooltip').classList.remove('show'); }

function startGPS() {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  document.getElementById('gps-status').textContent = 'GPS: acquiring…';
  gpsWatchId = navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    userLat = lat;
    userLng = lng;
    document.getElementById('gps-status').textContent = `GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Snap to user on the very first fix (only once)
    if (!_gpsFirstFix) {
      _gpsFirstFix = true;
      map.setView([lat, lng], map.getZoom());
    }

    // Update / create the "You are here" marker and accuracy circle
    _updateUserMarker(lat, lng, accuracy);

    checkProximity();
    updateCompass();
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
  if (!rooms.length) { alert('Add a room first.'); return; }
  simActive = true; let idx = 0;
  const step = () => {
    const room = rooms[idx % rooms.length];
    userLat = room.lat + (Math.random() - 0.5) * 0.0002;
    userLng = room.lng + (Math.random() - 0.5) * 0.0002;
    document.getElementById('gps-status').textContent = `Sim: near ${room.name}`;
    map.panTo([userLat, userLng]);
    // Update "You are here" marker during simulation too
    _updateUserMarker(userLat, userLng, 10);
    checkProximity(); updateCompass(); idx++;
  };
  step(); simInterval = setInterval(step, 4000);
}

function checkProximity() {
  if (userLat === null || facilitatorMode) return;
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
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateCompass() {
  const list = document.getElementById('compass-list');
  list.innerHTML = '';
  if (userLat === null) return;
  rooms.map(r => ({ ...r, dist: haversine(userLat, userLng, r.lat, r.lng) }))
    .sort((a, b) => a.dist - b.dist).slice(0, 5).forEach(r => {
      const inside = r.dist < (r.radius || 30);
      const item = document.createElement('div');
      item.className = 'compass-list-item' + (inside ? ' inside' : '');
      item.innerHTML = `<span class="room-name">${r.name}</span><span>${inside ? '✓ here' : Math.round(r.dist) + 'm'}</span>`;
      list.appendChild(item);
    });
}

function toggleMode() {
  facilitatorMode = !facilitatorMode;
  _insideRoomIds.clear();
  document.getElementById('mode-label').textContent = facilitatorMode ? 'Facilitator' : 'Visitor';
  document.querySelector('.hbtn.toggle-mode').textContent = facilitatorMode ? 'Projector' : 'Facilitator';
}

function spawnTestRoom() {
  const centre = map.getCenter();
  const roomId = 'room_' + Date.now();
  rooms.push({ id: roomId, name: 'Test Room', lede: 'A sun-warm garden.', lat: centre.lat, lng: centre.lng, radius: 30 });
  characters.push({
    id: 'char_' + Date.now(), name: 'Pebble', roomId, roomIds: [roomId],
    homeRoomId: roomId, workRoomId: roomId,
    schedule: { morning: 'home', midday: 'work', afternoon: 'work', evening: 'home', night: 'home' },
    mood: 'Happy', items: ['small rock', 'lucky leaf'],
    passages: [{ type: 'hello', text: 'Oh! A visitor. Hello!' }, { type: 'secret', text: 'I found a tiny door under the big root.' }],
    photoData: null, animData: null, glbUrl: DEFAULT_GLB_URL
  });
  objects.push({
    id: 'obj_test_' + Date.now(), roomId, name: 'Old Chest', glbUrl: '',
    position: { x: 2, y: 0, z: 2 }, rotation: { y: 0.5 }, scale: 1,
    description: 'A battered wooden chest. Something rattles inside.',
    interactable: true, context: 'home', usageTags: []
  });
  renderMapPins(); updateCompass(); save(); map.panTo([centre.lat, centre.lng]);
}

window.lcMap = {
  initMap, renderMapPins, showTooltip, hideTooltip,
  startGPS, startSim, checkProximity, haversine, updateCompass,
  toggleMode, spawnTestRoom, getActiveRoomId, setDaySegment
};

export {
  initMap, renderMapPins, showTooltip, hideTooltip,
  startGPS, startSim, checkProximity, haversine, updateCompass,
  toggleMode, spawnTestRoom, getActiveRoomId, setDaySegment
};
