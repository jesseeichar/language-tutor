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
