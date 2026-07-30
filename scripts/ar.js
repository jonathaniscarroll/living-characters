/**
 * scripts/ar.js
 * AR camera view for living-characters.
 *
 * Strategy:
 *   1. Try WebXR immersive-ar with hit-test (Android Chrome / supported browsers).
 *   2. Fall back to a simulated AR mode: live getUserMedia camera feed behind a
 *      Three.js canvas, character placed on a virtual ground plane the user can
 *      tap to reposition.
 *
 * Public API (attached to window.ARView):
 *   ARView.open(character)  — launch AR for a character object
 *   ARView.close()          — exit AR and return to map
 */

(function () {
  'use strict';

  // ─── Module-level state ───────────────────────────────────────────────────
  let _character   = null;
  let _renderer    = null;
  let _scene       = null;
  let _camera      = null;
  let _mixer       = null;
  let _clock       = null;
  let _model       = null;
  let _reticle     = null;       // hit-test reticle (WebXR path)
  let _xrSession   = null;
  let _hitTestSrc  = null;
  let _rafId       = null;
  let _videoStream = null;
  let _videoEl     = null;
  let _placedAt    = null;       // THREE.Vector3 — where model is anchored
  let _simMode     = false;      // true when running the fallback
  let _container   = null;
  let _overlay     = null;

  // ─── Helpers ─────────────────────────────────────────────────────────────

  function moodToHex(mood) {
    const map = {
      happy: '#ffe44d', sad: '#6699cc', angry: '#ff4444',
      scared: '#cc88ff', curious: '#44dd88', neutral: '#aaaaaa',
    };
    return map[(mood || '').toLowerCase()] || '#aaaaaa';
  }

  function buildOverlayHTML(ch) {
    const colour = moodToHex(ch.mood);
    const arEnabled = ch.arEnabled !== false;
    return `
      <div id="ar-overlay" style="
        position:fixed;inset:0;pointer-events:none;z-index:9999;
        font-family:system-ui,sans-serif;">

        <!-- top bar -->
        <div style="
          position:absolute;top:0;left:0;right:0;
          padding:16px 20px;display:flex;align-items:center;gap:12px;
          background:linear-gradient(to bottom,rgba(0,0,0,.55),transparent);
          pointer-events:auto;">

          <!-- mood ring -->
          <div style="
            width:18px;height:18px;border-radius:50%;
            background:${colour};
            box-shadow:0 0 10px 4px ${colour}88;
            animation:ar-pulse 1.8s ease-in-out infinite;
            flex-shrink:0;"></div>

          <!-- name -->
          <span style="
            color:#fff;font-size:20px;font-weight:700;
            text-shadow:0 1px 4px rgba(0,0,0,.7);">${ch.name || 'Character'}</span>

          <!-- exit -->
          <button id="ar-exit" style="
            margin-left:auto;background:rgba(255,255,255,.15);
            border:none;border-radius:8px;padding:8px 16px;
            color:#fff;font-size:15px;font-weight:600;cursor:pointer;
            backdrop-filter:blur(6px);">
            ✕ Exit AR
          </button>
        </div>

        <!-- hint banner -->
        <div id="ar-hint" style="
          position:absolute;top:80px;left:50%;transform:translateX(-50%);
          background:rgba(0,0,0,.5);color:#fff;border-radius:20px;
          padding:8px 20px;font-size:14px;text-align:center;
          backdrop-filter:blur(6px);transition:opacity .4s;">
          ${arEnabled ? 'Tap the floor to place the character' : 'Point camera and tap to place'}
        </div>

        <!-- bottom action bar -->
        <div style="
          position:absolute;bottom:0;left:0;right:0;
          padding:20px;display:flex;gap:12px;justify-content:center;
          background:linear-gradient(to top,rgba(0,0,0,.55),transparent);
          pointer-events:auto;">

          <button id="ar-talk" style="
            background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);
            border-radius:16px;padding:14px 28px;color:#fff;
            font-size:17px;font-weight:700;cursor:pointer;
            backdrop-filter:blur(8px);min-width:120px;">💬 Talk</button>

          <button id="ar-items" style="
            background:rgba(255,255,255,.18);border:2px solid rgba(255,255,255,.4);
            border-radius:16px;padding:14px 28px;color:#fff;
            font-size:17px;font-weight:700;cursor:pointer;
            backdrop-filter:blur(8px);min-width:120px;">🎒 Items</button>
        </div>

        <!-- dialogue panel (hidden by default) -->
        <div id="ar-dialogue" style="
          position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;
          padding:20px;color:#fff;font-size:16px;line-height:1.5;
          backdrop-filter:blur(12px);display:none;
          max-height:40vh;overflow-y:auto;"></div>

        <!-- items panel (hidden by default) -->
        <div id="ar-items-panel" style="
          position:absolute;bottom:100px;left:16px;right:16px;
          background:rgba(10,10,10,.85);border-radius:20px;
          padding:20px;color:#fff;font-size:16px;line-height:1.5;
          backdrop-filter:blur(12px);display:none;"></div>

        <style>
          @keyframes ar-pulse {
            0%,100%{transform:scale(1);opacity:1}
            50%{transform:scale(1.3);opacity:.7}
          }
          #ar-talk:active,#ar-items:active,#ar-exit:active{
            transform:scale(.95);background:rgba(255,255,255,.28);
          }
        </style>
      </div>`;
  }

  function buildItemsHTML(ch) {
    const items = ch.items || [];
    if (!items.length) return '<p style="color:#aaa">No items.</p>';
    return items.map(i =>
      `<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.1);last-child{border:none}">
        <strong>${i.name || i}</strong>${i.description ? '<br><span style="color:#ccc;font-size:14px">' + i.description + '</span>' : ''}
      </div>`
    ).join('');
  }

  function buildDialogueHTML(ch) {
    const dlg = ch.dialogue || {};
    const hello   = dlg.hello   || dlg[ch.name + '-hello']   || ch.greeting || '';
    const question= dlg.question|| dlg[ch.name + '-question']|| '';
    const secret  = dlg.secret  || dlg[ch.name + '-secret']  || '';
    let html = `<p><strong>${ch.name || 'Character'} says:</strong></p>`;
    if (hello)    html += `<p style="margin-top:10px">${hello}</p>`;
    if (question) html += `<p style="margin-top:8px;color:#adf">❓ ${question}</p>`;
    if (secret)   html += `<p style="margin-top:8px;color:#fad">🤫 ${secret}</p>`;
    if (!hello && !question && !secret)
      html += '<p style="color:#aaa">…says nothing yet.</p>';
    return html;
  }

  // ─── Three.js setup (shared by both paths) ───────────────────────────────

  function initThree(canvas, width, height) {
    const THREE = window.THREE;
    _scene  = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 200);
    _clock  = new THREE.Clock();

    _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(width, height);
    _renderer.xr.enabled = true;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    _scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 5, 3);
    _scene.add(dir);

    return { THREE, renderer: _renderer, scene: _scene, camera: _camera };
  }

  function loadModel(ch) {
    const THREE = window.THREE;
    const url   = ch.glbUrl || '';
    const scale = typeof ch.arScale === 'number' ? ch.arScale : 1.0;
    const yOff  = typeof ch.arYOffset === 'number' ? ch.arYOffset : 0;

    // Remove previous model
    if (_model) { _scene.remove(_model); _model = null; }

    if (url && typeof window.GLTFLoader !== 'undefined') {
      const loader = new window.GLTFLoader();
      loader.load(url,
        (gltf) => {
          _model = gltf.scene;
          _model.scale.setScalar(scale);
          _model.position.set(0, yOff, -1.5);
          _scene.add(_model);

          // Animations
          if (gltf.animations && gltf.animations.length) {
            _mixer = new THREE.AnimationMixer(_model);
            const idle = gltf.animations.find(a =>
              /idle/i.test(a.name)) || gltf.animations[0];
            _mixer.clipAction(idle).play();
          }
          hideHint();
        },
        undefined,
        (err) => {
          console.warn('AR: GLB load failed, using fallback box', err);
          _model = buildFallbackBox(ch, scale, yOff);
          _scene.add(_model);
          hideHint();
        }
      );
    } else {
      // Photo sprite or box fallback
      _model = buildFallbackBox(ch, scale, yOff);
      _scene.add(_model);
      if (!url) hideHint();
    }
  }

  function buildFallbackBox(ch, scale, yOff) {
    const THREE = window.THREE;
    const geo  = new THREE.BoxGeometry(0.3 * scale, 0.6 * scale, 0.3 * scale);
    let mat;
    if (ch.photoData) {
      const tex = new THREE.TextureLoader().load(ch.photoData);
      mat = new THREE.MeshStandardMaterial({ map: tex });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(moodToHex(ch.mood))
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, (0.3 * scale) + yOff, -1.5);
    return mesh;
  }

  function hideHint() {
    const hint = document.getElementById('ar-hint');
    if (hint) setTimeout(() => { hint.style.opacity = '0'; }, 1800);
  }

  function placeModel(x, y, z) {
    if (_model) {
      const yOff = typeof _character.arYOffset === 'number' ? _character.arYOffset : 0;
      _model.position.set(x, y + yOff, z);
      _placedAt = { x, y, z };
    }
  }

  // ─── WebXR path ───────────────────────────────────────────────────────────

  async function startWebXR(character) {
    const THREE = window.THREE;
    const nav   = navigator;
    const xr    = nav.xr;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9998;';
    _container.appendChild(canvas);

    const { renderer } = initThree(canvas, window.innerWidth, window.innerHeight);

    // Reticle (ring shown before placement)
    const rGeo = new THREE.RingGeometry(0.08, 0.1, 32);
    rGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    _reticle = new THREE.Mesh(rGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    _reticle.matrixAutoUpdate = false;
    _reticle.visible = false;
    _scene.add(_reticle);

    _xrSession = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay'],
      domOverlay: { root: _overlay },
    });

    renderer.xr.setReferenceSpaceType('local');
    await renderer.xr.setSession(_xrSession);

    const refSpace = await _xrSession.requestReferenceSpace('local');
    const viewerSpace = await _xrSession.requestReferenceSpace('viewer');
    _hitTestSrc = await _xrSession.requestHitTestSource({ space: viewerSpace });

    // Tap to place
    _xrSession.addEventListener('select', () => {
      if (_reticle.visible) {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        _reticle.matrix.decompose(pos, quat, scale);
        if (!_placedAt) loadModel(character);
        placeModel(pos.x, pos.y, pos.z);
      }
    });

    renderer.setAnimationLoop((timestamp, frame) => {
      if (frame) {
        const results = frame.getHitTestResults(_hitTestSrc);
        if (results.length) {
          const hit = results[0];
          const pose = hit.getPose(refSpace);
          _reticle.visible = true;
          _reticle.matrix.fromArray(pose.transform.matrix);
        } else {
          _reticle.visible = false;
        }
      }
      if (_mixer) _mixer.update(_clock.getDelta());
      renderer.render(_scene, _camera);
    });

    _xrSession.addEventListener('end', () => close(false));
  }

  // ─── Simulated AR path (fallback) ─────────────────────────────────────────

  async function startSimAR(character) {
    const THREE = window.THREE;
    _simMode = true;

    // Camera feed (or solid background if permission denied)
    _videoEl = document.createElement('video');
    _videoEl.setAttribute('autoplay', '');
    _videoEl.setAttribute('playsinline', '');
    _videoEl.setAttribute('muted', '');
    _videoEl.style.cssText = [
      'position:fixed', 'inset:0', 'width:100%', 'height:100%',
      'object-fit:cover', 'z-index:9997'
    ].join(';');

    try {
      _videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      _videoEl.srcObject = _videoStream;
    } catch (e) {
      console.warn('AR sim: camera unavailable, using dark background');
      _videoEl.style.background = '#111';
    }
    _container.appendChild(_videoEl);

    // Transparent Three.js canvas on top of video
    const canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed', 'inset:0', 'width:100%', 'height:100%',
      'z-index:9998', 'pointer-events:none'
    ].join(';');
    _container.appendChild(canvas);

    const { renderer, camera } = initThree(canvas, window.innerWidth, window.innerHeight);

    // Invisible ground plane for raycasting
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    groundGeo.rotateX(-Math.PI / 2);
    const groundMesh = new THREE.Mesh(groundGeo,
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    groundMesh.position.y = -0.8;
    _scene.add(groundMesh);

    // Reticle ring on the ground
    const rGeo = new THREE.RingGeometry(0.08, 0.1, 32);
    rGeo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    _reticle = new THREE.Mesh(rGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    _reticle.position.set(0, -0.8, -1.5);
    _scene.add(_reticle);

    camera.position.set(0, 1.6, 0);

    // Auto-place model after a short delay in sim mode
    setTimeout(() => {
      loadModel(character);
      placeModel(0, -0.8, -1.5);
      _reticle.visible = false;
    }, 600);

    // Tap canvas parent to reposition
    _overlay.addEventListener('pointerdown', (e) => {
      // Only reposition if tapping the camera/canvas area (not buttons)
      if (e.target.closest('button') || e.target.closest('#ar-dialogue') || e.target.closest('#ar-items-panel')) return;
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(groundMesh);
      if (hits.length) {
        const p = hits[0].point;
        if (!_model) loadModel(character);
        else placeModel(p.x, p.y, p.z);
      }
    });

    const loop = () => {
      _rafId = requestAnimationFrame(loop);
      if (_mixer) _mixer.update(_clock.getDelta());
      renderer.render(_scene, camera);
    };
    loop();
  }

  // ─── Wire up overlay UI ───────────────────────────────────────────────────

  function wireOverlayUI(character) {
    const exitBtn     = document.getElementById('ar-exit');
    const talkBtn     = document.getElementById('ar-talk');
    const itemsBtn    = document.getElementById('ar-items');
    const dlgPanel    = document.getElementById('ar-dialogue');
    const itemsPanel  = document.getElementById('ar-items-panel');

    exitBtn.addEventListener('click', () => close(true));

    talkBtn.addEventListener('click', () => {
      const showing = dlgPanel.style.display !== 'none';
      dlgPanel.innerHTML   = buildDialogueHTML(character);
      dlgPanel.style.display  = showing ? 'none' : 'block';
      itemsPanel.style.display = 'none';
    });

    itemsBtn.addEventListener('click', () => {
      const showing = itemsPanel.style.display !== 'none';
      itemsPanel.innerHTML  = buildItemsHTML(character);
      itemsPanel.style.display = showing ? 'none' : 'block';
      dlgPanel.style.display   = 'none';
    });
  }

  // ─── Open / Close ─────────────────────────────────────────────────────────

  async function open(character) {
    if (!window.THREE) {
      alert('Three.js is not loaded — cannot open AR view.');
      return;
    }

    _character = character;

    // Build mount container
    _container = document.createElement('div');
    _container.id = 'ar-root';
    _container.style.cssText = 'position:fixed;inset:0;z-index:9997;';
    document.body.appendChild(_container);

    // Build overlay (sits above video + canvas)
    _overlay = document.createElement('div');
    _overlay.id = 'ar-overlay-root';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;';
    _overlay.innerHTML = buildOverlayHTML(character);
    document.body.appendChild(_overlay);

    wireOverlayUI(character);

    // Attempt WebXR hit-test; fall back to simulated AR
    const supportsWebXR = navigator.xr &&
      await navigator.xr.isSessionSupported('immersive-ar').catch(() => false);

    if (supportsWebXR) {
      try {
        await startWebXR(character);
      } catch (e) {
        console.warn('WebXR failed, falling back to simulated AR:', e);
        await startSimAR(character);
      }
    } else {
      await startSimAR(character);
    }
  }

  function close(returnToCard) {
    // Cancel animation loop
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }

    // End WebXR session
    if (_xrSession) {
      _xrSession.end().catch(() => {});
      _xrSession = null;
    }

    // Stop camera stream
    if (_videoStream) {
      _videoStream.getTracks().forEach(t => t.stop());
      _videoStream = null;
    }

    // Dispose Three.js
    if (_renderer) { _renderer.dispose(); _renderer = null; }
    if (_mixer)    { _mixer.stopAllAction(); _mixer = null; }
    _scene = _camera = _model = _reticle = _clock = null;
    _placedAt = null;
    _simMode  = false;

    // Remove DOM nodes
    if (_container)  { _container.remove();  _container = null; }
    if (_overlay)    { _overlay.remove();     _overlay   = null; }
    if (_videoEl)    { _videoEl.remove();     _videoEl   = null; }

    // Optionally re-open the character card
    if (returnToCard && _character && typeof window.openCharacterCard === 'function') {
      window.openCharacterCard(_character);
    }
    _character = null;
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  window.ARView = { open, close };

})();
