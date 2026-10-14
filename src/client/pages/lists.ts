/**
 * Flashcard lists are ordinary categories flagged `isList`. These helpers decide which lists
 * exist, how a card belongs to one, and which list the learner last picked. The pick is a
 * browser-local convenience; list definitions and memberships live in the shared content files.
 */
import { expandCategories, type Category } from "../../shared";

/** The list every data set starts with; the first fallback when no list was remembered. */
export const NEEDS_WORK_ID = "needs-work";

export type Membership =
  | { kind: "direct" }
  /** Included because the card belongs to a descendant of the list; `via` names those categories. */
  | { kind: "inherited"; via: string[] }
  | { kind: "none" };

export function enabledLists(categories: readonly Category[]): Category[] {
  return categories.filter((c) => c.isList === true);
}

/** How a card belongs to a list. Only a direct assignment can be toggled by the list button. */
export function membership(questionCategories: readonly string[], listId: string, categories: readonly Category[]): Membership {
  if (questionCategories.includes(listId)) return { kind: "direct" };
  const descendants = expandCategories([listId], categories);
  const via = questionCategories
    .filter((id) => id !== listId && descendants.has(id))
    .map((id) => categories.find((c) => c.id === id)?.label ?? id);
  return via.length > 0 ? { kind: "inherited", via } : { kind: "none" };
}

/** The remembered list when it is still enabled, otherwise Needs work, otherwise the first list. */
export function chooseList(lists: readonly Category[], remembered: string | null): Category | null {
  return lists.find((l) => l.id === remembered) ?? lists.find((l) => l.id === NEEDS_WORK_ID) ?? lists[0] ?? null;
}

const KEY = "language-tutor:list";

export function loadListChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveListChoice(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Remembering the choice is only a convenience.
  }
}
