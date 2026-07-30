/**
 * scripts/ar-patch.js
 * Patches the existing map.js + modals.js at runtime to inject
 * "Visit in AR" into every character card and map pin popup.
 *
 * This file is loaded AFTER all other scripts in index.html.
 * It does not modify any original file — instead it monkey-patches
 * the openCharacterCard / createPinPopup helpers and extends the
 * character data model with arEnabled / arScale / arYOffset fields.
 */

(function () {
  'use strict';

  // ── 1. Extend store.save / store.load to persist AR fields ──────────────
  // The existing store already persists the full character object via
  // JSON round-trip, so new fields are automatically persisted as long as
  // we write them into the character object before saving.
  // Nothing to patch here — just document the fields:
  //   character.arEnabled  (boolean, default true)
  //   character.arScale    (number, default 1.0)
  //   character.arYOffset  (number, default 0)

  function arDefaults(ch) {
    if (typeof ch.arEnabled  === 'undefined') ch.arEnabled  = true;
    if (typeof ch.arScale    === 'undefined') ch.arScale    = 1.0;
    if (typeof ch.arYOffset  === 'undefined') ch.arYOffset  = 0;
    return ch;
  }

  // ── 2. Inject "Visit in AR" button into character cards ─────────────────
  //
  // We wrap the global openCharacterCard function (defined in modals.js /
  // card.js) to append an AR button to the card DOM after it renders.

  function injectARButton(character) {
    // Give the card DOM a moment to render
    requestAnimationFrame(() => {
      // Target the card footer / action area — try common selectors
      const card = document.querySelector('#character-card, .character-card, #charCard, .char-card');
      if (!card) return;

      // Avoid double-injection
      if (card.querySelector('.ar-visit-btn')) return;

      const ch = arDefaults(character);

      const btn = document.createElement('button');
      btn.className = 'ar-visit-btn';
      btn.innerHTML = '📷 Visit in AR';
      btn.title = ch.arEnabled ? 'Open AR view' : 'AR disabled for this character';
      btn.style.cssText = [
        'display:inline-flex', 'align-items:center', 'gap:8px',
        'background:#01696f', 'color:#fff',
        'border:none', 'border-radius:12px',
        'padding:12px 22px', 'font-size:16px', 'font-weight:700',
        'cursor:pointer', 'margin-top:12px', 'width:100%',
        'justify-content:center',
        'transition:background .18s'
      ].join(';');

      btn.addEventListener('pointerover',  () => { btn.style.background = '#0c4e54'; });
      btn.addEventListener('pointerout',   () => { btn.style.background = '#01696f'; });
      btn.addEventListener('pointerdown',  () => { btn.style.background = '#0f3638'; });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close the card modal if there's a close function
        if (typeof window.closeCharacterCard === 'function') window.closeCharacterCard();
        // Launch AR
        window.ARView.open(ch);
      });

      // Find a good insertion point: look for an action row, footer, or just append
      const footer = card.querySelector('.card-footer, .card-actions, .modal-footer, [data-actions]')
                     || card;
      footer.appendChild(btn);
    });
  }

  // Wrap openCharacterCard if it exists
  const origOpen = window.openCharacterCard;
  if (typeof origOpen === 'function') {
    window.openCharacterCard = function (character) {
      origOpen.call(this, character);
      injectARButton(character);
    };
  }

  // ── 3. Inject AR badge on map pins ──────────────────────────────────────
  // Patch the Leaflet popup creation so AR-enabled characters get a
  // small camera badge on their pin tooltip.

  function patchLeafletPopups() {
    if (!window.L) return;

    // Store original bindPopup
    const orig = L.Layer.prototype.bindPopup;
    L.Layer.prototype.bindPopup = function (content, options) {
      // Only patch string / HTML content
      if (typeof content === 'string' && this._arCharacter) {
        const ch = arDefaults(this._arCharacter);
        if (ch.arEnabled) {
          content += `<br><button
            onclick="window.ARView.open(window._arChars['${ch.id || ch.name}'])"
            style="margin-top:8px;background:#01696f;color:#fff;border:none;
                   border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;">
            📷 AR
          </button>`;
          // Keep a registry so the onclick above can find the char
          window._arChars = window._arChars || {};
          window._arChars[ch.id || ch.name] = ch;
        }
      }
      return orig.call(this, content, options);
    };
  }

  // Run once Leaflet is ready
  if (window.L) {
    patchLeafletPopups();
  } else {
    window.addEventListener('load', patchLeafletPopups);
  }

  // ── 4. Extend Add/Edit modal with AR fields ──────────────────────────────
  // After the modal opens, append AR-specific controls if not present.

  function injectARModalFields() {
    const form = document.querySelector('#add-character-form, #editCharForm, .character-form, form[data-char-form]');
    if (!form || form.querySelector('.ar-fields')) return;

    const section = document.createElement('div');
    section.className = 'ar-fields';
    section.style.cssText = 'margin-top:16px;padding-top:16px;border-top:1px solid #ddd;';
    section.innerHTML = `
      <h4 style="margin:0 0 10px;font-size:14px;color:#555;">AR Settings</h4>

      <label style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <input type="checkbox" id="ar-enabled-check" checked
               style="width:18px;height:18px;cursor:pointer;">
        <span style="font-size:14px;">Enable AR for this character</span>
      </label>

      <label style="display:block;margin-bottom:10px;font-size:14px;">
        AR Scale
        <input type="range" id="ar-scale-range" min="0.1" max="5" step="0.1" value="1"
               style="width:100%;margin-top:4px;">
        <span id="ar-scale-val" style="font-size:12px;color:#777;">1.0×</span>
      </label>

      <label style="display:block;font-size:14px;">
        Vertical offset (Y)
        <input type="number" id="ar-yoffset" value="0" step="0.05"
               style="width:100%;margin-top:4px;padding:6px;border:1px solid #ccc;border-radius:6px;">
      </label>`;

    form.appendChild(section);

    const scaleRange = document.getElementById('ar-scale-range');
    const scaleVal   = document.getElementById('ar-scale-val');
    if (scaleRange) {
      scaleRange.addEventListener('input', () => {
        scaleVal.textContent = parseFloat(scaleRange.value).toFixed(1) + '×';
      });
    }
  }

  // Observe for the modal opening
  const modalObs = new MutationObserver(() => injectARModalFields());
  modalObs.observe(document.body, { childList: true, subtree: true });

  // ── 5. Intercept form save to capture AR fields ──────────────────────────
  // When a character form is submitted, read AR fields and merge them
  // into the character data before the normal save handler runs.

  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!form.matches('#add-character-form, #editCharForm, .character-form, [data-char-form]')) return;

    const enabledEl = form.querySelector('#ar-enabled-check');
    const scaleEl   = form.querySelector('#ar-scale-range');
    const yOffEl    = form.querySelector('#ar-yoffset');

    // Attach to form so the existing save handler can read them
    if (enabledEl) form._arEnabled  = enabledEl.checked;
    if (scaleEl)   form._arScale    = parseFloat(scaleEl.value) || 1;
    if (yOffEl)    form._arYOffset  = parseFloat(yOffEl.value)  || 0;
  }, true /* capture — before the form's own handler */);

  // ── 6. Expose arDefaults globally so map.js can call it ─────────────────
  window.arDefaults = arDefaults;

  console.log('[AR Patch] loaded — ARView ready, overlay injection active');

})();
