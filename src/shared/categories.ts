import type { Category } from "./content";

/** The given ids plus all of their descendants. Unknown ids are kept as-is. */
export function expandCategories(selected: Iterable<string>, all: readonly Category[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const c of all) {
    if (!c.parent) continue;
    const list = children.get(c.parent) ?? [];
    list.push(c.id);
    children.set(c.parent, list);
  }
  const result = new Set<string>();
  const stack = [...selected];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

export function matchesCategories(questionCategories: readonly string[], expanded: Set<string>): boolean {
  return questionCategories.some((c) => expanded.has(c));
}

/** A category tree must be acyclic so every category remains reachable from a root. */
export function categoryProblems(categories: readonly Category[]): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const problems: string[] = [];
  if (byId.size !== categories.length) problems.push("Category ids must be unique.");
  for (const category of categories) {
    const seen = new Set([category.id]);
    let parent = category.parent;
    while (parent) {
      if (!byId.has(parent)) { problems.push(`Category "${category.label}" has an unknown parent.`); break; }
      if (seen.has(parent)) { problems.push(`Category "${category.label}" would create a parent cycle.`); break; }
      seen.add(parent);
      parent = byId.get(parent)!.parent;
    }
  }
  return problems;
}
