# Building PlayerDocs

This guide explains the exact build flow for this repository.

## Repository Layout (Important)

The Electron app is inside the `game_docs` folder.

- Repo root: `player_docs/`
- App root: `player_docs/game_docs/`

Most build commands must be run from `game_docs`, not from the repository root.

## Prerequisites

- Node.js 18+ (Node 18 is used in CI)
- npm
- Windows/macOS/Linux supported for development

## 1) Install dependencies

From repo root:

```bash
cd game_docs
npm install
```

If native modules fail after install (for example `better-sqlite3` or `sharp`), run:

```bash
npm run rebuild:native
```

## 2) Run in development

```bash
npm run dev
```

What this does:
- starts Vite for the renderer
- builds/runs Electron main + preload via `vite-plugin-electron`
- opens the desktop app

## 3) Run tests

```bash
npm test
```

Notes:
- `pretest` runs `vite build --mode=test` first
- tests use Vitest (`vitest run`)

## 4) Build production artifacts

```bash
npm run build
```

Build script:

```text
tsc && vite build && electron-builder
```

This performs:
1. TypeScript compile
2. Renderer + Electron bundle build
3. Electron packaging/installer creation

Feature-specific notes:
- File attachment and template support are database-backed; no extra external services are required.
- Inline PDF viewing uses `pdfjs-dist` in the renderer (no separate system PDF SDK install step).

## 5) Output locations

From `game_docs/`:

- `dist/` -> built renderer assets
- `dist-electron/` -> built Electron main/preload
- `release/<version>/` -> packaged app artifacts (installer/bundles)

## Common Confusion Points

- **Wrong directory:** if `npm run build` fails from repo root, switch to `game_docs/`.
- **Native dependency errors:** run `npm run rebuild:native`.
- **No installer found:** check `game_docs/release/<version>/`.
- **Dev app not loading:** verify Node version and that `npm install` completed in `game_docs/`.
- **TypeScript strict null errors in `Editor.tsx`:** some known legacy nullability errors can fail `tsc` until they are cleaned up.

## CI behavior (for reference)

- Build workflow runs on push to `main` across macOS/Ubuntu/Windows.
- CI uses Node 18 and runs:
  - `npm install`
  - `npm run build`

