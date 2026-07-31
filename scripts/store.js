const GH_OWNER = 'jonathaniscarroll';
const GH_REPO = 'living-characters';
const GH_PATH = 'story/main.twee';
const GH_BRANCH = 'main';

const GH_RAW_URL = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${GH_PATH}`;
function rawUrlFresh() { return GH_RAW_URL + '?v=' + Date.now(); }

let ghFileSha = null;

function decodeBase64Unicode(b64) {
  return decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
}

function getToken() {
  return document.getElementById('gh-token-input').value.trim() || localStorage.getItem('lc_gh_token') || '';
}

function setGhStatus(msg, cls) {
  const el = document.getElementById('gh-status');
  if (!el) return;
  el.textContent = msg;
  el.className = cls || '';
}

async function seedGhFileSha(token) {
  try {
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (token) headers.Authorization = 'token ' + token;
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`, { headers });
    if (res.ok) { const data = await res.json(); ghFileSha = data.sha; setGhStatus('ready \u2713', 'ok'); }
  } catch (_) {}
}

function onTokenInput() {
  const t = document.getElementById('gh-token-input').value.trim();
  if (t) { localStorage.setItem('lc_gh_token', t); setGhStatus('token saved \u2713', 'ok'); seedGhFileSha(t); }
}

async function autoLoadFromGitHub() {
  setGhStatus('Loading world\u2026');
  try {
    const res = await fetch(rawUrlFresh());
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const src = await res.text();
    if (src.trim().length < 10) throw new Error('empty');
    importTweeSource(src, true);
    setGhStatus('World loaded \u2713', 'ok');
    showToast('World loaded \u2713', 'ok');
    const token = getToken();
    if (token) {
      seedGhFileSha(token);
    } else {
      const metaRes = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`,
        { headers: { Accept: 'application/vnd.github.v3+json' } }
      );
      if (metaRes.ok) { const d = await metaRes.json(); ghFileSha = d.sha; }
    }
  } catch (e) {
    loadLocal();
    if (e.message === 'empty') {
      setGhStatus('No world saved yet', ''); showToast('No world saved yet \u2014 start adding characters!', 'ok');
    } else if (e.message.startsWith('HTTP 404')) {
      setGhStatus('No world file yet', '');
    } else {
      setGhStatus('Offline \u2014 local data', ''); showToast('Offline \u2014 showing local data', '');
    }
  }
}

async function ghLoad() {
  const token = getToken();
  if (!token) { setGhStatus('Enter a GitHub token first', 'err'); return; }
  setGhStatus('Loading\u2026');
  try {
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}?ref=${GH_BRANCH}`, {
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    ghFileSha = data.sha;
    const src = decodeBase64Unicode(data.content.replace(/\n/g, ''));
    importTweeSource(src, true);
    setGhStatus('Loaded \u2713  (' + rooms.length + ' rooms, ' + characters.length + ' chars, ' + objects.length + ' objects)', 'ok');
  } catch (e) {
    setGhStatus('Load failed: ' + e.message, 'err');
  }
}

async function ghSave() {
  const token = getToken();
  if (!token) { setGhStatus('Enter a GitHub token first', 'err'); return; }
  const src = buildTweeSource(rooms, characters, objects);
  const encoded = btoa(unescape(encodeURIComponent(src)));
  const msg = document.getElementById('gh-commit-input').value.trim() || 'Update living-characters world via tool';
  setGhStatus('Saving\u2026');
  try {
    const body = { message: msg, content: encoded, branch: GH_BRANCH };
    if (ghFileSha) body.sha = ghFileSha;
    const res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`, {
      method: 'PUT',
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errData = await res.json();
      if (res.status === 409 || res.status === 422) {
        ghFileSha = null; setGhStatus('SHA conflict \u2014 re-syncing, try Save again', 'err'); seedGhFileSha(token);
      } else {
        setGhStatus('Save failed: ' + (errData.message || 'HTTP ' + res.status), 'err');
      }
      return;
    }
    const data = await res.json();
    ghFileSha = data.content.sha;
    setGhStatus('Saved \u2713  ' + data.commit.sha.slice(0, 7), 'ok');
    save();
  } catch (e) {
    setGhStatus('Save failed: ' + e.message, 'err');
  }
}

/**
 * buildTweeSource
 * ---------------
 * Each character written EXACTLY ONCE (no per-room duplication).
 * ch.lat / ch.lng (map-placed characters outside any room) are now
 * included in the character's JSON metadata so they survive reload.
 */
function buildTweeSource(roomsList, chars, objs) {
  let out = '';

  // 1. Rooms + their objects
  roomsList.forEach(room => {
    const roomMeta = { id: room.id, lat: room.lat, lng: room.lng, radius: room.radius };
    if (room.cameraX != null) roomMeta.cameraX = room.cameraX;
    if (room.cameraY != null) roomMeta.cameraY = room.cameraY;
    if (room.cameraZ != null) roomMeta.cameraZ = room.cameraZ;
    if (room.backdropUrl) roomMeta.backdropUrl = room.backdropUrl;
    out += `:: ${room.name} ${JSON.stringify(roomMeta)}\n`;
    out += room.lede ? room.lede + '\n' : '';
    out += '\n';

    (objs || []).filter(o => o.roomId === room.id).forEach(obj => {
      const meta = { roomId: obj.roomId, scale: obj.scale || 1 };
      if (obj.glbUrl) meta.glbUrl = obj.glbUrl;
      if (obj.position) { meta.x = obj.position.x; meta.y = obj.position.y || 0; meta.z = obj.position.z; }
      if (obj.rotation) meta.rotY = obj.rotation.y || 0;
      if (obj.interactable !== undefined) meta.interactable = obj.interactable;
      if (obj.context) meta.context = obj.context;
      if (obj.usageTags && obj.usageTags.length) meta.usageTags = obj.usageTags;
      out += `:: ${obj.name}-object ${JSON.stringify(meta)}\n`;
      out += obj.description ? obj.description + '\n' : '';
      out += '\n';
    });
  });

  // 2. Characters — each written EXACTLY ONCE
  const seen = new Set();
  chars.forEach(ch => {
    const uid = ch.id || ch.name;
    if (seen.has(uid)) return;
    seen.add(uid);

    const meta = {
      roomIds:    ch.roomIds || (ch.roomId ? [ch.roomId] : []),
      homeRoomId: ch.homeRoomId || null,
      workRoomId: ch.workRoomId || null,
      schedule:   ch.schedule || null,
      mood:       ch.mood,
      items:      ch.items || []
    };
    // ── FIX: persist map-placed coordinates ──────────────────────────────────
    if (typeof ch.lat === 'number') meta.lat = ch.lat;
    if (typeof ch.lng === 'number') meta.lng = ch.lng;
    // ─────────────────────────────────────────────────────────────────────────
    if (ch.glbUrl && !ch.glbUrl.startsWith('data:')) meta.glbUrl = ch.glbUrl;

    out += `:: ${ch.name} ${JSON.stringify(meta)}\n\n`;
    (ch.passages || []).forEach(p => { out += `:: ${ch.name}-${p.type}\n${p.text}\n\n`; });
  });

  return out;
}

function buildTweeStandalone(roomsList, chars, objs) {
  return ':: StoryTitle\nLiving Characters World\n\n:: StoryData\n{"ifid":"C15CE33F-61F6-4909-BB59-73EE7A3D57B1"}\n\n' + buildTweeSource(roomsList, chars, objs);
}

function previewTwee() {
  document.getElementById('twee-source').textContent = buildTweeStandalone(rooms, characters, objects);
  document.getElementById('twee-preview-overlay').classList.add('open');
}
function closeTweePreview() { document.getElementById('twee-preview-overlay').classList.remove('open'); }

function downloadTwee() {
  const blob = new Blob([buildTweeStandalone(rooms, characters, objects)], { type: 'text/plain' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'living-characters.twee'; a.click();
}

function triggerImport() { document.getElementById('twee-import-input').click(); }

function handleImportFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => importTweeSource(e.target.result);
  reader.readAsText(file);
  event.target.value = '';
}

function importTweeSource(src, silent) {
  const lines = src.split('\n');
  const newRooms = [], newChars = [], newObjs = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(':: ') && !line.startsWith(':: StoryTitle') && !line.startsWith(':: StoryData')) {
      const m = line.match(/^:: ([^{]+?)(?:\s+(\{.*\}))?$/);
      if (!m) { i++; continue; }
      const passName = m[1].trim();
      const meta = m[2] ? JSON.parse(m[2]) : {};
      const bodyLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(':: ')) { bodyLines.push(lines[i]); i++; }
      const body = bodyLines.join('\n').trim();

      if (meta.lat !== undefined && (meta.roomIds === undefined && meta.roomId === undefined)) {
        // Room passage — has lat but no roomIds
        const roomId = meta.id || ('room_' + passName.replace(/\s+/g, '_'));
        newRooms.push({
          id: roomId, name: passName, lede: body,
          lat: meta.lat, lng: meta.lng, radius: meta.radius || 30,
          backdropUrl: meta.backdropUrl || null,
          cameraX: meta.cameraX, cameraY: meta.cameraY, cameraZ: meta.cameraZ
        });
      } else if (passName.endsWith('-object')) {
        const objName = passName.slice(0, -7).trim();
        newObjs.push({
          id: 'obj_' + objName.replace(/\s+/g, '_') + '_' + Date.now(),
          roomId: meta.roomId || '', name: objName, glbUrl: meta.glbUrl || '',
          position: { x: meta.x || 0, y: meta.y || 0, z: meta.z || 0 },
          rotation: { y: meta.rotY || 0 }, scale: meta.scale || 1,
          description: body, interactable: meta.interactable !== false,
          context: meta.context || null, usageTags: meta.usageTags || []
        });
      } else if ((meta.roomIds !== undefined || meta.roomId !== undefined) && !passName.includes('-')) {
        if (newChars.find(c => c.name === passName)) { continue; }
        const roomIds = Array.isArray(meta.roomIds) ? meta.roomIds : (meta.roomId ? [meta.roomId] : []);
        const primaryRoomId = roomIds[0] || meta.roomId || null;
        const ch = {
          id: 'char_' + passName.replace(/\s+/g, '_'), name: passName,
          roomId: primaryRoomId, roomIds,
          homeRoomId: meta.homeRoomId || null,
          workRoomId: meta.workRoomId || null,
          schedule: meta.schedule || null,
          mood: meta.mood || 'Happy', items: meta.items || [],
          passages: [], photoData: null, animData: null, glbUrl: meta.glbUrl || null
        };
        // ── FIX: restore map-placed coordinates ──────────────────────────────
        if (typeof meta.lat === 'number') ch.lat = meta.lat;
        if (typeof meta.lng === 'number') ch.lng = meta.lng;
        // ─────────────────────────────────────────────────────────────────────
        newChars.push(ch);
      } else if (passName.includes('-')) {
        const dashIdx = passName.indexOf('-');
        const charName = passName.slice(0, dashIdx);
        const type = passName.slice(dashIdx + 1);
        const ch = newChars.find(c => c.name === charName);
        if (ch) ch.passages.push({ type, text: body });
      }
    } else { i++; }
  }
  if (newRooms.length || newChars.length || newObjs.length) {
    rooms = newRooms; characters = newChars; objects = newObjs;
    if (typeof window.renderMapPins === 'function') window.renderMapPins();
    if (typeof window.updateCompass === 'function') window.updateCompass();
    save();
    if (!silent) alert(`Imported ${newRooms.length} rooms, ${newChars.length} characters and ${newObjs.length} objects.`);
  } else if (!silent) {
    alert('No rooms or characters found in that .twee file.');
  }
}

function save() {
  try {
    localStorage.setItem('lc_rooms', JSON.stringify(rooms));
    localStorage.setItem('lc_chars', JSON.stringify(characters));
    localStorage.setItem('lc_objects', JSON.stringify(objects));
  } catch (e) {}
}

async function uploadRoomBackdropToGitHub(roomId, file) {
  const token = getToken();
  if (!token) { setGhStatus('Enter a GitHub token first to save backdrops', 'err'); showToast('GitHub token required to save backdrop to repo', 'err'); return null; }
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(String(e.target.result).replace(/^data:.*?;base64,/, ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const path = `media/room-backdrops/${roomId}.png`;
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;
  const body = { message: `Upload backdrop for room ${roomId}`, content: base64, branch: GH_BRANCH };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    setGhStatus('Backdrop upload failed: ' + (err.message || res.status), 'err');
    showToast('Backdrop upload failed', 'err');
    return null;
  }
  setGhStatus('Backdrop saved \u2713', 'ok');
  showToast('Backdrop saved to GitHub', 'ok');
  return `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/media/room-backdrops/${roomId}.png`;
}

function showToast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.style.borderColor = type === 'err' ? 'var(--accent)' : 'var(--accent2)';
  el.style.color = type === 'err' ? 'var(--accent)' : 'var(--accent2)';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function loadLocal() {
  try {
    const r = localStorage.getItem('lc_rooms');
    const c = localStorage.getItem('lc_chars');
    const o = localStorage.getItem('lc_objects');
    if (r) rooms = JSON.parse(r);
    if (c) {
      characters = JSON.parse(c);
      const seen = new Set();
      characters = characters.filter(ch => {
        const uid = ch.id || ch.name;
        if (seen.has(uid)) return false;
        seen.add(uid); return true;
      });
      characters.forEach(ch => {
        if (!ch.roomIds || !Array.isArray(ch.roomIds)) ch.roomIds = ch.roomId ? [ch.roomId] : [];
        if (!ch.homeRoomId) ch.homeRoomId = ch.roomIds[0] || null;
        if (!ch.workRoomId) ch.workRoomId = ch.roomIds[0] || null;
        if (!ch.schedule) ch.schedule = { morning: 'home', midday: 'work', afternoon: 'work', evening: 'home', night: 'home' };
      });
    }
    if (o) objects = JSON.parse(o);
  } catch (e) {}
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('lc_gh_token');
  if (saved) document.getElementById('gh-token-input').value = saved;
  autoLoadFromGitHub();
});

window.lcStore = {
  save, loadLocal, ghLoad, ghSave, autoLoadFromGitHub,
  buildTweeSource, buildTweeStandalone,
  previewTwee, closeTweePreview, downloadTwee, triggerImport, handleImportFile,
  importTweeSource, onTokenInput, setGhStatus, getToken, decodeBase64Unicode,
  seedGhFileSha, uploadRoomBackdropToGitHub
};

export {
  save, loadLocal, ghLoad, ghSave, autoLoadFromGitHub,
  buildTweeSource, buildTweeStandalone,
  previewTwee, closeTweePreview, downloadTwee, triggerImport, handleImportFile,
  importTweeSource, onTokenInput, setGhStatus, getToken, decodeBase64Unicode,
  seedGhFileSha, uploadRoomBackdropToGitHub
};
