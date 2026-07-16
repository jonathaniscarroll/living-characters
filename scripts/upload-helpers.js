/**
 * upload-helpers.js
 * -----------------
 * Shared file-upload helpers. Handles .glb (passthrough) and .fbx
 * (lazy-imports fbx-to-glb.js on demand so timing is never an issue).
 * Also registers window.lcUpload so inline onclick handlers in index.html work.
 */

// Lazy singleton — resolved the first time an FBX is uploaded
let _fbxModule = null;
async function getFbxConverter() {
  if (_fbxModule) return _fbxModule;
  _fbxModule = await import('./fbx-to-glb.js');
  window.lcFbx = _fbxModule;
  return _fbxModule;
}

export async function handleModelUpload(file, statusElId, urlFieldId, dataKey, onProgress) {
  const statusEl = document.getElementById(statusElId);
  const urlEl    = urlFieldId ? document.getElementById(urlFieldId) : null;

  function setStatus(msg, colour) {
    if (statusEl) {
      statusEl.textContent = msg;
      if (colour) statusEl.style.color = colour;
    }
  }
  function storeResult(dataUrl) {
    // Write to both the named global key AND window.tempGlbData so
    // saveCharacter() / saveObject() always find it regardless of which
    // variable name they check.
    if (dataKey) window[dataKey] = dataUrl;
    window.tempGlbData = dataUrl;       // character modal reads this
    if (urlEl) urlEl.value = '';
    return dataUrl;
  }

  if (!file) return null;
  const name = file.name.toLowerCase();

  // ── GLB / GLTF: FileReader passthrough ──
  if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    setStatus('⌛ Reading…', 'var(--accent2)');
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        setStatus(`✓ "${file.name}" ready!`, 'var(--accent2)');
        if (onProgress) onProgress(1);
        resolve(storeResult(e.target.result));
      };
      reader.onerror = () => {
        setStatus('Could not read file — please try again.', '#ff8a80');
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── FBX: lazy-load converter then convert ──
  if (name.endsWith('.fbx')) {
    setStatus('⏳ Loading FBX converter…', 'var(--accent2)');
    let mod;
    try {
      mod = await getFbxConverter();
    } catch (err) {
      setStatus('Could not load FBX converter: ' + err.message, '#ff8a80');
      return null;
    }

    setStatus('⏳ Converting FBX… (0%)', 'var(--accent2)');
    try {
      const dataUrl = await mod.convertFbxFileToGlbDataUrl(file, {
        onProgress: pct => {
          setStatus(`⏳ Converting FBX… (${Math.round(pct * 100)}%)`, 'var(--accent2)');
          if (onProgress) onProgress(pct);
        }
      });
      setStatus(`✓ FBX converted — "${file.name}" ready!`, 'var(--accent2)');
      if (onProgress) onProgress(1);
      return storeResult(dataUrl);
    } catch (err) {
      setStatus('FBX conversion failed: ' + err.message, '#ff8a80');
      return null;
    }
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

  // dataKey 'tempGlbData' writes to window.tempGlbData;
  // storeResult() also explicitly sets window.tempGlbData as a belt-and-braces.
  const result = await handleModelUpload(
    file,
    'cf-glb-status',
    'cf-glb-url',
    'tempGlbData',
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
    file,
    'of-glb-status',
    'of-glb',
    'tempObjectGlbData',
    pct => { if (barEl) barEl.style.width = Math.round(pct * 100) + '%'; }
  );

  if (!result && progressEl) progressEl.style.display = 'none';
}

// ── Expose on window so inline onclick handlers (index.html) resolve ──────────
window.lcUpload = { uploadCharacterGlb, uploadObjectGlb, handleModelUpload };
window.handleModelUpload = handleModelUpload;

export default handleModelUpload;
