/* ============================================================
   scripts/ar.js  —  Living Characters AR module
   WebXR markerless AR (iOS 18+ Safari / Chrome Android)
   AR Quick Look fallback (iOS < 18 / no WebXR)
   ============================================================ */

(function () {
  'use strict';

  // ── UA sniff ────────────────────────────────────────────────
  const IS_IOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // ── DOM helpers ─────────────────────────────────────────────
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
        touchAction: 'none',   // required for iOS Safari WebXR input
      });
      document.body.appendChild(cv);
    }
    return cv;
  }

  function showToastAR(msg) {
    if (typeof showToast === 'function') { showToast(msg, 'info'); return; }
    alert(msg);
  }

  // ── Sync canvas backing-store to device pixels ───────────────
  // iOS Safari WebXR produces a blank viewport if the canvas element's
  // pixel dimensions don't match the actual screen pixel dimensions.
  function syncCanvasSize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w   = Math.round(window.innerWidth  * dpr);
    const h   = Math.round(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width  = w;
      canvas.height = h;
    }
  }

  // ── AR Quick Look fallback ───────────────────────────────────
  // iOS 15+ can preview .glb files via Quick Look — no .usdz needed.
  function launchQuickLook(character) {
    const href = character.usdzUrl || character.glbUrl;
    if (!href) {
      showToastAR('No 3D model available. Attach a .glb or .usdz to this character.');
      return;
    }
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = href;
    // Quick Look requires an <img> child to trigger on iOS
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
    a.appendChild(img);
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 2000);
  }

  // ── Resolve GLB source → Blob URL ───────────────────────────
  async function resolveGlbUrl(character) {
    if (character.glbData) {
      const res  = await fetch(character.glbData);
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
    if (character.glbUrl) return character.glbUrl;
    return window.DEFAULT_GLB_URL || 'https://threejs.org/examples/models/gltf/Soldier.glb';
  }

  // ── Mood emoji lookup ────────────────────────────────────────
  function moodEmoji(character) {
    const MOODS = window.MOODS || [];
    const m = MOODS.find(x => x.label === character.mood);
    return m ? m.emoji : '✨';
  }

  // ── WebXR markerless AR ──────────────────────────────────────
  async function launchWebXR(character) {
    const THREE      = window.THREE;
    const GLTFLoader = window.GLTFLoader;
    if (!THREE || !GLTFLoader) {
      showToastAR('3D engine not ready. Please wait a moment and try again.');
      return;
    }

    const overlay = ensureOverlay();
    const canvas  = ensureCanvas();
    syncCanvasSize(canvas);   // must happen before renderer creation on iOS

    // Build renderer
    // • antialias: false on iOS — triggers GPU command-buffer errors on A-series chips
    // • setSize(..., false) — don't let Three.js override the CSS sizing we already set
    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha:           true,
      antialias:       !IS_IOS,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_IOS ? 2 : 3));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.xr.enabled = true;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(1, 2, 1);
    scene.add(dirLight);

    // Reticle
    const reticleGeo = new THREE.RingGeometry(0.08, 0.12, 32);
    const reticleMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
    const reticle    = new THREE.Mesh(reticleGeo, reticleMat);
    reticle.rotation.x = -Math.PI / 2;
    reticle.matrixAutoUpdate = false;
    reticle.visible = false;
    scene.add(reticle);

    // Build overlay HUD
    overlay.innerHTML = '';
    const nameTag = document.createElement('div');
    nameTag.style.cssText = 'background:rgba(10,15,30,.82);color:#eaeaea;font-family:inherit;font-size:15px;font-weight:700;padding:7px 18px;border-radius:20px;pointer-events:none;';
    nameTag.textContent = `${moodEmoji(character)}  ${character.name}`;

    const exitBtn = document.createElement('button');
    exitBtn.textContent = '✕ Exit AR';
    exitBtn.style.cssText = 'pointer-events:all;padding:10px 28px;border-radius:24px;background:#e94560;color:#fff;border:none;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;';

    const hint = document.createElement('div');
    hint.style.cssText = 'background:rgba(10,15,30,.72);color:#a0a0b0;font-size:11px;padding:5px 14px;border-radius:10px;pointer-events:none;';
    hint.textContent = 'Point at a flat surface, then tap to place';

    overlay.appendChild(nameTag);
    overlay.appendChild(hint);
    overlay.appendChild(exitBtn);
    overlay.style.display      = 'flex';
    overlay.style.pointerEvents = 'none';
    exitBtn.style.pointerEvents = 'all';

    // ── iOS Safari 18 session init notes ────────────────────────
    // • 'dom-overlay' MUST stay in optionalFeatures only.
    //   iOS Safari 18 does not expose it as a satisfiable required
    //   feature — listing it in requiredFeatures causes the session
    //   promise to reject with NotSupportedError before the camera opens.
    // • 'hit-test' is genuinely required and IS supported on iOS 18 Safari.
    // • 'light-estimation' is optional and may not be granted.
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
      // NotSupportedError / SecurityError → device can't satisfy the feature
      // set even though isSessionSupported returned true. Fall back to Quick Look.
      if (err && (err.name === 'NotSupportedError' || err.name === 'SecurityError')) {
        launchQuickLook(character);
        return;
      }
      showToastAR('Could not start AR. Grant camera access and use HTTPS.');
      return;
    }

    // framebufferScaleFactor=1 prevents a blank-viewport bug on some iOS 18 builds.
    // Older Three.js builds ignore the second argument — catch and fall through.
    try {
      await renderer.xr.setSession(session, { framebufferScaleFactor: 1.0 });
    } catch (_) {
      renderer.xr.setSession(session);
    }

    canvas.style.display = 'block';

    let hitTestSource          = null;
    let hitTestSourceRequested = false;
    let characterPlaced        = false;
    let charModel              = null;
    let mixer                  = null;
    const clock                = new THREE.Clock();
    let blobUrlToRevoke        = null;

    // Load the GLB
    const glbUrl = await resolveGlbUrl(character);
    if (glbUrl.startsWith('blob:')) blobUrlToRevoke = glbUrl;
    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
      charModel = gltf.scene;
      const box    = new THREE.Box3().setFromObject(charModel);
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

    // Exit / clean-up
    function cleanUp() {
      renderer.setAnimationLoop(null);
      try { renderer.dispose(); } catch (_) {}
      canvas.style.display   = 'none';
      overlay.style.display  = 'none';
      overlay.innerHTML      = '';
      hitTestSource          = null;
      if (blobUrlToRevoke) { URL.revokeObjectURL(blobUrlToRevoke); blobUrlToRevoke = null; }
    }

    exitBtn.addEventListener('click', () => { try { session.end(); } catch (_) {} });
    session.addEventListener('end', cleanUp);

    // Tap to place
    session.addEventListener('select', () => {
      if (!reticle.visible || !charModel) return;
      if (!characterPlaced) {
        characterPlaced = true;
        charModel.position.setFromMatrixPosition(reticle.matrix);
        charModel.visible = true;
        hint.textContent = `${character.name} placed! Use ✕ to exit.`;
      }
    });

    // Render loop
    renderer.setAnimationLoop((timestamp, frame) => {
      const delta = clock.getDelta();
      if (mixer) mixer.update(delta);

      if (frame) {
        const refSpace  = renderer.xr.getReferenceSpace();
        const xrSession = renderer.xr.getSession();

        if (!hitTestSourceRequested) {
          hitTestSourceRequested = true;
          xrSession.requestReferenceSpace('viewer').then((viewerSpace) => {
            xrSession.requestHitTestSource({ space: viewerSpace }).then((src) => {
              hitTestSource = src;
            }).catch((e) => { console.warn('[AR] hit-test source error:', e); });
          }).catch((e) => { console.warn('[AR] viewer ref space error:', e); });
        }

        if (hitTestSource && !characterPlaced) {
          const results = frame.getHitTestResults(hitTestSource);
          if (results.length) {
            const hit  = results[0];
            const pose = hit.getPose(refSpace);
            if (pose) {
              reticle.visible = true;
              reticle.matrix.fromArray(pose.transform.matrix);
            }
          } else {
            reticle.visible = false;
          }
        } else if (characterPlaced) {
          reticle.visible = false;
        }

        // Face character toward camera
        if (charModel && charModel.visible) {
          const camPos = new THREE.Vector3();
          camera.getWorldPosition(camPos);
          charModel.lookAt(camPos.x, charModel.position.y, camPos.z);
        }
      }

      renderer.render(scene, camera);
    });
  }

  // ── Public API ───────────────────────────────────────────────
  async function launchAR(character) {
    if (!character) { showToastAR('No character selected.'); return; }

    // WebXR requires HTTPS — Safari enforces this strictly on iOS 18
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      showToastAR('AR requires a secure connection (HTTPS). Open the site over https://.');
      return;
    }

    const xr = navigator.xr;
    if (!xr) { launchQuickLook(character); return; }

    let supported = false;
    try { supported = await xr.isSessionSupported('immersive-ar'); } catch (_) {}

    if (supported) {
      await launchWebXR(character);
    } else {
      // iOS Safari < 18, WebXR flag off, or unsupported device → Quick Look
      launchQuickLook(character);
    }
  }

  window.lcAR    = { launchAR };
  window.launchAR = launchAR;

})();
