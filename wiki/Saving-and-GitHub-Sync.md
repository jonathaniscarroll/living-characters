# Saving & GitHub Sync

## localStorage (default)

All data — rooms, characters, objects, backdrop images, 3D model data URLs — is saved to `localStorage` under the key `livingCharactersData`. This persists across page reloads on the same browser and machine.

To export a snapshot manually, use the **Export JSON** button in the settings panel.

## GitHub sync (optional)

If you configure a GitHub Personal Access Token (PAT), the tool can save and load data to/from the repo.

### Setup

1. Generate a PAT with `repo` scope at [github.com/settings/tokens](https://github.com/settings/tokens).
2. Open the **Settings** panel in the tool.
3. Enter your repo (`owner/repo`), branch (`main`), and PAT.
4. Click **Save Settings**.

### How saves work

- `window.lcStore.ghSave()` commits `localStorage.json` to the repo with a descriptive message.
- Backdrop images and GLB models that exceed the GitHub file size limit are stored as data URLs inside `localStorage.json`.
- On load, `window.lcStore.ghLoad()` fetches `localStorage.json` from the repo and hydrates `localStorage`.

### Commit messages

The tool auto-generates commit messages:
- `Add character: <name>`
- `Update character: <name>`
- `Add room: <name>`
- `Update room: <name>`

You can override the message in the commit input field before saving.

## Backup advice (Art Camp context)

Since there is one shared machine and no individual logins, it is recommended to:
1. GitHub sync at the end of each workshop session.
2. Export JSON as a local backup before closing the browser.
3. Keep the `localStorage.json` committed in the repo as the canonical source of truth.
