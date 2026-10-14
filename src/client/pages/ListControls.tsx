import { useState } from "react";
import { ErrorBox } from "./ErrorBox";
import { chooseList, enabledLists, loadListChoice, membership, saveListChoice } from "./lists";
import type { ListMembership } from "./useListMembership";

interface Props {
  modeId: string;
  questionId: string;
  lists: ListMembership;
}

/**
 * Quick-add controls shown under a card: pick a destination list, then add the card with one
 * click. Once the card is directly in that list the button becomes a checkmark that removes it.
 * Changing the dropdown only changes the destination.
 */
export function ListControls({ modeId, questionId, lists }: Props) {
  const { snapshot, pending, error, retry, setMembership } = lists;
  const [choice, setChoice] = useState(loadListChoice);
  if (!snapshot) return null;
  const available = enabledLists(snapshot.categories);
  const list = chooseList(available, choice);
  if (!list) return null;
  const question = snapshot.questions.find((q) => q.modeId === modeId && q.id === questionId);
  const state = membership(question?.categories ?? [], list.id, snapshot.categories);
  const direct = state.kind === "direct";

  const pick = (id: string) => {
    setChoice(id);
    saveListChoice(id);
  };

  return (
    <div className="list-controls">
      <label className="small" htmlFor="list-choice">List</label>
      <select id="list-choice" value={list.id} onChange={(e) => pick(e.target.value)}>
        {available.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>
      <button
        type="button"
        className={`list-toggle ${direct ? "is-member" : ""}`}
        aria-pressed={direct}
        aria-label={direct ? `Remove from ${list.label}` : `Add to ${list.label}`}
        disabled={pending}
        onClick={() => setMembership({ modeId, questionId, categoryId: list.id, member: !direct })}
      >
        {direct ? "✓" : "+"}
      </button>
      <span className="muted small" aria-live="polite">
        {direct ? `In ${list.label}` : state.kind === "inherited" ? `In ${list.label} via ${state.via.join(", ")}` : `Not in ${list.label}`}
      </span>
      <ErrorBox error={error} onRetry={retry ?? undefined} busy={pending} />
    </div>
  );
}
