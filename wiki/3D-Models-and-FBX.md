# 3D Models & FBX

## Supported formats

| Format | Path |
|---|---|
| `.glb` | FileReader → base64 data URL → stored directly |
| `.gltf` | Same as GLB |
| `.fbx` | Loaded via Three.js FBXLoader → converted to GLB in-browser via GLTFExporter → base64 data URL |

## Uploading a model

1. Open the **Add / Edit Character** modal.
2. Under **3D Model**, click **Choose file**.
3. Select a `.glb`, `.gltf`, or `.fbx` file.
4. Wait for the status line to show **✓ ready!** (FBX conversion can take a few seconds).
5. Click **Save Character**.

The data URL is stored on `ch.glbUrl` and persisted in `localStorage`.

## Mixamo animations

If the GLB contains animation clips named `Idle`, `Walk`, or `Run` (case-insensitive), the wander AI will blend between them automatically. Export from Mixamo with "In Place" checked for best results.

## How the render pipeline works

```
upload-helpers.js
  uploadCharacterGlb()
    → handleModelUpload(file, ...)
        GLB/GLTF: FileReader.readAsDataURL → storeResult(dataUrl)
        FBX:      fbx-to-glb.js convertFbxFileToGlbDataUrl() → storeResult(dataUrl)
        storeResult() writes:
          window.tempGlbData = dataUrl
          window['tempGlbData'] = dataUrl

modals.js
  saveCharacter()
    glbUrl = tempGlbData || window.tempGlbData || url-field
    → character.glbUrl = glbUrl

room.js
  buildRoomScene()
    ch.glbUrl → loadGlbUrl(url, onLoad)
      data: URL → loader.parse(buffer)
      https: URL → loader.load(url)
    onLoad(gltf) → scale, position, add to scene, init wander agent
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Character shows as coloured box | `ch.glbUrl` is null or empty | Re-upload the model and save |
| FBX conversion stalls at 0% | Browser tab ran out of memory | Use a smaller / re-exported FBX |
| Model appears underground | Bounding box floor offset calculation | Model's origin is not at foot — re-export with origin at ground |
| Animations don't play | Clip names don't match | Rename clips to `Idle` and `Walk` in Blender / Mixamo before export |
