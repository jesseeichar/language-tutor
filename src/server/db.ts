/**
 * Progress storage in SQLite (bun:sqlite).
 *
 * The questions live in JSON; this database only records what happened:
 * sessions, every answer, and the current strength of each word and topic.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Direction, SessionInfo } from "../shared";
import type { QuestionHistory } from "./selection";
import { nextStrength } from "./scoring";

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
];

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const { user_version: current } = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.run(MIGRATIONS[v]!);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

type ItemType = "word" | "topic";

interface SessionRow {
  id: string;
  mode_id: string;
  graded: number;
  category_ids: string;
  question_ids: string;
  started_at: string;
  finished_at: string | null;
  directions: string;
}

export interface StoredSession extends SessionInfo {
  questionIds: string[];
  /** Direction per directional question id. */
  directions: Record<string, Direction>;
  finishedAt: string | null;
}

export interface AttemptInput {
  sessionId: string;
  modeId: string;
  questionId: string;
  response: unknown;
  correct: boolean | null;
  pointsAwarded: number;
  pointsPossible: number;
  /** The direction the question was asked in, or null if it is not directional. */
  direction: Direction | null;
  /** Strength items to update. Only used when correct is not null. */
  refs: { words: string[]; topics: string[] };
}

export class ProgressStore {
  constructor(private readonly db: Database) {}

  createSession(s: {
    modeId: string;
    graded: boolean;
    categoryIds: string[];
    questionIds: string[];
    directions: Record<string, Direction>;
  }): StoredSession {
    const session: StoredSession = {
      id: crypto.randomUUID(),
      modeId: s.modeId,
      graded: s.graded,
      categoryIds: s.categoryIds,
      questionIds: s.questionIds,
      directions: s.directions,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.db
      .query(
        `INSERT INTO sessions (id, mode_id, graded, category_ids, question_ids, directions, started_at)
         VALUES ($id, $mode, $graded, $cats, $qs, $directions, $started)`,
      )
      .run({
        id: session.id,
        mode: session.modeId,
        graded: session.graded ? 1 : 0,
        cats: JSON.stringify(session.categoryIds),
        qs: JSON.stringify(session.questionIds),
        directions: JSON.stringify(session.directions),
        started: session.startedAt,
      });
    return session;
  }

  getSession(id: string): StoredSession | null {
    const row = this.db.query<SessionRow, { id: string }>("SELECT * FROM sessions WHERE id = $id").get({ id });
    if (!row) return null;
    return {
      id: row.id,
      modeId: row.mode_id,
      graded: row.graded === 1,
      categoryIds: JSON.parse(row.category_ids),
      questionIds: JSON.parse(row.question_ids),
      directions: JSON.parse(row.directions),
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    };
  }

  finishSession(id: string): void {
    this.db
      .query("UPDATE sessions SET finished_at = $now WHERE id = $id AND finished_at IS NULL")
      .run({ id, now: new Date().toISOString() });
  }

  hasAttempt(sessionId: string, questionId: string): boolean {
    return (
      this.db
        .query("SELECT 1 FROM attempts WHERE session_id = $s AND question_id = $q")
        .get({ s: sessionId, q: questionId }) !== null
    );
  }

  /** Records an answer and, for graded answers, updates strengths. All in one transaction. */
  recordAttempt(a: AttemptInput): void {
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db
        .query(
          `INSERT INTO attempts (session_id, mode_id, question_id, response, correct, points_awarded, points_possible, direction, answered_at)
           VALUES ($session, $mode, $question, $response, $correct, $awarded, $possible, $direction, $now)`,
        )
        .run({
          session: a.sessionId,
          mode: a.modeId,
          question: a.questionId,
          response: JSON.stringify(a.response),
          correct: a.correct === null ? null : a.correct ? 1 : 0,
          awarded: a.pointsAwarded,
          possible: a.pointsPossible,
          direction: a.direction,
          now,
        });
      if (a.correct === null) return;
      const items: { type: ItemType; id: string }[] = [
        ...a.refs.words.map((id) => ({ type: "word" as const, id })),
        ...a.refs.topics.map((id) => ({ type: "topic" as const, id })),
      ];
      for (const item of items) {
        const current = this.getStrength(item.type, item.id);
        this.db
          .query(
            `INSERT INTO strengths (item_type, item_id, score, attempts, correct, updated_at)
             VALUES ($type, $id, $score, 1, $c, $now)
             ON CONFLICT (item_type, item_id) DO UPDATE SET
               score = $score, attempts = attempts + 1, correct = correct + $c, updated_at = $now`,
          )
          .run({ type: item.type, id: item.id, score: nextStrength(current, a.correct), c: a.correct ? 1 : 0, now });
      }
    })();
  }

  getStrength(type: ItemType, id: string): number {
    const row = this.db
      .query<{ score: number }, { type: string; id: string }>(
        "SELECT score FROM strengths WHERE item_type = $type AND item_id = $id",
      )
      .get({ type, id });
    return row?.score ?? 0;
  }

  /** Keyed "word:<id>" / "topic:<id>", as selection expects. */
  allStrengths(): Map<string, number> {
    const rows = this.db
      .query<{ item_type: string; item_id: string; score: number }, []>("SELECT item_type, item_id, score FROM strengths")
      .all();
    return new Map(rows.map((r) => [`${r.item_type}:${r.item_id}`, r.score]));
  }

  /** Per-question history for one mode, across all sessions. */
  questionHistory(modeId: string): Map<string, QuestionHistory> {
    const rows = this.db
      .query<{ question_id: string; times_seen: number; last_seen: string }, { mode: string }>(
        `SELECT question_id, COUNT(*) AS times_seen, MAX(answered_at) AS last_seen
         FROM attempts WHERE mode_id = $mode GROUP BY question_id`,
      )
      .all({ mode: modeId });
    return new Map(rows.map((r) => [r.question_id, { timesSeen: r.times_seen, lastSeen: r.last_seen }]));
  }

  sessionTotals(sessionId: string): { answered: number; correct: number; pointsAwarded: number; pointsPossible: number } {
    return this.db
      .query<
        { answered: number; correct: number; pointsAwarded: number; pointsPossible: number },
        { s: string }
      >(
        `SELECT COUNT(*) AS answered,
                COALESCE(SUM(correct), 0) AS correct,
                COALESCE(SUM(points_awarded), 0) AS pointsAwarded,
                COALESCE(SUM(points_possible), 0) AS pointsPossible
         FROM attempts WHERE session_id = $s`,
      )
      .get({ s: sessionId })!;
  }
}
