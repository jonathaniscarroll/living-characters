# Phase 2 Implementation — Room Backdrop Upload & Three.js Integration

## Completed
- Mobile-first CSS
- Auto-load story on first visit
- Global function wrappers for module scripts
- Room picker map initialization

## Current Task: Room Backdrop Upload
1. Upload backdrop to GitHub under `media/room-backdrops/{roomId}.png`
2. Store `backdropUrl` on room object
3. Use `backdropUrl` in Three.js room scene background

### Implementation Plan
- [x] Add `uploadRoomBackdropToGitHub()` function to store.js
- [x] Modify `uploadRoomBackdrop()` in modals.js to call GitHub upload
- [x] Store `backdropUrl` on room when saved
- [x] Update room.js to use `room.backdropUrl` for Three.js background
- [ ] Test and deploy