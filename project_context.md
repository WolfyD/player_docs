## DnD World & Campaign Manager — Project Context

### Vision
Build a fast, flexible desktop tool for TTRPG worldbuilding and campaign management. Users create and organize interconnected entries (people, cities, factions, myths, places, etc.) in an entirely user-defined hierarchy, link any text to one or more entries, and navigate/edit with a fluid, keyboard-centric UI.

### Core Principles
- **Flexibility over prescription**: No fixed taxonomy. Any object can contain folders/collections of arbitrary types.
- **Human-friendly + durable**: Readable inline links with stable IDs; soft-deletes; explicit audit fields.
- **Performance**: Snappy editing, scalable search (FTS5), thumbnail generation for images, and lazy loading for large worlds.
- **Desktop-first**: Tauri/Electron app with local SQLite database and filesystem-stored media.

### Object & Hierarchy Model
- **Objects**: Every entry is an object with a frozen ID, name, optional type, and optional parent.
- **Folders/Collections**: Represented as normal objects (e.g., type = `Folder` or custom). Any direct child folder becomes a menu item in the UI. Non-folder objects do not appear as menu items but remain linkable in text.
- **Parent-only derivation**: Store `parent_id`; compute children by query (avoid duplicating `children`).

### Identifiers
- **Object ID format**: `UUID_object_name` (e.g., `d731f0c8_beowulf`).
  - The ID is frozen at creation; renaming the object does not change its ID.
- **Inline link token ID**: `tag_<shortid>` used in text like `[[label|tag_22f0cdd]]`.

### Inline Linking
- Links are embedded in descriptions using `[[label|tag_id]]` to keep text human-readable and diff-safe.
- Multi-target links are supported: a single `tag_id` can point to one or more objects.
- No automatic linking; the editor can suggest matches when text matches existing object names.
- On click of a multi-linked span, show a chooser of targets. Right-click exposes actions (Add/Edit links). Shift+click jumps to the first target.
- The editor maintains a synchronized mapping table so that adding/removing tags in text updates the database and avoids stale relationships.

### Media & Thumbnails
- Images are stored locally; each object may have a default image and additional images in a gallery.
- Thumbnails are generated on import with a max dimension of 350px (scaled by the larger side) and stored separately for fast rendering.
- The default image is shown in hover previews and as the main image in the object view.

### Storage & Project Layout
- **Project folder**: User-chosen directory at first run or install. The app prompts to select a GameDocs folder and populates it.
  - Suggested layout:
    - `world.db` (SQLite database)
    - `images/` (originals; may be grouped by object or flat)
    - `thumbs/` (generated thumbnails)
    - `backups/` (periodic DB backups)
    - `export/` (optional JSON/zip exports)

### Database Schema (SQLite, soft-delete on all tables)
All tables include `created_at`, `updated_at`, and `deleted_at` (NULL = active). Times are ISO 8601 UTC strings.

- `games`
  - Fields: `id` (TEXT, PK), `name`, timestamps, `deleted_at`
  - Purpose: Separate worlds/campaigns; only current game’s data is visible.

- `objects`
  - Fields: `id` (TEXT, PK, frozen), `game_id` (FK games.id), `name` (TEXT), `type` (TEXT), `parent_id` (FK objects.id), `description` (TEXT), timestamps, `deleted_at`
  - Indexes: `(game_id, parent_id)`, `(game_id, name)`
  - Notes: `description` stores inline tokens like `[[label|tag_xxx]]`.

- `images`
  - Fields: `id` (TEXT, PK), `object_id` (FK objects.id), `file_path` (TEXT), `thumb_path` (TEXT), `name` (TEXT), `is_default` (0/1), timestamps, `deleted_at`
  - Indexes: `(object_id)`
  - Invariant: At most one default per object (enforced in UI/transactions).

- `tags`
  - Fields: `id` (TEXT, PK), `name` (TEXT, UNIQUE), timestamps, `deleted_at`
  - Purpose: Global metadata tagging for search/organization (not inline link tokens).

- `object_tags`
  - Fields: `id` (TEXT, PK), `object_id` (FK objects.id), `tag_id` (FK tags.id), timestamps, `deleted_at`
  - Indexes: `(object_id)`, `(tag_id)`, `UNIQUE(object_id, tag_id)`

- `notes`
  - Fields: `id` (TEXT, PK), `object_id` (FK objects.id), `content` (TEXT), timestamps, `deleted_at`
  - Purpose: Per-object notes; notes are linked to their object.

- `settings`
  - Fields: `id` (TEXT, PK), `setting_name` (UNIQUE), `setting_value` (TEXT/JSON), timestamps, `deleted_at`
  - Purpose: Color palettes, shortcut keys, startup password, etc.

- `link_tags` (registry of inline link token IDs that appear in text)
  - Fields: `id` (TEXT, PK; e.g., `tag_22f0cdd`), `game_id` (FK games.id), timestamps, `deleted_at`

- `tag_links` (mapping from a link token to one or more target objects)
  - Fields: `tag_id` (FK link_tags.id), `object_id` (FK objects.id), `created_at`, `deleted_at`
  - PK: `(tag_id, object_id)`; Index: `(object_id)`

- `fts_objects` (FTS5 virtual table)
  - Columns: `name`, `description`, `tags`, `game_id UNINDEXED`
  - Maintained by app logic; `tags` column is aggregated object tag names for searching.

### Search
- Primary search via SQLite FTS5 across object `name`, optional `description`, and aggregated tag names.
- Scoped by `game_id` to restrict results to the current campaign.

### Editor & UX
- **Create-from-link wizard**: Name → Parent (fuzzy dropdown) → Pictures → Description → Done. Only Name and Parent are required.
- **Inline linking UX**: Select text → context menu → link to one or many objects; show suggestions on name match; multi-link spans open a target chooser on click; right-click shows Add/Edit; Shift+click opens the first target.
- **Menus**: Any direct child folder (object of folder/collection type) becomes a menu item; selecting it lists its children. Non-folder items don’t appear in menus.
- **Attachments**: Default image shown prominently; additional images appear as thumbnails under the main image; thumbnails are generated and cached.
- **Navigation**: Fully keyboard navigable, drag-and-drop to move entities, right-click for new/rename/delete/duplicate, VS Code-like Command Palette.

### Keyboard Shortcuts (defaults; all reassignable except Escape)
- Ctrl + N → new entity under current folder
- Enter → open selected entity
- Ctrl + Shift + N → new folder
- Ctrl + F → quick search by name
- [[ → insert link
- Ctrl + I → attach image
- Ctrl + D → duplicate entity
- Alt + ← / → → navigate back/forward
- F2 → rename
- Ctrl + K or / → global quick search / command palette
- Rules: Character shortcuts always require a modifier; Escape is reserved for closing.

### Performance & Scale
- Designed to handle large datasets (millions of lines across descriptions). Use FTS5, virtualized lists, lazy loading, and thumbnailing.
- Soft deletes by default; filters always exclude `deleted_at IS NOT NULL` unless explicitly requested.

### Open/Implementation Considerations
- Cascade behavior for soft-deletes (children, images, notes, tag_links) should be handled at the application layer via transactions.
- Folder objects can also hold content (description/images) if desired; UI will treat them primarily as containers while still renderable.
- Thumbnail generation happens on import and on demand when missing; failures fall back to scaled original.
- Settings store an overridable keybinding map and UI preferences; Escape remains unbindable.

### Example Inline Link
`The city of [[Breah|tag_6f2c1a]] is ruled by [[Hrothgar|tag_7b9e40]].`  
`tag_6f2c1a → {Breah object_id}`  
`tag_7b9e40 → {Hrothgar object_id, (optionally others)}`

### DB schema (concise)
-- games
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

-- objects (self-referencing; scoped by game)
CREATE TABLE objects (
  id TEXT PRIMARY KEY,                -- e.g. d731f0c8_beowulf (frozen)
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  type TEXT,                          -- freeform: Person, City, Folder, etc.
  parent_id TEXT REFERENCES objects(id),
  description TEXT,                   -- stores inline tags like [[person|tag_22f0cdd]]
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX idx_objects_game_parent ON objects(game_id, parent_id);
CREATE INDEX idx_objects_game_name ON objects(game_id, name);

-- images
CREATE TABLE images (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  file_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  name TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,  -- 0/1
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX idx_images_object ON images(object_id);

-- tags (metadata tags for search/organization; scoped by game)
CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  UNIQUE(name)
);

-- object_tags (metadata tags ↔ objects)
CREATE TABLE object_tags (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  UNIQUE(object_id, tag_id)
);
CREATE INDEX idx_object_tags_object ON object_tags(object_id);
CREATE INDEX idx_object_tags_tag ON object_tags(tag_id);

-- notes (per-object)
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX idx_notes_object ON notes(object_id);

-- settings (key/value)
CREATE TABLE settings (
  id TEXT PRIMARY KEY,
  setting_name TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,        -- JSON/text for palettes, keybinds, etc.
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

-- inline linking tokens embedded in text, plus external mapping for multi-target links
CREATE TABLE link_tags (
  id TEXT PRIMARY KEY,                -- e.g. tag_22f0cdd (appears in [[label|id]])
  game_id TEXT NOT NULL REFERENCES games(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE link_targets (
  link_id TEXT NOT NULL REFERENCES link_tags(id),
  object_id TEXT NOT NULL REFERENCES objects(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  PRIMARY KEY (link_id, object_id)
);
CREATE INDEX idx_link_targets_object ON link_targets(object_id);

-- Optional FTS5 (contentless; maintain via app logic)
CREATE VIRTUAL TABLE fts_objects USING fts5(
  name, description, tags, game_id UNINDEXED
);
-- Populate/update fts_objects with:
-- name = objects.name, description = objects.description,
-- tags = space-joined tag names for the object, game_id = objects.game_id