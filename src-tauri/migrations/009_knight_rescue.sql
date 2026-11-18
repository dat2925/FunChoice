CREATE TABLE IF NOT EXISTS knight_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    classroom_id TEXT NOT NULL REFERENCES classrooms(id),
    revision INTEGER NOT NULL,
    snapshot TEXT NOT NULL CHECK(json_valid(snapshot)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS knight_sessions_classroom ON knight_sessions(classroom_id, updated_at DESC);
PRAGMA user_version=9;
