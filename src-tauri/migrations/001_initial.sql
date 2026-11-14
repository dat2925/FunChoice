CREATE TABLE schools (
 id TEXT PRIMARY KEY, name TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE TABLE classrooms (
 id TEXT PRIMARY KEY, school_id TEXT NOT NULL REFERENCES schools(id),
 name TEXT NOT NULL, name_key TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE UNIQUE INDEX class_name ON classrooms(school_id,name_key) WHERE deleted=0;
CREATE TABLE students (
 id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id),
 full_name TEXT NOT NULL, student_code TEXT,
 character_variant INTEGER NOT NULL CHECK(character_variant BETWEEN 0 AND 23),
 is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
);
CREATE INDEX student_class ON students(classroom_id);
CREATE TABLE game_sessions (
 id TEXT PRIMARY KEY, classroom_id TEXT NOT NULL REFERENCES classrooms(id),
 school_name TEXT NOT NULL, classroom_name TEXT NOT NULL,
 target_count INTEGER NOT NULL CHECK(target_count>0),
 selection_mode TEXT NOT NULL CHECK(selection_mode IN ('random','cycle','weighted')),
 settings TEXT NOT NULL, cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
 started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 finished_at TEXT
);
CREATE UNIQUE INDEX one_pending ON game_sessions((1)) WHERE finished_at IS NULL;
CREATE INDEX session_class ON game_sessions(classroom_id, started_at DESC);
CREATE TABLE selection_results (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES game_sessions(id),
 student_id TEXT NOT NULL REFERENCES students(id), full_name TEXT NOT NULL, student_code TEXT,
 reset_cycle INTEGER NOT NULL DEFAULT 0 CHECK(reset_cycle IN (0,1)),
 selection_order INTEGER NOT NULL CHECK(selection_order>0), selected_at TEXT,
 UNIQUE(session_id,student_id), UNIQUE(session_id,selection_order)
);
CREATE INDEX result_student ON selection_results(student_id,selected_at);
CREATE TABLE cycle_members (
 classroom_id TEXT NOT NULL REFERENCES classrooms(id),
 student_id TEXT NOT NULL REFERENCES students(id),
 PRIMARY KEY(classroom_id,student_id)
);
PRAGMA application_id=1397705812;
PRAGMA user_version=1;

