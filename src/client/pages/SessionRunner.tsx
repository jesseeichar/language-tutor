import { useCallback, useState } from "react";
import type { CreateSessionResponse, ModeSummary, SessionSummary } from "../../shared";
import { api } from "../api";
import { getClientMode } from "../modes";
import { ErrorBox } from "./ErrorBox";

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
  const clientMode = getClientMode(session.modeId);
  const question = questions[index];
  const typeLabel = mode.questionTypes.find((t) => t.id === question?.type)?.label;

  const finish = useCallback(async () => {
    try {
      onFinished(await api.finishSession(session.id));
    } catch (e) {
      setError(e);
    }
  }, [session.id, onFinished]);

  const next = useCallback(() => {
    if (index + 1 >= questions.length) void finish();
    else setIndex(index + 1);
  }, [index, questions.length, finish]);

  const submit = useCallback(
    (response: unknown) => api.submitAnswer(session.id, question!.id, response),
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
        <button type="button" className="link" onClick={finish}>
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
        isLast={index + 1 === questions.length}
      />
    </div>
  );
}
