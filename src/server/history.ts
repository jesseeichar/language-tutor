/**
 * Builds what the API reports about a session: the end-of-session summary
 * and the session log. Pure functions over stored data and current content.
 */
import { getMode, pointsFor, type SessionInfo, type SessionLogEntry, type SessionSummary } from "../shared";
import type { Content } from "./content";
import type { StoredSession } from "./db";

export interface SessionTotals {
  answered: number;
  correct: number;
  pointsAwarded: number;
}

export function toSessionInfo(s: StoredSession): SessionInfo {
  const { id, modeId, graded, categoryIds, questionTypes, direction, repeatOf, startedAt } = s;
  return { id, modeId, graded, categoryIds, questionTypes, direction, repeatOf, startedAt };
}

/** Points the whole session was worth. Questions removed from the data since count as 0. */
function pointsPossible(session: StoredSession, content: Content): number {
  const mode = getMode(session.modeId);
  if (!mode) return 0;
  const questions = new Map((content.questions.get(session.modeId) ?? []).map((q) => [q.id, q]));
  return session.questionIds.reduce((sum, id) => {
    const q = questions.get(id);
    return sum + (q ? pointsFor(mode, q) : 0);
  }, 0);
}

export function summarize(session: StoredSession, totals: SessionTotals, content: Content): SessionSummary {
  return {
    session: toSessionInfo(session),
    totalQuestions: session.questionIds.length,
    answered: totals.answered,
    correct: session.graded ? totals.correct : null,
    pointsAwarded: totals.pointsAwarded,
    pointsPossible: pointsPossible(session, content),
  };
}

export function logEntry(session: StoredSession, totals: SessionTotals, content: Content): SessionLogEntry {
  const categoryLabels = new Map(content.categories.map((c) => [c.id, c.label]));
  const typeLabels = new Map((content.questionTypes.get(session.modeId) ?? []).map((t) => [t.id, t.label]));
  return {
    ...summarize(session, totals, content),
    modeTitle: getMode(session.modeId)?.title ?? session.modeId,
    finishedAt: session.finishedAt,
    categoryLabels: session.categoryIds.map((id) => categoryLabels.get(id) ?? id),
    questionTypeLabels: session.questionTypes?.map((id) => typeLabels.get(id) ?? id) ?? null,
  };
}
