CREATE TABLE exams (
    id TEXT PRIMARY KEY,
    classroom_id TEXT NOT NULL REFERENCES classrooms(id),
    title TEXT NOT NULL,
    questions TEXT NOT NULL CHECK(json_valid(questions) AND json_type(questions) = 'array'),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX exams_class_updated ON exams(classroom_id, updated_at DESC);
PRAGMA user_version=6;
