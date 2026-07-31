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
    await seedGhFileSha(token);
  } catch (err) {
    setGhStatus('\u274C Network error \u2014 check connection', 'err');
  }
}

function showToast(msg, cls) {
  const el = document.getElementById('gh-status');
  if (!el) return;
  el.textContent = msg;
  el.className = cls || '';
  setTimeout(() => { if (el.textContent === msg) { el.textContent = ''; el.className = ''; } }, 4000);
}

// ---------------------------------------------------------------------------
// Twee serialisation
// ---------------------------------------------------------------------------

/**
 * Serialise the full cast + world to a .twee string.
 *
 * Format
 * ------
 * :: StoryData
 * {"characters":[...], "rooms":[...], "objects":[...]}
 *
 * :: CharacterName [character]
 * {mood, items, roomIds, homeRoomId, workRoomId, schedule, photoData, animData, sprites}
 *
 * :: CharacterName-<passageType>
 * <passage text>
 */
function buildTweeSource() {
  // StoryData block — full world state for round-trip import
  const worldMeta = {
    rooms: rooms.map(r => ({
      id: r.id, name: r.name, lede: r.lede,
      lat: r.lat, lng: r.lng, radius: r.radius,
      cameraX: r.cameraX, cameraY: r.cameraY, cameraZ: r.cameraZ,
      cameraTargetX: r.cameraTargetX, cameraTargetY: r.cameraTargetY, cameraTargetZ: r.cameraTargetZ,
      cameraZoom: r.cameraZoom,
      backdropUrl: r.backdropUrl,
    })),
    objects: objects.map(o => ({
      id: o.id, name: o.name, desc: o.desc,
      x: o.x, z: o.z, scale: o.scale, roomId: o.roomId,
    })),
  };

  const lines = [];
  lines.push(':: StoryData');
  lines.push(JSON.stringify(worldMeta, null, 2));
  lines.push('');

  for (const ch of characters) {
    // Character metadata block
    const meta = {
      id:          ch.id,
      mood:        ch.mood,
      items:       ch.items,
      roomIds:     ch.roomIds || (ch.roomId ? [ch.roomId] : []),
      homeRoomId:  ch.homeRoomId,
      workRoomId:  ch.workRoomId,
      schedule:    ch.schedule,
      photoData:   ch.photoData,
      animData:    ch.animData,
      lat:         ch.lat,
      lng:         ch.lng,
    };
    if (ch.sprites)   meta.sprites   = ch.sprites;

    lines.push(`:: ${ch.name} [character]`);
    lines.push(JSON.stringify(meta, null, 2));
    lines.push('');

    // One passage per dialogue entry
    if (ch.passages) {
      for (const p of ch.passages) {
        if (!p.text) continue;
        lines.push(`:: ${ch.name}-${p.type}`);
        lines.push(p.text);
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/**
 * Parse a .twee string back into characters / rooms / objects arrays.
 * Overwrites the in-memory state and re-renders.
 */
function importTweeSource(src) {
  const rawBlocks = src.split(/\n(?=:: )/);
  const newChars = [];
  const newRooms = [];
  const newObjs  = [];

  // First pass — collect passage bodies keyed by passage title
  const passageMap = {};
  for (const block of rawBlocks) {
    const headerEnd = block.indexOf('\n');
    const header    = headerEnd !== -1 ? block.slice(0, headerEnd).trim() : block.trim();
    const body      = headerEnd !== -1 ? block.slice(headerEnd + 1).trim() : '';
    // Strip [tags]
    const title = header.replace(/^::\s*/, '').replace(/\[.*?\]/g, '').trim();
    passageMap[title] = body;
  }

  // Second pass — process character and StoryData blocks
  for (const block of rawBlocks) {
    const headerEnd = block.indexOf('\n');
    const header    = headerEnd !== -1 ? block.slice(0, headerEnd).trim() : block.trim();
    const body      = headerEnd !== -1 ? block.slice(headerEnd + 1).trim() : '';
    const tagMatch  = header.match(/\[([^\]]+)\]/);
    const tags      = tagMatch ? tagMatch[1].split(/\s+/) : [];
    const title     = header.replace(/^::\s*/, '').replace(/\[.*?\]/g, '').trim();

    if (title === 'StoryData') {
      try {
        const world = JSON.parse(body);
        if (world.rooms)   newRooms.push(...world.rooms);
        if (world.objects) newObjs.push(...world.objects);
      } catch (_) {}
      continue;
    }

    if (!tags.includes('character')) continue;
    let meta = {};
    try { meta = JSON.parse(body); } catch (_) { continue; }

    const ch = {
      id:         meta.id || ('char_' + Date.now() + Math.random()),
      name:       title,
      mood:       meta.mood || 'Happy',
      items:      meta.items || [],
      roomIds:    meta.roomIds || [],
      roomId:     (meta.roomIds || [])[0] || '',
      homeRoomId: meta.homeRoomId,
      workRoomId: meta.workRoomId,
      schedule:   meta.schedule,
      photoData:  meta.photoData,
      animData:   meta.animData,
      lat:        meta.lat,
      lng:        meta.lng,
      passages:   [],
    };
    if (meta.sprites)   ch.sprites   = meta.sprites;

    // Collect passages for this character
    for (const [passageTitle, passageBody] of Object.entries(passageMap)) {
      if (!passageTitle.startsWith(title + '-')) continue;
      const type = passageTitle.slice(title.length + 1);
      if (passageBody) ch.passages.push({ type, text: passageBody });
    }

    newChars.push(ch);
  }

  characters = newChars;
  rooms      = newRooms;
  objects    = newObjs;

  renderMapPins();
  updateCompass();
  save();
  showToast('\u2713 Imported ' + newChars.length + ' characters, ' + newRooms.length + ' rooms', 'ok');
}

// ---------------------------------------------------------------------------
// GitHub persistence
// ---------------------------------------------------------------------------

async function ghLoad() {
  setGhStatus('Loading\u2026', '');
  try {
    const res = await fetch(rawUrlFresh());
    if (!res.ok) { setGhStatus('No story file found yet \u2014 save to create it', ''); return; }
    const text = await res.text();
    importTweeSource(text);
    setGhStatus('\u2713 Loaded from GitHub', 'ok');
  } catch (err) {
    setGhStatus('\u274C Load failed: ' + err.message, 'err');
  }
}

async function ghSave() {
  const token = getToken();
  if (!token) { setGhStatus('\u274C No token \u2014 enter your GitHub token first', 'err'); return; }
  const commitMsg = document.getElementById('gh-commit-input')?.value.trim() || 'Update story';
  setGhStatus('Saving\u2026', '');
  try {
    if (!ghFileSha) await seedGhFileSha(token);
    const content = btoa(unescape(encodeURIComponent(buildTweeSource())));
    const body = { message: commitMsg, content };
    if (ghFileSha) body.sha = ghFileSha;
    const headers = {
      Authorization: 'token ' + token,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`,
      { method: 'PUT', headers, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      const err = await res.json();
      setGhStatus('\u274C Save failed: ' + (err.message || res.status), 'err');
      return;
    }
    const data = await res.json();
    ghFileSha = data.content.sha;
    setGhStatus('\u2713 Saved to GitHub', 'ok');
  } catch (err) {
    setGhStatus('\u274C Save error: ' + err.message, 'err');
  }
}

// ---------------------------------------------------------------------------
// Upload a room backdrop image to the repo at assets/backdrops/<roomId>.jpg
// Returns the raw URL of the uploaded file, or null on failure.
// ---------------------------------------------------------------------------
async function uploadRoomBackdropToGitHub(roomId, file) {
  const token = getToken();
  if (!token) return null;

  const ext  = file.name.split('.').pop().toLowerCase() || 'jpg';
  const path = `assets/backdrops/${roomId}.${ext}`;

  // Read the file as base64
  const b64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Check if file already exists (need sha for update)
  let existingSha = null;
  try {
    const checkRes = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}`,
      { headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' } }
    );
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      existingSha = checkData.sha;
    }
  } catch (_) {}

  const body = {
    message: `Upload backdrop for room ${roomId}`,
    content: b64,
    branch:  GH_BRANCH,
  };
  if (existingSha) body.sha = existingSha;

  try {
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
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Export / Import UI helpers
// ---------------------------------------------------------------------------

function exportTwee() {
  const src  = buildTweeSource();
  const blob = new Blob([src], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'living-characters.twee';
  a.click();
}

function importTwee() {
  const input = document.createElement('input');
  input.type  = 'file';
  input.accept = '.twee,.txt';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => importTweeSource(ev.target.result);
    reader.readAsText(file);
  };
  input.click();
}

window.lcStore = {
  getToken, setGhStatus, showToast,
  seedGhFileSha, validateToken,
  buildTweeSource, importTweeSource,
  ghLoad, ghSave,
  exportTwee, importTwee,
  uploadRoomBackdropToGitHub,
};

export {
  getToken, setGhStatus, showToast,
  seedGhFileSha, validateToken,
  buildTweeSource, importTweeSource,
  ghLoad, ghSave,
  exportTwee, importTwee,
  uploadRoomBackdropToGitHub,
};
