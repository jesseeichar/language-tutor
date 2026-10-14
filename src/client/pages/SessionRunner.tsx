import { useCallback, useRef, useState } from "react";
import type { CreateSessionResponse, ModeSummary, SessionSummary, SubmitAnswerResponse } from "../../shared";
import { api } from "../api";
import { getClientMode } from "../modes";
import { ErrorBox } from "./ErrorBox";
import { ListControls } from "./ListControls";
import { useListMembership } from "./useListMembership";

interface Props {
  mode: ModeSummary;
  data: CreateSessionResponse;
  onFinished: (summary: SessionSummary) => void;
}

/** Generic runner: steps through the session and hands each question to the mode's own view. */
export function SessionRunner({ mode, data, onFinished }: Props) {
  const { session, questions } = data;
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [ending, setEnding] = useState(false);
  const pendingAnswer = useRef<Promise<SubmitAnswerResponse> | null>(null);
  const finishing = useRef(false);
  const navigating = useRef(false);
  const submissions = useRef(new Map<string, SubmitAnswerResponse>());
  const clientMode = getClientMode(session.modeId);
  // Membership is read from saved content, so revisiting a card shows what was stored, not what was clicked.
  const lists = useListMembership(clientMode?.allowLists === true);
  const question = questions[index];
  const typeLabel = mode.questionTypes.find((t) => t.id === question?.type)?.label;

  const finish = useCallback(async () => {
    if (pendingAnswer.current || finishing.current) return;
    finishing.current = true;
    setEnding(true); setError(null);
    try {
      onFinished(await api.finishSession(session.id));
    } catch (e) {
      setError(e);
    } finally { finishing.current = false; setEnding(false); }
  }, [session.id, onFinished]);

  const move = useCallback(async (step: -1 | 1) => {
    if (finishing.current || navigating.current || index + step < 0) return;
    navigating.current = true;
    setError(null);
    try {
      // Preserve a navigation request made immediately after Flip until saving completes.
      await pendingAnswer.current;
      if (index + step >= questions.length) await finish();
      else setIndex(index + step);
    } catch (e) { setError(e); }
    finally { navigating.current = false; }
  }, [index, questions.length, finish]);

  const next = useCallback(() => { void move(1); }, [move]);
  const previous = useCallback(() => { void move(-1); }, [move]);

  const submit = useCallback(
    async (response: unknown) => {
      const saved = submissions.current.get(question!.id);
      if (saved) return saved;
      if (pendingAnswer.current || finishing.current) throw new Error("Wait for the current request to finish.");
      setSubmitting(true);
      const request = api.submitAnswer(session.id, question!.id, response);
      pendingAnswer.current = request;
      try {
        const result = await request;
        submissions.current.set(question!.id, result);
        return result;
      }
      finally { pendingAnswer.current = null; setSubmitting(false); }
    },
    [session.id, question],
  );

  if (!clientMode) return <ErrorBox error={new Error(`No view registered for mode "${session.modeId}"`)} />;
  if (!question) return null;
  const View = clientMode.QuestionView;

  return (
    <div className="runner">
      <div className="runner-head">
        <span>{mode.title}</span>
        <span className="muted">
          {index + 1} / {questions.length}
        </span>
        <button type="button" className="link" onClick={finish} disabled={submitting || ending}>
          End session
        </button>
      </div>
      <progress value={index} max={questions.length} />
      <ErrorBox error={error} />
      {typeLabel && <div className="question-type">{typeLabel}</div>}
      <View
        key={question.id}
        question={question}
        direction={data.directions[question.id] ?? null}
        submit={submit}
        next={next}
        previous={clientMode.allowBack && index > 0 ? previous : undefined}
        submission={submissions.current.get(question.id)}
        isLast={index + 1 === questions.length}
        tools={clientMode.allowLists ? <ListControls modeId={session.modeId} questionId={question.id} lists={lists} /> : undefined}
      />
    </div>
  );
}
