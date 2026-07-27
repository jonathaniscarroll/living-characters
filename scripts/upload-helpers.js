/**
 * upload-helpers.js
 * -----------------
 * Shared file-upload helpers. Handles .glb (passthrough) and .fbx
 * (lazy-imports fbx-to-glb.js on demand so timing is never an issue).
 *
 * PERSISTENCE STRATEGY
 * --------------------
 * Binary model data (GLB/FBX) cannot be stored in the Twee file — it would
 * make the file too large for GitHub’s API. Instead, after converting the
 * file to a GLB data-URL in the browser we immediately push it to the repo
 * under  media/models/<slug>.glb  and store only the resulting raw.githubusercontent
 * URL on the character/object record. Every browser then loads the model from
 * that stable public URL on demand.
 *
 * If no GitHub token is present (first-time visitors) we fall back to storing
 * the data-URL in memory for the current session so the model still shows up
 * during the same visit.
 */

const GH_OWNER  = 'jonathaniscarroll';
const GH_REPO   = 'living-characters';
const GH_BRANCH = 'main';

// Lazy singleton — resolved the first time an FBX is uploaded
let _fbxModule = null;
async function getFbxConverter() {
  if (_fbxModule) return _fbxModule;
  _fbxModule = await import('./fbx-to-glb.js');
  window.lcFbx = _fbxModule;
  return _fbxModule;
}

/**
 * Push a GLB data-URL to  media/models/<slug>.glb  in the repo.
 * Returns the stable raw.githubusercontent.com URL, or null on failure.
 */
async function uploadGlbToGitHub(slug, dataUrl, statusEl) {
  function setStatus(msg, colour) {
    if (statusEl) { statusEl.textContent = msg; if (colour) statusEl.style.color = colour; }
  }

  const token = (document.getElementById('gh-token-input')?.value.trim()) ||
                localStorage.getItem('lc_gh_token') || '';
  if (!token) {
    setStatus('\u2713 Model ready (save to GitHub to persist across browsers)', 'var(--accent2)');
    return null; // caller will keep the data-URL as session-only fallback
  }

  setStatus('\u2601 Uploading model to repo…', 'var(--accent2)');

  // Strip the data-URL prefix to get raw base64
  const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
  const path   = `media/models/${slug}.glb`;
  const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`;

  // Check if the file already exists (need its sha to update it)
  let existingSha = null;
  try {
    const check = await fetch(apiUrl + `?ref=${GH_BRANCH}`, {
      headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json' }
    });
    if (check.ok) { const d = await check.json(); existingSha = d.sha; }
  } catch (_) {}

  const body = { message: `Upload model: ${slug}`, content: base64, branch: GH_BRANCH };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: { Authorization: 'token ' + token, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    setStatus('Upload failed: ' + (err.message || res.status), '#ff8a80');
    return null;
  }

  const rawUrl = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/${GH_BRANCH}/${path}`;
  setStatus(`\u2713 Model saved to repo!`, 'var(--accent2)');
  return rawUrl;
}

/**
 * Core handler — converts the file to a GLB data-URL then immediately tries
 * to push it to GitHub. Resolves with:
 *   { dataUrl, persistentUrl }
 * where persistentUrl is the raw.githubusercontent.com URL if upload succeeded,
 * or null if there was no token (session-only).
 */
export async function handleModelUpload(file, statusElId, urlFieldId, dataKey, onProgress) {
  const statusEl = document.getElementById(statusElId);
  const urlEl    = urlFieldId ? document.getElementById(urlFieldId) : null;

  function setStatus(msg, colour) {
    if (statusEl) { statusEl.textContent = msg; if (colour) statusEl.style.color = colour; }
  }
  function storeResult(dataUrl, persistentUrl) {
    // Store the persistent URL if available, otherwise the data-URL as session fallback
    const effective = persistentUrl || dataUrl;
    if (dataKey) window[dataKey] = effective;
    window.tempGlbData = effective;
    if (urlEl) urlEl.value = persistentUrl || '';
    return { dataUrl, persistentUrl };
  }

  if (!file) return null;
  const name = file.name.toLowerCase();
  // Slug: strip extension, lowercase, replace spaces/dots with hyphens
  const slug = file.name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // ── GLB / GLTF: FileReader passthrough ──
  if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    setStatus('\u231B Reading…', 'var(--accent2)');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(file);
    }).catch(err => { setStatus('Could not read file — please try again.', '#ff8a80'); return null; });
    if (!dataUrl) return null;
    if (onProgress) onProgress(0.5);
    const persistentUrl = await uploadGlbToGitHub(slug, dataUrl, statusEl);
    if (onProgress) onProgress(1);
    return storeResult(dataUrl, persistentUrl);
  }

  // ── FBX: lazy-load converter then convert ──
  if (name.endsWith('.fbx')) {
    setStatus('\u23F3 Loading FBX converter…', 'var(--accent2)');
    let mod;
    try { mod = await getFbxConverter(); }
    catch (err) { setStatus('Could not load FBX converter: ' + err.message, '#ff8a80'); return null; }

    setStatus('\u23F3 Converting FBX… (0%)', 'var(--accent2)');
    const dataUrl = await mod.convertFbxFileToGlbDataUrl(file, {
      onProgress: pct => {
        setStatus(`\u23F3 Converting FBX\u2026 (${Math.round(pct * 100)}%)`, 'var(--accent2)');
        if (onProgress) onProgress(pct * 0.8);
      }
    }).catch(err => { setStatus('FBX conversion failed: ' + err.message, '#ff8a80'); return null; });
    if (!dataUrl) return null;

    const persistentUrl = await uploadGlbToGitHub(slug, dataUrl, statusEl);
    if (onProgress) onProgress(1);
    return storeResult(dataUrl, persistentUrl);
  }

  setStatus('Unsupported format. Use .glb, .gltf, or .fbx', '#ff8a80');
  return null;
}

// ── Character GLB/FBX upload (wired to #cf-glb-input) ────────────────────────
export async function uploadCharacterGlb() {
  const input = document.getElementById('cf-glb-input');
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];

  const progressEl = document.getElementById('cf-fbx-progress');
  const barEl      = document.getElementById('cf-fbx-progress-bar');
  if (progressEl) progressEl.style.display = 'block';

  const result = await handleModelUpload(
    file, 'cf-glb-status', 'cf-glb-url', 'tempGlbData',
    pct => { if (barEl) barEl.style.width = Math.round(pct * 100) + '%'; }
  );

  if (!result && progressEl) progressEl.style.display = 'none';
}

// ── Object GLB/FBX upload (wired to #of-glb-input) ───────────────────────────
export async function uploadObjectGlb() {
  const input = document.getElementById('of-glb-input');
  if (!input || !input.files || !input.files[0]) return;
  const file = input.files[0];

  const progressEl = document.getElementById('of-fbx-progress');
  const barEl      = document.getElementById('of-fbx-progress-bar');
  if (progressEl) progressEl.style.display = 'block';

  const result = await handleModelUpload(
    file, 'of-glb-status', 'of-glb', 'tempObjectGlbData',
    pct => { if (barEl) barEl.style.width = Math.round(pct * 100) + '%'; }
  );

  if (!result && progressEl) progressEl.style.display = 'none';
}

// ── Expose on window so inline onclick handlers (index.html) resolve ──────────
window.lcUpload = { uploadCharacterGlb, uploadObjectGlb, handleModelUpload };
window.handleModelUpload = handleModelUpload;

export default handleModelUpload;
