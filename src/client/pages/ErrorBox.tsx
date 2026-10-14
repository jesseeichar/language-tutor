import { ApiRequestError } from "../api";

interface Props {
  error: unknown;
  /** Offers a Retry button that repeats the failed action. */
  onRetry?: () => void;
  /** Disables Retry while the action is already running again. */
  busy?: boolean;
}

export function ErrorBox({ error, onRetry, busy = false }: Props) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const details = error instanceof ApiRequestError ? error.details : [];
  return (
    <div className="error-box" role="alert">
      <strong>{message}</strong>
      {onRetry && <button type="button" className="retry" onClick={onRetry} disabled={busy}>Retry</button>}
      {details.length > 0 && (
        <ul>
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
