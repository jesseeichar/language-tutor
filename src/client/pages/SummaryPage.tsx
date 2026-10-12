import { useState } from "react";
import type { ModeSummary, SessionSummary } from "../../shared";
import { resultText } from "../sessionText";
import { ErrorBox } from "./ErrorBox";

interface Props {
  mode: ModeSummary;
  summary: SessionSummary;
  onAgain: () => void;
  onRepeat: (sessionId: string) => Promise<void>;
  onHome: () => void;
}

export function SummaryPage({ mode, summary, onAgain, onRepeat, onHome }: Props) {
  const [error, setError] = useState<unknown>(null);

  const repeat = () => {
    setError(null);
    onRepeat(summary.session.id).catch(setError);
  };

  return (
    <div className="summary">
      <h2>{mode.title}: done</h2>
      <p className="big">{resultText(summary)}</p>
      {!summary.session.graded && <p className="muted">Study sessions are not graded. Every card is worth 0 points.</p>}
      <ErrorBox error={error} />
      <div className="actions">
        <button type="button" className="primary" onClick={repeat}>
          Repeat this session
        </button>
        <button type="button" onClick={onAgain}>
          New session
        </button>
        <button type="button" onClick={onHome}>
          All modes
        </button>
      </div>
    </div>
  );
}
