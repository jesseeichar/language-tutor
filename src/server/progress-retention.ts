import type { ProgressData } from "./progress-schema";

/** Mutates already validated data; creation order breaks timestamp ties consistently. */
export function retainRecentSessions(data: ProgressData): boolean {
  if (data.sessions.length <= 50) return false;
  data.sessions = data.sessions.slice(-50);
  const retained = new Set(data.sessions.map(session => session.id));
  const archived = new Map((data.archivedQuestionHistory ?? []).map(entry => [JSON.stringify([entry.modeId, entry.questionId]), entry]));
  data.attempts = data.attempts.filter(attempt => {
    if (retained.has(attempt.sessionId)) return true;
    const key = JSON.stringify([attempt.modeId, attempt.questionId]);
    const entry = archived.get(key) ?? { modeId: attempt.modeId, questionId: attempt.questionId, timesSeen: 0, lastSeen: attempt.answeredAt };
    entry.timesSeen++;
    if (attempt.answeredAt > entry.lastSeen) entry.lastSeen = attempt.answeredAt;
    archived.set(key, entry);
    return false;
  });
  data.archivedQuestionHistory = [...archived.values()];
  for (const session of data.sessions) {
    // Repeat uses the session's own question/direction snapshot, not its original session.
    if (session.repeatOf !== null && !retained.has(session.repeatOf)) session.repeatOf = null;
  }
  return true;
}
