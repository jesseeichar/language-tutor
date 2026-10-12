/**
 * Imports the vocabulary and grammar topics from the Obsidian notes into data/.
 *
 *   bun run import:notes [notesDir]
 *
 * notesDir defaults to $LT_NOTES_DIR. It must contain Deutsch_Vokabular.md and Deutsch_Grammatik.md.
 *
 * The notes are the source of truth for words and topics. Re-running is safe:
 *  - existing ids are kept (matched on the German text / topic title), so progress stays attached
 *  - text, part of speech, example and categories are refreshed from the notes
 *  - entries no longer in the notes are kept and reported, never deleted
 *  - existing category definitions are preserved; newly discovered categories are added
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { CategoriesFileSchema, GrammarTopicsFileSchema, VocabularyFileSchema } from "../src/shared";
import { loadConfig } from "../src/server";
import { mergeNotes } from "./lib";

const notesArg = process.argv[2] ?? process.env.LT_NOTES_DIR;
if (!notesArg) {
  console.error("Set LT_NOTES_DIR in .env or pass the notes folder as an argument.");
  process.exit(1);
}
const notesDir = resolve(notesArg);
const { dataDir } = loadConfig();
const vocabPath = join(notesDir, "Deutsch_Vokabular.md");
const grammarPath = join(notesDir, "Deutsch_Grammatik.md");
for (const p of [vocabPath, grammarPath]) {
  if (!existsSync(p)) {
    console.error(`Not found: ${p}`);
    process.exit(1);
  }
}

async function readData(file: string, fallback: unknown): Promise<unknown> {
  const path = join(dataDir, file);
  return existsSync(path) ? JSON.parse(await Bun.file(path).text()) : fallback;
}

const result = mergeNotes(await Bun.file(vocabPath).text(), await Bun.file(grammarPath).text(), {
  words: VocabularyFileSchema.parse(await readData("vocabulary.json", { words: [] })).words,
  topics: GrammarTopicsFileSchema.parse(await readData("grammar-topics.json", { topics: [] })).topics,
  categories: CategoriesFileSchema.parse(await readData("categories.json", { categories: [] })).categories,
});

const write = (file: string, value: unknown) => Bun.write(join(dataDir, file), JSON.stringify(value, null, 2) + "\n");
await write("vocabulary.json", { words: result.words });
await write("grammar-topics.json", { topics: result.topics });
await write("categories.json", { categories: result.categories });

console.log(`Imported from ${notesDir}`);
console.log(`  words:      ${result.words.length} (${result.addedWords} new)`);
console.log(`  topics:     ${result.topics.length} (${result.addedTopics} new)`);
console.log(`  categories: ${result.categories.length}`);
for (const w of result.orphanWords) console.warn(`  ! word "${w.de}" (${w.id}) is no longer in the notes; kept`);
for (const t of result.orphanTopics) console.warn(`  ! topic "${t.title}" (${t.id}) is no longer in the notes; kept`);
console.log("Run `bun run validate` to check that every question still points at existing ids.");
