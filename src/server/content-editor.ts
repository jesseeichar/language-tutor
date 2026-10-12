import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { categoryProblems, modes, type Category, type ContentEdit, type EditorSnapshot } from "../shared";
import { loadContent, type Content } from "./content";
import { replaceFile } from "./atomic-file";

export class ContentEditError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

function categoryId(label: string, categories: Category[]): string {
  const slug = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const base = `custom-${slug || "category"}`;
  let id = base;
  for (let n = 2; categories.some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
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

  async edit(input: ContentEdit): Promise<EditorSnapshot> {
    if (this.saving) throw new ContentEditError("Another content save is running. Please try again.");
    this.saving = true;
    try {
      this.assertRevision(input.revision);
      const content = await loadContent(this.dataDir);
      this.assertRevision(input.revision);
      const files = this.files();
      const change = input.change;
      let name = "categories.json";
      let result: unknown;
      if (change.kind === "assign-categories") {
        const questions = content.questions.get(change.modeId);
        const question = questions?.find((q) => q.id === change.questionId);
        if (!question) throw new ContentEditError("This question no longer exists.", 404);
        if (change.categoryIds.some((id) => !content.categories.some((c) => c.id === id))) {
          throw new ContentEditError("Select existing categories.", 400);
        }
        name = `questions/${change.modeId}.json`;
        const raw = JSON.parse(files.get(name)!);
        // Change only category assignments; retain mode-specific fields and file metadata verbatim.
        raw.questions = raw.questions.map((q: { id: string }) => q.id === change.questionId ? { ...q, categories: change.categoryIds } : q);
        question.categories = change.categoryIds;
        result = raw;
      } else {
        const raw = JSON.parse(files.get(name)!);
        const categories: Category[] = raw.categories;
        if (change.kind === "create-category") {
          categories.push({ id: categoryId(change.category.label, categories), ...change.category });
        } else {
          const index = categories.findIndex((c) => c.id === change.id);
          if (index < 0) throw new ContentEditError("This category no longer exists.", 404);
          if (change.kind === "delete-category") {
            const usage = this.snapshot(content, input.revision).usage[change.id]!;
            if (Object.values(usage).some((count) => count > 0)) {
              throw new ContentEditError("This category is still used by questions, words, topics, or child categories. Reassign them before deleting it.");
            }
            categories.splice(index, 1);
          } else {
            const { parent, description, ...previous } = categories[index]!;
            categories[index] = { ...previous, ...change.category };
          }
        }
        const problems = categoryProblems(categories);
        if (problems.length) throw new ContentEditError(problems.join(" "), 400);
        content.categories = categories;
        result = raw;
      }
      const text = `${JSON.stringify(result, null, 2)}\n`;
      replaceFile(join(this.dataDir, name), text, () => this.assertRevision(input.revision));
      files.set(name, text);
      return this.snapshot(content, this.revision(files));
    } finally {
      this.saving = false;
    }
  }
}
