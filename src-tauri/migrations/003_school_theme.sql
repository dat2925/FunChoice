ALTER TABLE schools ADD COLUMN theme TEXT NOT NULL DEFAULT 'rural' CHECK(theme IN ('rural','city','mountain'));
ALTER TABLE game_sessions ADD COLUMN school_theme TEXT NOT NULL DEFAULT 'rural' CHECK(school_theme IN ('rural','city','mountain'));
PRAGMA user_version=3;
