/* ============================================================
   scripts/ar-patch.js  —  Wire the card "📱 AR" button
   ============================================================ */
(function () {
  function hookArButton() {
    const btn = document.getElementById('card-ar-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (window.lcAR && typeof window.selectedChar !== 'undefined' && window.selectedChar) {
        window.lcAR.launchAR(window.selectedChar);
      } else {
        if (typeof showToast === 'function') showToast('No character selected for AR.', 'err');
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookArButton);
  } else {
    hookArButton();
  }
})();
