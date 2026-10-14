import { useState } from "react";
import type { ModeSummary } from "../../shared";
import { api } from "../api";
import { clientModes } from "../modes";
import { ErrorBox } from "./ErrorBox";
import { chooseList, enabledLists, loadListChoice, membership, saveListChoice } from "./lists";
import { useListMembership } from "./useListMembership";

interface Props {
  /** Opens the setup screen for `mode` with the list preselected. */
  onStudy: (mode: ModeSummary, listId: string) => void;
  onManage: () => void;
}

/** Browse the cards in each list, drop cards from it, and start studying it. Browsing records nothing. */
export function ListsPage({ onStudy, onManage }: Props) {
  const { snapshot, pending, error, retry, setMembership } = useListMembership(true);
  const [choice, setChoice] = useState(loadListChoice);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<unknown>(null);

  if (!snapshot) return error ? <ErrorBox error={error} onRetry={retry ?? undefined} /> : <p className="muted">Loading…</p>;

  const listModeIds = new Set(clientModes.filter((m) => m.allowLists).map((m) => m.id));
  const cards = snapshot.questions.filter((q) => listModeIds.has(q.modeId));
  const lists = enabledLists(snapshot.categories);
  const list = chooseList(lists, choice);
  const membersOf = (listId: string) =>
    cards.flatMap((card) => {
      const state = membership(card.categories, listId, snapshot.categories);
      return state.kind === "none" ? [] : [{ card, state }];
    });
  const members = list ? membersOf(list.id) : [];
  const needle = search.toLocaleLowerCase();
  const shown = members.filter(({ card }) => card.preview.toLocaleLowerCase().includes(needle));

  const pick = (id: string) => {
    setChoice(id);
    saveListChoice(id);
    setSearch("");
  };

  const study = async () => {
    if (!list) return;
    setStarting(true);
    setStartError(null);
    try {
      const mode = (await api.modes()).find((m) => listModeIds.has(m.id) && m.categories.some((c) => c.id === list.id));
      if (!mode) throw new Error("This list has no flashcards to study yet.");
      onStudy(mode, list.id);
    } catch (e) {
      setStartError(e);
      setStarting(false);
    }
  };

  return (
    <div className="lists">
      <h2>Lists</h2>
      <p className="muted">Lists are categories shown here and under each flashcard. Add cards while studying, then study a list on its own.</p>
      {lists.length === 0 && (
        <p className="muted">
          No lists yet. Turn on “Show in flashcard lists” for a category in{" "}
          <button type="button" className="link" onClick={onManage}>Manage content</button>.
        </p>
      )}
      {list && (
        <>
          <div className="list-picker" role="group" aria-label="Lists">
            {lists.map((l) => (
              <button key={l.id} type="button" aria-pressed={l.id === list.id} onClick={() => pick(l.id)}>
                {l.label} <span className="count">{membersOf(l.id).length}</span>
              </button>
            ))}
          </div>
          <div className="actions">
            <button type="button" className="primary" disabled={members.length === 0 || starting || pending} onClick={study}>
              {starting ? "Starting…" : `Study ${list.label}`}
            </button>
            {members.length === 0 && <span className="muted small">Add flashcards to this list while studying.</span>}
          </div>
          <ErrorBox error={startError} />
          <ErrorBox error={error} onRetry={retry ?? undefined} busy={pending} />
          {members.length > 0 && (
            <label className="list-search">
              Search {list.label}
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          )}
          <ul className="list-members">
            {shown.map(({ card, state }) => (
              <li key={`${card.modeId}:${card.id}`} className="list-member">
                <span className="question-preview">{card.preview}</span>
                {state.kind === "inherited" ? (
                  <span className="muted small">via {state.via.join(", ")}</span>
                ) : (
                  <button type="button" disabled={pending} aria-label={`Remove ${card.preview} from ${list.label}`}
                    onClick={() => setMembership({ modeId: card.modeId, questionId: card.id, categoryId: list.id, member: false })}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
          {members.length > 0 && shown.length === 0 && <p className="muted">No matches.</p>}
        </>
      )}
    </div>
  );
}
