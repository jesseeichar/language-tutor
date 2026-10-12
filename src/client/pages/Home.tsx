import { useEffect, useState } from "react";
import type { ModeSummary } from "../../shared";
import { api } from "../api";
import { getClientMode } from "../modes";
import { ErrorBox } from "./ErrorBox";

export function Home({ onPick }: { onPick: (mode: ModeSummary) => void }) {
  const [modes, setModes] = useState<ModeSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.modes().then(setModes, setError);
  }, []);

  if (error) return <ErrorBox error={error} />;
  if (!modes) return <p className="muted">Loading…</p>;

  const studyTools = modes.filter((m) => !m.graded);
  const quizzes = modes.filter((m) => m.graded);

  const list = (items: ModeSummary[]) => (
    <div className="mode-grid">
      {items.map((m) => {
        const missingView = !getClientMode(m.id);
        return (
          <button
            key={m.id}
            type="button"
            className="mode-card"
            disabled={m.questionCount === 0 || missingView}
            onClick={() => onPick(m)}
          >
            <h3>{m.title}</h3>
            <p>{m.description}</p>
            <span className="muted">
              {missingView ? "No view registered in src/client/modes" : `${m.questionCount} questions`}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <section>
        <h2>Study</h2>
        {studyTools.length > 0 ? list(studyTools) : <p className="muted">No study tools yet.</p>}
      </section>
      <section>
        <h2>Quizzes</h2>
        {quizzes.length > 0 ? list(quizzes) : <p className="muted">No quizzes yet. See CLAUDE.md, "Adding a new mode".</p>}
      </section>
    </>
  );
}
