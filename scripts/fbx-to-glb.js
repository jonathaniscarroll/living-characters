/**
 * fbx-to-glb.js
 * -------------
 * Browser-side FBX → GLB conversion.
 * Uses Three.js FBXLoader then GLTFExporter.
 *
 * Key fix: strips all embedded textures before exporting.
 * GLTFExporter cannot serialise FBX-embedded image blobs and throws
 * "No valid image data found" — replacing with plain MeshLambertMaterial
 * sidesteps this entirely while keeping geometry + animations intact.
 */

import * as THREE from 'three';
import { FBXLoader }    from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

export function isFbxFile(file) {
  return !!file && file.name.toLowerCase().endsWith('.fbx');
}

/**
 * Strip all materials down to a plain MeshLambertMaterial so GLTFExporter
 * never encounters an image it cannot serialise.
 */
function stripTextures(group) {
  const plain = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
  group.traverse(child => {
    if (!child.isMesh) return;
    // Replace single material or array of materials
    if (Array.isArray(child.material)) {
      child.material = child.material.map(() => plain);
    } else {
      child.material = plain;
    }
  });
}

/**
 * Convert a File (.fbx) to a base-64 GLB data URL.
 * @param {File} file
 * @param {object} [opts]
 * @param {boolean} [opts.animations=true]
 * @param {function} [opts.onProgress]  (pct 0–1)
 * @returns {Promise<string>}  data:model/gltf-binary;base64,…
 */
export async function convertFbxFileToGlbDataUrl(file, opts = {}) {
  const { animations = true, onProgress } = opts;

  if (onProgress) onProgress(0.05);

  // 1. Object URL so FBXLoader can resolve relative texture paths
  const objectUrl = URL.createObjectURL(file);
  let group;
  try {
    group = await new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        objectUrl,
        obj => resolve(obj),
        xhr => {
          if (onProgress && xhr.total)
            onProgress(0.05 + 0.55 * (xhr.loaded / xhr.total));
        },
        err => reject(new Error('FBXLoader: ' + (err?.message || String(err))))
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  if (onProgress) onProgress(0.65);

  // 2. Strip all textures — prevents GLTFExporter image-data errors
  stripTextures(group);

  // 3. Auto-scale to unit height
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) group.scale.setScalar(1 / maxDim);

  if (onProgress) onProgress(0.75);

  // 4. Export as binary GLB
  const clips = animations ? (group.animations || []) : [];
  const glbArrayBuffer = await new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      result => {
        if (result instanceof ArrayBuffer) resolve(result);
        else reject(new Error('GLTFExporter returned JSON — expected binary'));
      },
      err => reject(new Error('GLTFExporter: ' + (err?.message || String(err)))),
      { binary: true, animations: clips, includeCustomExtensions: false }
    );
  });
  if (onProgress) onProgress(0.92);

  // 5. ArrayBuffer → base-64 data URL
  const uint8 = new Uint8Array(glbArrayBuffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < uint8.length; i += CHUNK)
    binary += String.fromCharCode(...uint8.subarray(i, i + CHUNK));
  const b64 = btoa(binary);
  if (onProgress) onProgress(1);

  return `data:model/gltf-binary;base64,${b64}`;
}

window.lcFbx = { convertFbxFileToGlbDataUrl, isFbxFile };
export default { convertFbxFileToGlbDataUrl, isFbxFile };
