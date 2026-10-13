import { useEffect, useState } from "react";
import type { SessionLogEntry } from "../../shared";
import { api } from "../api";
import { DIRECTION_LABELS } from "../directions";
import { formatDateTime, resultText } from "../sessionText";
import { ErrorBox } from "./ErrorBox";
import { ProgressBackup } from "./ProgressBackup";

interface Props {
  /** Starts a repeat of the given session. Rejects if it cannot. */
  onRepeat: (sessionId: string) => Promise<void>;
}

/** The most recent sessions, newest first, each one repeatable. */
export function HistoryPage({ onRepeat }: Props) {
  const [log, setLog] = useState<SessionLogEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.sessionLog().then(setLog, setError);
  }, []);

  const repeat = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await onRepeat(id);
    } catch (e) {
      setError(e);
      setBusy(null);
    }
  };

  if (!log) return error ? <ErrorBox error={error} /> : <p className="muted">Loading…</p>;

  return (
    <div className="history">
      <h2>History</h2>
      <p className="muted">The last 50 sessions are kept, including unfinished sessions. Learning scores are preserved.</p>
      <ProgressBackup />
      <ErrorBox error={error} />
      {log.length === 0 && <p className="muted">No sessions yet.</p>}
      <ol className="log">
        {log.map((entry) => (
          <li key={entry.session.id} className="log-entry">
            <div className="log-head">
              <strong>{entry.modeTitle}</strong>
              <span className="muted">{formatDateTime(entry.session.startedAt)}</span>
              {entry.session.repeatOf && <span className="question-type">Repeated session</span>}
            </div>
            <div>{entry.categoryLabels.join(", ")}</div>
            <div className="muted small">
              {entry.questionTypeLabels ? entry.questionTypeLabels.join(", ") : "All question types"}
              {entry.session.direction && ` · ${DIRECTION_LABELS[entry.session.direction]}`}
            </div>
            <div className="log-foot">
              <span>
                {resultText(entry)}
                {!entry.finishedAt && <span className="muted"> · not finished</span>}
              </span>
              <button type="button" onClick={() => repeat(entry.session.id)} disabled={busy !== null}>
                {busy === entry.session.id ? "Starting…" : "Repeat"}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
