import { isDeepStrictEqual } from "node:util";
import { getMode, pointsFor, SubmitAnswerRequestSchema, type SubmitAnswerResponse } from "../shared";
import type { Content } from "./content";
import type { ProgressStore } from "./progress";
import type { GradingServices } from "./jev";

const pending = new WeakMap<ProgressStore, Map<string, { response: unknown; promise: Promise<SubmitAnswerResponse> }>>();

export class AnswerError extends Error {
  constructor(message: string, public readonly status: number, public readonly details?: string[]) { super(message); }
}

function requireActiveSession(store: ProgressStore, sessionId: string) {
  const session = store.getSession(sessionId);
  if (!session) throw new AnswerError("This session is no longer in the retained history. Start a new session.", 404);
  if (session.finishedAt) throw new AnswerError("Session is already finished", 409);
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

export async function recordAnswer(store: ProgressStore, sessionId: string, body: unknown, content: () => Promise<Content>, services?: GradingServices): Promise<SubmitAnswerResponse> {
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
  let active = pending.get(store);
  if (!active) { active = new Map(); pending.set(store, active); }
  const key = JSON.stringify([sessionId, questionId]);
  const existing = active.get(key);
  if (existing) {
    if (!isDeepStrictEqual(existing.response, response.data)) throw new AnswerError("This question is already being graded with a different answer", 409);
    return existing.promise;
  }
  const evaluate = async (): Promise<SubmitAnswerResponse> => {
    const question = (await content()).questions.get(mode.id)?.find((q) => q.id === questionId);
    requireActiveSession(store, sessionId);
    if (!question) throw new AnswerError(`Question ${questionId} no longer exists in data/questions/${mode.id}.json`, 409);
    const pointsPossible = session.questionPoints?.[questionId] ?? pointsFor(mode, question);
    const grade = mode.graded ? await mode.grade(question, response.data, session.directions[questionId] ?? null, services) : null;

    // Network grading yields too: recheck immediately before the synchronous atomic update.
    const concurrent = previousResult(store, sessionId, questionId, response.data);
    if (concurrent) return concurrent;
    requireActiveSession(store, sessionId);
    const pointsAwarded = grade ? grade.score * pointsPossible : 0;
    store.recordAttempt({ sessionId, modeId: mode.id, questionId, response: response.data,
      correct: grade ? grade.correct : null, pointsAwarded, pointsPossible, grade,
      direction: session.directions[questionId] ?? null, refs: question.refs });
    return { grade, pointsAwarded, pointsPossible };
  };
  const promise = evaluate();
  active.set(key, { response: response.data, promise });
  try { return await promise; }
  finally { active.delete(key); }
}
