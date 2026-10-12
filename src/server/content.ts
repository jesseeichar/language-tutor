/**
 * Loads and validates everything under data/.
 *
 * Files are re-read on every call so new questions show up without
 * restarting the server. The data set is small, so this is cheap.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import type { z } from "zod";
import {
  CategoriesFileSchema,
  GrammarTopicsFileSchema,
  QuestionFileSchema,
  VocabularyFileSchema,
  type Category,
  type GrammarTopic,
  type QuestionBase,
  type QuestionType,
  type VocabWord,
  modes,
  categoryProblems,
} from "../shared";

export interface Content {
  categories: Category[];
  words: VocabWord[];
  topics: GrammarTopic[];
  /** Keyed by mode id. Every registered mode has an entry, possibly empty. */
  questions: Map<string, QuestionBase[]>;
  /** Question types declared per mode, keyed by mode id. Empty when a mode declares none. */
  questionTypes: Map<string, QuestionType[]>;
}

export class ContentError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid content in data/:\n  - ${problems.join("\n  - ")}`);
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await Bun.file(path).text());
}

function formatIssues(file: string, error: z.ZodError): string[] {
  return error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`);
}

function findDuplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const id of ids) (seen.has(id) ? dupes : seen).add(id);
  return [...dupes];
}

/** Returns the content, or throws ContentError listing every problem found. */
export async function loadContent(dataDir: string): Promise<Content> {
  const problems: string[] = [];

  async function load<T>(file: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
    const path = join(dataDir, file);
    if (!existsSync(path)) {
      problems.push(`${file}: file is missing`);
      return fallback;
    }
    let raw: unknown;
    try {
      raw = await readJson(path);
    } catch (e) {
      problems.push(`${file}: ${(e as Error).message}`);
      return fallback;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      problems.push(...formatIssues(file, parsed.error));
      return fallback;
    }
    return parsed.data;
  }

  const { categories } = await load("categories.json", CategoriesFileSchema, { categories: [] });
  const { words } = await load("vocabulary.json", VocabularyFileSchema, { words: [] });
  const { topics } = await load("grammar-topics.json", GrammarTopicsFileSchema, { topics: [] });

  const categoryIds = new Set(categories.map((c) => c.id));
  const wordIds = new Set(words.map((w) => w.id));
  const topicIds = new Set(topics.map((t) => t.id));

  for (const d of findDuplicates(categories.map((c) => c.id))) problems.push(`categories.json: duplicate id "${d}"`);
  for (const d of findDuplicates(words.map((w) => w.id))) problems.push(`vocabulary.json: duplicate id "${d}"`);
  for (const d of findDuplicates(topics.map((t) => t.id))) problems.push(`grammar-topics.json: duplicate id "${d}"`);

  for (const c of categories) {
    if (c.parent && !categoryIds.has(c.parent)) problems.push(`categories.json: "${c.id}" has unknown parent "${c.parent}"`);
  }
  problems.push(...categoryProblems(categories).map((p) => `categories.json: ${p}`));
  const checkCategories = (file: string, owner: string, ids: string[]) => {
    for (const id of ids) if (!categoryIds.has(id)) problems.push(`${file}: "${owner}" uses unknown category "${id}"`);
  };
  for (const w of words) checkCategories("vocabulary.json", w.id, w.categories);
  for (const t of topics) checkCategories("grammar-topics.json", t.id, t.categories);

  const questions = new Map<string, QuestionBase[]>();
  const questionTypes = new Map<string, QuestionType[]>();
  const questionsDir = join(dataDir, "questions");
  const knownModeIds = new Set(modes.map((m) => m.id));

  if (existsSync(questionsDir)) {
    for (const entry of readdirSync(questionsDir)) {
      if (!entry.endsWith(".json")) continue;
      const modeId = basename(entry, ".json");
      if (!knownModeIds.has(modeId)) problems.push(`questions/${entry}: no mode with id "${modeId}" is registered in src/shared/modes/registry.ts`);
    }
  }

  for (const mode of modes) {
    const file = `questions/${mode.id}.json`;
    const empty = { types: [], questions: [] };
    const { types, questions: rawQuestions } = existsSync(join(dataDir, file))
      ? await load(file, QuestionFileSchema, empty)
      : empty;
    for (const d of findDuplicates(types.map((t) => t.id))) problems.push(`${file}: duplicate question type "${d}"`);
    const typeIds = new Set(types.map((t) => t.id));
    const valid: QuestionBase[] = [];
    rawQuestions.forEach((raw, index) => {
      const parsed = mode.questionSchema.safeParse(raw);
      if (!parsed.success) {
        const label = typeof (raw as { id?: unknown })?.id === "string" ? (raw as { id: string }).id : `#${index}`;
        problems.push(...formatIssues(`${file} [${label}]`, parsed.error));
        return;
      }
      const q = parsed.data as QuestionBase;
      checkCategories(file, q.id, q.categories);
      for (const w of q.refs.words) if (!wordIds.has(w)) problems.push(`${file}: "${q.id}" refers to unknown word "${w}"`);
      for (const t of q.refs.topics) if (!topicIds.has(t)) problems.push(`${file}: "${q.id}" refers to unknown topic "${t}"`);
      if (types.length > 0 && q.type === undefined) problems.push(`${file}: "${q.id}" needs a type (one of: ${[...typeIds].join(", ")})`);
      if (q.type !== undefined && !typeIds.has(q.type)) problems.push(`${file}: "${q.id}" has unknown type "${q.type}"`);
      if (!mode.graded && q.points !== undefined && q.points !== 0) {
        problems.push(`${file}: "${q.id}" sets points=${q.points}, but ${mode.id} is ungraded so every question is worth 0`);
      }
      valid.push(q);
    });
    for (const d of findDuplicates(valid.map((q) => q.id))) problems.push(`${file}: duplicate question id "${d}"`);
    questions.set(mode.id, valid);
    questionTypes.set(mode.id, types);
  }

  if (problems.length > 0) throw new ContentError(problems);
  return { categories, words, topics, questions, questionTypes };
}
