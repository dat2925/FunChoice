ALTER TABLE classrooms ADD COLUMN question_plan TEXT NOT NULL DEFAULT '{"bank":[],"turns":[]}';

CREATE TABLE selection_results_v4 (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES game_sessions(id),
 student_id TEXT NOT NULL REFERENCES students(id), full_name TEXT NOT NULL, student_code TEXT,
 reset_cycle INTEGER NOT NULL DEFAULT 0 CHECK(reset_cycle IN (0,1)),
 selection_order INTEGER NOT NULL CHECK(selection_order>0), selected_at TEXT,
 UNIQUE(session_id,selection_order)
);
INSERT INTO selection_results_v4 SELECT id,session_id,student_id,full_name,student_code,reset_cycle,selection_order,selected_at FROM selection_results;
DROP TABLE selection_results;
ALTER TABLE selection_results_v4 RENAME TO selection_results;
CREATE INDEX result_student ON selection_results(student_id,selected_at);
PRAGMA user_version=4;
