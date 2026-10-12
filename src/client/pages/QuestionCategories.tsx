import { useState } from "react";
import type { ContentEdit, EditorSnapshot } from "../../shared";
import { CheckboxGroup } from "./CheckboxGroup";

interface Props {
  question: EditorSnapshot["questions"][number];
  data: EditorSnapshot;
  busy: boolean;
  onDirty: () => void;
  onSave: (change: ContentEdit["change"]) => void;
}

export function QuestionCategories({ question, data, busy, onDirty, onSave }: Props) {
  const [selected, setSelected] = useState(new Set(question.categories));
  const groups = [...new Set(data.categories.map((c) => c.group))];
  return (
    <form className="editor-form" onSubmit={(e) => {
      e.preventDefault();
      onSave({ kind: "assign-categories", modeId: question.modeId, questionId: question.id, categoryIds: [...selected] });
    }}>
      <h3>Question categories</h3>
      <p className="question-preview">{question.preview}</p>
      <p className="muted small">Select one or more categories. Assignments do not change the question or its study history.</p>
      <fieldset disabled={busy}>
        {groups.map((group) => <CheckboxGroup key={group} legend={group}
          items={data.categories.filter((c) => c.group === group).map((c) => ({ id: c.id, label: c.label }))}
          checked={selected} onChange={(ids, on) => {
            setSelected((previous) => {
              const next = new Set(previous);
              for (const id of ids) { if (on) next.add(id); else next.delete(id); }
              return next;
            });
            onDirty();
          }} />)}
        <button className="primary" disabled={selected.size === 0}>{busy ? "Saving…" : "Save assignments"}</button>
      </fieldset>
      {selected.size === 0 && <p className="muted">Select at least one category.</p>}
    </form>
  );
}
