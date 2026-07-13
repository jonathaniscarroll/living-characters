/**
 * fbx-to-glb.js
 * -------------
 * Browser-side FBX → GLB conversion.
 *
 * Uses Three.js FBXLoader (loads the .fbx ArrayBuffer in-browser)
 * then GLTFExporter to produce a GLB Blob / data: URL.
 *
 * Exports:
 *   convertFbxFileToGlbDataUrl(file)  → Promise<string>  (data:model/gltf-binary;base64,…)
 *   isFbxFile(file)                  → boolean
 *
 * Wire-up helper (called from index.html after the module loads):
 *   window.lcFbx.convertFbxFileToGlbDataUrl(file)
 *
 * Dependencies (loaded via importmap already in index.html):
 *   three, three/addons/loaders/FBXLoader.js, three/addons/exporters/GLTFExporter.js
 */

import * as THREE from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

/** Returns true if the File looks like an FBX */
export function isFbxFile(file) {
  if (!file) return false;
  return file.name.toLowerCase().endsWith('.fbx')
    || file.type === 'application/octet-stream' && file.name.toLowerCase().endsWith('.fbx');
}

/**
 * Convert a File (.fbx) to a base-64 GLB data URL.
 * Resolves with the data URL string; rejects with an Error.
 *
 * @param {File} file
 * @param {object} [opts]
 * @param {boolean} [opts.animations=true]  include animations
 * @param {function} [opts.onProgress]      (pct 0-1) progress callback
 * @returns {Promise<string>}
 */
export async function convertFbxFileToGlbDataUrl(file, opts = {}) {
  const { animations = true, onProgress } = opts;

  // 1. Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  if (onProgress) onProgress(0.1);

  // 2. Load with FBXLoader (needs an object URL for texture paths to resolve)
  const objectUrl = URL.createObjectURL(file);
  let group;
  try {
    group = await new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        objectUrl,
        obj => resolve(obj),
        xhr => { if (onProgress && xhr.total) onProgress(0.1 + 0.6 * xhr.loaded / xhr.total); },
        err => reject(new Error('FBXLoader failed: ' + (err?.message || err)))
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  if (onProgress) onProgress(0.75);

  // 3. Auto-scale to unit height so it fits the scene the same way GLBs do
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) group.scale.setScalar(1 / maxDim);

  // 4. Export with GLTFExporter
  const glbArrayBuffer = await new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      result => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('GLTFExporter returned JSON instead of binary. Pass binary:true.'));
      },
      err => reject(new Error('GLTFExporter failed: ' + (err?.message || err))),
      {
        binary: true,
        animations: animations ? group.animations || [] : [],
        includeCustomExtensions: false
      }
    );
  });
  if (onProgress) onProgress(0.95);

  // 5. Convert ArrayBuffer → base64 data URL
  const uint8 = new Uint8Array(glbArrayBuffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8.length; i += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(i, i + chunkSize));
  }
  const b64 = btoa(binary);
  if (onProgress) onProgress(1);

  return `data:model/gltf-binary;base64,${b64}`;
}

// Expose on window for inline onclick handlers
window.lcFbx = { convertFbxFileToGlbDataUrl, isFbxFile };

export default { convertFbxFileToGlbDataUrl, isFbxFile };
