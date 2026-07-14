/**
 * fbx-to-glb.js
 * -------------
 * Browser-side FBX → GLB conversion with embedded-texture support.
 *
 * Strategy: give FBXLoader a custom LoadingManager so we can tell when
 * every embedded texture blob has fully decoded. We resolve only after
 * BOTH the FBX parse callback fires AND the manager signals all items done.
 */

import * as THREE from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function isFbxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.fbx');
}

// ---------------------------------------------------------------------------
// Convert a Three.js texture image to a canvas so GLTFExporter can call
// canvas.toDataURL(). Handles ImageBitmap, HTMLImageElement, DataTexture, etc.
// ---------------------------------------------------------------------------
function textureToCanvas(texture) {
  try {
    const src = texture.image;
    if (!src) return null;

    // DataTexture raw buffer
    if (ArrayBuffer.isView(src) || src instanceof ArrayBuffer) {
      const w = texture.image.width  || Math.sqrt((src.byteLength || src.length) / 4) | 0;
      const h = texture.image.height || w;
      if (!w || !h) return null;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const id = ctx.createImageData(w, h);
      id.data.set(new Uint8ClampedArray(src.buffer || src));
      ctx.putImageData(id, 0, 0);
      return canvas;
    }

    const w = src.width  || src.naturalWidth  || src.videoWidth  || 0;
    const h = src.height || src.naturalHeight || src.videoHeight || 0;
    if (!w || !h) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (src instanceof ImageData) ctx.putImageData(src, 0, 0);
    else ctx.drawImage(src, 0, 0);
    return canvas;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Bake all texture slots to canvases and promote materials to Standard.
// ---------------------------------------------------------------------------
function fixTexturesForExport(group) {
  const slots = ['map','normalMap','roughnessMap','metalnessMap',
                 'emissiveMap','aoMap','alphaMap','lightMap'];

  group.traverse(child => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    child.material = mats.map(mat => {
      if (!mat) return new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

      slots.forEach(slot => {
        const tex = mat[slot];
        if (!tex) return;
        const canvas = textureToCanvas(tex);
        if (canvas) { tex.image = canvas; tex.needsUpdate = true; }
        else mat[slot] = null;
      });

      // Promote non-exporter-friendly material types
      if (
        !(mat instanceof THREE.MeshStandardMaterial) &&
        !(mat instanceof THREE.MeshBasicMaterial) &&
        !(mat instanceof THREE.MeshLambertMaterial)
      ) {
        return new THREE.MeshStandardMaterial({
          color:       mat.color       || new THREE.Color(0xcccccc),
          map:         mat.map         || null,
          normalMap:   mat.normalMap   || null,
          emissive:    mat.emissive    || new THREE.Color(0x000000),
          emissiveMap: mat.emissiveMap || null,
          side:        THREE.DoubleSide,
          transparent: mat.transparent || false,
          opacity:     mat.opacity     !== undefined ? mat.opacity : 1,
        });
      }
      return mat;
    });
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function convertFbxFileToGlbDataUrl(file, opts = {}) {
  const { animations = true, onProgress } = opts;
  if (onProgress) onProgress(0.05);

  const objectUrl = URL.createObjectURL(file);

  let group;
  try {
    group = await new Promise((resolve, reject) => {
      let parsedGroup = null;
      let managerDone = false;
      let parseDone   = false;

      function tryResolve() {
        // Only resolve once BOTH the FBX parse callback AND the manager
        // onLoad have fired. This ensures all embedded texture blobs are
        // decoded before we export — but also handles the case where the
        // manager fires synchronously (no textures) before parsedGroup is set.
        if (parseDone && managerDone && parsedGroup) resolve(parsedGroup);
      }

      const manager = new THREE.LoadingManager();
      manager.onLoad  = () => { managerDone = true; tryResolve(); };
      manager.onError = url => reject(new Error('Texture load error: ' + url));

      new FBXLoader(manager).load(
        objectUrl,
        obj => {
          parsedGroup = obj;
          parseDone   = true;
          tryResolve();
        },
        xhr => {
          if (onProgress && xhr.total)
            onProgress(0.05 + 0.45 * xhr.loaded / xhr.total);
        },
        err => reject(new Error('FBXLoader: ' + (err?.message || String(err))))
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (onProgress) onProgress(0.55);

  // All textures decoded — safe to bake
  fixTexturesForExport(group);

  if (onProgress) onProgress(0.65);

  // Auto-scale to unit height
  const box  = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) group.scale.setScalar(1 / maxDim);

  if (onProgress) onProgress(0.75);

  const clips = animations ? (group.animations || []) : [];

  const glbArrayBuffer = await new Promise((resolve, reject) => {
    new GLTFExporter().parse(
      group,
      result => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('GLTFExporter returned JSON instead of binary'));
      },
      err => reject(new Error('GLTFExporter: ' + (err?.message || String(err)))),
      { binary: true, animations: clips, includeCustomExtensions: false }
    );
  });

  if (onProgress) onProgress(0.92);

  // ArrayBuffer → base64 data URL (chunked to avoid stack overflow)
  const uint8 = new Uint8Array(glbArrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i += 8192)
    binary += String.fromCharCode(...uint8.subarray(i, i + 8192));

  if (onProgress) onProgress(1);
  return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

window.lcFbx = { convertFbxFileToGlbDataUrl, isFbxFile };
export default { convertFbxFileToGlbDataUrl, isFbxFile };
