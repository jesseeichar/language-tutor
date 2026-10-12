# Quizzes and question authoring

Open **Quiz**, select categories, and choose one or more **Question types**:

| Type | What the learner does | Grading |
| --- | --- | --- |
| Multiple choice | Select one of four full-sentence translations, then **Check answer**. | The option must be at `correctIndex`. |
| Fill in the blank | Type only the missing word or phrase in a sentence containing `___`. | Input must equal `answer` exactly. |
| Translation | Type the complete translation of a sentence. | Input must equal the target-language sentence exactly. |

Multiple choice and Translation support **German → English**, **English → German**, and **Random**.
Random fixes a direction for each question when the session starts. Fill-in-the-blank prompts stay
the same in every direction. Practise one type alone or combine types in a session.

Initially, Multiple choice and Fill in the blank are selected. The default session size is 30:
with the supplied question bank and all categories selected, this gives 25 vocabulary multiple-choice
questions and 5 grammar blanks. The size field is a dropdown of suggested sizes, **All questions (n)**
for everything the selected categories and types match, and **Custom…** for any other number. Translation is opt-in. Custom counts reserve approximately one sixth
of the session for questions with grammar-topic references. If either pool is too small, the other
fills the remaining places. Sessions never include questions outside the selected categories/types
or repeat a question. The existing fresh/weak-question selection runs within each pool. Your type,
category, and direction choices are remembered for the next session. If a question bank contains
none of the preferred default types (for example, only Translation), all available types are used.

## Version 1 exact matching

Typed answers are compared literally. Capitalization, punctuation, accents, and every space count,
including leading and trailing spaces. There is no trimming, case folding, spelling correction,
Unicode normalization, synonym matching, or AI grading. If the expected answer is
`First, we read the report.`, then `first, we read the report.`, `First, we read the report`, and
`First, we read the report. ` are incorrect. A valid alternative translation is still marked incorrect
unless it is the single stored answer. Keep expected translations concise and unambiguous.

After **Check answer**, the app displays Correct or Incorrect, the expected answer, an optional
explanation, and awarded points. The answer then locks; **Next** or **Finish** continues. A failed
save keeps the input available for retry. If the save succeeded but its response was lost, retrying
the same answer returns the original grade without scoring twice. A different answer cannot replace
an already recorded answer. **End session** is disabled while saving an answer. Correct answers earn 1 point by default; wrong answers
earn 0. Optional `points` overrides the default. Correct answers add 1 to the strength of each
referenced word/topic; wrong answers subtract 2, bounded between -10 and 10. Results appear in
History. Point values are captured when a session starts, so later point edits or question deletion
do not rewrite that session's total. **Repeat this session** keeps IDs, order, and directions, using
current question content and point values.

## Add questions

Quiz questions live in [data/questions/quiz.json](../data/questions/quiz.json):

```json
{
  "types": [
    { "id": "multiple-choice", "label": "Multiple choice" },
    { "id": "fill-in-the-blank", "label": "Fill in the blank" },
    { "id": "translation", "label": "Translation" }
  ],
  "questions": []
}
```

Append objects to the existing `questions` array; keep the existing entries and type declarations.
All examples below use categories and references present in the supplied data. Give each question
its own stable `id` using lowercase letters, digits, and dashes. Never reuse an ID from a different
question: attempts, repeats, and selection history are attached to it.

| Common field | Meaning |
| --- | --- |
| `id` | Unique within this mode; keep unchanged after use. |
| `type` | Exactly one of the three IDs above. |
| `categories` | At least one ID from `data/categories.json`; controls setup filters. |
| `refs.words` | IDs from `data/vocabulary.json` for vocabulary exercised. |
| `refs.topics` | IDs from `data/grammar-topics.json` for grammar exercised. Any topic reference places the question in the grammar selection pool. |
| `explanation` | Optional text shown after grading. |
| `points` | Optional nonnegative number, default 1. Strength updates are independent of points. |

Use each word/topic ID at most once in its reference array; duplicates are rejected. Use empty
reference arrays for content not exercised. Avoid referencing a word solely because it
appears as a distractor: all referenced items receive the answer's strength update. Create new
categories in **Manage content**. Vocabulary and grammar topics come from the notes importer;
do not hand-edit those generated files.

### Multiple choice

```json
{
  "id": "quiz-mc-zuerst-example",
  "type": "multiple-choice",
  "categories": ["vocab-sequence-time-order"],
  "refs": { "words": ["zuerst"], "topics": [] },
  "de": {
    "prompt": "Zuerst lesen wir den Bericht.",
    "options": [
      "After that, we read the report.",
      "First, we read the report.",
      "Later, we read the report.",
      "Finally, we read the report."
    ]
  },
  "en": {
    "prompt": "First, we read the report.",
    "options": [
      "Danach lesen wir den Bericht.",
      "Zuerst lesen wir den Bericht.",
      "Später lesen wir den Bericht.",
      "Schliesslich lesen wir den Bericht."
    ]
  },
  "correctIndex": 1,
  "explanation": "Zuerst means first: it identifies the first step."
}
```

`de` describes the **German-first question**: a German prompt and English options.
`en` describes the **English-first question**: an English prompt and German options.
Both sides require exactly four nonblank, distinct options. `correctIndex` is zero-based (0–3)
and must identify the correct option on **both** sides. Keep distractors clearly incorrect.
Prompts and options should be full sentences. Spread correct positions evenly across the whole
multiple-choice bank (counts should differ by at most one). The app keeps authored option order,
so repeats remain consistent. Validation checks shapes, not the linguistic correctness of choices.

### Fill in the blank

```json
{
  "id": "quiz-blank-adjective-example",
  "type": "fill-in-the-blank",
  "categories": ["grammar-adjektivdeklination-adjective-endings"],
  "refs": { "words": [], "topics": ["adjektivdeklination-adjective-endings"] },
  "prompt": "Ich spreche mit dem ___ Kollegen. (neu)",
  "answer": "neuen",
  "explanation": "After dem, the adjective has -en in the dative."
}
```

`prompt` must contain exactly one `___` marker. `answer` must be on a single line and is only the missing text, not the entire
sentence. It may be a phrase, but version 1 accepts one exact answer, not an array of alternatives.
Include a hint such as the uninflected adjective when it makes the intended answer unambiguous.

### Translation

```json
{
  "id": "quiz-translate-bericht-example",
  "type": "translation",
  "categories": ["vocab-job-workplace"],
  "refs": { "words": ["der-bericht-die-berichte"], "topics": [] },
  "de": "Der Bericht ist wichtig.",
  "en": "The report is important."
}
```

Here `de` and `en` are single-line strings; line breaks are rejected because the answer input is
single-line. Write English in American spelling and German in Swiss Standard spelling (`ss`, never
`ß`), as everywhere else in the bank. German → English shows `de` and grades against `en`;
English → German shows `en` and grades against `de`. Write exactly the punctuation, capitalization,
and spelling you expect the learner to type. Put explanations in `explanation`, not inside answers.

## Validate, try, and save

1. Append questions to `data/questions/quiz.json` and save the file.
2. Run `bun run validate`. It checks question shapes, IDs, declared types, category/reference
   existence, four distinct options, valid correct indexes, and the single-blank marker. It cannot
   judge linguistic accuracy or which option is actually correct; review both directions yourself.
   Also check that correct-option positions remain balanced across the file.
3. Run `bun run dev`, open Quiz, and select the relevant categories and type. Content is reloaded
   for new requests, so data-only edits need no server restart. Start a fresh session after edits;
   avoid changing answers while someone is answering an existing session.
4. Try a correct and an incorrect answer, and both directions for bilingual questions. Check feedback
   and the final score. For code changes, also run `bun run check` and `bun run test:e2e`.
5. Use **Back up changes** to commit and push saved question/category/progress files, or stage the
   question file and commit/push with Git. Saving a local file alone does not back it up remotely.

**Manage content** changes category assignments; question text and answers are authored in JSON.
Adding questions of these three types needs no code change. Adding a fourth format requires changes
to the quiz schema, response schema, grader, view, tests, and this guide; a new `types` entry alone
does not implement a new answer format. Existing flashcard types remain ungraded study cards, even
when labeled Translation or Fill in the blank.
