/**
 * fbx-to-glb.js
 * -------------
 * Browser-side FBX → GLB conversion.
 *
 * KEY FIX: FBXLoader resolves embedded textures asynchronously through its
 * own internal LoadingManager. We inject our own manager and only run
 * fixTexturesForExport + GLTFExporter inside manager.onLoad — guaranteeing
 * every texture ImageBitmap is fully decoded before the exporter reads it.
 */

import * as THREE from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function isFbxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.fbx');
}

// ---------------------------------------------------------------------------
// Convert any Three.js texture to a plain <canvas> the exporter can read.
// GLTFExporter needs canvas.toDataURL() — it cannot handle ImageBitmap,
// DataTexture raw buffers, or cross-origin images directly.
// ---------------------------------------------------------------------------
function textureToCanvas(texture) {
  try {
    const src = texture.image;
    if (!src) return null;

    // DataTexture: raw typed array with .width/.height on the texture
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

    // ImageBitmap, HTMLImageElement, HTMLCanvasElement, ImageData, VideoElement
    const w = src.width  || src.naturalWidth  || src.videoWidth  || 0;
    const h = src.height || src.naturalHeight || src.videoHeight || 0;
    if (!w || !h) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (src instanceof ImageData) {
      ctx.putImageData(src, 0, 0);
    } else {
      ctx.drawImage(src, 0, 0);
    }
    return canvas;
  } catch (_) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Walk every mesh and replace texture .image with a canvas so GLTFExporter
// can call canvas.toDataURL(). Falls back to grey if a texture can't be read.
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
        if (canvas) {
          tex.image = canvas;
          tex.needsUpdate = true;
        } else {
          mat[slot] = null;
        }
      });

      // Promote non-standard material types (e.g. MeshPhongMaterial) to
      // MeshStandardMaterial which GLTFExporter handles reliably.
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
    // Unwrap single-element array
    if (!Array.isArray(child.material) && Array.isArray(mats) && mats.length === 1) {
      child.material = child.material[0] ?? child.material;
    }
  });
}

// ---------------------------------------------------------------------------
// Main export — FBXLoader gets a LoadingManager so we can wait for ALL
// async texture loads (embedded blobs) before exporting.
// ---------------------------------------------------------------------------
export async function convertFbxFileToGlbDataUrl(file, opts = {}) {
  const { animations = true, onProgress } = opts;
  if (onProgress) onProgress(0.05);

  const objectUrl = URL.createObjectURL(file);

  let group;
  try {
    group = await new Promise((resolve, reject) => {
      // Create a LoadingManager so we know when every embedded texture
      // has finished loading — not just when the FBX parse is done.
      const manager = new THREE.LoadingManager();

      // onLoad fires after ALL items tracked by this manager finish.
      // We resolve here, not in FBXLoader's onLoad, so textures are ready.
      manager.onLoad = () => resolve(group_ref);
      manager.onError = url => reject(new Error('LoadingManager error: ' + url));

      // Temporary ref so onLoad closure can access it
      let group_ref = null;

      new FBXLoader(manager).load(
        objectUrl,
        obj => {
          group_ref = obj;
          // manager.onLoad will fire once all pending texture blobs resolve.
          // If there are no textures the manager fires onLoad immediately after.
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

  // NOW all textures are fully decoded — safe to bake to canvases
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

  // ArrayBuffer → base-64 data URL (chunked to avoid stack overflow on large files)
  const uint8 = new Uint8Array(glbArrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i += 8192)
    binary += String.fromCharCode(...uint8.subarray(i, i + 8192));

  if (onProgress) onProgress(1);
  return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

window.lcFbx = { convertFbxFileToGlbDataUrl, isFbxFile };
export default { convertFbxFileToGlbDataUrl, isFbxFile };
