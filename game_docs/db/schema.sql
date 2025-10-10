-- GameDocs SQLite schema (FTS5-ready)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  type TEXT,
  parent_id TEXT REFERENCES objects(id),
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_objects_game_parent ON objects(game_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_objects_game_name ON objects(game_id, name);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  file_path TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  name TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_images_object ON images(object_id);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS object_tags (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  tag_id TEXT NOT NULL REFERENCES tags(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  UNIQUE(object_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_object_tags_object ON object_tags(object_id);
CREATE INDEX IF NOT EXISTS idx_object_tags_tag ON object_tags(tag_id);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_object ON notes(object_id);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  setting_name TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS link_tags (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  object_id TEXT NOT NULL REFERENCES objects(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS tag_links (
  tag_id TEXT NOT NULL REFERENCES link_tags(id),
  object_id TEXT NOT NULL REFERENCES objects(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  PRIMARY KEY (tag_id, object_id)
);
CREATE INDEX IF NOT EXISTS idx_tag_links_object ON tag_links(object_id);

-- Virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS fts_objects USING fts5(
  name, description, tags, game_id UNINDEXED
);


