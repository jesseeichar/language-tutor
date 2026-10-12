/**
 * Progress storage in SQLite (bun:sqlite).
 *
 * The questions live in JSON; this database only records what happened:
 * sessions, every answer, and the current strength of each word and topic.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Direction, DirectionChoice, SessionInfo } from "../shared";
import type { QuestionHistory } from "./selection";
import { migrate } from "./migrations";
import { nextStrength } from "./scoring";

export function openDatabase(path: string): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
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
  question_types: string | null;
  direction_choice: string | null;
  repeat_of: string | null;
}

function toStoredSession(row: SessionRow): StoredSession {
  return {
    id: row.id,
    modeId: row.mode_id,
    graded: row.graded === 1,
    categoryIds: JSON.parse(row.category_ids),
    questionIds: JSON.parse(row.question_ids),
    directions: JSON.parse(row.directions),
    questionTypes: row.question_types ? JSON.parse(row.question_types) : null,
    direction: row.direction_choice as DirectionChoice | null,
    repeatOf: row.repeat_of,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
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

  createSession(s: Omit<StoredSession, "id" | "startedAt" | "finishedAt">): StoredSession {
    const session: StoredSession = { ...s, id: crypto.randomUUID(), startedAt: new Date().toISOString(), finishedAt: null };
    this.db
      .query(
        `INSERT INTO sessions (id, mode_id, graded, category_ids, question_ids, directions,
                               question_types, direction_choice, repeat_of, started_at)
         VALUES ($id, $mode, $graded, $cats, $qs, $directions, $types, $choice, $repeatOf, $started)`,
      )
      .run({
        id: session.id,
        mode: session.modeId,
        graded: session.graded ? 1 : 0,
        cats: JSON.stringify(session.categoryIds),
        qs: JSON.stringify(session.questionIds),
        directions: JSON.stringify(session.directions),
        types: session.questionTypes ? JSON.stringify(session.questionTypes) : null,
        choice: session.direction,
        repeatOf: session.repeatOf,
        started: session.startedAt,
      });
    return session;
  }

  getSession(id: string): StoredSession | null {
    const row = this.db.query<SessionRow, { id: string }>("SELECT * FROM sessions WHERE id = $id").get({ id });
    return row ? toStoredSession(row) : null;
  }

  /** Every session, newest first. */
  listSessions(): StoredSession[] {
    return this.db
      .query<SessionRow, []>("SELECT * FROM sessions ORDER BY started_at DESC, rowid DESC")
      .all()
      .map(toStoredSession);
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
