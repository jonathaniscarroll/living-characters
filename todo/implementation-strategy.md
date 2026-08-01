# Implementation Strategy — All Todo Prompts

This file coordinates the safe, non-destructive execution of all prompts in `todo/`,
on a `dev` branch with its own GitHub Pages preview URL. `main` and its live deployment
are never touched during development.

---

## Part 1 — Dev Branch + Preview Deployment

### How GitHub Pages handles multiple branches

GitHub Pages officially supports **one source** per repo (usually `main` or `gh-pages`).
It does **not** natively serve separate branches at separate subdomains.

However, you can serve `dev` at a path prefix (`/dev/`) on the same Pages site by
deploying it into a subfolder of the `gh-pages` branch. The approach:

- `main` continues to build → root of the Pages site (`jonathaniscarroll.github.io/living-characters/`)
- `dev` builds → a `dev/` subfolder (`jonathaniscarroll.github.io/living-characters/dev/`)

Both are served by the same GitHub Pages deployment; no custom domain or DNS needed.

> **True subdomain** (e.g. `dev.living-characters.example.com`) requires a custom domain
> and DNS control. The `/dev/` path approach works out of the box with `github.io`.

---

### Step 1 — Create the `dev` branch

```bash
git checkout main
git pull
git checkout -b dev
git push -u origin dev
```

All feature work happens on `dev`. `main` is never committed to directly during this sprint.

---

### Step 2 — Add a second workflow: `dev-preview.yml`

Create `.github/workflows/dev-preview.yml` with this content:

```yaml
name: Dev Preview Deploy

on:
  push:
    branches: [ dev ]
  workflow_dispatch:

permissions:
  contents: write   # needs write to push to gh-pages branch

jobs:
  build-dev-preview:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout dev
        uses: actions/checkout@v4
        with:
          ref: dev

      - name: Copy site into dev/ subfolder
        run: |
          mkdir -p _preview/dev
          # Copy all site files (index.html, scripts/, media/, vendor/, etc.)
          # Exclude .git, .github, todo, node_modules
          rsync -a \
            --exclude='.git' \
            --exclude='.github' \
            --exclude='todo' \
            --exclude='node_modules' \
            --exclude='_preview' \
            . _preview/dev/

      - name: Checkout gh-pages branch into subfolder
        uses: actions/checkout@v4
        with:
          ref: gh-pages
          path: gh-pages-current
          fetch-depth: 0

      - name: Merge dev preview into gh-pages
        run: |
          # Copy only the dev/ subfolder — leave everything else in gh-pages untouched
          rm -rf gh-pages-current/dev
          cp -r _preview/dev gh-pages-current/dev

      - name: Push updated gh-pages
        run: |
          cd gh-pages-current
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add dev/
          git diff --cached --quiet || git commit -m "Deploy dev preview [skip ci]"
          git push
```

**What this does:**
- Triggers only on pushes to `dev` (never touches `main`)
- Copies the dev branch into a `dev/` folder inside the `gh-pages` branch
- The existing `build-and-deploy.yml` workflow on `main` continues to deploy to the root
- Dev preview is live at: `https://jonathaniscarroll.github.io/living-characters/dev/`

> **Important:** The existing workflow uses `actions/deploy-pages` (the official Pages API).
> That API controls the root of the Pages site. To avoid conflicts, the dev workflow writes
> directly to the `gh-pages` branch instead. This requires:
> 1. In GitHub repo Settings → Pages, change the source to **Deploy from a branch** → `gh-pages` / `/(root)` — OR keep the existing Actions deployment for root and accept that the dev path is written by the branch approach. If the existing workflow already uses the Actions Pages API, the two deployment methods may conflict. **Safest option: keep the existing `build-and-deploy.yml` unchanged and only add the dev workflow.** Test after first push to confirm both paths serve correctly.

---

### Step 3 — Verify both URLs work

| Branch | URL | Workflow |
|---|---|---|
| `main` | `jonathaniscarroll.github.io/living-characters/` | `build-and-deploy.yml` (unchanged) |
| `dev` | `jonathaniscarroll.github.io/living-characters/dev/` | `dev-preview.yml` (new) |

---

## Part 2 — Implementation Order

The five todo prompts must be executed in a specific order to avoid compounding risk.
Each phase is a self-contained commit (or small series of commits) on `dev`.
Test after each phase before starting the next.

```
Phase 0 — Portrait bug fix          (scripts/modals.js only — surgical, no new features)
Phase 1 — Room bounds + floor removal (scripts/room.js only — pure math, no new data)
Phase 2 — Room object sprites        (scripts/room.js — additive, new field on objects)
Phase 3 — Fetch quest system         (scripts/modals.js + scripts/card.js + index.html)
Phase 4 — Animated commute           (scripts/room.js + scripts/modals.js — most complex)
```

Rationale:
- Phase 0 first because it fixes existing data flow; everything downstream depends on portraits working.
- Phase 1 before Phase 2 because the floor removal changes `buildRoomScene` structure; doing it first means Phase 2 writes into a clean version of that function.
- Phase 2 before Phase 3 because the fetch quest references `obj.name` from objects — having objects with sprites working first means you can test quests with visual objects.
- Phase 4 last because animated commute adds a new state machine layer on top of wander AI (Phase 1) and schedule data (Phase 3).

---

## Phase 0 — Portrait Bug Fix

**Source prompt:** `todo/fix-portrait-bug.md`  
**File:** `scripts/modals.js`  
**Risk:** Low — data flow fix only, no new DOM or schema changes

### Non-destructive approach

1. In `openCharModal(charId)`, confirm these two lines exist **before** the modal opens:
   ```js
   tempPhotoData = ch.photoData || null;
   tempAnimData  = ch.animData  || null;
   ```
   They are already present in the current code — verify the photo/anim preview `<img>` elements
   are also being shown (the `pp.src` / `ap.src` assignment blocks). These are also present.
   The bug is almost certainly in `saveCharacter()` — inspect that function specifically.

2. In `saveCharacter()`, find the `data` object construction and confirm:
   ```js
   photoData: tempPhotoData || existing?.photoData || null,
   animData:  tempAnimData  || existing?.animData  || null,
   ```
   If these lines are missing or mis-named, add them. Do not change anything else.

3. Add a temporary `console.log('portrait check:', ch.name, !!ch.photoData)` in `openCard()`
   to verify data is present after the fix. Remove before merging to `main`.

**Commit message:** `fix: preserve photoData/animData through saveCharacter`

---

## Phase 1 — Room Bounds Fit to Screen + Remove Floor

**Source prompt:** `todo/room-bounds-fit-screen.md`  
**File:** `scripts/room.js`  
**Risk:** Low-medium — touches wander AI and scene construction

### Non-destructive approach

1. **Remove floor and walls first** as a separate micro-commit before touching wander logic.
   This is purely subtractive — delete the `floor` mesh block and the `wN`/`wW` wall blocks.
   Load the room in the preview and confirm the backdrop image is unaffected.

2. **Compute `worldBounds`** immediately after `camera.updateProjectionMatrix()`. Log it to
   console to sanity-check the values before wiring it up.

3. **Update `_initWanderAgent`** to accept `bounds` as an optional last parameter. The
   existing call sites without the new parameter still work (agent.bounds is undefined —
   the fallback to WANDER_RADIUS is preserved by the guard `if (b)`).

4. **Update `_tickWander`** with the bounds-aware target picker and per-tick clamp.

5. **Update the `_initWanderAgent` call** in `buildRoomScene` to pass `worldBounds`.

6. **Clamp spawn positions** when reading `ch.sceneX` / `ch.sceneZ`.

**Test:** Open a room. Observe characters wander. Leave it running for 30 seconds. No
character should leave the visible area. Check two different rooms with different camera
zoom values.

**Commit message:** `feat: fit wander bounds to screen, remove floor mesh`

---

## Phase 2 — Room Object Sprites

**Source prompt:** `todo/room-object-sprites.md`  
**File:** `scripts/room.js`  
**Risk:** Low — purely additive; objects without `frames` are completely unaffected

### Non-destructive approach

1. Add `_objPendingFrames = []` and `_objSpriteMap = new Map()` at module level. These are
   new variables — they cannot conflict with anything existing.

2. Add `buildObjSpriteSection()`, `renderObjSpriteStrip()`, `triggerObjFrameUpload()`,
   `onObjFrameFileChange()`, `toggleObjSpriteSection()` as new functions. Do not modify
   any existing function signatures yet.

3. Modify `openObjModal` to call `buildObjSpriteSection()` at the end — one new line.

4. Modify `closeObjModal` to reset `_objPendingFrames` and remove the section — three new lines.

5. Modify `saveObject` to add `frames: ...` to the data object — one new line. The existing
   `glbUrl` path is untouched.

6. In `buildRoomScene`, add the `if (obj.frames && obj.frames.length)` early-return branch
   **before** the existing glbUrl branch. The existing code is indented but not restructured.

7. Add `_tickObjSprites` call in the `animate()` loop.

8. Add `_objSpriteMap.clear()` in `destroyRoomScene`.

9. Export the new public functions.

**Test:** Add a new object. Upload 2-3 PNG frames. Save. Open the room. Confirm the
sprite animates. Edit the object again — confirm frames are still there. Add a second
object without frames — confirm it still renders as a GLB or fallback box.

**Commit message:** `feat: sprite frame support for room objects`

---

## Phase 3 — Fetch Quest System

**Source prompt:** `todo/fetch-quest-system.md`  
**Files:** `scripts/modals.js`, `scripts/card.js`, `index.html`  
**Risk:** Medium — touches three files, adds new UI to two existing modals

### Non-destructive approach

1. **Data model first.** Add `playerInventory = []` to module scope in `card.js` (or
   wherever `characters` lives). Add it to `save()` / `load()` with a `|| []` default so
   existing saves load fine.

2. **`#inventory-bar` in `index.html`** — add the fixed bottom bar div. It starts empty
   and invisible-ish (`nothing yet` label). This change is purely additive HTML.

3. **Quest fields in `openCharModal` / `saveCharacter`** — add the `🔍 FETCH QUEST`
   section to the dialogue builder. All five new fields are optional; existing characters
   with no quest data load fine because all fields default to `null`.

4. **Quest panel in `openCard`** — add the four-state panel rendering after existing
   dialogue. Guard every branch with `if (ch.wantsItem)` so characters without a quest
   show no quest UI.

5. **`giveItem()` and `pickUpItem()`** — add as new exports on `window.lcCard`.

6. **`renderInventoryBar()`** — call it on `save()` and on page load after `load()`.

**Test sequence:**
- Create character A with `items: ['acorn']`.
- Create character B with `wantsItem: 'acorn'`, `questReward: 'feather'`.
- Open character A's card → tap "Take acorn" → confirm inventory bar shows `acorn`.
- Open character B's card → confirm offer line and "Give acorn" button appear.
- Tap give → confirm inventory shows `feather`, B's card shows complete state.
- Reload page → confirm inventory and quest state persisted.

**Commit message:** `feat: fetch quest system with player inventory`

---

## Phase 4 — Animated Commute

**Source prompt:** `todo/animated-commute.md`  
**Files:** `scripts/room.js`, `scripts/modals.js` (schedule data already present)  
**Risk:** Medium-high — most complex; adds a new state layer on top of wander AI

### Non-destructive approach

Read `todo/animated-commute.md` carefully before starting. Key principle: the commute
system should be **opt-in** — if a character has no schedule or no home/work rooms set,
they continue wandering as before.

1. Add commute state to agents: `commuteState: null` (null = not commuting). Existing
   agents with `commuteState === null` follow the current wander path unchanged.

2. Add a `checkSchedule()` function that runs on a timer (every 60 seconds of real time,
   or on room open). It reads `character.schedule` and `character.homeRoomId` /
   `workRoomId`, computes the current time-of-day segment, and sets the commute target
   if the character should be in a different room.

3. Commute within a room is just moving toward a target position (same as wander walking).
   Cross-room commute (character appears in new room) can be deferred: for now, simply
   hide the character mesh in the current room and show them in the correct room when that
   room is opened.

4. Add all changes behind a `USE_SCHEDULE = true` flag at the top of `room.js` so you
   can disable it instantly if it breaks wander AI.

**Commit message:** `feat: schedule-based commute for characters`

---

## Part 3 — Merge Strategy

Once all phases pass on `dev`:

1. Open a pull request from `dev` → `main` on GitHub.
2. Review the diff — confirm no files outside the expected set were modified.
3. Squash-merge or merge commit (your preference).
4. The existing `build-and-deploy.yml` fires automatically on merge to `main` and
   deploys the updated site to the root URL.
5. Delete or archive the `dev` branch, or keep it open for the next sprint.

---

## Part 4 — Safety Rules for All Phases

- **One phase per commit (minimum).** Never mix phases in a single commit.
- **No renaming of existing functions or variables.** Only add new ones.
- **No changes to `save()` / `load()` data structure beyond adding new keys** with `|| default` fallbacks so existing localStorage saves don't break.
- **Guard every new feature with an existence check** (`if (ch.wantsItem)`, `if (obj.frames?.length)`, `if (agent.bounds)`) so the feature is invisible until data is present.
- **Test at the preview URL** (`/dev/`) before merging anything to `main`.
- **Keep `todo/` files on `dev`** as a record; delete or archive them after merge.
