import { useCallback, useEffect, useRef, useState } from "react";
import { cardSides, type FlashcardQuestion, type FlashcardResponse } from "../../../shared";
import { DIRECTION_LABELS } from "../../directions";
import type { QuestionViewProps } from "../types";

/** Front first; reveal once, then review studied cards with the arrow keys. */
export function FlashcardView({ question, direction, submit, next, previous, submission, isLast, tools }: QuestionViewProps<FlashcardQuestion, FlashcardResponse>) {
  const sides = cardSides(question, direction);
  const [flipped, setFlipped] = useState(!!submission);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(!!submission);

  const flip = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    setError(null);
    setFlipped(true);
    // Ungraded: this only records that the card was studied.
    submit({ revealed: true }).catch((e: Error) => {
      submitted.current = false;
      setFlipped(false);
      setError(e.message);
    });
  }, [submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Form controls (including the list dropdown) keep their own arrow and Enter handling.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      // Let focused buttons handle their own activation, including Previous and End session.
      if (e.target instanceof Element && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        previous?.();
      } else if (!flipped && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        flip();
      } else if (flipped && (e.key === "Enter" || e.key === "ArrowRight")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flipped, flip, next, previous]);

  return (
    <div className="flashcard-wrap">
      <button
        type="button"
        className={`flashcard ${flipped ? "is-flipped" : ""}`}
        onClick={flip}
        aria-label={flipped ? "Card answer" : "Show answer"}
      >
        <div className="flashcard-side-label">
          {flipped ? "Answer" : "Question"}
          {sides.direction && <span className="flashcard-direction"> · {DIRECTION_LABELS[sides.direction]}</span>}
        </div>
        <div className="flashcard-front">{sides.front}</div>
        {flipped && (
          <>
            <hr />
            <div className="flashcard-back">{sides.back}</div>
            {question.notes && <div className="flashcard-notes">{question.notes}</div>}
          </>
        )}
      </button>

      {tools}
      {error && <p className="error">Could not record this card: {error}</p>}

      <div className="actions">
        <button type="button" onClick={previous} disabled={!previous}>
          Previous <kbd>←</kbd>
        </button>
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
