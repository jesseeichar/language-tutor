import { z } from "zod";
import { DirectionChoiceSchema } from "../shared";
import { MAX_STRENGTH, MIN_STRENGTH } from "./scoring";

const id = z.string().min(1);
const timestamp = z.iso.datetime();
const direction = z.enum(["de-en", "en-de"]);
const ids = z.array(id).refine((values) => new Set(values).size === values.length, "duplicate ids");

const SessionSchema = z.strictObject({
  id,
  modeId: id,
  graded: z.boolean(),
  categoryIds: ids,
  questionIds: ids,
  /** Optional for progress saved before graded quizzes captured their point values. */
  questionPoints: z.record(id, z.number().nonnegative()).optional(),
  directions: z.record(id, direction),
  questionTypes: ids.nullable(),
  direction: DirectionChoiceSchema.nullable(),
  repeatOf: id.nullable(),
  startedAt: timestamp,
  finishedAt: timestamp.nullable(),
});

const AttemptSchema = z.strictObject({
  sessionId: id,
  modeId: id,
  questionId: id,
  response: z.json(),
  correct: z.boolean().nullable(),
  pointsAwarded: z.number().nonnegative(),
  pointsPossible: z.number().nonnegative(),
  direction: direction.nullable(),
  answeredAt: timestamp,
  /** Saved so retries return the original feedback, even after question edits. */
  grade: z.strictObject({ correct: z.boolean(), score: z.number().min(0).max(1), feedback: z.string().optional() }).nullable().optional(),
});

const StrengthSchema = z.strictObject({
  itemType: z.enum(["word", "topic"]),
  itemId: id,
  score: z.number().int().min(MIN_STRENGTH).max(MAX_STRENGTH),
  attempts: z.number().int().positive(),
  correct: z.number().int().nonnegative(),
  updatedAt: timestamp,
});

const ProgressSchema = z.strictObject({
  version: z.literal(1),
  sessions: z.array(SessionSchema),
  attempts: z.array(AttemptSchema),
  strengths: z.array(StrengthSchema),
}).superRefine((data, ctx) => {
  const problem = (message: string) => ctx.addIssue({ code: "custom", message });
  const sessions = new Map<string, StoredSession>();
  for (const session of data.sessions) {
    if (sessions.has(session.id)) problem(`duplicate session ${session.id}`);
    // Repeats point backward in creation order, which also prevents cycles.
    if (session.repeatOf !== null && !sessions.has(session.repeatOf)) problem(`invalid repeatOf in session ${session.id}`);
    if (Object.keys(session.directions).some((q) => !session.questionIds.includes(q))) {
      problem(`unknown question in directions for session ${session.id}`);
    }
    if (session.questionPoints && (Object.keys(session.questionPoints).length !== session.questionIds.length ||
      session.questionIds.some((q) => session.questionPoints![q] === undefined) ||
      (!session.graded && Object.values(session.questionPoints).some((points) => points !== 0)))) {
      problem(`invalid point snapshot for session ${session.id}`);
    }
    sessions.set(session.id, session);
  }
  const answers = new Set<string>();
  for (const attempt of data.attempts) {
    const key = JSON.stringify([attempt.sessionId, attempt.questionId]);
    if (answers.has(key)) problem(`duplicate answer for ${attempt.questionId} in session ${attempt.sessionId}`);
    answers.add(key);
    const session = sessions.get(attempt.sessionId);
    if (!session || session.modeId !== attempt.modeId || !session.questionIds.includes(attempt.questionId)) {
      problem(`invalid session or question reference in attempt for ${attempt.questionId}`);
    } else {
      if (attempt.direction !== (session.directions[attempt.questionId] ?? null)) problem(`inconsistent attempt direction for ${attempt.questionId}`);
      if (session.graded !== (attempt.correct !== null)) problem(`inconsistent grading for ${attempt.questionId}`);
    }
    if (attempt.pointsAwarded > attempt.pointsPossible) problem(`awarded points exceed possible points for ${attempt.questionId}`);
    if (attempt.correct === null && (attempt.pointsAwarded !== 0 || attempt.pointsPossible !== 0)) {
      problem(`ungraded attempt has points for ${attempt.questionId}`);
    }
    if (attempt.grade !== undefined && (attempt.grade === null ? attempt.correct !== null :
      attempt.grade.correct !== attempt.correct || Math.abs(attempt.grade.score * attempt.pointsPossible - attempt.pointsAwarded) > 1e-9)) {
      problem(`inconsistent saved grade for ${attempt.questionId}`);
    }
  }
  const strengths = new Set<string>();
  for (const strength of data.strengths) {
    const key = `${strength.itemType}:${strength.itemId}`;
    if (strengths.has(key)) problem(`duplicate strength ${key}`);
    strengths.add(key);
    if (strength.correct > strength.attempts) problem(`correct count exceeds attempts for ${key}`);
  }
});

export type StoredSession = z.infer<typeof SessionSchema>;
export type ProgressData = z.infer<typeof ProgressSchema>;

export function emptyProgress(): ProgressData {
  return { version: 1, sessions: [], attempts: [], strengths: [] };
}

/** Historical ids are validated against the log, never against today's question files. */
export function parseProgress(value: unknown): ProgressData {
  return ProgressSchema.parse(value);
}
