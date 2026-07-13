/**
 * upload-helpers.js
 * -----------------
 * Shared file-upload helpers. Handles .glb (passthrough) and .fbx
 * (lazy-imports fbx-to-glb.js on demand so timing is never an issue).
 */

// Lazy singleton — resolved the first time an FBX is uploaded
let _fbxModule = null;
async function getFbxConverter() {
  if (_fbxModule) return _fbxModule;
  // Dynamic import works regardless of when this module itself was loaded
  _fbxModule = await import('./fbx-to-glb.js');
  // Also expose on window for any direct callers
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
    if (dataKey) window[dataKey] = dataUrl;
    if (urlEl)   urlEl.value = '';
    return dataUrl;
  }

  if (!file) return null;
  const name = file.name.toLowerCase();

  // ── GLB / GLTF: FileReader passthrough ──
  if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    setStatus('\u231b Reading\u2026', 'var(--accent2)');
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        setStatus(`\u2713 "${file.name}" ready!`, 'var(--accent2)');
        if (onProgress) onProgress(1);
        resolve(storeResult(e.target.result));
      };
      reader.onerror = () => {
        setStatus('Could not read file \u2014 please try again.', '#ff8a80');
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── FBX: lazy-load converter then convert ──
  if (name.endsWith('.fbx')) {
    setStatus('\u23f3 Loading FBX converter\u2026', 'var(--accent2)');
    let mod;
    try {
      mod = await getFbxConverter();
    } catch (err) {
      setStatus('Could not load FBX converter: ' + err.message, '#ff8a80');
      return null;
    }

    setStatus('\u23f3 Converting FBX\u2026 (0%)', 'var(--accent2)');
    try {
      const dataUrl = await mod.convertFbxFileToGlbDataUrl(file, {
        onProgress: pct => {
          setStatus(`\u23f3 Converting FBX\u2026 (${Math.round(pct * 100)}%)`, 'var(--accent2)');
          if (onProgress) onProgress(pct);
        }
      });
      setStatus(`\u2713 FBX converted \u2014 "${file.name}" ready!`, 'var(--accent2)');
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

// Expose for inline onclick handlers in index.html
window.handleModelUpload = handleModelUpload;
export default handleModelUpload;
