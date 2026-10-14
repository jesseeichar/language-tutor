import { describe, expect, test } from "bun:test";
import type { Category } from "../../shared";
import { chooseList, enabledLists, loadListChoice, membership, saveListChoice } from "./lists";

const categories: Category[] = [
  { id: "vocab-time", label: "Time", group: "Vokabular" },
  { id: "needs-work", label: "Needs work", group: "Lists", isList: true },
  { id: "tricky", label: "Tricky", group: "Lists", isList: true },
  { id: "tricky-child", label: "Tricky child", group: "Lists", parent: "tricky" },
  { id: "grandchild", label: "Grandchild", group: "Lists", parent: "tricky-child" },
];

describe("lists", () => {
  test("only categories flagged as lists are offered", () => {
    expect(enabledLists(categories).map((c) => c.id)).toEqual(["needs-work", "tricky"]);
  });

  test("membership is direct, inherited through descendants, or none", () => {
    expect(membership(["vocab-time", "tricky"], "tricky", categories)).toEqual({ kind: "direct" });
    expect(membership(["grandchild"], "tricky", categories)).toEqual({ kind: "inherited", via: ["Grandchild"] });
    expect(membership(["tricky-child", "grandchild"], "tricky", categories)).toEqual({ kind: "inherited", via: ["Tricky child", "Grandchild"] });
    expect(membership(["vocab-time"], "tricky", categories)).toEqual({ kind: "none" });
    // A direct assignment wins even when the card is also included through a child.
    expect(membership(["tricky", "tricky-child"], "tricky", categories)).toEqual({ kind: "direct" });
  });

  test("the remembered list is used when available, then Needs work, then the first list", () => {
    const lists = enabledLists(categories);
    expect(chooseList(lists, "tricky")!.id).toBe("tricky");
    expect(chooseList(lists, "gone")!.id).toBe("needs-work");
    expect(chooseList(lists, null)!.id).toBe("needs-work");
    expect(chooseList(lists.filter((l) => l.id !== "needs-work"), "gone")!.id).toBe("tricky");
    expect(chooseList([], "tricky")).toBeNull();
  });

  test("the choice round-trips through storage", () => {
    expect(loadListChoice()).toBeNull();
    saveListChoice("tricky");
    expect(loadListChoice()).toBe("tricky");
  });
});
