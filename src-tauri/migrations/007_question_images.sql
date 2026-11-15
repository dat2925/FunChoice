CREATE TABLE question_images (
    id TEXT PRIMARY KEY CHECK(length(id) = 64),
    bytes BLOB NOT NULL CHECK(length(bytes) BETWEEN 1 AND 5242880)
);
PRAGMA user_version=7;
