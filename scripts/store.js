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

/**
 * validateToken
 * -------------
 * Called on every token input change. Hits GET /user to verify the token
 * is valid and not expired, then checks X-OAuth-Scopes for 'repo' or
 * 'public_repo'. Shows a clear status: username + scope tick, or a
 * specific error message so problems are caught before a save attempt.
 */
async function validateToken(token) {
  if (!token) {
    setGhStatus('', '');
    return;
  }
  setGhStatus('Checking token\u2026', '');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'token ' + token,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    if (res.status === 401) {
      setGhStatus('\u274C Token invalid or expired \u2014 generate a new one at github.com/settings/tokens', 'err');
      return;
    }
    if (!res.ok) {
      setGhStatus('\u274C GitHub error ' + res.status, 'err');
      return;
    }
    const user = await res.json();
    const scopeHeader = res.headers.get('X-OAuth-Scopes') || '';
    const scopes = scopeHeader.split(',').map(s => s.trim()).filter(Boolean);
    const hasWrite = scopes.includes('repo') || scopes.includes('public_repo');
    if (!hasWrite) {
      // Fine-grained tokens don't emit X-OAuth-Scopes; treat empty scope list as fine-grained (may work).
      const isFineGrained = scopes.length === 0;
      if (isFineGrained) {
        setGhStatus(`\u2705 ${user.login} (fine-grained token \u2014 ensure Contents: write is enabled)`, 'ok');
      } else {
        setGhStatus(`\u26A0\uFE0F ${user.login} \u2014 token missing repo scope (has: ${scopes.join(', ') || 'none'})`, 'err');
        return;
      }
    } else {
      setGhStatus(`\u2705 ${user.login} \u2014 token OK`, 'ok');
    }
    // Token looks good — seed the SHA for the twee file.
    seedGhFileSha(token);
  } catch (e) {
    setGhStatus('\u274C Could not reach GitHub: ' + e.message, 'err');
  }
}

function onTokenInput() {
  const t = document.getElementById('gh-token-input').value.trim();
  if (t) {
    localStorage.setItem('lc_gh_token', t);
    validateToken(t);
  } else {
    setGhStatus('', '');
  }
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

// ── Asset upload helper ────────────────────────────────────────────────────────
async function uploadCharacterAsset(charId, field, dataUrl) {
  const token = getToken();
  if (!token || !dataUrl || !dataUrl.startsWith('data:')) return null;

  const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
  const ext  = mime.split('/')[1] || 'bin';
  const b64  = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const path = `story/assets/${charId}-${field}.${ext}`;

  let existingSha = null;
  try {
    const check = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`,
      { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' } }
    );
    if (check.ok) { const d = await check.json(); existingSha = d.sha; }
  } catch (_) {}

  const body = { message: `Asset: ${charId} ${field}`, content: b64, branch: GH_BRANCH };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`,
    {
      method: 'PUT',
      headers: {
        Authorization: 'token ' + token,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) return null;
  return `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}`;
}

// ── Sprite asset upload ────────────────────────────────────────────────────────
async function uploadPendingSprites(ch) {
  if (!ch.sprites) return;
  const token = getToken();
  if (!token) return;
  if (!ch.spriteUrls) ch.spriteUrls = {};
  const STATES = ['idle', 'walk', 'talk', 'listen'];
  for (const state of STATES) {
    const frames = ch.sprites[state];
    if (!Array.isArray(frames)) continue;
    if (!ch.spriteUrls[state]) ch.spriteUrls[state] = [null, null];
    for (let i = 0; i < 2; i++) {
      const frame = frames[i];
      if (!frame || !frame.startsWith('data:')) continue;
      const url = await uploadCharacterAsset(ch.id, `sprite-${state}-${i}`, frame);
      if (url) {
        ch.spriteUrls[state][i] = url;
        ch.sprites[state][i] = url;
      }
    }
  }
}

async function uploadAllPendingAssets() {
  for (const ch of characters) {
    if (ch.photoData && ch.photoData.startsWith('data:') && !ch.photoUrl) {
      const url = await uploadCharacterAsset(ch.id, 'photo', ch.photoData);
      if (url) ch.photoUrl = url;
    }
    if (ch.animData && ch.animData.startsWith('data:') && !ch.animUrl) {
      const url = await uploadCharacterAsset(ch.id, 'anim', ch.animData);
      if (url) ch.animUrl = url;
    }
    await uploadPendingSprites(ch);
  }
  save();
}

async function ghSave() {
  const token = getToken();
  if (!token) { setGhStatus('Enter a GitHub token first', 'err'); return; }
  setGhStatus('Uploading assets\u2026');
  await uploadAllPendingAssets();
  setGhStatus('Saving world\u2026');
  const src = buildTweeSource(rooms, characters, objects);
  const encoded = btoa(unescape(encodeURIComponent(src)));
  const msg = document.getElementById('gh-commit-input').value.trim() || 'Update living-characters world via tool';
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
      if (res.status === 401) {
        setGhStatus('\u274C 401 Unauthorized \u2014 token expired or missing repo scope. Re-enter your token.', 'err');
        showToast('Token invalid \u2014 re-enter in the GitHub panel', 'err');
      } else if (res.status === 409 || res.status === 422) {
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
 * Asset policy: write hosted URLs only — NEVER base64 blobs.
 *
 * Sprite frames are stored on ch.sprites[state][i] in memory but may
 * still be data: URLs if assets haven't been uploaded yet (no token).
 * We only write spriteUrls (already-hosted URLs) into the twee file.
 * This prevents the file bloating to 20MB when characters have sprite
 * frames that haven't been pushed to GitHub yet.
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
    if (typeof ch.lat === 'number') meta.lat = ch.lat;
    if (typeof ch.lng === 'number') meta.lng = ch.lng;
    if (ch.glbUrl && !ch.glbUrl.startsWith('data:')) meta.glbUrl = ch.glbUrl;
    if (ch.photoUrl) meta.photoUrl = ch.photoUrl;
    if (ch.animUrl)  meta.animUrl  = ch.animUrl;

    // Sprites: only write hosted URLs — never data: blobs.
    if (ch.spriteUrls) {
      const hostedSprites = {};
      let any = false;
      Object.entries(ch.spriteUrls).forEach(([state, frames]) => {
        const hosted = (frames || []).map(f => (f && !f.startsWith('data:')) ? f : null);
        if (hosted.some(Boolean)) { hostedSprites[state] = hosted; any = true; }
      });
      if (any) meta.spriteUrls = hostedSprites;
    }
    if (ch.chromaKey) meta.chromaKey = ch.chromaKey;

    out += `:: ${ch.name} ${JSON.stringify(meta)}\n\n`;
    (ch.passages || []).forEach(p => { out += `:: ${ch.name}-${p.type}\n${p.text}\n\n`; });
  });

  return out;
}

// ── SugarCube bridge passages ──────────────────────────────────────────────────
const _scBridgePassages = `:: StoryInit
<<run
  State.variables.rooms      = window.rooms      || [];
  State.variables.characters = window.characters || [];
  State.variables.objects    = window.objects    || [];
>>

:: PassageReady
<<run
  State.variables.rooms      = window.rooms      || [];
  State.variables.characters = window.characters || [];
  State.variables.objects    = window.objects    || [];
>>

`;

function buildTweeStandalone(roomsList, chars, objs) {
  return [
    ':: StoryTitle\nLiving Characters World\n',
    ':: StoryData\n{"ifid":"C15CE33F-61F6-4909-BB59-73EE7A3D57B1"}\n',
    _scBridgePassages,
    buildTweeSource(roomsList, chars, objs),
  ].join('\n');
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

// Special passage names that are SugarCube built-ins — skip during import.
const _SC_SPECIAL = new Set([
  'StoryTitle', 'StoryData', 'StoryInit', 'PassageReady',
  'PassageHeader', 'PassageFooter', 'PassageDone', 'StoryBanner',
  'StoryCaption', 'StoryMenu', 'StorySettings', 'StoryShare',
]);

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

      if (_SC_SPECIAL.has(passName)) {
        i++;
        while (i < lines.length && !lines[i].startsWith(':: ')) { i++; }
        continue;
      }

      const bodyLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(':: ')) { bodyLines.push(lines[i]); i++; }
      const body = bodyLines.join('\n').trim();

      if (meta.lat !== undefined && (meta.roomIds === undefined && meta.roomId === undefined)) {
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
          passages: [],
          photoUrl:  meta.photoUrl  || null,
          animUrl:   meta.animUrl   || null,
          photoData: null,
          animData:  null,
          glbUrl: meta.glbUrl || null
        };
        if (typeof meta.lat === 'number') ch.lat = meta.lat;
        if (typeof meta.lng === 'number') ch.lng = meta.lng;
        if (meta.spriteUrls) { ch.spriteUrls = meta.spriteUrls; ch.sprites = meta.spriteUrls; }
        if (meta.chromaKey) ch.chromaKey = meta.chromaKey;
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

// ── Visitor / Facilitator mode ─────────────────────────────────────────────────
let _lcMode = localStorage.getItem('lc_mode') || 'visitor';
function lcSetMode(m) {
  _lcMode = m;
  localStorage.setItem('lc_mode', m);
  document.body.classList.toggle('facilitator-mode', m === 'facilitator');
}
window.lcMode = () => _lcMode;
window.lcSetMode = lcSetMode;

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('lc_gh_token');
  if (saved) {
    document.getElementById('gh-token-input').value = saved;
    // Validate the stored token immediately on load so status is accurate
    // before the facilitator attempts a save.
    validateToken(saved);
  }
  // Apply persisted mode on load
  lcSetMode(_lcMode);
  // Sync mode toggle button label
  const modeBtn = document.querySelector('[data-mode-toggle]');
  if (modeBtn) modeBtn.textContent = _lcMode === 'facilitator' ? '\uD83D\uDC65 Visitor' : '\uD83D\uDD27 Facilitator';
  autoLoadFromGitHub();
});

window.lcStore = {
  save, loadLocal, ghLoad, ghSave, autoLoadFromGitHub,
  buildTweeSource, buildTweeStandalone,
  previewTwee, closeTweePreview, downloadTwee, triggerImport, handleImportFile,
  importTweeSource, onTokenInput, setGhStatus, getToken, decodeBase64Unicode,
  seedGhFileSha, validateToken, uploadRoomBackdropToGitHub, uploadCharacterAsset,
  uploadAllPendingAssets, uploadPendingSprites, showToast, lcSetMode
};

export {
  save, loadLocal, ghLoad, ghSave, autoLoadFromGitHub,
  buildTweeSource, buildTweeStandalone,
  previewTwee, closeTweePreview, downloadTwee, triggerImport, handleImportFile,
  importTweeSource, onTokenInput, setGhStatus, getToken, decodeBase64Unicode,
  seedGhFileSha, validateToken, uploadRoomBackdropToGitHub, uploadCharacterAsset,
  uploadAllPendingAssets, uploadPendingSprites, showToast, lcSetMode
};
