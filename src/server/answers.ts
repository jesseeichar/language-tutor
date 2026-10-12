import { isDeepStrictEqual } from "node:util";
import { getMode, pointsFor, SubmitAnswerRequestSchema, type SubmitAnswerResponse } from "../shared";
import type { Content } from "./content";
import type { ProgressStore } from "./progress";

export class AnswerError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: string[]) { super(message); }
}

/** Identical retries read the committed result; a changed answer must never rewrite a grade. */
function previousResult(store: ProgressStore, sessionId: string, questionId: string, response: unknown): SubmitAnswerResponse | undefined {
  const attempt = store.getAttempt(sessionId, questionId);
  if (!attempt) return;
  if (!isDeepStrictEqual(attempt.response, response)) throw new AnswerError(`Question ${questionId} was already answered differently`, 409);
  const grade = attempt.grade ?? (attempt.correct === null ? null : {
    correct: attempt.correct,
    score: attempt.pointsPossible ? attempt.pointsAwarded / attempt.pointsPossible : Number(attempt.correct),
  });
  return { grade, pointsAwarded: attempt.pointsAwarded, pointsPossible: attempt.pointsPossible };
}

export async function recordAnswer(store: ProgressStore, sessionId: string, body: unknown, content: () => Promise<Content>): Promise<SubmitAnswerResponse> {
  const session = store.getSession(sessionId);
  if (!session) throw new AnswerError(`No session ${sessionId}`, 404);
  const parsed = SubmitAnswerRequestSchema.safeParse(body);
  if (!parsed.success) throw new AnswerError("Invalid request", 400, parsed.error.issues.map((i) => i.message));
  const { questionId } = parsed.data;
  if (!session.questionIds.includes(questionId)) throw new AnswerError(`Question ${questionId} is not part of this session`, 400);
  const previous = previousResult(store, sessionId, questionId, parsed.data.response);
  if (previous) return previous;
  if (session.finishedAt) throw new AnswerError("Session is already finished", 409);
  const mode = getMode(session.modeId);
  if (!mode) throw new AnswerError(`Mode ${session.modeId} is no longer registered`, 500);
  const response = mode.responseSchema.safeParse(parsed.data.response);
  if (!response.success) throw new AnswerError("Invalid response for this mode", 400, response.error.issues.map((i) => i.message));
  const question = (await content()).questions.get(mode.id)?.find((q) => q.id === questionId);

  // The content read yields: another answer or finish may have committed while we waited.
  // No awaits occur between these checks and the synchronous atomic store update.
  const concurrent = previousResult(store, sessionId, questionId, response.data);
  if (concurrent) return concurrent;
  if (store.getSession(sessionId)!.finishedAt) throw new AnswerError("Session is already finished", 409);
  if (!question) throw new AnswerError(`Question ${questionId} no longer exists in data/questions/${mode.id}.json`, 409);
  const pointsPossible = session.questionPoints?.[questionId] ?? pointsFor(mode, question);
  const grade = mode.graded ? mode.grade(question, response.data, session.directions[questionId] ?? null) : null;
  const pointsAwarded = grade ? grade.score * pointsPossible : 0;
  store.recordAttempt({ sessionId, modeId: mode.id, questionId, response: response.data,
    correct: grade ? grade.correct : null, pointsAwarded, pointsPossible, grade,
    direction: session.directions[questionId] ?? null, refs: question.refs });
  return { grade, pointsAwarded, pointsPossible };
}
