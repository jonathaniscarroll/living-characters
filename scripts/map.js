// map.js — Leaflet map, GPS, proximity, compass, sim

// Track which rooms the player is currently inside, to detect enter/exit edges
let _insideRoomIds = new Set();

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([44.65, -63.59], 16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);
  renderMapPins();
}

function renderMapPins() {
  map.eachLayer(l => { if (l._lcPin) map.removeLayer(l); });
  rooms.forEach(room => {
    const circle = L.circle([room.lat, room.lng], {
      radius: room.radius || 30, color: '#f5a623', fillColor: '#f5a623', fillOpacity: 0.08, weight: 1
    }).addTo(map);
    circle._lcPin = true;
    const chars = characters.filter(c => (c.roomIds || [c.roomId]).includes(room.id));
    const objs = objects.filter(o => o.roomId === room.id);
    const icon = L.divIcon({ className: '', html:
      `<div style="background:#16213e;border:2px solid #f5a623;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;color:#f5a623;white-space:nowrap;cursor:pointer;">
        🏠 ${room.name}<br><span style="font-size:9px;color:#a0a0b0">${chars.length} char${chars.length !== 1 ? 's' : ''} · ${objs.length} obj${objs.length !== 1 ? 's' : ''}</span>
      </div>`, iconAnchor: [0, 0] });
    const marker = L.marker([room.lat, room.lng], { icon }).addTo(map);
    marker._lcPin = true;
    marker.on('click', () => window.openRoom(room.id));
  });
  characters.forEach(ch => {
    const primaryRoomId = (ch.roomIds && ch.roomIds[0]) || ch.roomId;
    const room = rooms.find(r => r.id === primaryRoomId);
    if (!room) return;
    const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
    const jitter = (Math.random() - 0.5) * 0.0004;
    const icon = L.divIcon({ className: '', html:
      `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
        <div style="width:44px;height:44px;border-radius:50%;border:3px solid ${mood.color};overflow:hidden;background:#0a0f1e;display:flex;align-items:center;justify-content:center;">
          ${ch.photoData ? `<img src="${ch.photoData}" style="width:100%;height:100%;object-fit:cover">` : '<span style="font-size:22px">🧸</span>'}
        </div>
        <div style="font-size:9px;font-weight:700;color:#eaeaea;background:rgba(10,15,30,.8);padding:1px 5px;border-radius:10px;margin-top:2px;white-space:nowrap;">${ch.name}</div>
      </div>`, iconAnchor: [22, 22] });
    const marker = L.marker([room.lat + jitter, room.lng + jitter], { icon }).addTo(map);
    marker._lcPin = true;
    marker.on('click', () => window.openCard(ch.id));
    marker.on('mouseover', e => showTooltip(ch, e.originalEvent));
    marker.on('mouseout', hideTooltip);
  });
}

function showTooltip(ch, evt) {
  const tt = document.getElementById('tooltip');
  const mood = MOODS.find(m => m.label === ch.mood) || MOODS[0];
  const primaryRoomId = (ch.roomIds && ch.roomIds[0]) || ch.roomId;
  const room = rooms.find(r => r.id === primaryRoomId);
  document.getElementById('tt-name').textContent = ch.name;
  document.getElementById('tt-loc').textContent = room ? room.name + (ch.roomIds && ch.roomIds.length > 1 ? ` +${ch.roomIds.length - 1}` : '') : '';
  document.getElementById('tt-mood').textContent = mood.emoji + ' ' + mood.label;
  tt.style.left = (evt.clientX + 12) + 'px';
  tt.style.top = (evt.clientY + 12) + 'px';
  tt.classList.add('show');
}

function hideTooltip() {
  document.getElementById('tooltip').classList.remove('show');
}

function startGPS() {
  if (!navigator.geolocation) { alert('Geolocation not supported.'); return; }
  document.getElementById('gps-status').textContent = 'GPS: acquiring…';
  gpsWatchId = navigator.geolocation.watchPosition(pos => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    document.getElementById('gps-status').textContent = `GPS: ${userLat.toFixed(4)}, ${userLng.toFixed(4)}`;
    checkProximity();
    updateCompass();
  }, err => {
    const msgs = { 1: 'permission denied', 2: 'position unavailable', 3: 'timeout' };
    document.getElementById('gps-status').textContent = 'GPS: ' + (msgs[err.code] || err.message || 'error');
  }, { enableHighAccuracy: true });
}

function startSim() {
  if (simActive) {
    clearInterval(simInterval);
    simActive = false;
    _insideRoomIds.clear();
    document.getElementById('gps-status').textContent = 'Sim: stopped';
    return;
  }
  if (!rooms.length) { alert('Add a room first.'); return; }
  simActive = true;
  let idx = 0;
  const step = () => {
    const room = rooms[idx % rooms.length];
    userLat = room.lat + (Math.random() - 0.5) * 0.0002;
    userLng = room.lng + (Math.random() - 0.5) * 0.0002;
    document.getElementById('gps-status').textContent = `Sim: near ${room.name}`;
    map.panTo([userLat, userLng]);
    checkProximity();
    updateCompass();
    idx++;
  };
  step();
  simInterval = setInterval(step, 4000);
}

function checkProximity() {
  if (userLat === null || facilitatorMode) return;

  const nowInside = new Set();
  rooms.forEach(room => {
    const dist = haversine(userLat, userLng, room.lat, room.lng);
    if (dist < (room.radius || 30)) nowInside.add(room.id);
  });

  // Entered rooms (were outside, now inside)
  nowInside.forEach(roomId => {
    if (!_insideRoomIds.has(roomId)) {
      const room = rooms.find(r => r.id === roomId);
      showToast('📍 Entering ' + (room ? room.name : 'room') + '…');
      // Only open if no room is currently open, or this is a different room
      if (activeRoomId !== roomId) {
        window.openRoom(roomId);
      }
    }
  });

  // Exited rooms (were inside, now outside)
  _insideRoomIds.forEach(roomId => {
    if (!nowInside.has(roomId)) {
      const room = rooms.find(r => r.id === roomId);
      showToast('🚶 Left ' + (room ? room.name : 'room'));
      // Close room view if the player left the active room
      if (activeRoomId === roomId) {
        window.closeRoom();
      }
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
  rooms.map(r => ({ ...r, dist: haversine(userLat, userLng, r.lat, r.lng) })).sort((a, b) => a.dist - b.dist).slice(0, 5).forEach(r => {
    const inside = r.dist < (r.radius || 30);
    const item = document.createElement('div');
    item.className = 'compass-list-item' + (inside ? ' inside' : '');
    item.innerHTML = `<span class="room-name">${r.name}</span><span>${inside ? '✓ here' : Math.round(r.dist) + 'm'}</span>`;
    list.appendChild(item);
  });
}

function toggleMode() {
  facilitatorMode = !facilitatorMode;
  // Reset inside-tracking when switching modes so enter events fire cleanly
  _insideRoomIds.clear();
  document.getElementById('mode-label').textContent = facilitatorMode ? 'Facilitator' : 'Visitor';
  document.querySelector('.hbtn.toggle-mode').textContent = facilitatorMode ? 'Projector' : 'Facilitator';
}

function spawnTestRoom() {
  const centre = map.getCenter();
  const roomId = 'room_' + Date.now();
  rooms.push({ id: roomId, name: 'Test Room', lede: 'A sun-warm garden.', lat: centre.lat, lng: centre.lng, radius: 30, backdrop: 'grass' });
  characters.push({
    id: 'char_' + Date.now(), name: 'Pebble', roomId, roomIds: [roomId], mood: 'Happy',
    items: ['small rock', 'lucky leaf'],
    passages: [{ type: 'hello', text: 'Oh! A visitor. Hello!' }, { type: 'secret', text: 'I found a tiny door under the big root.' }],
    photoData: null, animData: null, glbUrl: DEFAULT_GLB_URL
  });
  objects.push({
    id: 'obj_test_' + Date.now(),
    roomId,
    name: 'Old Chest',
    glbUrl: '',
    position: { x: 2, y: 0, z: 2 },
    rotation: { y: 0.5 },
    scale: 1,
    description: 'A battered wooden chest. Something rattles inside.',
    interactable: true
  });
  renderMapPins();
  updateCompass();
  save();
  map.panTo([centre.lat, centre.lng]);
}

window.lcMap = {
  initMap,
  renderMapPins,
  showTooltip,
  hideTooltip,
  startGPS,
  startSim,
  checkProximity,
  haversine,
  updateCompass,
  toggleMode,
  spawnTestRoom
};

export {
  initMap,
  renderMapPins,
  showTooltip,
  hideTooltip,
  startGPS,
  startSim,
  checkProximity,
  haversine,
  updateCompass,
  toggleMode,
  spawnTestRoom
};
