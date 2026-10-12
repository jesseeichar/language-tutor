/**
 * Parses the Obsidian notes (Deutsch_Vokabular.md, Deutsch_Grammatik.md) and
 * merges them into the existing data/ content. Pure functions, no file access.
 */
import type { Category, GrammarTopic, VocabWord } from "../../src/shared";
import { cleanCell, firstParagraph, isSeparatorRow, slugify, splitRow } from "./markdown";

const normalise = (s: string) => s.toLocaleLowerCase("de").replace(/\s+/g, " ").trim();

/** "schliesslich / schließlich" -> "schliesslich", not "schliesslich-schliesslich". */
export function wordSlug(de: string): string {
  const parts = de.split(" / ").map(slugify).filter(Boolean);
  return parts.filter((p, i) => parts.indexOf(p) === i).join("-");
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base || "item";
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/** "1.1 Reihenfolge & zeitlicher Ablauf / Sequence & Time Order" -> label without number, slug from the English part. */
function parseHeading(text: string): { label: string; slug: string } {
  const label = text.replace(/^\d+(\.\d+)*\.?\s*/, "").trim();
  const english = label.includes(" / ") ? label.split(" / ").slice(1).join(" / ") : label;
  return { label, slug: slugify(english) };
}

// ---------- vocabulary ----------

export interface ParsedWord {
  de: string;
  en: string;
  partOfSpeech?: string;
  example?: string;
  category: string;
}

export function parseVocabulary(md: string): { words: ParsedWord[]; categories: Category[] } {
  const words: ParsedWord[] = [];
  const categories: Category[] = [];
  const known = new Set<string>();
  let section: { label: string; id: string } | null = null;
  let subsection: { label: string; id: string } | null = null;
  let inVocabTable = false;

  const ensure = (c: Category) => {
    if (!known.has(c.id)) {
      known.add(c.id);
      categories.push(c);
    }
  };

  for (const line of md.split("\n")) {
    const h2 = line.match(/^##\s+(.*)$/);
    const h3 = line.match(/^###\s+(.*)$/);
    if (h2) {
      const { label, slug } = parseHeading(h2[1]!);
      section = { label, id: `vocab-${slug}` };
      subsection = null;
      inVocabTable = false;
      continue;
    }
    if (h3) {
      const { label, slug } = parseHeading(h3[1]!);
      subsection = { label, id: `vocab-${slug}` };
      inVocabTable = false;
      continue;
    }
    if (!line.startsWith("|")) {
      inVocabTable = false;
      continue;
    }
    const cells = splitRow(line);
    if (cells[0] && cleanCell(cells[0]) === "Deutsch") {
      inVocabTable = true;
      continue;
    }
    if (!inVocabTable || isSeparatorRow(cells) || !section) continue;

    const [de, en, pos, example] = cells.map(cleanCell);
    if (!de || !en) continue;
    ensure({ id: section.id, label: section.label, group: "Vokabular" });
    if (subsection) ensure({ id: subsection.id, label: subsection.label, group: "Vokabular", parent: section.id });
    words.push({
      de,
      en,
      partOfSpeech: pos || undefined,
      example: example || undefined,
      category: (subsection ?? section).id,
    });
  }
  return { words, categories };
}

// ---------- grammar ----------

export interface ParsedTopic {
  number: number;
  title: string;
  status?: string;
  description: string;
}

export function parseGrammar(md: string): ParsedTopic[] {
  const lines = md.split("\n");
  const topics: ParsedTopic[] = [];

  // Table of contents rows look like: | **1** | ohne dass / ohne zu | **In Arbeit** |
  for (const line of lines) {
    const cells = splitRow(line);
    const num = cells[0]?.match(/^\*\*(\d+)\*\*$/);
    if (!num || !cells[1]) continue;
    topics.push({
      number: Number(num[1]),
      title: cleanCell(cells[1]),
      status: cells[2] ? cleanCell(cells[2]) || undefined : undefined,
      description: "",
    });
  }

  // The first "## N." heading for each number is the topic itself (later ones are misnumbered subsections).
  for (const topic of topics) {
    const start = lines.findIndex((l) => l.startsWith(`## ${topic.number}. `));
    if (start === -1) continue;
    const text = firstParagraph(lines.slice(start + 1));
    topic.description = /^Noch nicht begonnen/.test(text) ? "" : text;
  }
  return topics;
}


export interface ExistingData {
  words: VocabWord[];
  topics: GrammarTopic[];
  categories: Category[];
}

export interface MergeResult extends ExistingData {
  addedWords: number;
  addedTopics: number;
  /** Entries in data/ that are no longer in the notes. They are kept, never deleted. */
  orphanWords: VocabWord[];
  orphanTopics: GrammarTopic[];
}

/**
 * Combines freshly parsed notes with what is already in data/.
 * Existing ids are kept (matched on German text / topic title) so progress stays attached.
 */
export function mergeNotes(vocabMarkdown: string, grammarMarkdown: string, existing: ExistingData): MergeResult {
  const parsedVocab = parseVocabulary(vocabMarkdown);
  const parsedTopics = parseGrammar(grammarMarkdown);

  const wordIds = new Set(existing.words.map((w) => w.id));
  const wordsByDe = new Map(existing.words.map((w) => [normalise(w.de), w]));
  const seenWordIds = new Set<string>();
  const words: VocabWord[] = [];
  let addedWords = 0;
  for (const p of parsedVocab.words) {
    const match = wordsByDe.get(normalise(p.de));
    const id = match?.id ?? uniqueId(wordSlug(p.de), wordIds);
    if (seenWordIds.has(id)) continue; // same word listed twice in the notes
    if (!match) addedWords++;
    seenWordIds.add(id);
    words.push({ id, de: p.de, en: p.en, partOfSpeech: p.partOfSpeech, example: p.example, categories: [p.category] });
  }
  const orphanWords = existing.words.filter((w) => !seenWordIds.has(w.id));
  words.push(...orphanWords);

  const topicIds = new Set(existing.topics.map((t) => t.id));
  const topicsByTitle = new Map(existing.topics.map((t) => [normalise(t.title), t]));
  const seenTopicIds = new Set<string>();
  const topicCategories: Category[] = [];
  const topics: GrammarTopic[] = [];
  let addedTopics = 0;
  for (const p of parsedTopics) {
    const match = topicsByTitle.get(normalise(p.title));
    const id = match?.id ?? uniqueId(slugify(p.title), topicIds);
    if (!match) addedTopics++;
    seenTopicIds.add(id);
    const categoryId = match?.categories.find((c) => c.startsWith("grammar-")) ?? `grammar-${id}`;
    topicCategories.push({ id: categoryId, label: p.title, group: "Grammatik" });
    topics.push({ id, title: p.title, description: p.description, status: p.status, categories: [categoryId] });
  }
  const orphanTopics = existing.topics.filter((t) => !seenTopicIds.has(t.id));
  topics.push(...orphanTopics);

  const generated = [...parsedVocab.categories, ...topicCategories];
  // Category definitions belong to the editor once created. Keep stable ids, app edits, and
  // categories referenced only by questions; importing notes must not silently remove them.
  const existingIds = new Set(existing.categories.map((c) => c.id));
  const categories = [...existing.categories, ...generated.filter((c) => !existingIds.has(c.id))];

  return { words, topics, categories, addedWords, addedTopics, orphanWords, orphanTopics };
}
