/**
 * glb-picker.js
 * -------------
 * Shared GLB / asset picker modal.
 * Shows all characters' and objects' existing GLB files as re-usable options,
 * plus the Three.js example models, plus a "paste URL" escape hatch.
 *
 * Usage:
 *   openGlbPicker(targetInputId, onPickCallback)
 *   - targetInputId: id of an <input> to write the chosen URL into (optional)
 *   - onPickCallback(url, label): called when user picks
 */

const BUILTIN_GLBS = [
  { label: 'Soldier',  url: 'https://threejs.org/examples/models/gltf/Soldier.glb' },
  { label: 'Parrot',   url: 'https://threejs.org/examples/models/gltf/Parrot.glb' },
  { label: 'Flamingo', url: 'https://threejs.org/examples/models/gltf/Flamingo.glb' },
  { label: 'Horse',    url: 'https://threejs.org/examples/models/gltf/Horse.glb' },
  { label: 'Duck',     url: 'https://threejs.org/examples/models/gltf/Duck/glTF/Duck.gltf' },
  { label: 'RobotExpressive', url: 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb' },
];

function openGlbPicker(targetInputId, onPickCallback) {
  // Collect existing GLBs already loaded in the world
  const usedGlbs = [];
  const seen = new Set();
  [...(window.characters || []), ...(window.objects || [])].forEach(item => {
    const url = item.glbUrl;
    if (url && !url.startsWith('data:') && !seen.has(url)) {
      seen.add(url);
      usedGlbs.push({ label: (item.name || 'unnamed') + ' (existing)', url });
    }
  });

  // Build modal
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.style.cssText = 'z-index:1600;';

  const allGlbs = [...usedGlbs, ...BUILTIN_GLBS];

  overlay.innerHTML = `
    <div class="modal-box" style="width:520px;gap:12px">
      <h2>🎭 Choose a 3D Model</h2>
      <div style="font-size:11px;color:var(--text-muted);margin-top:-6px">
        Pick an existing model from the world, a built-in, or paste your own link.
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:260px;overflow-y:auto" id="glb-picker-grid">
        ${allGlbs.map((g, i) => `
          <div class="asset-card" data-idx="${i}" style="cursor:pointer;padding:8px;text-align:center">
            <div style="font-size:28px;margin-bottom:4px">🎭</div>
            <div class="asset-label" style="font-size:10px;color:var(--text-muted);word-break:break-word">${g.label}</div>
          </div>
        `).join('')}
      </div>

      <div class="field" style="margin-top:4px">
        <label>Or paste a .glb / .gltf URL</label>
        <input id="glb-picker-url" type="text" placeholder="https://…glb" />
      </div>

      <div class="modal-actions">
        <button class="mbtn cancel" id="glb-picker-cancel">Cancel</button>
        <button class="mbtn save"   id="glb-picker-use-url">Use URL</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function pick(url, label) {
    if (targetInputId) {
      const el = document.getElementById(targetInputId);
      if (el) el.value = url;
    }
    if (onPickCallback) onPickCallback(url, label);
    overlay.remove();
  }

  overlay.querySelectorAll('.asset-card').forEach(card => {
    card.addEventListener('click', () => {
      const g = allGlbs[parseInt(card.dataset.idx)];
      if (g) pick(g.url, g.label);
    });
  });

  document.getElementById('glb-picker-use-url').onclick = () => {
    const url = document.getElementById('glb-picker-url').value.trim();
    if (!url) return;
    pick(url, url.split('/').pop());
  };

  document.getElementById('glb-picker-cancel').onclick = () => overlay.remove();

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

window.openGlbPicker = openGlbPicker;

export { openGlbPicker, BUILTIN_GLBS };
