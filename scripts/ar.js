/**
 * scripts/ar.js  v3
 * AR camera view for living-characters.
 *
 * Two paths:
 *   WebXR  — real camera pass-through + hit-test (Android Chrome)
 *   SimAR  — getUserMedia rear camera + DeviceOrientation tracking (iOS / desktop)
 *             The Three.js camera rotates with the phone so the model stays
 *             anchored to the floor as you move the device.
 *
 * API:  window.ARView.open(character)  /  window.ARView.close()
 */

(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────────────────────
  let _ch          = null;
  let _renderer    = null;
  let _scene       = null;
  let _camera      = null;
  let _mixer       = null;
  let _clock       = null;
  let _model       = null;
  let _reticle     = null;
  let _ground      = null;
  let _xrSession   = null;
  let _hitTestSrc  = null;
  let _rafId       = null;
  let _videoStream = null;
  let _videoEl     = null;
  let _placed      = false;
  let _simMode     = false;
  let _container   = null;
  let _overlay     = null;

  // DeviceOrientation tracking
  let _orientHandler  = null;   // bound event listener (so we can remove it)
  let _targetQuat     = null;   // THREE.Quaternion updated from sensor
  let _orientReady    = false;  // true once we have a first reading

  // ─── Mood colours ─────────────────────────────────────────────────────
  const MOOD_COLOURS = {
    happy:'#ffe44d', sad:'#6699cc', angry:'#ff4444',
    scared:'#cc88ff', curious:'#44dd88', neutral:'#aaaaaa',
  };
  const moodColour = m => MOOD_COLOURS[(m||'').toLowerCase()] || '#aaaaaa';

  // ─── Hint helpers ────────────────────────────────────────────────────
  function showHint(msg) {
    const el = document.getElementById('ar-hint');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
  }
  function hideHint() {
    const el = document.getElementById('ar-hint');
    if (!el) return;
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
  }

  // ─── Three.js init ─────────────────────────────────────────────────────
  function initThree(canvas, w, h) {
    const T   = window.THREE;
    _scene    = new T.Scene();
    _clock    = new T.Clock();
    _camera   = new T.PerspectiveCamera(70, w / h, 0.01, 200);
    _renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    _renderer.setSize(w, h, false);
    _renderer.xr.enabled = true;
    _scene.add(new T.AmbientLight(0xffffff, 0.8));
    const d = new T.DirectionalLight(0xffffff, 1.2);
    d.position.set(2, 5, 3);
    _scene.add(d);
    _targetQuat = new T.Quaternion();
  }

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

  // ─── DeviceOrientation → camera quaternion ───────────────────────────────────
  //
  // DeviceOrientationEvent gives us:
  //   alpha — compass heading (Z-axis rotation, 0–360)
  //   beta  — front-back tilt  (X-axis, −180–180)
  //   gamma — left-right tilt  (Y-axis, −90–90)
  //
  // THREE.js camera looks down −Z by default. We want the camera to look in the
  // direction the phone is pointing. The correct Euler order for a portrait phone
  // held up and panning is 'YXZ': yaw (alpha), pitch (beta), roll (gamma).
  //
  // iOS reports alpha relative to an arbitrary starting heading, so we capture
  // the first alpha as an offset and subtract it so the model starts in front.

  let _alphaOffset = null;

  function _startOrientationTracking() {
    const T = window.THREE;

    const attach = () => {
      _alphaOffset = null;
      _orientHandler = (e) => {
        if (e.alpha === null) return;  // sensor not available

        // Capture starting heading so model begins in front of user
        if (_alphaOffset === null) _alphaOffset = e.alpha;

        const alpha = (e.alpha - _alphaOffset + 360) % 360;
        const beta  = e.beta  ?? 0;
        const gamma = e.gamma ?? 0;

        // Convert degrees → radians
        const a = THREE.MathUtils.degToRad(alpha);
        const b = THREE.MathUtils.degToRad(beta);
        const g = THREE.MathUtils.degToRad(gamma);

        // Build euler in screen-space: phone in portrait, camera axis is -Z
        // Order YXZ: heading first, then pitch, then roll
        const euler = new T.Euler(
          b - Math.PI / 2,   // beta: subtract 90° so 0° = looking forward not up
          -a,                 // alpha: negate so turning right rotates right
          -g,                 // gamma: negate for natural roll
          'YXZ'
        );
        _targetQuat.setFromEuler(euler);
        _orientReady = true;
      };
      window.addEventListener('deviceorientation', _orientHandler, { passive: true });
    };

    // iOS 13+ requires explicit permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(state => { if (state === 'granted') attach(); })
        .catch(() => {/* silently skip — fall back to static camera */});
    } else {
      // Android / desktop — no permission needed
      attach();
    }
  }

  function _stopOrientationTracking() {
    if (_orientHandler) {
      window.removeEventListener('deviceorientation', _orientHandler);
      _orientHandler = null;
    }
    _targetQuat = null;
    _alphaOffset = null;
    _orientReady = false;
  }

  // ─── Model loading ──────────────────────────────────────────────────────
  function loadModel(x, y, z) {
    const T     = window.THREE;
    const ch    = _ch;
    const scale = typeof ch.arScale === 'number'   ? ch.arScale   : 1.0;
    const yOff  = typeof ch.arYOffset === 'number' ? ch.arYOffset : 0;
    const url   = ch.glbUrl || '';

    if (_model) { _scene.remove(_model); _model = null; }

    const place = (mesh) => {
      _model = mesh;
      _model.position.set(x, y + yOff, z);
      _scene.add(_model);
      _placed = true;
      _reticle.visible = false;
      hideHint();
      // After placement, nudge the user to move the phone
      setTimeout(() => showHint('Move your phone to look around'), 2400);
      setTimeout(() => hideHint(), 4000);
    };

    if (url && window.GLTFLoader) {
      // Instant placeholder
      const ph = makeFallbackBox(ch, scale, yOff);
      ph.position.set(x, y + yOff, z);
      _model = ph;
      _scene.add(_model);
      _placed = true;
      _reticle.visible = false;
      hideHint();
      setTimeout(() => showHint('Move your phone to look around'), 2400);
      setTimeout(() => hideHint(), 4000);

      const loader = new window.GLTFLoader();
      loader.load(url,
        (gltf) => {
          _scene.remove(ph);
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
        err => console.warn('AR: GLB failed, keeping placeholder', err)
      );
    } else {
      place(makeFallbackBox(ch, scale, yOff));
    }
  }

  function makeFallbackBox(ch, scale) {
    const T   = window.THREE;
    const geo = new T.BoxGeometry(0.3 * scale, 0.6 * scale, 0.3 * scale);
    const mat = ch.photoData
      ? new T.MeshStandardMaterial({ map: new T.TextureLoader().load(ch.photoData) })
      : new T.MeshStandardMaterial({ color: new T.Color(moodColour(ch.mood)) });
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
      const pos = new T.Vector3(), quat = new T.Quaternion(), sc = new T.Vector3();
      _reticle.matrix.decompose(pos, quat, sc);
      _placed ? repositionModel(pos.x, pos.y, pos.z) : loadModel(pos.x, pos.y, pos.z);
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

  // ─── Simulated AR path (iOS / desktop) ────────────────────────────────────
  async function startSimAR() {
    const T = window.THREE;
    _simMode = true;

    // Camera feed
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

    // Three.js canvas
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;pointer-events:none;touch-action:none;';
    _container.appendChild(canvas);

    initThree(canvas, innerWidth, innerHeight);
    makeReticle();

    // Invisible ground plane at y = 0
    const geoG = new T.PlaneGeometry(20, 20);
    geoG.rotateX(-Math.PI / 2);
    _ground = new T.Mesh(geoG, new T.MeshBasicMaterial({ visible: false, side: T.DoubleSide }));
    _ground.position.y = 0;
    _scene.add(_ground);

    // Camera starts at eye height, looking forward
    // Position stays fixed (we have no translation data from sensors)
    // Only rotation is updated from DeviceOrientation
    _camera.position.set(0, 1.6, 0);
    _camera.lookAt(0, 0, -3);

    // Start orientation tracking (asks iOS permission if needed)
    _startOrientationTracking();

    showHint('Tap the floor to place ' + _ch.name);

    // ── Render loop ───────────────────────────────────────────────
    const LERP = 0.15;  // smoothing factor (0 = instant, 1 = frozen)
    const loop = () => {
      _rafId = requestAnimationFrame(loop);

      // Smoothly interpolate camera rotation toward sensor target
      if (_orientReady && _targetQuat) {
        _camera.quaternion.slerp(_targetQuat, LERP);
      }

      if (_mixer) _mixer.update(_clock.getDelta());
      _renderer.render(_scene, _camera);
    };
    loop();

    // ── Raycasting helpers ────────────────────────────────────────
    const getRayHit = (cx, cy) => {
      const rc = new T.Raycaster();
      rc.setFromCamera(
        new T.Vector2((cx / innerWidth) * 2 - 1, (cy / innerHeight) * -2 + 1),
        _camera
      );
      const hits = rc.intersectObject(_ground);
      return hits.length ? hits[0].point : null;
    };

    _overlay.addEventListener('pointermove', (e) => {
      if (e.target.closest('button, #ar-dialogue, #ar-items-panel')) return;
      const p = getRayHit(e.clientX, e.clientY);
      if (p) { _reticle.position.set(p.x, p.y + 0.001, p.z); _reticle.visible = true; }
    });

    _overlay.addEventListener('pointerup', (e) => {
      if (e.target.closest('button, #ar-dialogue, #ar-items-panel')) return;
      const p = getRayHit(e.clientX, e.clientY);
      if (!p) return;
      _placed ? repositionModel(p.x, p.y, p.z) : loadModel(p.x, p.y, p.z);
      _reticle.visible = false;
    });
  }

  // ─── Overlay HTML & UI wiring ──────────────────────────────────────────────
  function buildOverlayHTML(ch) {
    const colour = moodColour(ch.mood);
    return `
      <div id="ar-overlay" style="position:fixed;inset:0;pointer-events:none;z-index:9999;font-family:system-ui,sans-serif;">
        <!-- top bar -->
        <div style="position:absolute;top:0;left:0;right:0;padding:16px 20px;
          display:flex;align-items:center;gap:12px;
          background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);pointer-events:auto;">
          <div style="width:18px;height:18px;border-radius:50%;background:${colour};
            box-shadow:0 0 10px 4px ${colour}88;
            animation:ar-pulse 1.8s ease-in-out infinite;flex-shrink:0;"></div>
          <span style="color:#fff;font-size:20px;font-weight:700;
            text-shadow:0 1px 4px rgba(0,0,0,.7);">${ch.name||'Character'}</span>
          <button id="ar-exit" style="margin-left:auto;background:rgba(255,255,255,.15);
            border:none;border-radius:8px;padding:8px 16px;color:#fff;
            font-size:15px;font-weight:600;cursor:pointer;
            backdrop-filter:blur(6px);">✕ Exit AR</button>
        </div>
        <!-- hint -->
        <div id="ar-hint" style="position:absolute;top:80px;left:50%;
          transform:translateX(-50%);background:rgba(0,0,0,.55);color:#fff;
          border-radius:20px;padding:8px 20px;font-size:14px;text-align:center;
          backdrop-filter:blur(6px);transition:opacity .6s;
          pointer-events:none;white-space:nowrap;">
          Tap the floor to place ${ch.name||'character'}
        </div>
        <!-- bottom actions -->
        <div style="position:absolute;bottom:0;left:0;right:0;padding:20px;
          display:flex;gap:12px;justify-content:center;
          background:linear-gradient(to top,rgba(0,0,0,.55),transparent);
          pointer-events:auto;">
          <button id="ar-talk" style="background:rgba(255,255,255,.18);
            border:2px solid rgba(255,255,255,.4);border-radius:16px;
            padding:14px 28px;color:#fff;font-size:17px;font-weight:700;
            cursor:pointer;backdrop-filter:blur(8px);min-width:120px;">💬 Talk</button>
          <button id="ar-items" style="background:rgba(255,255,255,.18);
            border:2px solid rgba(255,255,255,.4);border-radius:16px;
            padding:14px 28px;color:#fff;font-size:17px;font-weight:700;
            cursor:pointer;backdrop-filter:blur(8px);min-width:120px;">🎒 Items</button>
        </div>
        <!-- panels -->
        <div id="ar-dialogue" style="position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;padding:20px;color:#fff;
          font-size:16px;line-height:1.5;backdrop-filter:blur(12px);display:none;
          max-height:40vh;overflow-y:auto;pointer-events:auto;"></div>
        <div id="ar-items-panel" style="position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;padding:20px;color:#fff;
          font-size:16px;line-height:1.5;backdrop-filter:blur(12px);display:none;
          pointer-events:auto;"></div>
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
      const show = !dlg.style.display || dlg.style.display === 'none';
      dlg.innerHTML = buildDialogueHTML(ch);
      dlg.style.display   = show ? 'block' : 'none';
      items.style.display = 'none';
    });
    document.getElementById('ar-items').addEventListener('click', () => {
      const show = !items.style.display || items.style.display === 'none';
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
        <strong>${i.name||i}</strong>
        ${i.description ? '<br><span style="color:#ccc;font-size:14px">'+i.description+'</span>' : ''}
      </div>`
    ).join('');
  }

  // ─── Open / Close ────────────────────────────────────────────────────────
  async function open(character) {
    if (!window.THREE) { alert('Three.js not loaded — cannot open AR.'); return; }
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
    if (_rafId)       { cancelAnimationFrame(_rafId);              _rafId = null; }
    if (_xrSession)   { _xrSession.end().catch(()=>{});            _xrSession = null; }
    if (_videoStream) { _videoStream.getTracks().forEach(t=>t.stop()); _videoStream = null; }
    if (_renderer)    { _renderer.dispose();                       _renderer = null; }
    if (_mixer)       { _mixer.stopAllAction();                    _mixer = null; }
    _stopOrientationTracking();
    _scene=_camera=_model=_reticle=_ground=_clock=null;
    _placed=false; _simMode=false;
    if (_container) { _container.remove(); _container = null; }
    if (_overlay)   { _overlay.remove();   _overlay   = null; }
    if (_videoEl)   { _videoEl.remove();   _videoEl   = null; }
    if (returnToCard && _ch && typeof window.openCharacterCard === 'function') {
      window.openCharacterCard(_ch);
    }
    _ch = null;
  }

  window.ARView = { open, close };

})();
