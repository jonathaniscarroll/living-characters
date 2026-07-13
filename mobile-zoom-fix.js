/**
 * mobile-zoom-fix.js
 * ------------------
 * Belt-and-suspenders iOS Safari zoom prevention.
 * Include this with a <script src="mobile-zoom-fix.js"> tag in index.html
 * BEFORE the closing </body>.
 *
 * What it does:
 *   1. Blocks gesturestart / gesturechange — the Safari-proprietary events
 *      that trigger pinch-zoom even when user-scalable=no is set on older iOS.
 *   2. Adds a ⚙ button to the header that toggles the GitHub token bar
 *      on mobile, so it doesn't eat screen space by default.
 */

// 1. Block Safari gesture zoom events
document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });

// 2. Patch viewport meta to add user-scalable=no at runtime
//    (handles cases where the HTML meta hasn't been updated yet)
(function patchViewport() {
  const meta = document.querySelector('meta[name=viewport]');
  if (!meta) return;
  const content = meta.getAttribute('content');
  if (!content.includes('user-scalable')) {
    meta.setAttribute('content', content + ', maximum-scale=1.0, user-scalable=no');
  }
})();

// 3. GitHub bar toggle for mobile
function toggleGhBar() {
  const bar = document.getElementById('gh-bar');
  if (!bar) return;
  const isOpen = bar.classList.toggle('mobile-open');
  document.body.classList.toggle('ghbar-open', isOpen);
}
// Expose globally so the onclick in the button can find it
window.toggleGhBar = toggleGhBar;

// 4. Inject the ⚙ toggle button into the header if it isn't there yet
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('gh-bar-toggle')) return;
  const btns = document.querySelector('#header .btns');
  if (!btns) return;
  const btn = document.createElement('button');
  btn.id = 'gh-bar-toggle';
  btn.className = 'hbtn';
  btn.style.cssText = 'background:#0a1520;color:#90caf9;border:1px solid #ffffff18;';
  btn.setAttribute('onclick', 'toggleGhBar()');
  btn.setAttribute('title', 'GitHub settings');
  btn.textContent = '⚙';
  // Insert before the last item (Projector / mode-label span)
  const modeLabel = document.getElementById('mode-label');
  btns.insertBefore(btn, modeLabel || null);
});
