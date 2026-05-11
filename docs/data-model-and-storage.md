# Data Model and Storage Reference

## LLM Quick Context
- **Read this when:** you need the canonical persistence model and how objects/links/images are stored and moved.
- **Primary source files:** `game_docs/db/schema.sql`, `game_docs/electron/main/db.ts`, `game_docs/electron/main/index.ts`, `game_docs/electron/main/config.ts`.
- **Canonical source:** SQL schema is the authoritative model; renderer types are mostly local/inferred.

## Storage Architecture

### Config storage (app-level)
- Config file: `%LOCALAPPDATA%/PlayerDocs/config.json` on Windows.
- Key field: `projectDir` (selected by user on first run).
- Managed by `readConfig`, `writeConfig`, `ensureProjectScaffold` in `config.ts`.

### Project storage (user-chosen folder)
- `games/` -> campaign asset folders (images/thumbs).
- `backups/` -> backup target default area.
- `export/` -> HTML/PDF export outputs.
- `player_docs.db` -> single SQLite DB file for all campaigns in project.

## Database Boot and Guarantees
- Initialized through `initGameDatabase()` in `db.ts`.
- Pragmas:
  - `journal_mode = WAL`
  - `foreign_keys = ON`
- Schema is applied on open via `db.exec(schemaSql)`.

## Relational Schema Summary

### Core tables
- `games`: campaign root metadata (`id`, `name`, timestamps, `deleted_at` soft delete).
- `objects`: hierarchical content nodes with `parent_id`, `type`, `description`, `locked`.
- `images`: media rows linked to objects; includes original path and thumbnail path.
- `settings`: key/value app settings (`setting_value` is JSON text).
- `logs`: event log stream with `metadata` JSON text.
- `attachments`: generic file attachment rows linked to objects or unlinked-word tags.
- `templates`: template definition records (source tokens, parsed fields JSON, optional style CSS).
- `template_instances`: persisted template field values for inserted blocks per object.

### Link graph tables
- `link_tags`: link token identity (`id`) and owning object (`object_id`).
- `tag_links`: many-to-many mapping from `tag_id` to target `object_id`.

### Present but lightly used in current app flows
- `tags`, `object_tags`, `notes` exist in schema but are not central to current editor linking behavior.

### Search table
- `fts_objects` virtual table exists (`fts5`) but is not the primary quick-search path today.

## ID Conventions (Implemented)

### Game IDs
- Generated with `crypto.randomUUID()` (hyphenated UUID).

### Object IDs
- `generateObjectId(name)`:
  - takes UUID without dashes,
  - keeps first 8 chars,
  - appends slugified name.
- Shape example: `a1b2c3d4_dark_forest`.

### Link tag IDs
- `generateTagId()` returns `tag_` + 8 hex chars.
- Shape example: `tag_1a2b3c4d`.

### Image IDs
- Common path uses UUID without dashes.
- Imported share images are remapped to unique prefixed IDs.

## Description and Linking Data Model

### Description storage
- `objects.description` stores plain text with lightweight inline markup.
- Link token format: `[[Label|tag_id]]`.
- Template marker format: `{{tpl:instance_id}}`.

### Template metadata shape
- `templates.fields_json` supports legacy flat arrays and object payloads.
- Current visual builder writes `version: 3` payloads with `cardClass` and hierarchical `fields`.
- Field entries may include `id`, `type` (`text`, `textarea`, `image`, `attachment`, `div`), `label`, `className`, `required`, `placeholder`, `parentId`, `order`.

### Link resolution model
1. `link_tags.id` identifies the token.
2. `link_tags.object_id` points to the owner object (where the tag is anchored conceptually).
3. `tag_links` maps that `tag_id` to one or more target objects.

This design allows one in-text link token to reference multiple targets (disambiguation in UI).

### Word attachment constraint model
- Unlinked-word attachments are stored on `attachments.tag_id` for tags without targets.
- Once a tag is linked to an object, attachment state transitions to object attachment (move) or deletion (remove).

## Soft Delete vs Hard Delete
- Most standard deletion paths use `deleted_at` (soft-delete semantics in query filters).
- Some import/replace workflows (`import-from-share`, backup restore replacement) perform hard deletes/replacements in controlled transactional flows.

## Filesystem and Media Layout

### Campaign asset folders
- Path pattern: `<projectDir>/games/<campaignName>/`.
- Subfolders:
  - `images/` originals
  - `thumbs/` generated thumbnails

### Image row path strategy
- `images.file_path` and `images.thumb_path` store absolute paths.
- `gamedocs:add-image` copies or downloads source, stores file, and generates thumb.

## Import/Export/Backup Persistence Mechanics

### Share export (`gamedocs:export-to-share`)
- Creates zip archive containing:
  - `manifest.json` (game, objects, linkTags, tagLinks, images metadata),
  - `images/` originals.
- Thumbnails are not embedded; regenerated on import.

### Share import (`gamedocs:import-from-share`)
- Opens zip, extracts temporary directory, reads manifest.
- Optionally confirms overwrite for same game ID.
- Clears existing game-scoped rows in FK-safe order.
- Remaps object/tag/image IDs with random prefix to reduce collisions.
- Rewrites `[[Label|tag]]` references to remapped tag IDs.
- Re-inserts objects, links, images, then regenerates thumbnails.

### DB backup (`gamedocs:create-backup`)
- Copies current `player_docs.db` to user-selected destination.

### DB restore (`gamedocs:import-from-backup`)
- Optionally creates pre-restore backup.
- Replaces active `player_docs.db` with selected database file.

## Settings Persistence Model
- Settings are stored in the `settings` table by unique `setting_name`.
- Values are JSON-serialized strings.
- Key families in active use:
  - `ui.palette`
  - `ui.fonts`
  - `ui.customFont`
  - `ui.shortcuts`
  - `ui.hoverDebounce`
  - `ui.sidebarWidth`
  - `ui.stylingEnabled`
- `ui.exportStyledTemplates`
  - window state keys like `ui.mainWindow`, `ui.mapWindow`
  - logging config key `log_config`

## Known Caveats and Mismatches
- `fts_objects` exists but quick search is currently implemented via SQL `LIKE` query path.
- Schema includes `tags`, `object_tags`, and `notes` that are not central in active editor link UX.
- Some seeded/demo data uses legacy/static ID styles; runtime creation paths use generator functions described above.
