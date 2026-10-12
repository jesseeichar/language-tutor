import { useCallback, useEffect, useRef, useState } from "react";
import type { FlashcardQuestion, FlashcardResponse } from "../../../shared";
import type { QuestionViewProps } from "../types";

/** Front first; click, Space or Enter flips. After flipping, Enter or → moves on. */
export function FlashcardView({ question, submit, next, isLast }: QuestionViewProps<FlashcardQuestion, FlashcardResponse>) {
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);

  const flip = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    setFlipped(true);
    // Ungraded: this only records that the card was studied.
    submit({ revealed: true }).catch((e: Error) => setError(e.message));
  }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        flip();
      } else if (flipped && (e.key === "Enter" || e.key === "ArrowRight")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, flip, next]);

  return (
    <div className="flashcard-wrap">
      <button
        type="button"
        className={`flashcard ${flipped ? "is-flipped" : ""}`}
        onClick={flip}
        aria-label={flipped ? "Card answer" : "Show answer"}
      >
        <div className="flashcard-side-label">{flipped ? "Answer" : "Question"}</div>
        <div className="flashcard-front">{question.front}</div>
        {flipped && (
          <>
            <hr />
            <div className="flashcard-back">{question.back}</div>
            {question.notes && <div className="flashcard-notes">{question.notes}</div>}
          </>
        )}
      </button>

      {error && <p className="error">Could not record this card: {error}</p>}

      <div className="actions">
        {!flipped ? (
          <button type="button" className="primary" onClick={flip}>
            Flip <kbd>Space</kbd>
          </button>
        ) : (
          <button type="button" className="primary" onClick={next} autoFocus>
            {isLast ? "Finish" : "Next"} <kbd>→</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
