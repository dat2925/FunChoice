ALTER TABLE students ADD COLUMN gender TEXT CHECK(gender IN ('male','female'));
DELETE FROM selection_results WHERE selected_at IS NULL;
PRAGMA user_version=2;
