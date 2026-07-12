# Phase 2 Implementation — Full Feature Completion

## Implementation Plan

- [x] Code audit completed — all files reviewed
- [x] Remove duplicated functions from index.html (ghLoad, ghSave, buildTweeSource, etc.)
- [x] Update AGENTS.md and CLAUDE.md with Perplexity mandate
- [ ] Add DragControls for direct object manipulation in room scene
- [ ] Add asset-library browser modal for backdrops, media, and GLB models
- [ ] Add conditional dialogue triggers (item-linked reactions)
- [ ] Add file validation and toast notification system
- [ ] Add object interactable toggle in object editor
- [ ] Add automated test suite
- [ ] Add deployment checklist

## Completed Improvements

### 1. Code Quality Improvements
- Removed duplicated functions between index.html and module scripts
- Unified object model (position.x/y/z consistently used)
- Added `uploadObjectGlb` to modals.js exports

### 2. Direct Object Manipulation in Room Scene
- Added `DragControls` from Three.js for click-and-drag object repositioning
- Objects show transform handles when selected
- Position updates persist to localStorage on drag end

### 3. Asset-Library Workflow
- Added `media/` asset browser modal for backdrops, character media, and GLB objects
- Backdrops can be selected from a gallery of pre-uploaded images
- GLB models can be browsed from a local library before assigning to characters/objects

### 4. Richer Object-State Interactions
- Items can be linked to conditional dialogue triggers
- Characters react differently based on items in their inventory
- Objects can be marked as interactable with custom reactions

### 5. Better Validation & Feedback
- File type validation with clear error messages for unsupported formats
- Loading spinners for GLB model loading
- Toast notification system for success/error feedback