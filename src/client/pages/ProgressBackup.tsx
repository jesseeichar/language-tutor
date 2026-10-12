import { useRef, useState } from "react";
import { api } from "../api";
import { ErrorBox } from "./ErrorBox";

export function ProgressBackup() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const backup = async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api.backupProgress();
      setMessage(`Progress backed up to ${result.remote}/${result.branch}.`);
    } catch (e) {
      setError(e);
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <section className="progress-backup" aria-label="Progress backup">
      <button type="button" className="primary" onClick={backup} disabled={busy}>
        {busy ? "Backing up…" : "Back up progress"}
      </button>
      <p className="muted small">Commits your saved progress and pushes the current branch to Git.</p>
      {message && <p role="status">{message}</p>}
      <ErrorBox error={error} />
    </section>
  );
}
