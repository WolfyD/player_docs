-- GameDocs SQLite schema (FTS5-ready)

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_types_name_ci ON types(lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS type_tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_type_tags_name_ci ON type_tags(lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS type_tag_connections (
  type_id TEXT NOT NULL REFERENCES types(id),
  type_tag_id TEXT NOT NULL REFERENCES type_tags(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  PRIMARY KEY (type_id, type_tag_id)
);
CREATE INDEX IF NOT EXISTS idx_type_tag_connections_tag ON type_tag_connections(type_tag_id);

CREATE TABLE IF NOT EXISTS campaign_hidden_types (
  game_id TEXT NOT NULL REFERENCES games(id),
  type_id TEXT NOT NULL REFERENCES types(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, type_id)
);
CREATE INDEX IF NOT EXISTS idx_campaign_hidden_types_type ON campaign_hidden_types(type_id);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other',
  type_id TEXT REFERENCES types(id),
  parent_id TEXT REFERENCES objects(id),
  description TEXT,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_objects_game_parent ON objects(game_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_objects_game_name ON objects(game_id, name);
CREATE INDEX IF NOT EXISTS idx_objects_type_id ON objects(type_id);

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

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  object_id TEXT REFERENCES objects(id),
  tag_id TEXT REFERENCES link_tags(id),
  file_path TEXT NOT NULL,
  name TEXT,
  mime TEXT,
  ext TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL,
  CHECK (object_id IS NOT NULL OR tag_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_attachments_object ON attachments(object_id);
CREATE INDEX IF NOT EXISTS idx_attachments_tag ON attachments(tag_id);
CREATE INDEX IF NOT EXISTS idx_attachments_game ON attachments(game_id);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  style_css TEXT,
  fields_json TEXT NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS template_instances (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id),
  template_id TEXT NOT NULL REFERENCES templates(id),
  values_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_template_instances_object ON template_instances(object_id);
CREATE INDEX IF NOT EXISTS idx_template_instances_template ON template_instances(template_id);

-- Logs table for event logging
CREATE TABLE IF NOT EXISTS logs (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  event_type TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('debug', 'info', 'warn', 'error')),
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT, -- JSON string with event data
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_game_created ON logs(game_id, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_event_type ON logs(event_type);
CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);

-- Virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS fts_objects USING fts5(
  name, description, tags, game_id UNINDEXED
);


