# Build, Test, and Release Reference

## LLM Quick Context
- **Read this when:** you need tooling, local dev flow, CI behavior, and packaging details.
- **Primary source files:** `game_docs/package.json`, `game_docs/vite.config.ts`, `game_docs/electron-builder.json`, `game_docs/.github/workflows/ci.yml`, `game_docs/.github/workflows/build.yml`, `game_docs/vitest.config.ts`.

## Stack and Toolchain
- **Language:** TypeScript.
- **UI:** React 18.
- **Desktop runtime:** Electron 33.
- **Bundler/dev server:** Vite 5 with `vite-plugin-electron`.
- **Tests:** Vitest (unit/integration style) and Playwright dependency present.
- **Native/runtime dependencies:** `better-sqlite3`, `sharp`, `puppeteer-core`, etc.

## Local Development Workflow

### Main scripts (`game_docs/package.json`)
- `npm run dev` -> starts Vite/electron dev flow.
- `npm run build` -> `tsc && vite build && electron-builder`.
- `npm run preview` -> previews renderer build.
- `npm test` -> runs `vitest run` (with `pretest` build step).
- `npm run rebuild:native` -> reinstall native deps for Electron runtime.

### Vite/Electron integration behavior
- `vite.config.ts` clears `dist-electron` on startup.
- Builds both:
  - main process bundle (`dist-electron/main`),
  - preload bundle (`dist-electron/preload`),
  - renderer output (`dist`).
- Marks key native packages external in main build (not bundled into JS).

## Packaging and Distribution

## Configuration sources
- Primary build configuration appears in two places:
  - `package.json` `build` section,
  - `electron-builder.json`.

In practice, this project uses Electron Builder with explicit inclusion of dist outputs, schema, and native modules.

## Packaging outputs
- Release artifacts are placed under `release/<version>/` per `electron-builder.json`.
- Windows NSIS installer is configured with custom behavior/icons.

## Native dependency handling
- `asarUnpack` includes native modules and schema resources so runtime can access:
  - `better-sqlite3`
  - `bindings`
  - `sharp`
  - SQL schema file

## CI/CD Workflows

### `ci.yml` (PR guard/lint helper)
- Trigger: `pull_request_target` on `main`.
- Checks for disallowed lockfile modifications.
- If markdown files changed, runs markdown linting.

### `build.yml` (push build matrix)
- Trigger: push to `main` (with path ignores).
- Matrix build on macOS, Ubuntu, Windows.
- Steps:
  - checkout,
  - setup Node 18,
  - install deps,
  - `npm run build`,
  - upload `release/` artifacts.

## Test Configuration Notes
- `vitest.config.ts` is present for test runtime.
- `pretest` build step means tests run against built artifacts assumptions.
- Playwright dependency and `test/e2e.spec.ts` indicate E2E capability, but primary scripted test path remains Vitest.

## Operational Caveats
- Native modules can fail if local environment/toolchain mismatches Electron ABI; `rebuild:native` is the recovery path.
- Build config duplication (`package.json` + `electron-builder.json`) can drift over time if changed in only one location.
- CI workflows are oriented to basic safeguards and build validation, not exhaustive static analysis.
- Current `tsc` can fail on known legacy nullability errors in `Editor.tsx` unrelated to packaging plumbing.

## New Runtime Features Affecting Build/Packaging
- Attachment/template features add DB tables and migrations, but no extra external service dependency.
- In-app PDF viewing is implemented using Electron runtime window rendering (no additional system PDF SDK step).

## Practical Commands (Reference)
- Install: `npm install`
- Dev: `npm run dev`
- Test: `npm test`
- Production package: `npm run build`
