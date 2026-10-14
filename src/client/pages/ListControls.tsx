import { useEffect, useRef, useState } from "react";
import type { Category } from "../../shared";
import { ErrorBox } from "./ErrorBox";
import { chooseList, enabledLists, loadListChoice, membership, saveListChoice } from "./lists";
import type { ListMembership } from "./useListMembership";

interface Props {
  modeId: string;
  questionId: string;
  lists: ListMembership;
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const PLUS = "M8 3v10M3 8h10";
const CHECK = "M3 8.5l3 3 7-7";
const CHEVRON = "M4 6l4 4 4-4";

/**
 * A split control under a card: the first icon adds the card to the remembered list (a checkmark
 * removes it again once the card is directly in that list); the chevron opens a menu of every
 * list, and picking one adds or removes the card there and makes it the remembered list.
 */
export function ListControls({ modeId, questionId, lists }: Props) {
  const { snapshot, pending, error, retry, setMembership } = lists;
  const [choice, setChoice] = useState(loadListChoice);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, [open]);

  if (!snapshot) return null;
  const available = enabledLists(snapshot.categories);
  const list = chooseList(available, choice);
  if (!list) return null;
  const question = snapshot.questions.find((q) => q.modeId === modeId && q.id === questionId);
  const stateOf = (listId: string) => membership(question?.categories ?? [], listId, snapshot.categories);
  const state = stateOf(list.id);
  const direct = state.kind === "direct";

  const toggle = (target: Category) => {
    setChoice(target.id);
    saveListChoice(target.id);
    setOpen(false);
    setMembership({ modeId, questionId, categoryId: target.id, member: stateOf(target.id).kind !== "direct" });
  };

  return (
    // Keys pressed inside the control belong to it, not to the flashcard shortcuts on window.
    <div className="list-controls" ref={root} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") setOpen(false); }}>
      <span className="list-split">
        <button
          type="button"
          className={`icon-button ${direct ? "is-member" : ""}`}
          aria-pressed={direct}
          aria-label={direct ? `Remove from ${list.label}` : `Add to ${list.label}`}
          disabled={pending}
          onClick={() => toggle(list)}
        >
          <Icon d={direct ? CHECK : PLUS} />
        </button>
        <button type="button" className="icon-button" aria-label="Choose list" aria-haspopup="menu" aria-expanded={open} disabled={pending} onClick={() => setOpen(!open)}>
          <Icon d={CHEVRON} />
        </button>
        {open && (
          <ul className="list-menu" role="menu" aria-label="Add to list">
            {available.map((l) => {
              const member = stateOf(l.id).kind === "direct";
              return (
                <li key={l.id} role="none">
                  <button type="button" role="menuitemcheckbox" aria-checked={member} onClick={() => toggle(l)}>
                    <span className="list-menu-mark">{member && <Icon d={CHECK} />}</span>
                    {l.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </span>
      <span className="muted small" aria-live="polite">
        {list.label}
        {state.kind === "inherited" && ` · via ${state.via.join(", ")}`}
      </span>
      <ErrorBox error={error} onRetry={retry ?? undefined} busy={pending} />
    </div>
  );
}
