CREATE TABLE game_presets (
    id TEXT PRIMARY KEY NOT NULL,
    classroom_id TEXT NOT NULL REFERENCES classrooms(id),
    title TEXT NOT NULL,
    game TEXT NOT NULL CHECK(json_valid(game) AND json_type(game) = 'object'),
    source_label TEXT NOT NULL,
    questions TEXT NOT NULL CHECK(json_valid(questions) AND json_type(questions) = 'array'),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX game_presets_classroom ON game_presets(classroom_id, updated_at DESC);
PRAGMA user_version=8;
