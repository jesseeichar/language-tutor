import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryProblems, modes, type Category, type ContentEdit, type EditorSnapshot } from "../shared";
import { loadContent, type Content } from "./content";
import { replaceFile } from "./atomic-file";

export class ContentEditError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

type Change = ContentEdit["change"];
type QuestionChange = Extract<Change, { modeId: string }>;

function categoryId(label: string, categories: Category[]): string {
  const slug = label.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = `custom-${slug || "category"}`;
  let id = base;
  for (let n = 2; categories.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

/** The question's categories after the change. List membership touches one assignment; everything else is kept. */
function nextCategories(change: QuestionChange, current: readonly string[], categories: readonly Category[]): string[] {
  if (change.kind === "assign-categories") {
    if (change.categoryIds.some((id) => !categories.some((c) => c.id === id))) throw new ContentEditError("Select existing categories.", 400);
    return change.categoryIds;
  }
  const list = categories.find((c) => c.id === change.categoryId);
  if (!list?.isList) throw new ContentEditError("Choose a category that is shown in flashcard lists.", 400);
  const others = current.filter((id) => id !== change.categoryId);
  if (!change.member && others.length === 0) throw new ContentEditError("A question needs at least one category. Assign another one before removing this list.", 400);
  return change.member ? [...others, change.categoryId] : others;
}

export class ContentEditor {
  private saving = false;
  constructor(private readonly dataDir: string) {}

  private files(): Map<string, string | null> {
    const names = ["categories.json", "vocabulary.json", "grammar-topics.json", ...modes.map((m) => `questions/${m.id}.json`)];
    return new Map(names.map((name) => {
      const path = join(this.dataDir, name);
      return [name, existsSync(path) ? readFileSync(path, "utf8") : null];
    }));
  }

  private revision(files: Map<string, string | null>): string {
    return createHash("sha256").update(JSON.stringify([...files])).digest("hex");
  }

  private assertRevision(revision: string): void {
    if (this.revision(this.files()) !== revision) throw new ContentEditError("Content changed since you loaded it. Reload the editor and try again.");
  }

  private snapshot(content: Content, revision: string): EditorSnapshot {
    const questions = modes.flatMap((mode) => (content.questions.get(mode.id) ?? []).map((q) => ({
      id: q.id, modeId: mode.id, modeTitle: mode.title, type: q.type, categories: q.categories,
      preview: mode.questionPreview?.(q) ?? q.id,
    })));
    const usage = Object.fromEntries(content.categories.map((c) => [c.id, {
      questions: questions.filter((q) => q.categories.includes(c.id)).length,
      words: content.words.filter((w) => w.categories.includes(c.id)).length,
      topics: content.topics.filter((t) => t.categories.includes(c.id)).length,
      children: content.categories.filter((child) => child.parent === c.id).length,
    }]));
    return { revision, categories: content.categories, questions, usage };
  }

  async read(): Promise<EditorSnapshot> {
    const revision = this.revision(this.files());
    const content = await loadContent(this.dataDir);
    this.assertRevision(revision);
    return this.snapshot(content, revision);
  }

  private editQuestion(change: QuestionChange, content: Content, raw: { questions: { id: string; categories: string[] }[] }): boolean {
    const question = content.questions.get(change.modeId)?.find((q) => q.id === change.questionId);
    if (!question) throw new ContentEditError("This question no longer exists.", 404);
    const categories = nextCategories(change, question.categories, content.categories);
    const same = categories.length === question.categories.length && categories.every((id, i) => id === question.categories[i]);
    if (same) return false;
    // Change only category assignments; retain mode-specific fields and file metadata verbatim.
    raw.questions = raw.questions.map((q) => q.id === change.questionId ? { ...q, categories } : q);
    question.categories = categories;
    return true;
  }

  private editCategories(change: Exclude<Change, QuestionChange>, content: Content, categories: Category[], revision: string): void {
    if (change.kind === "create-category") {
      categories.push({ id: categoryId(change.category.label, categories), ...change.category });
    } else {
      const index = categories.findIndex((c) => c.id === change.id);
      if (index < 0) throw new ContentEditError("This category no longer exists.", 404);
      if (change.kind === "delete-category") {
        const usage = this.snapshot(content, revision).usage[change.id]!;
        if (Object.values(usage).some((count) => count > 0)) {
          throw new ContentEditError("This category is still used by questions, words, topics, or child categories. Reassign them before deleting it.");
        }
        categories.splice(index, 1);
      } else {
        // Optional fields the form left out are cleared, not inherited from the previous definition.
        const { parent, description, isList, ...previous } = categories[index]!;
        categories[index] = { ...previous, ...change.category };
      }
    }
    const problems = categoryProblems(categories);
    if (problems.length) throw new ContentEditError(problems.join(" "), 400);
    content.categories = categories;
  }

  async edit(input: ContentEdit): Promise<EditorSnapshot> {
    if (this.saving) throw new ContentEditError("Another content save is running. Please try again.");
    this.saving = true;
    try {
      this.assertRevision(input.revision);
      const content = await loadContent(this.dataDir);
      this.assertRevision(input.revision);
      const files = this.files();
      const change = input.change;
      const name = "modeId" in change ? `questions/${change.modeId}.json` : "categories.json";
      const raw = JSON.parse(files.get(name)!);
      if ("modeId" in change) {
        // An unchanged membership (e.g. adding a card twice) is a successful no-op without a write.
        if (!this.editQuestion(change, content, raw)) return this.snapshot(content, input.revision);
      } else {
        this.editCategories(change, content, raw.categories, input.revision);
      }
      const text = `${JSON.stringify(raw, null, 2)}\n`;
      replaceFile(join(this.dataDir, name), text, () => this.assertRevision(input.revision));
      files.set(name, text);
      return this.snapshot(content, this.revision(files));
    } finally {
      this.saving = false;
    }
  }
}
