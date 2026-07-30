/**
 * scripts/ar.js  v2
 * AR camera view for living-characters.
 *
 * Two paths:
 *   WebXR  — real camera pass-through + hit-test floor detection (Android Chrome)
 *   SimAR  — getUserMedia rear camera + invisible ground-plane raycasting (iOS / desktop)
 *
 * Key interaction:
 *   WebXR : white reticle tracks detected surface → tap places model
 *   SimAR : white reticle tracks ground under finger → TAP PLACES model
 *           (no auto-place; user must tap the floor)
 *
 * API:  window.ARView.open(character)  /  window.ARView.close()
 */

(function () {
  'use strict';

  // ─── State ────────────────────────────────────────────────────────────────
  let _ch         = null;   // active character
  let _renderer   = null;
  let _scene      = null;
  let _camera     = null;
  let _mixer      = null;
  let _clock      = null;
  let _model      = null;
  let _reticle    = null;
  let _ground     = null;   // invisible ground mesh (simAR)
  let _xrSession  = null;
  let _hitTestSrc = null;
  let _rafId      = null;
  let _videoStream= null;
  let _videoEl    = null;
  let _placed     = false;  // has user tapped to place yet?
  let _simMode    = false;
  let _container  = null;
  let _overlay    = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const MOOD_COLOURS = {
    happy:'#ffe44d', sad:'#6699cc', angry:'#ff4444',
    scared:'#cc88ff', curious:'#44dd88', neutral:'#aaaaaa',
  };
  const moodColour = m => MOOD_COLOURS[(m||'').toLowerCase()] || '#aaaaaa';

  function showHint(msg) {
    const el = document.getElementById('ar-hint');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
  }
  function hideHint() {
    const el = document.getElementById('ar-hint');
    if (!el) return;
    setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  // ─── Three.js init ───────────────────────────────────────────────────────

  function initThree(canvas, w, h) {
    const T = window.THREE;
    _scene  = new T.Scene();
    _clock  = new T.Clock();
    _camera = new T.PerspectiveCamera(70, w / h, 0.01, 200);
    _renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    _renderer.setSize(w, h, false);
    _renderer.xr.enabled = true;
    _scene.add(new T.AmbientLight(0xffffff, 0.8));
    const d = new T.DirectionalLight(0xffffff, 1.2);
    d.position.set(2, 5, 3);
    _scene.add(d);
  }

  // White ring reticle
  function makeReticle() {
    const T   = window.THREE;
    const geo = new T.RingGeometry(0.07, 0.1, 32);
    geo.applyMatrix4(new T.Matrix4().makeRotationX(-Math.PI / 2));
    _reticle = new T.Mesh(geo, new T.MeshBasicMaterial({
      color: 0xffffff, side: T.DoubleSide, depthTest: false
    }));
    _reticle.visible = false;
    _scene.add(_reticle);
  }

  // ─── Model loading ───────────────────────────────────────────────────────

  function loadModel(x, y, z) {
    const T     = window.THREE;
    const ch    = _ch;
    const scale = typeof ch.arScale === 'number'   ? ch.arScale   : 1.0;
    const yOff  = typeof ch.arYOffset === 'number' ? ch.arYOffset : 0;
    const url   = ch.glbUrl || '';

    // Remove old model
    if (_model) { _scene.remove(_model); _model = null; }

    const place = (mesh) => {
      _model = mesh;
      _model.position.set(x, y + yOff, z);
      _scene.add(_model);
      _placed = true;
      _reticle.visible = false;
      hideHint();
    };

    if (url && window.GLTFLoader) {
      const loader = new window.GLTFLoader();
      // Show a placeholder box while the GLB loads
      const placeholder = makeFallbackBox(ch, scale, yOff);
      placeholder.position.set(x, y + yOff, z);
      _model = placeholder;
      _scene.add(_model);
      _placed = true;
      _reticle.visible = false;
      hideHint();

      loader.load(
        url,
        (gltf) => {
          // Swap placeholder for real model
          _scene.remove(placeholder);
          const m = gltf.scene;
          m.scale.setScalar(scale);
          place(m);
          if (gltf.animations && gltf.animations.length) {
            _mixer = new T.AnimationMixer(m);
            const idle = gltf.animations.find(a => /idle/i.test(a.name)) || gltf.animations[0];
            _mixer.clipAction(idle).play();
          }
        },
        undefined,
        (err) => { console.warn('AR: GLB failed, keeping fallback box', err); }
      );
    } else {
      place(makeFallbackBox(ch, scale, yOff));
    }
  }

  function makeFallbackBox(ch, scale, yOff) {
    const T   = window.THREE;
    const geo = new T.BoxGeometry(0.3 * scale, 0.6 * scale, 0.3 * scale);
    let mat;
    if (ch.photoData) {
      const tex = new T.TextureLoader().load(ch.photoData);
      mat = new T.MeshStandardMaterial({ map: tex });
    } else {
      mat = new T.MeshStandardMaterial({ color: new T.Color(moodColour(ch.mood)) });
    }
    return new T.Mesh(geo, mat);
  }

  function repositionModel(x, y, z) {
    if (!_model) return;
    const yOff = typeof _ch.arYOffset === 'number' ? _ch.arYOffset : 0;
    _model.position.set(x, y + yOff, z);
  }

  // ─── WebXR path ───────────────────────────────────────────────────────────

  async function startWebXR() {
    const T      = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;touch-action:none;';
    _container.appendChild(canvas);

    initThree(canvas, innerWidth, innerHeight);
    makeReticle();

    _xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: _overlay },
    });

    _renderer.xr.setReferenceSpaceType('local');
    await _renderer.xr.setSession(_xrSession);

    const refSpace    = await _xrSession.requestReferenceSpace('local');
    const viewerSpace = await _xrSession.requestReferenceSpace('viewer');
    _hitTestSrc = await _xrSession.requestHitTestSource({ space: viewerSpace });

    showHint('Point at the floor — tap to place ' + _ch.name);

    _xrSession.addEventListener('select', () => {
      if (!_reticle.visible) return;
      const pos  = new T.Vector3();
      const quat = new T.Quaternion();
      const sc   = new T.Vector3();
      _reticle.matrix.decompose(pos, quat, sc);
      if (!_placed) {
        loadModel(pos.x, pos.y, pos.z);
      } else {
        repositionModel(pos.x, pos.y, pos.z);
      }
    });

    _renderer.setAnimationLoop((_, frame) => {
      if (frame && _hitTestSrc) {
        const results = frame.getHitTestResults(_hitTestSrc);
        if (results.length) {
          const pose = results[0].getPose(refSpace);
          _reticle.visible = true;
          _reticle.matrix.fromArray(pose.transform.matrix);
          _reticle.matrixAutoUpdate = false;
        } else {
          _reticle.visible = false;
        }
      }
      if (_mixer) _mixer.update(_clock.getDelta());
      _renderer.render(_scene, _camera);
    });

    _xrSession.addEventListener('end', () => close(false));
  }

  // ─── Simulated AR path ────────────────────────────────────────────────────

  async function startSimAR() {
    const T = window.THREE;
    _simMode = true;

    // 1. Camera feed background
    _videoEl = document.createElement('video');
    _videoEl.setAttribute('autoplay', '');
    _videoEl.setAttribute('playsinline', '');
    _videoEl.setAttribute('muted', '');
    _videoEl.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:9997;';
    try {
      _videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      _videoEl.srcObject = _videoStream;
      await _videoEl.play().catch(() => {});
    } catch (e) {
      _videoEl.style.background = '#111';
    }
    _container.appendChild(_videoEl);

    // 2. Three.js canvas (alpha:true so camera shows through)
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none;touch-action:none;';
    _container.appendChild(canvas);

    initThree(canvas, innerWidth, innerHeight);
    makeReticle();

    // Invisible ground plane at y = 0 (camera is at y = 1.6, looking forward)
    const geoG = new T.PlaneGeometry(20, 20);
    geoG.rotateX(-Math.PI / 2);
    _ground = new T.Mesh(geoG, new T.MeshBasicMaterial({ visible: false, side: T.DoubleSide }));
    _ground.position.y = 0;
    _scene.add(_ground);

    _camera.position.set(0, 1.6, 0);
    _camera.lookAt(0, 0, -2);

    showHint('Tap the floor to place ' + _ch.name);

    // Render loop (runs continuously)
    const loop = () => {
      _rafId = requestAnimationFrame(loop);
      if (_mixer) _mixer.update(_clock.getDelta());
      _renderer.render(_scene, _camera);
    };
    loop();

    // Pointer tracking — move reticle to ground hit point on every touch/move
    const getRayHit = (clientX, clientY) => {
      const raycaster = new T.Raycaster();
      raycaster.setFromCamera(
        new T.Vector2(
          (clientX / innerWidth)  *  2 - 1,
          (clientY / innerHeight) * -2 + 1
        ),
        _camera
      );
      const hits = raycaster.intersectObject(_ground);
      return hits.length ? hits[0].point : null;
    };

    // Track finger to show reticle before commitment
    _overlay.addEventListener('pointermove', (e) => {
      if (e.target.closest('button, #ar-dialogue, #ar-items-panel')) return;
      const p = getRayHit(e.clientX, e.clientY);
      if (p) {
        _reticle.position.copy(p);
        _reticle.position.y += 0.001; // just above floor
        _reticle.visible = true;
      }
    });

    // Tap to place / reposition
    _overlay.addEventListener('pointerup', (e) => {
      if (e.target.closest('button, #ar-dialogue, #ar-items-panel')) return;
      const p = getRayHit(e.clientX, e.clientY);
      if (!p) return;
      if (!_placed) {
        loadModel(p.x, p.y, p.z);
      } else {
        repositionModel(p.x, p.y, p.z);
      }
      _reticle.visible = false;
    });
  }

  // ─── Overlay UI ───────────────────────────────────────────────────────────

  function buildOverlayHTML(ch) {
    const colour = moodColour(ch.mood);
    return `
      <div id="ar-overlay" style="position:fixed;inset:0;pointer-events:none;z-index:9999;font-family:system-ui,sans-serif;">
        <div style="position:absolute;top:0;left:0;right:0;padding:16px 20px;display:flex;align-items:center;gap:12px;
          background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);pointer-events:auto;">
          <div style="width:18px;height:18px;border-radius:50%;background:${colour};
            box-shadow:0 0 10px 4px ${colour}88;animation:ar-pulse 1.8s ease-in-out infinite;flex-shrink:0;"></div>
          <span style="color:#fff;font-size:20px;font-weight:700;text-shadow:0 1px 4px rgba(0,0,0,.7);">${ch.name||'Character'}</span>
          <button id="ar-exit" style="margin-left:auto;background:rgba(255,255,255,.15);border:none;border-radius:8px;
            padding:8px 16px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;backdrop-filter:blur(6px);">✕ Exit AR</button>
        </div>
        <div id="ar-hint" style="position:absolute;top:80px;left:50%;transform:translateX(-50%);
          background:rgba(0,0,0,.55);color:#fff;border-radius:20px;padding:8px 20px;
          font-size:14px;text-align:center;backdrop-filter:blur(6px);transition:opacity .6s;
          pointer-events:none;white-space:nowrap;">Tap the floor to place ${ch.name||'character'}</div>
        <div style="position:absolute;bottom:0;left:0;right:0;padding:20px;display:flex;gap:12px;
          justify-content:center;background:linear-gradient(to top,rgba(0,0,0,.55),transparent);pointer-events:auto;">
          <button id="ar-talk" style="background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);
            border-radius:16px;padding:14px 28px;color:#fff;font-size:17px;font-weight:700;cursor:pointer;
            backdrop-filter:blur(8px);min-width:120px;">💬 Talk</button>
          <button id="ar-items" style="background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);
            border-radius:16px;padding:14px 28px;color:#fff;font-size:17px;font-weight:700;cursor:pointer;
            backdrop-filter:blur(8px);min-width:120px;">🎒 Items</button>
        </div>
        <div id="ar-dialogue" style="position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;padding:20px;color:#fff;font-size:16px;
          line-height:1.5;backdrop-filter:blur(12px);display:none;max-height:40vh;overflow-y:auto;pointer-events:auto;"></div>
        <div id="ar-items-panel" style="position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;padding:20px;color:#fff;font-size:16px;
          line-height:1.5;backdrop-filter:blur(12px);display:none;pointer-events:auto;"></div>
        <style>
          @keyframes ar-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.7}}
          #ar-exit:active,#ar-talk:active,#ar-items:active{transform:scale(.95);background:rgba(255,255,255,.28);}
        </style>
      </div>`;
  }

  function wireUI(ch) {
    document.getElementById('ar-exit').addEventListener('click', () => close(true));

    const dlg   = document.getElementById('ar-dialogue');
    const items = document.getElementById('ar-items-panel');

    document.getElementById('ar-talk').addEventListener('click', () => {
      const show = dlg.style.display === 'none' || !dlg.style.display;
      dlg.innerHTML   = buildDialogueHTML(ch);
      dlg.style.display   = show ? 'block' : 'none';
      items.style.display = 'none';
    });

    document.getElementById('ar-items').addEventListener('click', () => {
      const show = items.style.display === 'none' || !items.style.display;
      items.innerHTML    = buildItemsHTML(ch);
      items.style.display  = show ? 'block' : 'none';
      dlg.style.display    = 'none';
    });
  }

  function buildDialogueHTML(ch) {
    const d = ch.dialogue || {};
    const hello    = d.hello    || d[ch.name+'-hello']    || ch.greeting || '';
    const question = d.question || d[ch.name+'-question'] || '';
    const secret   = d.secret   || d[ch.name+'-secret']   || '';
    let h = `<p><strong>${ch.name||'Character'} says:</strong></p>`;
    if (hello)    h += `<p style="margin-top:10px">${hello}</p>`;
    if (question) h += `<p style="margin-top:8px;color:#adf">❓ ${question}</p>`;
    if (secret)   h += `<p style="margin-top:8px;color:#fad">🤫 ${secret}</p>`;
    if (!hello && !question && !secret) h += '<p style="color:#aaa">…says nothing yet.</p>';
    return h;
  }

  function buildItemsHTML(ch) {
    const list = ch.items || [];
    if (!list.length) return '<p style="color:#aaa">No items.</p>';
    return list.map(i =>
      `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.1)">
        <strong>${i.name||i}</strong>${i.description?'<br><span style="color:#ccc;font-size:14px">'+i.description+'</span>':''}
      </div>`
    ).join('');
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  async function open(character) {
    if (!window.THREE) {
      alert('Three.js not loaded — cannot open AR.');
      return;
    }

    _ch = character;
    _placed = false;

    _container = document.createElement('div');
    _container.id = 'ar-root';
    _container.style.cssText = 'position:fixed;inset:0;z-index:9997;';
    document.body.appendChild(_container);

    _overlay = document.createElement('div');
    _overlay.id = 'ar-overlay-root';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;';
    _overlay.innerHTML = buildOverlayHTML(character);
    document.body.appendChild(_overlay);

    wireUI(character);

    const supportsWebXR = !!(navigator.xr &&
      await navigator.xr.isSessionSupported('immersive-ar').catch(() => false));

    if (supportsWebXR) {
      try { await startWebXR(); }
      catch (e) { console.warn('WebXR failed, using sim AR:', e); await startSimAR(); }
    } else {
      await startSimAR();
    }
  }

  function close(returnToCard) {
    if (_rafId)      { cancelAnimationFrame(_rafId); _rafId = null; }
    if (_xrSession)  { _xrSession.end().catch(()=>{}); _xrSession = null; }
    if (_videoStream){ _videoStream.getTracks().forEach(t=>t.stop()); _videoStream = null; }
    if (_renderer)   { _renderer.dispose(); _renderer = null; }
    if (_mixer)      { _mixer.stopAllAction(); _mixer = null; }
    _scene=_camera=_model=_reticle=_ground=_clock=null;
    _placed=false; _simMode=false;
    if (_container) { _container.remove();  _container = null; }
    if (_overlay)   { _overlay.remove();    _overlay   = null; }
    if (_videoEl)   { _videoEl.remove();    _videoEl   = null; }
    if (returnToCard && _ch && typeof window.openCharacterCard === 'function') {
      window.openCharacterCard(_ch);
    }
    _ch = null;
  }

  window.ARView = { open, close };

})();
