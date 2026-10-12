import type { SessionSummary } from "../shared";

/** One line describing how a session went, worded the same on the summary screen and in the log. */
export function resultText(s: SessionSummary): string {
  if (s.session.graded) {
    return `${s.correct ?? 0} / ${s.answered} correct · ${s.pointsAwarded} of ${s.pointsPossible} points`;
  }
  return `Studied ${s.answered} of ${s.totalQuestions} cards`;
}

/** "12 Oct 2026, 14:05" in the browser's locale. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
