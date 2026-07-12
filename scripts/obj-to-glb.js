// obj-to-glb.js — Convert OBJ to GLB for Three.js scenes (dependency-free)
// Usage: node obj-to-glb.js input.obj output.glb

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// OBJ Parser
function parseObj(content) {
  const lines = content.split(/\r?\n/);
  const positions = [];
  const normals = [];
  const uvs = [];
  const faces = [];

  let currentMaterial = 'default';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/\s+/);
    const key = parts[0];

    if (key === 'v') {
      positions.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (key === 'vn') {
      normals.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (key === 'vt') {
      uvs.push(parseFloat(parts[1] || 0), parseFloat(parts[2] || 0));
    } else if (key === 'usemtl') {
      currentMaterial = parts[1] || 'default';
    } else if (key === 'f') {
      const faceVerts = parts.slice(1).map(patch => {
        const [vStr, vtStr, vnStr] = patch.split('/');
        return {
          v: vStr ? parseInt(vStr, 10) - 1 : null,
          vt: vtStr ? parseInt(vtStr, 10) - 1 : null,
          vn: vnStr ? parseInt(vnStr, 10) - 1 : null
        };
      });
      // Triangulate (fan from first vertex)
      for (let i = 1; i < faceVerts.length - 1; i++) {
        faces.push({
          material: currentMaterial,
          indices: [faceVerts[0], faceVerts[i], faceVerts[i + 1]]
        });
      }
    }
  }

  return { positions, normals, uvs, faces };
}

// Build interleaved vertex buffer & indices buffer
function buildBuffers(obj) {
  const keyMap = new Map();
  const posOut = [];
  const normOut = [];
  const uvOut = [];
  const indexOut = [];

  const hasNormals = obj.normals.length > 0;
  const hasUvs = obj.uvs.length > 0;

  for (const face of obj.faces) {
    for (const vi of face.indices) {
      const vIdx = vi.v;
      const vtIdx = vi.vt;
      const vnIdx = vi.vn;

      const key = `${vIdx ?? ''},${vtIdx ?? ''},${vnIdx ?? ''}`;
      let idx = keyMap.get(key);
      if (idx === undefined) {
        idx = posOut.length / 3;
        keyMap.set(key, idx);

        posOut.push(obj.positions[vIdx * 3 + 0], obj.positions[vIdx * 3 + 1], obj.positions[vIdx * 3 + 2]);

        if (hasNormals && vnIdx !== null) {
          normOut.push(obj.normals[vnIdx * 3 + 0], obj.normals[vnIdx * 3 + 1], obj.normals[vnIdx * 3 + 2]);
        } else {
          normOut.push(0, 0, 0);
        }

        if (hasUvs && vtIdx !== null) {
          uvOut.push(obj.uvs[vtIdx * 2 + 0], obj.uvs[vtIdx * 2 + 1]);
        } else {
          uvOut.push(0, 0);
        }
      }
      indexOut.push(idx);
    }
  }

  return {
    positions: new Float32Array(posOut),
    normals: new Float32Array(normOut),
    uvs: new Float32Array(uvOut),
    indices: new Uint32Array(indexOut),
    vertexCount: posOut.length / 3,
    indexCount: indexOut.length
  };
}

// GLB / glTF helpers (binary)
const GLB_HEADER_BYTE_LENGTH = 12;
const GLB_CHUNK_HEADER_BYTE_LENGTH = 8;

function createGlb(json, binBuffer) {
  const jsonText = JSON.stringify(json);
  const jsonBuffer = Buffer.from(jsonText, 'utf8');

  const jsonChunkLength = (jsonBuffer.length + 3) & ~3;
  const jsonPadded = Buffer.alloc(jsonChunkLength);
  jsonBuffer.copy(jsonPadded);
  jsonPadded.fill(0x20, jsonBuffer.length);

  const binChunkLength = (binBuffer.length + 3) & ~3;
  const binPadded = Buffer.alloc(binChunkLength);
  binBuffer.copy(binPadded);

  const totalLength = GLB_HEADER_BYTE_LENGTH + GLB_CHUNK_HEADER_BYTE_LENGTH + jsonChunkLength + GLB_CHUNK_HEADER_BYTE_LENGTH + binChunkLength;

  const glb = Buffer.alloc(totalLength);
  let offset = 0;

  glb.writeUInt32LE(0x46546C67, offset); // 'glTF'
  offset += 4;
  glb.writeUInt32LE(2, offset); // version
  offset += 4;
  glb.writeUInt32LE(totalLength, offset); // total length
  offset += 4;

  glb.writeUInt32LE(jsonChunkLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x4E4F534A, offset); // 'JSON'
  offset += 4;
  jsonPadded.copy(glb, offset);
  offset += jsonChunkLength;

  glb.writeUInt32LE(binChunkLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x004E4942, offset); // 'BIN\0'
  offset += 4;
  binPadded.copy(glb, offset);

  return glb;
}

function buildGltfJSON(buffers) {
  const byteOffsetPos = 0;
  const byteOffsetNorm = buffers.positions.byteLength;
  const byteOffsetUV = byteOffsetNorm + buffers.normals.byteLength;
  const byteOffsetIdx = byteOffsetUV + buffers.uvs.byteLength;

  const totalBinLength = buffers.positions.byteLength + buffers.normals.byteLength + buffers.uvs.byteLength + buffers.indices.byteLength;

  const binBuffer = Buffer.alloc(totalBinLength);
  let off = 0;
  Buffer.from(buffers.positions.buffer).copy(binBuffer, off);
  off += buffers.positions.byteLength;
  Buffer.from(buffers.normals.buffer).copy(binBuffer, off);
  off += buffers.normals.byteLength;
  Buffer.from(buffers.uvs.buffer).copy(binBuffer, off);
  off += buffers.uvs.byteLength;
  Buffer.from(buffers.indices.buffer).copy(binBuffer, off);

  const gltf = {
    asset: { version: '2.0', generator: 'custom-obj-to-glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{
      primitives: [{
        attributes: {
          POSITION: 0,
          NORMAL: 1,
          TEXCOORD_0: 2
        },
        indices: 3,
        mode: 4
      }]
    }],
    materials: [{
      name: 'default',
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
      doubleSided: true
    }],
    accessors: [
      { bufferView: 0, componentType: 5126, type: 'VEC3', count: buffers.vertexCount },
      { bufferView: 1, componentType: 5126, type: 'VEC3', count: buffers.vertexCount },
      { bufferView: 2, componentType: 5126, type: 'VEC2', count: buffers.vertexCount },
      { bufferView: 3, componentType: 5125, type: 'SCALAR', count: buffers.indexCount }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: byteOffsetPos, byteLength: buffers.positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: byteOffsetNorm, byteLength: buffers.normals.byteLength, target: 34962 },
      { buffer: 0, byteOffset: byteOffsetUV, byteLength: buffers.uvs.byteLength, target: 34962 },
      { buffer: 0, byteOffset: byteOffsetIdx, byteLength: buffers.indices.byteLength, target: 34963 }
    ],
    buffers: [{ byteLength: totalBinLength }]
  };

  // compute min/max for positions
  const pos = buffers.positions;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  gltf.accessors[0].min = [minX, minY, minZ];
  gltf.accessors[0].max = [maxX, maxY, maxZ];

  return { gltf, binBuffer };
}

function convertObjToGlb(objPath, glbPath) {
  const objContent = fs.readFileSync(objPath, 'utf8');
  const parsed = parseObj(objContent);
  const buffers = buildBuffers(parsed);
  const { gltf, binBuffer } = buildGltfJSON(buffers);
  const glb = createGlb(gltf, binBuffer);
  fs.writeFileSync(glbPath, glb);
  console.log('✅ Wrote GLB to', glbPath);
}

const [objInput, glbOutput] = process.argv.slice(2);
if (!objInput || !glbOutput) {
  console.error('Usage: node obj-to-glb.js input.obj output.glb');
  process.exit(1);
}

convertObjToGlb(path.resolve(objInput), path.resolve(glbOutput));