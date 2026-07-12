---
description: Instructions for AI assistants working in this repository
applyTo: "**/*"
---

# Living Characters workspace instructions

- Treat the repository README as the primary source of truth for the project’s purpose, scope, and roadmap. Read it before making significant changes, and update it when behavior, architecture, or priorities change.
- This repository is a browser-based, no-backend interactive story/world builder. Preserve that approach unless the task explicitly requires otherwise.
- Prefer small, compatible changes that fit the existing single-page app structure and current data model rather than introducing major refactors without need.
- Keep the existing content model intact:
  - rooms with GPS metadata
  - characters with room assignments, moods, passages, media, and items
  - room objects with position, rotation, scale, and description
  - Twee import/export compatibility
- Avoid breaking local storage persistence, GitHub save/load, or existing import/export flows.
- When changing features, preserve backward compatibility where practical and document any meaningful changes in the README.
- If work changes the project’s architecture, roadmap, or workflow, update the README so it reflects the current state.
- Use the existing repository files and conventions before introducing new files, frameworks, or tooling.
- Prefer clear, minimal edits and call out assumptions or risks when they affect the project’s direction.