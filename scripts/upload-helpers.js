/**
 * upload-helpers.js
 * -----------------
 * Shared file-upload helpers used by both character and object modals.
 * Handles .glb (passthrough) and .fbx (converts via fbx-to-glb.js).
 *
 * Exports:
 *   handleModelUpload(file, statusElId, urlFieldId, dataKey)
 *     - file        : File object from <input type=file>
 *     - statusElId  : id of status <div> to update with progress/errors
 *     - urlFieldId  : id of <input> to write data URL into (optional)
 *     - dataKey     : window global key to store data URL on (e.g. 'tempGlbData')
 *     returns Promise<string|null> — the data URL, or null on failure
 */

export async function handleModelUpload(file, statusElId, urlFieldId, dataKey) {
  const statusEl = document.getElementById(statusElId);
  const urlEl    = urlFieldId ? document.getElementById(urlFieldId) : null;

  function setStatus(msg, colour) {
    if (statusEl) { statusEl.textContent = msg; if (colour) statusEl.style.color = colour; }
  }
  function storeResult(dataUrl) {
    if (dataKey) window[dataKey] = dataUrl;
    if (urlEl)   urlEl.value = '';
    return dataUrl;
  }

  if (!file) return null;
  const name = file.name.toLowerCase();

  // ── GLB / GLTF: passthrough ──
  if (name.endsWith('.glb') || name.endsWith('.gltf')) {
    setStatus('⌛ Reading…', 'var(--accent2)');
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        setStatus(`✓ "${file.name}" ready!`, 'var(--accent2)');
        resolve(storeResult(e.target.result));
      };
      reader.onerror = () => {
        setStatus('Could not read file — please try again.', '#ff8a80');
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  // ── FBX: convert via lcFbx ──
  if (name.endsWith('.fbx')) {
    if (!window.lcFbx) {
      setStatus('FBX converter not loaded yet — try again in a moment.', '#ff8a80');
      return null;
    }
    setStatus('⏳ Converting FBX… (0%)', 'var(--accent2)');
    try {
      const dataUrl = await window.lcFbx.convertFbxFileToGlbDataUrl(file, {
        onProgress: pct => setStatus(`⏳ Converting FBX… (${Math.round(pct * 100)}%)`, 'var(--accent2)')
      });
      setStatus(`✓ FBX converted — "${file.name}" ready!`, 'var(--accent2)');
      return storeResult(dataUrl);
    } catch (err) {
      setStatus('FBX conversion failed: ' + err.message, '#ff8a80');
      return null;
    }
  }

  setStatus('Unsupported format. Please use .glb, .gltf, or .fbx', '#ff8a80');
  return null;
}

window.handleModelUpload = handleModelUpload;
export default handleModelUpload;
