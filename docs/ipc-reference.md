# IPC Reference

## LLM Quick Context
- **Read this when:** you need to understand which renderer actions map to which main-process operations.
- **Primary source files:** `game_docs/electron/main/index.ts`, `game_docs/src/components/Editor.tsx`, `game_docs/src/components/ProjectSetup.tsx`, `game_docs/src/components/PlaceMap.tsx`, `game_docs/src/utils/logger.ts`, `game_docs/src/utils/ipc.ts`.
- **Scope note:** this document covers `gamedocs:*` channels plus update channels in `update.ts`.

## IPC Contract Shape
- Renderer uses `window.ipcRenderer.invoke(channel, ...args)` for request/response.
- Renderer uses `window.ipcRenderer.send(channel, ...args)` for fire-and-forget events.
- Main process registers handlers with `ipcMain.handle` and event listeners with `ipcMain.on`.

## Channel Inventory by Domain

### Campaign bootstrap and navigation
- `gamedocs:list-campaigns` -> list active campaigns (`ProjectSetup`).
- `gamedocs:create-campaign` -> create campaign + root object + folders (`ProjectSetup`, `utils/ipc`).
- `gamedocs:open-campaign` -> open editor window for campaign (`ProjectSetup`).
- `gamedocs:get-campaign` -> fetch campaign row (`Editor`).
- `gamedocs:get-root` -> fetch/create campaign root object (`Editor`).
- `gamedocs:open-map` -> open map window (`Editor` command).
- `gamedocs:focus-editor-select` -> focus editor and queue object selection (map/editor integration).
- `gamedocs:editor-ready` (send/on) -> signals editor can receive pending selection.
- `gamedocs:select-object` (main -> renderer event) -> async object selection push.

### Object tree and content lifecycle
- `gamedocs:get-parent`
- `gamedocs:list-children`
- `gamedocs:get-latest-child`
- `gamedocs:get-object`
- `gamedocs:create-category`
- `gamedocs:move-object`
- `gamedocs:delete-object-cascade`
- `gamedocs:rename-object`
- `gamedocs:update-object-type`
- `gamedocs:update-object-description`
- `gamedocs:object-has-content`
- `gamedocs:set-object-locked`

Used heavily by `Editor` for tree navigation, create/move/delete flows, and autosave.

### Linking graph and tag-link operations
- `gamedocs:list-objects-for-fuzzy`
- `gamedocs:get-objects-by-name-with-paths`
- `gamedocs:create-link-tag`
- `gamedocs:add-link-target`
- `gamedocs:remove-link-target`
- `gamedocs:delete-link-tag`
- `gamedocs:delete-tag-link`
- `gamedocs:list-link-targets`
- `gamedocs:list-owner-tags`
- `gamedocs:list-incoming-links`
- `gamedocs:get-or-create-tag-for-target`
- `gamedocs:create-object-and-link-tag` (present in main; currently commented out in renderer flow)

### Images and preview payloads
- `gamedocs:choose-image`
- `gamedocs:add-image`
- `gamedocs:list-images`
- `gamedocs:set-default-image`
- `gamedocs:rename-image`
- `gamedocs:delete-image`
- `gamedocs:open-image-external`
- `gamedocs:open-image-window`
- `gamedocs:get-file-dataurl`
- `gamedocs:get-object-preview`
- `gamedocs:cleanup-missing-images`

### File attachments and document opening
- `gamedocs:choose-attachment-file`
- `gamedocs:add-attachment`
- `gamedocs:list-object-attachments`
- `gamedocs:list-tag-attachments`
- `gamedocs:set-main-attachment`
- `gamedocs:delete-attachment`
- `gamedocs:move-tag-attachments-to-object`
- `gamedocs:remove-tag-attachments`
- `gamedocs:open-file-default`
- `gamedocs:open-pdf-window`

### Template library and instances
- `gamedocs:seed-default-templates`
- `gamedocs:list-templates`
- `gamedocs:save-template`
- `gamedocs:delete-template`
- `gamedocs:create-template-instance`
- `gamedocs:list-template-instances`
- `gamedocs:update-template-instance-values`
- `gamedocs:delete-template-instance`

### Search and command palette support
- `gamedocs:quick-search` -> SQL-backed quick search for objects/tags.
- `gamedocs:has-places` -> capability check before map actions.
- `gamedocs:get-place-graph` -> map data source (`PlaceMap`).

### Settings and logging
- `gamedocs:get-setting`
- `gamedocs:set-setting`
- `gamedocs:log-event`
- `gamedocs:get-logs`

Called by `Editor` (UI settings), `logger.ts`, and supporting flows.

### Export, import, backup, filesystem reveal
- `gamedocs:export-to-html`
- `gamedocs:export-to-pdf`
- `gamedocs:export-to-share`
- `gamedocs:import-from-share`
- `gamedocs:create-backup`
- `gamedocs:choose-database-file`
- `gamedocs:import-from-backup`
- `gamedocs:reveal-path`
- `gamedocs:write-to-clipboard`

### Campaign-level maintenance
- `gamedocs:rename-campaign`
- `gamedocs:delete-campaign`

## Non-`gamedocs` Update Channels
From `electron/main/update.ts`:
- **invoke handlers:** `check-update`, `start-download`, `quit-and-install`
- **main -> renderer events:** `update-can-available`, `update-error`, `download-progress`, `update-downloaded`

## Renderer Callers Map
- `ProjectSetup.tsx`: campaign list/open/create/import/share-import/backup/restore/rename/delete.
- `Editor.tsx`: dominant caller for nearly all content, links, images, exports, settings, and map launch.
- `PlaceMap.tsx`: place graph retrieval (and optional focus-editor flow).
- `utils/logger.ts`: settings-backed logging config and log writes.

## Operational Notes for LLMs
- IPC is effectively the app service layer; most business logic lives in main handlers.
- Many handlers open DB, run operation, and close DB inside each call.
- The stable API surface for renderer features is `gamedocs:*`; changes here have broad downstream impact.
