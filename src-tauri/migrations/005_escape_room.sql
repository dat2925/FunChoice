CREATE TABLE escape_sessions (
    id TEXT PRIMARY KEY,
    classroom_id TEXT NOT NULL REFERENCES classrooms(id),
    status TEXT NOT NULL CHECK(status IN ('not_started','playing','paused','completed','failed','abandoned')),
    started_at TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision >= 0),
    snapshot TEXT NOT NULL CHECK(json_valid(snapshot))
);
CREATE UNIQUE INDEX escape_active_class ON escape_sessions(classroom_id) WHERE status IN ('playing','paused');
CREATE INDEX escape_history ON escape_sessions(started_at DESC);
PRAGMA user_version=5;
