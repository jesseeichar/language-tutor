/**
 * Remembers the learner's last setup per mode in localStorage. A convenience only:
 * storage may be unavailable (private window), in which case defaults are used.
 */
import { DirectionChoiceSchema, type DirectionChoice } from "../../shared";

export interface SavedSetup {
  categoryIds: string[];
  /** null = never saved, so the caller picks a default. */
  questionTypes: string[] | null;
  direction: DirectionChoice;
}

const key = (modeId: string) => `language-tutor:setup:${modeId}`;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];

/** Returns the saved setup, dropping ids that no longer exist. */
export function loadSetup(modeId: string, available: { categoryIds: Set<string>; questionTypes: Set<string> }): SavedSetup {
  const fallback: SavedSetup = { categoryIds: [], questionTypes: null, direction: "random" };
  try {
    const raw = localStorage.getItem(key(modeId));
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<Record<keyof SavedSetup, unknown>>;
    return {
      categoryIds: strings(saved.categoryIds).filter((id) => available.categoryIds.has(id)),
      questionTypes: Array.isArray(saved.questionTypes) ? strings(saved.questionTypes).filter((id) => available.questionTypes.has(id)) : null,
      direction: DirectionChoiceSchema.catch("random").parse(saved.direction),
    };
  } catch {
    return fallback;
  }
}

export function saveSetup(modeId: string, setup: SavedSetup): void {
  try {
    localStorage.setItem(key(modeId), JSON.stringify(setup));
  } catch {
    // Remembering the choice is only a convenience.
  }
}
