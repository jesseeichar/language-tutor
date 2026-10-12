/**
 * Pure helpers that decide what goes into a session before selection runs:
 * which questions match the learner's filters, and which way round each
 * directional question is asked.
 */
import { expandCategories, matchesCategories, type Category, type Direction, type DirectionChoice, type QuestionBase } from "../shared";

export interface PoolFilter {
  categoryIds: readonly string[];
  /** Omitted = every type. */
  questionTypes?: readonly string[];
}

/** A data-only bank may no longer contain a mode's preferred types. Fall back to all in that case. */
export function defaultTypes(preferred: readonly string[] | undefined, questions: readonly QuestionBase[]): string[] | undefined {
  const available = new Set(questions.map((q) => q.type));
  const selected = preferred?.filter((type) => available.has(type));
  return selected?.length ? selected : undefined;
}

/** Questions in any selected category (parents include their children) and, if given, of a selected type. */
export function filterPool(questions: readonly QuestionBase[], categories: readonly Category[], filter: PoolFilter): QuestionBase[] {
  const expanded = expandCategories(filter.categoryIds, categories);
  const types = filter.questionTypes ? new Set(filter.questionTypes) : null;
  return questions.filter(
    (q) => matchesCategories(q.categories, expanded) && (types === null || (q.type !== undefined && types.has(q.type))),
  );
}

/** Number of questions per category, counting a parent's descendants too. */
export function countByCategory(questions: readonly QuestionBase[], categories: readonly Category[]): Map<string, number> {
  return new Map(categories.map((c) => [c.id, filterPool(questions, categories, { categoryIds: [c.id] }).length]));
}

/** Resolves the learner's choice into a concrete direction for each directional question. */
export function assignDirections(
  questions: readonly QuestionBase[],
  isDirectional: (q: QuestionBase) => boolean,
  choice: DirectionChoice,
  random: () => number = Math.random,
): Record<string, Direction> {
  const directions: Record<string, Direction> = {};
  for (const q of questions) {
    if (!isDirectional(q)) continue;
    directions[q.id] = choice === "random" ? (random() < 0.5 ? "de-en" : "en-de") : choice;
  }
  return directions;
}
