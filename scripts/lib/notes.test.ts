import { describe, expect, test } from "bun:test";
import { mergeNotes, parseGrammar, parseVocabulary, wordSlug } from "./notes";

const VOCAB = `# Vokabular

## 1. Verbindungswörter / Connectors

### 1.1 Reihenfolge / Sequence

| Deutsch | Englisch | Wortart | Beispiel |
| --- | --- | --- | --- |
| *zuerst* | first | Adv. | Zuerst lesen wir. |
| *schliesslich / schließlich* | finally | Adv. | |

## 2. Beruf / Job

| Deutsch | Englisch | Wortart | Beispiel |
| --- | --- | --- | --- |
| *der Lohn* | wage | Nomen m. | Der Lohn ist gut. |

### Lernfortschritt / Tracker

| Wort | Quiz 1 |
| --- | --- |
| *zuerst* | ✅ |
`;

const GRAMMAR = `# Grammatik

| # | Thema | Status |
| --- | --- | --- |
| **1** | ohne dass / ohne zu | **In Arbeit** |
| **2** | wegen / weil | **Ausstehend** |

## 1. ohne dass / ohne zu

Both constructions express "without".

## 2. wegen / weil

*Noch nicht begonnen. / Not yet started.*

## 1. misnumbered subsection

Should be ignored.
`;

describe("parseVocabulary", () => {
  const { words, categories } = parseVocabulary(VOCAB);
  test("reads vocabulary tables and ignores the tracker", () => {
    expect(words.map((w) => w.de)).toEqual(["zuerst", "schliesslich / schließlich", "der Lohn"]);
  });
  test("assigns subsection categories under their section", () => {
    expect(words[0]!.category).toBe("vocab-sequence");
    expect(words[2]!.category).toBe("vocab-job");
    expect(categories.find((c) => c.id === "vocab-sequence")?.parent).toBe("vocab-connectors");
  });
  test("drops empty example cells", () => expect(words[1]!.example).toBeUndefined());
});

describe("parseGrammar", () => {
  const topics = parseGrammar(GRAMMAR);
  test("reads topics from the table of contents", () => {
    expect(topics.map((t) => [t.title, t.status])).toEqual([
      ["ohne dass / ohne zu", "In Arbeit"],
      ["wegen / weil", "Ausstehend"],
    ]);
  });
  test("takes the description from the first matching heading only", () => {
    expect(topics[0]!.description).toBe('Both constructions express "without".');
  });
  test("treats 'not started' as an empty description", () => expect(topics[1]!.description).toBe(""));
});

describe("wordSlug", () => {
  test("collapses identical spellings", () => expect(wordSlug("schliesslich / schließlich")).toBe("schliesslich"));
  test("keeps different halves", () => expect(wordSlug("die Frist / die Fristen")).toBe("die-frist-die-fristen"));
});

describe("mergeNotes", () => {
  const empty = { words: [], topics: [], categories: [] };

  test("first import creates ids and categories", () => {
    const r = mergeNotes(VOCAB, GRAMMAR, empty);
    expect(r.words.map((w) => w.id)).toEqual(["zuerst", "schliesslich", "der-lohn"]);
    expect(r.topics.map((t) => t.categories[0])).toEqual(["grammar-ohne-dass-ohne-zu", "grammar-wegen-weil"]);
    expect(r.addedWords).toBe(3);
  });

  test("re-import keeps existing ids, keeps orphans and custom categories", () => {
    const first = mergeNotes(VOCAB, GRAMMAR, empty);
    const custom = { id: "my-own", label: "Mine", group: "Custom" };
    const renamed = { ...first.words[0]!, id: "custom-zuerst" };
    const orphan = { id: "gone", de: "weg", en: "gone", categories: ["vocab-old"] };
    const r = mergeNotes(VOCAB, GRAMMAR, {
      words: [renamed, orphan],
      topics: first.topics,
      categories: [...first.categories, custom, { id: "vocab-old", label: "Old", group: "Vokabular" }, { id: "vocab-stale", label: "Stale", group: "Vokabular" }],
    });
    expect(r.words.find((w) => w.de === "zuerst")!.id).toBe("custom-zuerst");
    expect(r.orphanWords.map((w) => w.id)).toEqual(["gone"]);
    expect(r.addedTopics).toBe(0);
    const ids = r.categories.map((c) => c.id);
    expect(ids).toContain("my-own");
    expect(ids).toContain("vocab-old");
    expect(ids).not.toContain("vocab-stale");
  });
});
