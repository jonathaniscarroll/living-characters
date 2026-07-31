/* ============================================================
   scripts/ar.js  —  Living Characters AR module
   WebXR markerless AR (iOS 18+ Safari / Chrome Android)
   AR Quick Look fallback (iOS < 18 / no WebXR)
   ============================================================ */

(function () {
  'use strict';

  const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  function ensureOverlay() {
    let ov = document.getElementById('ar-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'ar-overlay';
      Object.assign(ov.style, {
        position: 'fixed', inset: '0', zIndex: '3000',
        background: 'transparent', pointerEvents: 'none',
        display: 'none', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'flex-end',
        paddingBottom: '48px', gap: '12px',
      });
      document.body.appendChild(ov);
    }
    return ov;
  }

  function ensureCanvas() {
    let cv = document.getElementById('ar-canvas');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'ar-canvas';
      Object.assign(cv.style, {
        position: 'fixed', inset: '0', zIndex: '2999',
        width: '100%', height: '100%', display: 'none',
        touchAction: 'none',
      });
      document.body.appendChild(cv);
    }
    return cv;
  }

  function showToastAR(msg) {
    if (typeof showToast === 'function') { showToast(msg, 'info'); return; }
    alert(msg);
  }

  function syncCanvasSize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w   = Math.round(window.innerWidth  * dpr);
    const h   = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  // ── iOS Quick Look ────────────────────────────────────────────────────────────
  //
  // iOS Safari requires that the AR Quick Look anchor be tapped directly by the
  // user — programmatic .click() is silently swallowed for rel="ar" links.
  //
  // Strategy:
  //   1. Build a full-screen tap-to-open overlay that sits on top of everything.
  //   2. The overlay contains the real <a rel="ar"> with a pixel-perfect
  //      child <img> filling it. iOS triggers Quick Look when the *child img*
  //      is tapped inside a rel="ar" anchor.
  //   3. We style it to look like a native "View in AR" prompt so the user
  //      taps it naturally.
  //   4. The overlay auto-dismisses after the tap (Quick Look takes over).
  //
  let _qlOverlay = null;

  function _removeQlOverlay() {
    if (_qlOverlay) { _qlOverlay.remove(); _qlOverlay = null; }
  }

  function launchQuickLook(character) {
    const candidate = character.usdzUrl || character.glbUrl;
    const href = (candidate && candidate.startsWith('https://')) ? candidate : null;

    if (!href) {
      showToastAR(
        'AR preview needs a saved model. Open Edit, wait for \u201c\u2713 Model saved to repo!\u201d, then save the character.'
      );
      return;
    }

    _removeQlOverlay();

    // Build the overlay
    const overlay = document.createElement('div');
    overlay.id = 'ar-ql-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '9999',
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: '18px', fontFamily: 'inherit',
    });

    // Title
    const title = document.createElement('div');
    title.style.cssText = 'color:#fff;font-size:18px;font-weight:700;text-align:center;padding:0 24px;';
    title.textContent = 'Tap below to view ' + character.name + ' in AR';

    // The real Quick Look anchor — iOS needs a child <img> inside it
    // The anchor href is the model URL; the rel="ar" attribute is the trigger.
    const anchor = document.createElement('a');
    anchor.rel  = 'ar';
    anchor.href = href;
    Object.assign(anchor.style, {
      display: 'block', width: '200px', height: '200px',
      borderRadius: '20px', overflow: 'hidden',
      border: '3px solid #4f98a3',
      background: '#111',
    });

    // The child img — Quick Look fires off the img tap, not the anchor tap
    // Use a 1x1 transparent gif; the anchor background is the visual
    const img = document.createElement('img');
    img.src    = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    img.width  = 200;
    img.height = 200;
    img.alt    = 'View in AR';
    Object.assign(img.style, { width: '100%', height: '100%', objectFit: 'cover', display: 'block' });

    // Show character photo inside the box if available
    if (character.photoData || character.animData) {
      img.src    = character.animData || character.photoData;
      img.style.objectFit = 'contain';
    }

    anchor.appendChild(img);

    // Label beneath the box
    const label = document.createElement('div');
    label.style.cssText = 'color:#4f98a3;font-size:13px;font-weight:600;text-align:center;';
    label.textContent = '\uD83D\uDCF7  View in AR';

    // Cancel button
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    cancel.style.cssText = 'margin-top:12px;padding:10px 32px;border-radius:24px;background:transparent;color:#aaa;border:1px solid #555;font-size:14px;cursor:pointer;';
    cancel.addEventListener('click', _removeQlOverlay);

    // Dismiss overlay once Quick Look takes over (pageshow fires when
    // user returns from Quick Look; visibilitychange fires immediately)
    const _dismiss = () => { setTimeout(_removeQlOverlay, 400); };
    document.addEventListener('visibilitychange', _dismiss, { once: true });

    overlay.appendChild(title);
    overlay.appendChild(anchor);
    overlay.appendChild(label);
    overlay.appendChild(cancel);
    document.body.appendChild(overlay);
    _qlOverlay = overlay;
  }

  // ── Resolve GLB source → usable URL for Three.js GLTFLoader ─────────────────
  async function resolveGlbUrl(character) {
    const src = character.glbData || character.glbUrl;
    if (!src) return window.DEFAULT_GLB_URL || 'https://threejs.org/examples/models/gltf/Soldier.glb';
    if (src.startsWith('data:')) {
      const res  = await fetch(src);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
    return src;
  }

  function moodEmoji(character) {
    const MOODS = window.MOODS || [];
    const m = MOODS.find(x => x.label === character.mood);
    return m ? m.emoji : '\u2728';
  }

  // ── WebXR markerless AR ───────────────────────────────────────────────────────
  async function launchWebXR(character) {
    const THREE      = window.THREE;
    const GLTFLoader = window.GLTFLoader;
    if (!THREE || !GLTFLoader) { showToastAR('3D engine not ready. Please wait a moment and try again.'); return; }

    const overlay = ensureOverlay();
    const canvas  = ensureCanvas();
    syncCanvasSize(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: !IS_IOS, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_IOS ? 2 : 3));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.xr.enabled = true;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

    const reticleGeo = new THREE.RingGeometry(0.08, 0.12, 32);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
    const reticle    = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.rotation.x = -Math.PI / 2;
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    overlay.innerHTML = '';
    const nameTag = document.createElement('div');
    nameTag.style.cssText = 'background:rgba(10,15,30,.82);color:#eaeaea;font-family:inherit;font-size:15px;font-weight:700;padding:7px 18px;border-radius:20px;pointer-events:none;';
    nameTag.textContent = `${moodEmoji(character)}  ${character.name}`;

    const exitBtn = document.createElement('button');
    exitBtn.textContent = '\u2715 Exit AR';
    exitBtn.style.cssText = 'pointer-events:all;padding:10px 28px;border-radius:24px;background:#e94560;color:#fff;border:none;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;';

    const hint = document.createElement('div');
    hint.style.cssText = 'background:rgba(10,15,30,.72);color:#a0a0b0;font-size:11px;padding:5px 14px;border-radius:10px;pointer-events:none;';
    hint.textContent = 'Point at a flat surface, then tap to place';

    overlay.appendChild(nameTag);
    overlay.appendChild(hint);
    overlay.appendChild(exitBtn);
    overlay.style.display       = 'flex';
    overlay.style.pointerEvents = 'none';
    exitBtn.style.pointerEvents = 'all';

    const sessionInit = {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: overlay },
    };

    let session;
    try {
      session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    } catch (err) {
      console.error('[AR] session request failed:', err);
      cleanUp();
      if (err && (err.name === 'NotSupportedError' || err.name === 'SecurityError')) {
        launchQuickLook(character); return;
      }
      showToastAR('Could not start AR. Grant camera access and use HTTPS.');
      return;
    }

    try {
      await renderer.xr.setSession(session, { framebufferScaleFactor: 1.0 });
    } catch (_) { renderer.xr.setSession(session); }

    canvas.style.display = 'block';

    let hitTestSource = null, hitTestSourceRequested = false;
    let characterPlaced = false, charModel = null, mixer = null;
    const clock = new THREE.Clock();
    let blobUrlToRevoke = null;

    let glbUrl;
    try {
      glbUrl = await resolveGlbUrl(character);
    } catch (err) {
      console.error('[AR] could not resolve GLB URL:', err);
      showToastAR('Could not load 3D model \u2014 try re-uploading the .glb file.');
      cleanUp(); try { session.end(); } catch (_) {}
      return;
    }
    if (glbUrl && glbUrl.startsWith('blob:')) blobUrlToRevoke = glbUrl;

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      charModel = gltf.scene;
      const box = new THREE.Box3().setFromObject(charModel);
      const height = box.max.y - box.min.y;
      if (height > 0) charModel.scale.setScalar(1.5 / height);
      charModel.visible = false;
      scene.add(charModel);
      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(charModel);
        mixer.clipAction(gltf.animations[0]).play();
      }
    }, undefined, (err) => {
      console.error('[AR] GLB load error:', err);
      showToastAR('Could not load 3D model for AR.');
    });

    function cleanUp() {
      renderer.setAnimationLoop(null);
      try { renderer.dispose(); } catch (_) {}
      canvas.style.display  = 'none';
      overlay.style.display = 'none';
      overlay.innerHTML     = '';
      hitTestSource         = null;
      if (blobUrlToRevoke) { URL.revokeObjectURL(blobUrlToRevoke); blobUrlToRevoke = null; }
    }

    exitBtn.addEventListener('click', () => { try { session.end(); } catch (_) {} });
    session.addEventListener('end', cleanUp);

    session.addEventListener('select', () => {
      if (!reticle.visible || !charModel) return;
      if (!characterPlaced) {
        characterPlaced = true;
        charModel.position.setFromMatrixPosition(reticle.matrix);
        charModel.visible = true;
        hint.textContent = `${character.name} placed! Use \u2715 to exit.`;
      }
    });

    renderer.setAnimationLoop((timestamp, frame) => {
      const delta = clock.getDelta();
      if (mixer) mixer.update(delta);
      if (frame) {
        const refSpace  = renderer.xr.getReferenceSpace();
        const xrSession = renderer.xr.getSession();
        if (!hitTestSourceRequested) {
          hitTestSourceRequested = true;
          xrSession.requestReferenceSpace('viewer').then(viewerSpace => {
            xrSession.requestHitTestSource({ space: viewerSpace }).then(src => { hitTestSource = src; })
              .catch(e => { console.warn('[AR] hit-test source error:', e); });
          }).catch(e => { console.warn('[AR] viewer ref space error:', e); });
        }
        if (hitTestSource && !characterPlaced) {
          const results = frame.getHitTestResults(hitTestSource);
          if (results.length) {
            const pose = results[0].getPose(refSpace);
            if (pose) { reticle.visible = true; reticle.matrix.fromArray(pose.transform.matrix); }
          } else { reticle.visible = false; }
        } else if (characterPlaced) { reticle.visible = false; }
        if (charModel && charModel.visible) {
          const camPos = new THREE.Vector3();
          camera.getWorldPosition(camPos);
          charModel.lookAt(camPos.x, charModel.position.y, camPos.z);
        }
      }
      renderer.render(scene, camera);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  async function launchAR(character) {
    if (!character) { showToastAR('No character selected.'); return; }
    if (typeof character === 'string') {
      const resolved = (window.characters || []).find(c => c.id === character);
      if (!resolved) { showToastAR('Character not found.'); return; }
      character = resolved;
    }
    if (!character.glbData && !character.glbUrl) {
      showToastAR('No 3D model attached. Open Edit and upload a .glb file.');
      return;
    }
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      showToastAR('AR requires a secure connection (HTTPS).');
      return;
    }

    const xr = navigator.xr;
    if (!xr) { launchQuickLook(character); return; }

    let supported = false;
    try { supported = await xr.isSessionSupported('immersive-ar'); } catch (_) {}

    if (supported) {
      await launchWebXR(character);
    } else {
      launchQuickLook(character);
    }
  }

  window.lcAR    = { launchAR };
  window.launchAR = launchAR;

})();
