# index.html — AR wiring instructions

This file documents the **three small additions** needed in `index.html` to wire up the AR scripts.
Apply them manually or via a find-replace in your editor.

---

## 1. Load AR scripts before `</body>`

Add these two `<script>` tags **after** all existing script tags, just before `</body>`:

```html
<!-- AR view module -->
<script src="scripts/ar.js"></script>
<!-- AR runtime patch — wires Visit in AR into cards + pins -->
<script src="scripts/ar-patch.js"></script>
```

---

## 2. Add `GLTFLoader` if not already present

If `scripts/room.js` already imports `GLTFLoader` from Three.js addons, nothing extra is needed.
If not, add this line in the `<head>` (after the Three.js CDN tag):

```html
<script src="https://cdn.jsdelivr.net/npm/three@0.152.2/examples/js/loaders/GLTFLoader.js"></script>
```

---

## 3. (Optional) Add `isSessionSupported` polyfill for older iOS

Insert in `<head>` before other scripts:

```html
<script>
  if (!navigator.xr) {
    navigator.xr = { isSessionSupported: () => Promise.resolve(false) };
  }
</script>
```

This prevents a JS error on browsers that have no `navigator.xr` at all.
