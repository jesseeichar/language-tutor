import type { ModeSummary, SessionSummary } from "../../shared";

interface Props {
  mode: ModeSummary;
  summary: SessionSummary;
  onAgain: () => void;
  onHome: () => void;
}

export function SummaryPage({ mode, summary, onAgain, onHome }: Props) {
  return (
    <div className="summary">
      <h2>{mode.title}: done</h2>
      {summary.session.graded ? (
        <p className="big">
          {summary.correct} / {summary.answered} correct · {summary.pointsAwarded} of {summary.pointsPossible} points
        </p>
      ) : (
        <p className="big">
          Studied {summary.answered} of {summary.totalQuestions} cards
        </p>
      )}
      {!summary.session.graded && <p className="muted">Study sessions are not graded. Every card is worth 0 points.</p>}
      <div className="actions">
        <button type="button" className="primary" onClick={onAgain}>
          Another session
        </button>
        <button type="button" onClick={onHome}>
          All modes
        </button>
      </div>
    </div>
  );
}
