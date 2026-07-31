/* ============================================================
   scripts/ar.js  —  Living Characters pseudo-AR
   ────────────────────────────────────────────────────────────
   No WebXR. No Quick Look. Works on every modern iPhone/Android.

   How it works:
   1. getUserMedia (rear camera) → <video> fills the screen
   2. Three.js <canvas> sits on top with alpha:true so the video
      shows through
   3. DeviceOrientation drives a gentle parallax/drift so the
      sprite feels "anchored" in the room
   4. Tap the sprite → opens the same card + talk panel used in
      room mode (openCard / openTalkPanel from card.js)
   5. Exit button dismisses everything and stops the camera
   ============================================================ */

(function () {
  'use strict';

  // ── state ──────────────────────────────────────────────────────────────────
  let _active      = false;
  let _stream      = null;
  let _animId      = null;
  let _character   = null;
  let _orientBeta  = 0;   // device tilt front/back  (-180…180)
  let _orientGamma = 0;   // device tilt left/right  (-90…90)
  let _orientAlpha = 0;   // compass heading          (0…360)
  let _baseAlpha   = null;
  let _baseGamma   = null;
  let _baseBeta    = null;
  let _mixer       = null;  // kept for potential future use
  let _clock       = null;
  let _renderer    = null;
  let _scene       = null;
  let _camera      = null;
  let _model       = null;
  let _haloMesh    = null;
  let _raycaster   = null;
  let _mouse       = new (window.THREE ? window.THREE.Vector2 : function(){this.x=0;this.y=0;})();

  // ── sprite billboard state ─────────────────────────────────────────────────
  let _animator    = null;
  let _texture     = null;

  // ── helpers ────────────────────────────────────────────────────────────────
  function toast(msg) {
    if (typeof showToast === 'function') showToast(msg);
    else console.warn('[AR]', msg);
  }

  function getEl(id) { return document.getElementById(id); }

  // ── orientation listener ───────────────────────────────────────────────────
  function _onOrient(e) {
    _orientAlpha = e.alpha || 0;
    _orientBeta  = e.beta  || 0;
    _orientGamma = e.gamma || 0;
    if (_baseAlpha === null) {
      _baseAlpha = _orientAlpha;
      _baseBeta  = _orientBeta;
      _baseGamma = _orientGamma;
    }
  }

  // ── build / tear down DOM ─────────────────────────────────────────────────
  function _buildDOM() {
    let vid = getEl('ar-video');
    if (!vid) {
      vid = document.createElement('video');
      vid.id = 'ar-video';
      vid.setAttribute('playsinline', '');
      vid.setAttribute('autoplay', '');
      vid.setAttribute('muted', '');
      Object.assign(vid.style, {
        position: 'fixed', inset: '0', width: '100%', height: '100%',
        objectFit: 'cover', zIndex: '2000', display: 'none',
        background: '#000',
      });
      document.body.appendChild(vid);
    }

    let cv = getEl('ar-canvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'ar-canvas';
      Object.assign(cv.style, {
        position: 'fixed', inset: '0', width: '100%', height: '100%',
        zIndex: '2001', display: 'none', touchAction: 'none',
        pointerEvents: 'all',
      });
      document.body.appendChild(cv);
    }

    let hud = getEl('ar-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'ar-hud';
      Object.assign(hud.style, {
        position: 'fixed', inset: '0', zIndex: '2002',
        display: 'none', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: '36px', gap: '10px',
        pointerEvents: 'none',
      });
      document.body.appendChild(hud);
    }
    return { vid, cv, hud };
  }

  function _showDOM() {
    const { vid, cv, hud } = _buildDOM();
    vid.style.display = 'block';
    cv.style.display  = 'block';
    hud.style.display = 'flex';
  }

  function _hideDOM() {
    ['ar-video','ar-canvas','ar-hud'].forEach(id => {
      const el = getEl(id);
      if (el) el.style.display = 'none';
    });
  }

  // ── HUD build ─────────────────────────────────────────────────────────────
  function _buildHUD(ch) {
    const hud = getEl('ar-hud');
    hud.innerHTML = '';

    const mood = (window.MOODS || []).find(m => m.label === ch.mood);
    const moodEmoji = mood ? mood.emoji : '\u2728';

    const hint = document.createElement('div');
    hint.id = 'ar-hint';
    hint.style.cssText = [
      'background:rgba(10,15,30,.78)',
      'color:#eaeaea',
      'font-family:inherit',
      'font-size:13px',
      'padding:6px 16px',
      'border-radius:20px',
      'pointer-events:none',
    ].join(';');
    hint.textContent = `Tap ${ch.name} to talk`;

    const badge = document.createElement('div');
    badge.style.cssText = [
      'background:rgba(10,15,30,.82)',
      'color:#eaeaea',
      'font-family:inherit',
      'font-size:15px',
      'font-weight:700',
      'padding:7px 18px',
      'border-radius:20px',
      'pointer-events:none',
    ].join(';');
    badge.textContent = `${moodEmoji}  ${ch.name}`;

    const exitBtn = document.createElement('button');
    exitBtn.textContent = '\u2715 Exit AR';
    exitBtn.style.cssText = [
      'pointer-events:all',
      'padding:10px 28px',
      'border-radius:24px',
      'background:#e94560',
      'color:#fff',
      'border:none',
      'font-size:14px',
      'font-weight:700',
      'font-family:inherit',
      'cursor:pointer',
    ].join(';');
    exitBtn.addEventListener('click', close);

    hud.appendChild(hint);
    hud.appendChild(badge);
    hud.appendChild(exitBtn);
  }

  // ── Three.js setup ────────────────────────────────────────────────────────
  function _initThree(canvas) {
    const THREE = window.THREE;
    const w = window.innerWidth;
    const h = window.innerHeight;

    _renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    _renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    _renderer.setSize(w, h, false);
    _renderer.setClearColor(0x000000, 0);

    _scene  = new THREE.Scene();
    _camera = new THREE.PerspectiveCamera(60, w / h, 0.01, 100);
    _camera.position.set(0, 1.2, 3);
    _camera.lookAt(0, 0.8, 0);

    // Lighting (still useful if future mesh materials need it)
    _scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.4));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1.5, 3, 2);
    _scene.add(dir);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.3);
    fill.position.set(-2, 1, -1);
    _scene.add(fill);

    // Halo ring on the ground
    const haloGeo = new THREE.RingGeometry(0.28, 0.38, 48);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x4f98a3, side: THREE.DoubleSide,
      transparent: true, opacity: 0.55,
    });
    _haloMesh = new THREE.Mesh(haloGeo, haloMat);
    _haloMesh.rotation.x = -Math.PI / 2;
    _haloMesh.position.set(0, 0.01, 0);
    _scene.add(_haloMesh);

    _clock     = new THREE.Clock();
    _raycaster = new THREE.Raycaster();
  }

  // ── Sprite billboard ─────────────────────────────────────────────────────
  function _buildSpriteBillboard(ch) {
    const THREE = window.THREE;

    // Determine fallback image (animData or photoData)
    const fallbackSrc = ch.animData || ch.photoData || null;

    // Check if SpriteAnimator is available
    const hasAnimator = window.SpriteAnimator && (ch.sprites || fallbackSrc);

    if (!hasAnimator && !fallbackSrc) {
      // Colour-block fallback — no image at all
      const geo = new THREE.PlaneGeometry(1.0, 1.6);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4f98a3, side: THREE.DoubleSide });
      _model = new THREE.Mesh(geo, mat);
      _model.position.set(0, 0.8, 0);
      _scene.add(_model);

      // CSS name label so the user knows who this is
      const label = document.createElement('div');
      label.id = 'ar-sprite-label';
      label.textContent = ch.name || '?';
      label.style.cssText = [
        'position:fixed',
        'top:50%',
        'left:50%',
        'transform:translate(-50%,-50%)',
        'color:#fff',
        'font-size:18px',
        'font-weight:700',
        'font-family:inherit',
        'pointer-events:none',
        'z-index:2005',
        'text-shadow:0 1px 4px rgba(0,0,0,.8)',
      ].join(';');
      document.body.appendChild(label);
      return;
    }

    // Build SpriteAnimator
    _animator = new window.SpriteAnimator(ch.sprites || null, fallbackSrc);

    // Create a THREE.Texture backed by an Image element we control
    _texture = new THREE.Texture();
    _texture.image = new Image();
    _texture.image.onload = () => { _texture.needsUpdate = true; };
    const firstFrame = _animator.currentFrame();
    if (firstFrame) _texture.image.src = firstFrame;

    const geo = new THREE.PlaneGeometry(1.0, 1.6);
    const mat = new THREE.MeshBasicMaterial({
      map: _texture,
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
    });
    _model = new THREE.Mesh(geo, mat);
    _model.position.set(0, 0.8, 0);
    _scene.add(_model);
  }

  // ── Sprite tick ───────────────────────────────────────────────────────────
  function _tickSprite(deltaMs) {
    if (!_animator || !_model) return;
    const frame = _animator.tick(deltaMs);
    if (frame !== null && _texture) {
      _texture.image.src = frame;
      // needsUpdate is set via the onload handler on the image
    }
    // Billboard always faces camera
    _model.lookAt(_camera.position);
  }

  // ── Hit-test: did the user tap the model? ─────────────────────────────────
  function _hitModel(clientX, clientY) {
    if (!_model || !_camera || !_raycaster) return false;
    const THREE = window.THREE;
    _mouse.x =  (clientX / window.innerWidth)  * 2 - 1;
    _mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    _raycaster.setFromCamera(_mouse, _camera);
    const hits = _raycaster.intersectObject(_model, true);
    return hits.length > 0;
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  function _tick() {
    _animId = requestAnimationFrame(_tick);
    const delta = _clock ? _clock.getDelta() : 0.016;
    if (_mixer) _mixer.update(delta);

    // Sprite animation + billboard facing
    _tickSprite(delta * 1000);

    // Gyro parallax
    if (_baseAlpha !== null && _model) {
      let dg = _orientGamma - _baseGamma;
      let db = _orientBeta  - _baseBeta;
      dg = Math.max(-30, Math.min(30, dg));
      db = Math.max(-30, Math.min(30, db));
      const targetX = (dg / 30) * -1.2;
      const targetZ = (db / 30) *  0.6;
      _model.position.x += (targetX - _model.position.x) * 0.06;
      _model.position.z += (targetZ - _model.position.z) * 0.06;
      if (_haloMesh) {
        _haloMesh.position.x = _model.position.x;
        _haloMesh.position.z = _model.position.z;
      }
      // Gentle Y bob
      _model.position.y += (Math.sin(Date.now() * 0.001) * 0.004);
    }

    // Halo pulse
    if (_haloMesh) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.002);
      _haloMesh.material.opacity = 0.25 + pulse * 0.35;
    }

    if (_renderer && _scene && _camera) _renderer.render(_scene, _camera);
  }

  // ── Open ──────────────────────────────────────────────────────────────────
  async function open(character) {
    if (_active) close();
    if (!character) { toast('No character selected'); return; }
    _character = character;

    if (!window.THREE) { toast('3D engine not ready — please wait a moment'); return; }

    _showDOM();
    const { vid, cv } = _buildDOM();

    // Request camera
    try {
      _stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      vid.srcObject = _stream;
      await vid.play().catch(() => {});
    } catch (err) {
      console.warn('[AR] camera denied:', err);
      vid.style.background = '#0a0f1e';
    }

    _buildHUD(character);
    _initThree(cv);

    // Orientation
    _baseAlpha = _baseBeta = _baseGamma = null;
    window.addEventListener('deviceorientation', _onOrient, true);
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(s => {
        if (s === 'granted') window.addEventListener('deviceorientation', _onOrient, true);
      }).catch(() => {});
    }

    cv.addEventListener('pointerup', _onCanvasTap);

    _active = true;
    _buildSpriteBillboard(character);
    _tick();
  }

  // ── Canvas tap ────────────────────────────────────────────────────────────
  function _onCanvasTap(e) {
    if (!_character) return;
    const hit = _hitModel(e.clientX, e.clientY);
    if (!hit) return;

    const hint = getEl('ar-hint');
    if (hint) hint.style.opacity = '0';

    // Switch to talk animation state
    if (_animator) _animator.setState('talk');

    if (typeof openCard === 'function') {
      openCard(_character.id);
      return;
    }
    if (typeof openTalkPanel === 'function') {
      openTalkPanel(_character);
    }
  }

  // ── Set character animation state (called by card.js on open/close) ───────
  function setCharacterState(state) {
    if (_animator) _animator.setState(state);
  }

  // ── Close ─────────────────────────────────────────────────────────────────
  function close() {
    _active = false;

    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    window.removeEventListener('deviceorientation', _onOrient, true);

    // Dispose Three.js
    try { if (_renderer) _renderer.dispose(); } catch (_) {}
    _renderer = _scene = _camera = _model = _haloMesh = _mixer = _clock = _raycaster = null;

    // Dispose sprite resources
    if (_texture) { try { _texture.dispose(); } catch (_) {} _texture = null; }
    _animator = null;

    // Remove CSS label if it was created
    const label = getEl('ar-sprite-label');
    if (label) label.remove();

    _hideDOM();

    if (typeof closeCard === 'function') closeCard();

    _baseAlpha = _baseBeta = _baseGamma = null;
    _character = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  window.ARView = { open, close, setCharacterState };
  window.lcAR  = { open, close, launchAR: open, setCharacterState };
  window.launchAR = open;

})();
