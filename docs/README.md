# PlayerDocs LLM Reference Index

This directory is a high-signal reference set for understanding PlayerDocs without re-analyzing the full codebase each time.

## Recommended Reading Order
1. `architecture.md` - process boundaries, startup lifecycle, and runtime flow.
2. `data-model-and-storage.md` - canonical schema, IDs, linking model, and persistence behavior.
3. `editor-mechanics.md` - how the main editor actually behaves and persists state.
4. `ipc-reference.md` - operational API surface between renderer and main process.
5. `build-test-and-release.md` - tooling, build pipeline, CI, and packaging.

## Quick Project Summary
- PlayerDocs is an Electron + React + TypeScript desktop app for campaign/world documentation.
- Renderer handles UX; main process handles DB/filesystem/native side effects through IPC.
- Data is persisted in SQLite (`player_docs.db`) under a user-selected project directory.
- The editor stores linked narrative text using inline token syntax (`[[Label|tag_id]]`), resolved through `link_tags` and `tag_links`.

## Source-of-Truth Files
- App entry/routing: `game_docs/src/main.tsx`, `game_docs/src/App.tsx`
- Main process and IPC: `game_docs/electron/main/index.ts`
- Preload bridge: `game_docs/electron/preload/index.ts`
- DB bootstrap/schema: `game_docs/electron/main/db.ts`, `game_docs/db/schema.sql`
- Core editor behavior: `game_docs/src/components/Editor.tsx`

## How to Use This as an LLM
- Start with `architecture.md` to orient on boundaries and flow.
- Use `ipc-reference.md` as the lookup table when mapping a UI action to backend behavior.
- Use `data-model-and-storage.md` when reasoning about persistence, migrations, import/export, and ID semantics.
- Use `editor-mechanics.md` for user-facing behavior and interaction semantics.
