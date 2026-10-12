/**
 * Schema migrations for the progress database, tracked with PRAGMA user_version.
 */
import type { Database } from "bun:sqlite";

/** Each entry upgrades the schema by one version. Append only; never edit a shipped migration. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE sessions (
    id            TEXT PRIMARY KEY,
    mode_id       TEXT NOT NULL,
    graded        INTEGER NOT NULL,
    category_ids  TEXT NOT NULL,          -- JSON array of selected category ids
    question_ids  TEXT NOT NULL,          -- JSON array, in the order presented
    started_at    TEXT NOT NULL,
    finished_at   TEXT
  );

  CREATE TABLE attempts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL REFERENCES sessions(id),
    mode_id         TEXT NOT NULL,
    question_id     TEXT NOT NULL,
    response        TEXT NOT NULL,        -- JSON, shape defined by the mode
    correct         INTEGER,              -- NULL in ungraded modes
    points_awarded  REAL NOT NULL,
    points_possible REAL NOT NULL,
    answered_at     TEXT NOT NULL,
    UNIQUE (session_id, question_id)
  );
  CREATE INDEX attempts_by_question ON attempts (mode_id, question_id);

  CREATE TABLE strengths (
    item_type   TEXT NOT NULL CHECK (item_type IN ('word', 'topic')),
    item_id     TEXT NOT NULL,
    score       INTEGER NOT NULL,         -- -10 (very poor) .. 10 (very strong)
    attempts    INTEGER NOT NULL,
    correct     INTEGER NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (item_type, item_id)
  );
  `,
  `
  -- Which way round each directional question was asked: "de-en" or "en-de".
  ALTER TABLE sessions ADD COLUMN directions TEXT NOT NULL DEFAULT '{}';  -- JSON object, question id -> direction
  ALTER TABLE attempts ADD COLUMN direction TEXT;                         -- NULL for non-directional questions
  `,
  `
  -- What the learner chose, so the session log can show it, and which session a repeat replays.
  ALTER TABLE sessions ADD COLUMN question_types TEXT;                    -- JSON array, NULL = all types
  ALTER TABLE sessions ADD COLUMN direction_choice TEXT;                  -- "de-en" | "en-de" | "random", NULL if not directional
  ALTER TABLE sessions ADD COLUMN repeat_of TEXT REFERENCES sessions(id); -- NULL unless this session repeats another
  `,
];

export function migrate(db: Database): void {
  const { user_version: current } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v]!);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}
