import { z } from "zod";
import type { Direction } from "../shared";
import type { QuestionHistory } from "./selection";
import { nextStrength } from "./scoring";
import { ProgressFile } from "./progress-file";
import { parseProgress, type ProgressData, type StoredSession } from "./progress-schema";

export type { StoredSession } from "./progress-schema";
type ItemType = "word" | "topic";

export interface AttemptInput {
  sessionId: string;
  modeId: string;
  questionId: string;
  response: unknown;
  correct: boolean | null;
  pointsAwarded: number;
  pointsPossible: number;
  direction: Direction | null;
  /** Strength items to update. Only used when correct is not null. */
  refs: { words: string[]; topics: string[] };
}

export class ProgressStore {
  private data: ProgressData;
  private readonly file: ProgressFile;

  constructor(path: string | null) {
    this.file = new ProgressFile(path);
    this.data = this.file.load();
  }

  private update(change: (next: ProgressData) => void): void {
    const next = structuredClone(this.data);
    change(next);
    const validated = parseProgress(next);
    this.file.save(validated);
    this.data = validated;
  }

  createSession(s: Omit<StoredSession, "id" | "startedAt" | "finishedAt">): StoredSession {
    const session: StoredSession = { ...s, id: crypto.randomUUID(), startedAt: new Date().toISOString(), finishedAt: null };
    this.update((next) => next.sessions.push(session));
    return structuredClone(session);
  }

  getSession(id: string): StoredSession | null {
    return structuredClone(this.data.sessions.find((s) => s.id === id) ?? null);
  }

  /** Stable sort keeps reverse creation order when timestamps tie. */
  listSessions(): StoredSession[] {
    return structuredClone(this.data.sessions).reverse().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  finishSession(id: string): void {
    if (!this.data.sessions.some((s) => s.id === id && s.finishedAt === null)) return;
    this.update((next) => { next.sessions.find((s) => s.id === id)!.finishedAt = new Date().toISOString(); });
  }

  hasAttempt(sessionId: string, questionId: string): boolean {
    return this.data.attempts.some((a) => a.sessionId === sessionId && a.questionId === questionId);
  }

  /** An answer and all its strength changes are persisted as one atomic update. */
  recordAttempt(a: AttemptInput): void {
    const now = new Date().toISOString();
    this.update((next) => {
      const { refs, response, ...attempt } = a;
      // Reject non-JSON responses instead of silently losing fields on disk.
      next.attempts.push({ ...attempt, response: z.json().parse(response), answeredAt: now });
      if (a.correct === null) return;
      const items = [
        ...refs.words.map((id) => ({ type: "word" as const, id })),
        ...refs.topics.map((id) => ({ type: "topic" as const, id })),
      ];
      for (const item of items) {
        let strength = next.strengths.find((s) => s.itemType === item.type && s.itemId === item.id);
        if (!strength) {
          strength = { itemType: item.type, itemId: item.id, score: 0, attempts: 0, correct: 0, updatedAt: now };
          next.strengths.push(strength);
        }
        strength.score = nextStrength(strength.score, a.correct);
        strength.attempts++;
        strength.correct += a.correct ? 1 : 0;
        strength.updatedAt = now;
      }
    });
  }

  getStrength(type: ItemType, id: string): number {
    return this.data.strengths.find((s) => s.itemType === type && s.itemId === id)?.score ?? 0;
  }

  allStrengths(): Map<string, number> {
    return new Map(this.data.strengths.map((s) => [`${s.itemType}:${s.itemId}`, s.score]));
  }

  questionHistory(modeId: string): Map<string, QuestionHistory> {
    const history = new Map<string, QuestionHistory>();
    for (const a of this.data.attempts) {
      if (a.modeId !== modeId) continue;
      const previous = history.get(a.questionId);
      history.set(a.questionId, {
        timesSeen: (previous?.timesSeen ?? 0) + 1,
        lastSeen: previous && previous.lastSeen > a.answeredAt ? previous.lastSeen : a.answeredAt,
      });
    }
    return history;
  }

  sessionTotals(sessionId: string): { answered: number; correct: number; pointsAwarded: number; pointsPossible: number } {
    return this.data.attempts.filter((a) => a.sessionId === sessionId).reduce((total, a) => ({
      answered: total.answered + 1,
      correct: total.correct + (a.correct ? 1 : 0),
      pointsAwarded: total.pointsAwarded + a.pointsAwarded,
      pointsPossible: total.pointsPossible + a.pointsPossible,
    }), { answered: 0, correct: 0, pointsAwarded: 0, pointsPossible: 0 });
  }
}
