import { useRef, useState } from "react";
import type { SubmitAnswerResponse, WorksheetQuestion } from "../../../shared";
import { ErrorBox } from "../../pages/ErrorBox";
import type { QuestionViewProps } from "../types";
import { WorksheetItem } from "./WorksheetItem";

type Answers = Record<string, string | { word: string; sentence: string }>;
export function WorksheetView({ question, submit, next, isLast }: QuestionViewProps<WorksheetQuestion, { answers: Answers }>) {
  const [answers, setAnswers] = useState<Answers>({});
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const ready = question.items.every(item => {
    const value = answers[item.id];
    return typeof value === "string" ? !!value.trim() : !!value?.word.trim() && !!value?.sentence.trim();
  });
  const check = async () => {
    if (!ready || sending.current || result) return;
    sending.current = true; setBusy(true); setError(null);
    try { setResult(await submit({ answers })); }
    catch (e) { setError(e); }
    finally { sending.current = false; setBusy(false); }
  };
  return <form className="worksheet" onSubmit={e => { e.preventDefault(); void check(); }}>
    <h2>{question.title}</h2>
    <p className="worksheet-instructions">{question.instructions}</p>
    {question.wordBank && <p className="worksheet-bank">{question.wordBank.join(" – ")}</p>}
    {question.example && <aside className="worksheet-example"><strong>Beispiel</strong><p>{question.example}</p></aside>}
    {question.items.some(i => i.kind === "writing") && <p className="muted small">Jev checks the task requirements and German grammar. Valid alternative answers are accepted.</p>}
    {question.items.every(i => i.kind === "personal") && <p className="muted small">Personal choices are checked for completion only.</p>}
    {question.items.map((item, index) => <WorksheetItem key={item.id} item={item} number={index + 1}
      value={answers[item.id]} disabled={busy || !!result} onChange={value => setAnswers(current => ({ ...current, [item.id]: value }))} />)}
    <ErrorBox error={error} />
    {result && <div className="quiz-feedback" role="status">
      <strong>{result.grade?.correct ? "Correct" : result.pointsAwarded > 0 ? "Partly correct" : "Incorrect"}</strong>
      <p>{result.grade?.feedback}</p><span>{result.pointsAwarded} / {result.pointsPossible} points</span>
    </div>}
    <div className="actions">
      {result ? <button type="button" className="primary" onClick={next}>{isLast ? "Finish worksheet" : "Next exercise"}</button>
        : <button type="submit" className="primary" disabled={!ready || busy}>{busy ? "Checking exercise…" : "Check exercise"}</button>}
    </div>
  </form>;
}
