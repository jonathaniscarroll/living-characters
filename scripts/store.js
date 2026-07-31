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
    if (room.cameraX !=