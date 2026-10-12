import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { MIGRATIONS, migrate } from "./migrations";

const version = (db: Database) => db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;

/** A database as it was after the first `upTo` migrations, with one old session in it. */
function oldDatabase(upTo: number): Database {
  const db = new Database(":memory:");
  for (const sql of MIGRATIONS.slice(0, upTo)) db.run(sql);
  db.run(`PRAGMA user_version = ${upTo}`);
  db.run(`INSERT INTO sessions (id, mode_id, graded, category_ids, question_ids, started_at)
          VALUES ('old', 'm', 0, '["c"]', '["q1"]', '2026-10-01T00:00:00Z')`);
  return db;
}

describe("migrate", () => {
  test("brings a new database to the latest version", () => {
    const db = new Database(":memory:");
    migrate(db);
    expect(version(db)).toBe(MIGRATIONS.length);
  });

  test("is idempotent", () => {
    const db = new Database(":memory:");
    migrate(db);
    migrate(db);
    expect(version(db)).toBe(MIGRATIONS.length);
  });

  test.each([1, 2])("upgrades a version %i database and keeps its sessions", (from) => {
    const db = oldDatabase(from);
    migrate(db);
    expect(version(db)).toBe(MIGRATIONS.length);
    expect(db.query("SELECT id, directions, question_types, repeat_of FROM sessions").get()).toEqual({
      id: "old", directions: "{}", question_types: null, repeat_of: null,
    });
  });
});
