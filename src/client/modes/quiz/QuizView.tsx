import { useRef, useState } from "react";
import type { QuizQuestion, QuizResponse, SubmitAnswerResponse } from "../../../shared";
import { DIRECTION_LABELS } from "../../directions";
import { ErrorBox } from "../../pages/ErrorBox";
import type { QuestionViewProps } from "../types";

export function QuizView({ question, direction, submit, next, isLast }: QuestionViewProps<QuizQuestion, QuizResponse>) {
  const [answer, setAnswer] = useState("");
  const [optionIndex, setOptionIndex] = useState<number | null>(null);
  const [result, setResult] = useState<SubmitAnswerResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  const germanFirst = direction !== "en-de";
  const choiceSide = question.type === "multiple-choice" ? (germanFirst ? question.de : question.en) : null;
  const prompt = question.type === "fill-in-the-blank" ? question.prompt
    : question.type === "translation" ? (germanFirst ? question.de : question.en) : choiceSide!.prompt;
  const ready = question.type === "multiple-choice" ? optionIndex !== null : answer.trim().length > 0;

  const check = async () => {
    if (!ready || sending.current || result) return;
    sending.current = true;
    setBusy(true); setError(null);
    try {
      const response: QuizResponse = question.type === "multiple-choice"
        ? { type: question.type, optionIndex: optionIndex! } : { type: question.type, answer };
      setResult(await submit(response));
    } catch (e) { setError(e); }
    finally { sending.current = false; setBusy(false); }
  };

  return (
    <form className="quiz-card" onSubmit={(e) => { e.preventDefault(); void check(); }}>
      {question.type !== "fill-in-the-blank" && <p className="muted small">{DIRECTION_LABELS[direction ?? "de-en"]}</p>}
      <h2 className="quiz-prompt">{prompt}</h2>
      {choiceSide ? (
        <fieldset className="quiz-options" disabled={busy || result !== null}>
          <legend>Choose the correct translation</legend>
          {choiceSide.options.map((option, index) => <label key={index} className="quiz-option">
            <input type="radio" name="answer" value={index} checked={optionIndex === index} onChange={() => setOptionIndex(index)} />
            <span>{option}</span>
          </label>)}
        </fieldset>
      ) : (
        <>
          <p id="answer-hint" className="muted small">{question.type === "translation" ? "Translate the whole sentence. Jev checks meaning and grammar; natural alternative wording is accepted." : "Type only the missing word or phrase. Match the expected answer exactly, including capitalization, punctuation, accents, and spaces."}</p>
          <label className="quiz-answer">Your answer
            <input autoFocus value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={busy || result !== null}
              aria-describedby="answer-hint" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </label>
        </>
      )}
      <ErrorBox error={error} />
      {result && <div className="quiz-feedback" role="status">
        <strong>{result.grade?.correct ? "Correct" : "Incorrect"}</strong>
        <p>{result.grade?.feedback}</p>
        <span className="muted">{result.pointsAwarded} / {result.pointsPossible} points</span>
      </div>}
      <div className="actions">
        {result ? <button type="button" className="primary" onClick={next} autoFocus>{isLast ? "Finish" : "Next"}</button>
          : <button type="submit" className="primary" disabled={!ready || busy}>{busy ? (question.type === "translation" ? "Checking with Jev…" : "Checking…") : "Check answer"}</button>}
      </div>
    </form>
  );
}
