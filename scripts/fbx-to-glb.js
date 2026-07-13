/**
 * fbx-to-glb.js
 * -------------
 * Browser-side FBX → GLB conversion.
 * Preserves embedded FBX textures by drawing them onto a canvas so
 * GLTFExporter can serialise them without "No valid image data found".
 *
 * If a texture can't be drawn (e.g. cross-origin, corrupt), that mesh
 * falls back to a plain grey material — conversion never aborts.
 */

import * as THREE from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function isFbxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.fbx');
}

// ---------------------------------------------------------------------------
// Convert any Three.js texture to a plain <canvas> the exporter can read
// ---------------------------------------------------------------------------
function textureToCanvas(texture) {
  try {
    let src = texture.image;
    if (!src) return null;

    // DataTexture stores pixels in .data (Uint8Array) with .width/.height
    if (src instanceof Uint8Array || src instanceof Uint8ClampedArray || ArrayBuffer.isView(src)) {
      const w = texture.image.width  || (src.length / 4) ** 0.5 | 0;
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

    // ImageBitmap, HTMLImageElement, HTMLCanvasElement, ImageData…
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
// Walk every mesh and make sure its textures have a canvas .image
// so GLTFExporter can call canvas.toDataURL()
// ---------------------------------------------------------------------------
function fixTexturesForExport(group) {
  const fallback = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

  group.traverse(child => {
    if (!child.isMesh) return;

    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const fixed = mats.map(mat => {
      if (!mat) return fallback;

      let ok = true;
      // Check every texture slot that GLTFExporter cares about
      const slots = ['map','normalMap','roughnessMap','metalnessMap',
                     'emissiveMap','aoMap','alphaMap','lightMap'];
      slots.forEach(slot => {
        const tex = mat[slot];
        if (!tex) return;
        const canvas = textureToCanvas(tex);
        if (canvas) {
          // Replace the image with the canvas — exporter calls canvas.toDataURL()
          tex.image = canvas;
          tex.needsUpdate = true;
        } else {
          // Can't recover this texture slot — clear it
          mat[slot] = null;
        }
      });

      // Ensure material is a type GLTFExporter handles well
      if (!(mat instanceof THREE.MeshStandardMaterial) &&
          !(mat instanceof THREE.MeshBasicMaterial) &&
          !(mat instanceof THREE.MeshLambertMaterial)) {
        // Phong etc. — promote to Standard, copy colour + main map
        const std = new THREE.MeshStandardMaterial({
          color:       mat.color       || new THREE.Color(0xcccccc),
          map:         mat.map         || null,
          normalMap:   mat.normalMap   || null,
          emissive:    mat.emissive    || new THREE.Color(0x000000),
          emissiveMap: mat.emissiveMap || null,
          side:        THREE.DoubleSide,
          transparent: mat.transparent || false,
          opacity:     mat.opacity     !== undefined ? mat.opacity : 1,
        });
        return std;
      }
      return mat;
    });

    child.material = Array.isArray(child.material) ? fixed : fixed[0];
  });
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------
export async function convertFbxFileToGlbDataUrl(file, opts = {}) {
  const { animations = true, onProgress } = opts;

  if (onProgress) onProgress(0.05);

  const objectUrl = URL.createObjectURL(file);
  let group;
  try {
    group = await new Promise((resolve, reject) => {
      new FBXLoader().load(
        objectUrl,
        obj  => resolve(obj),
        xhr  => { if (onProgress && xhr.total) onProgress(0.05 + 0.55 * xhr.loaded / xhr.total); },
        err  => reject(new Error('FBXLoader: ' + (err?.message || String(err))))
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  if (onProgress) onProgress(0.65);

  // Bake textures onto canvases so the exporter can read them
  fixTexturesForExport(group);

  // Auto-scale to unit height
  const box = new THREE.Box3().setFromObject(group);
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

  // ArrayBuffer → base-64 data URL
  const uint8 = new Uint8Array(glbArrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i += 8192)
    binary += String.fromCharCode(...uint8.subarray(i, i + 8192));
  if (onProgress) onProgress(1);

  return `data:model/gltf-binary;base64,${btoa(binary)}`;
}

window.lcFbx = { convertFbxFileToGlbDataUrl, isFbxFile };
export default { convertFbxFileToGlbDataUrl, isFbxFile };
