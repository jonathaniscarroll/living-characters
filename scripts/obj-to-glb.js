// obj-to-glb.js — Convert OBJ (+ MTL/textures) to GLB for Three.js scenes
// Usage: node obj-to-glb.js input.obj [input.mtl] output.glb

import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

const INPUT_OBJ = process.argv[2];
const INPUT_MTL = process.argv[3] || null;
const OUTPUT_GLB = process.argv[4] || 'output.glb';

if (!INPUT_OBJ) {
  console.error('Usage: node obj-to-glb.js input.obj [material.mtl] [output.glb]');
  process.exit(1);
}

const objPath = path.resolve(INPUT_OBJ);
const mtlPath = INPUT_MTL ? path.resolve(INPUT_MTL) : null;
const outPath = path.resolve(OUTPUT_GLB);
const objDir = path.dirname(objPath);

function loadObject() {
  return new Promise((resolve, reject) => {
    const loader = mtlPath
      ? new OBJLoader()
      : new OBJLoader();

    if (mtlPath) {
      const mtlLoader = new MTLLoader({ resourcePath: objDir + '/' });
      mtlLoader.load(path.basename(mtlPath), (materials) => {
        materials.preload();
        loader.setMaterials(materials);
        loader.load(path.basename(objPath), resolve, undefined, reject);
      }, undefined, reject);
    } else {
      loader.setPath(objDir);
      loader.load(path.basename(objPath), resolve, undefined, reject);
    }
  });
}

async function main() {
  const object = await loadObject();

  // Fix texture paths for Node.js
  object.traverse((child) => {
    if (child.isMesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat.map && mat.map.isTexture && mat.map.image?.src) {
          const texPath = mat.map.image.src;
          if (!path.isAbsolute(texPath)) {
            mat.map.image.src = path.resolve(objDir, texPath);
          }
        }
      }
    }
  });

  const exporter = new GLTFExporter();
  const glbBuffer = await new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => Array.isArray(result) ? reject(new Error('Expected binary output')) : resolve(result),
      (err) => reject(err),
      { binary: true, trs: true, maxTextureSize: 4096 }
    );
  });

  fs.writeFileSync(outPath, Buffer.from(glbBuffer));
  console.log('✅ GLB written to:', outPath);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});