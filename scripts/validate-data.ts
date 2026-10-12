/**
 * Checks every file under data/: JSON syntax, schemas, unique ids, and that
 * every category, word and topic a question refers to exists.
 *
 *   bun run validate
 */
import { ContentError, loadConfig, loadContent } from "../src/server";

const { dataDir } = loadConfig();
try {
  const content = await loadContent(dataDir);
  console.log(`data/ is valid (${dataDir})`);
  console.log(`  categories: ${content.categories.length}`);
  console.log(`  words:      ${content.words.length}`);
  console.log(`  topics:     ${content.topics.length}`);
  for (const [mode, questions] of content.questions) console.log(`  questions/${mode}.json: ${questions.length}`);
} catch (e) {
  if (!(e instanceof ContentError)) throw e;
  console.error(e.message);
  process.exit(1);
}
