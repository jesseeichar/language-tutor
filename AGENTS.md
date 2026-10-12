# Language Tutor — shared agent instructions

These instructions apply to Codex, Claude, and other coding agents working anywhere in this repository.
Keep project-wide instructions here; `CLAUDE.md` points to this file so the rules cannot drift.

A local web app for practising German: ungraded flashcards and graded quizzes.
It runs only in dev mode on one machine. Questions live in JSON files; progress lives in Git-trackable JSON.

Read [docs/architecture.md](docs/architecture.md) before changing structure. It explains the modules, their
interfaces and the rules the architecture tests enforce.

## Source material

The learner's notes live in an Obsidian vault, outside this repo. The path is `LT_NOTES_DIR` in `.env`.

- `Deutsch_Vokabular.md`: vocabulary tables by section, plus a quiz history.
- `Deutsch_Grammatik.md`: grammar topics, with notes on past mistakes.
- PDFs in the same folder (Wo/Wohin, Akkusativ/Dativ, Artikel) are references for writing grammar questions.

`bun run import:notes` turns the notes into `data/vocabulary.json`, `data/grammar-topics.json` and the
`data/categories.json`. The notes are the source of truth for words and topics; do not hand-edit
`vocabulary.json` or `grammar-topics.json`. Category definitions can be edited in the app. Imports
preserve all existing category definitions and add newly discovered categories; they do not overwrite
editor changes or delete categories referenced by questions.
Use the notes' quiz history and "My Notes" sections to decide what questions to write.

## Commands

```bash
bun install              # once, and after pulling dependency changes
bun run dev              # API on :3001 + Vite on :5173, open http://localhost:5173
bun run check            # typecheck + all unit, UI and architecture tests + data validation
bun run test:e2e         # Playwright end-to-end tests (starts its own servers)
bun run validate         # check data/ after editing question files
bun run import:notes     # refresh vocabulary and topics from the Obsidian notes
```

Narrower test runs: `bun run test:unit` (shared, server, scripts), `bun run test:ui` (React components,
with a DOM), `bun run test:arch` (architecture rules).

Use Bun as the runtime and package manager, even when Node is installed. Run Vite and Playwright through Bun
(`bun --bun vite`, `bunx playwright`). Never add npm, yarn or pnpm lockfiles.

## Development rules

These are mandatory. CI enforces most of them.

1. **Work on a branch.** Every feature or fix gets its own branch off `main` (`feature/<name>`,
   `fix/<name>`, `refactor/<name>`), merged by pull request once CI is green. Never commit features
   directly to `main`.
2. **Unit test every component.** Each source file in `src/` and `scripts/lib/` has a co-located
   `*.test.ts` or `*.test.tsx`. The architecture tests fail when one is missing; the short exempt list
   (entry points, re-export indexes, pure type files) lives in `tests/architecture/architecture.test.ts`.
   React components are tested with Testing Library on happy-dom; mock the API with
   `tests/support/mock-api.ts`. Server tests use `tests/fixtures/data` and isolated in-memory or temporary JSON progress.
3. **Playwright test every major feature.** A major feature is anything the learner does from the UI:
   a new mode, a new screen, a change to session flow. Specs go in `tests/e2e/*.e2e.ts` and use the
   dedicated data in `tests/e2e/data`, never the real `data/`. The E2E launcher copies those fixtures
   to a temporary directory so editor tests cannot mutate checked-in files.
4. **Keep the architecture tests green.** They enforce module boundaries, public interfaces, dependency
   direction, interface budgets, depth, file size and the absence of cycles. Do not loosen a rule to
   make a change pass. Restructure the change instead. If a rule truly must change, change it together
   with `docs/architecture.md` and say why in the commit message.
5. **Refactor at the end of every coding session.** Before the final commit of a session, run
   `bun run check`, then review what changed for:
   - duplicated code that should be one function or component;
   - functions doing more than one thing, or longer than they need to be;
   - unclear names, dead code, stale comments and leftover debugging;
   - logic in the wrong module, or a module interface growing wider than it needs to.
   Fix what you find, run `bun run check` again, and commit the refactor separately from the feature.
6. **CI must pass.** `.github/workflows/ci.yml` runs the checks and the Playwright suite on every push
   to `main` and every pull request.
7. **Comments explain why.** Write for a reader who knows TypeScript but not this app.

## Adding a new mode

A mode is a study tool or a quiz. The framework is generic; nothing outside these files knows about
specific modes.

1. `src/shared/modes/<id>.ts`: question schema (extend `QuestionBaseSchema`), response schema, and the
   mode definition. Provide `questionPreview` for a readable summary in the editor. Set `graded: false` for a study tool. For a quiz set `graded: true`,
   `defaultPoints`, and a pure `grade(question, response, direction)` function. Grade against the
   server-stored direction, never a direction supplied with the answer.
2. Register it in `src/shared/modes/registry.ts` and export its question and response types from
   `src/shared/index.ts`.
3. `src/client/modes/<id>/`: a `QuestionView` component and an `index.ts` exporting the client mode.
   Register it in `src/client/modes/index.ts`.
4. `data/questions/<id>.json` with `{ "questions": [...] }`.
5. Tests: unit tests for the schema, grading and view; a Playwright spec; e2e data in
   `tests/e2e/data/questions/<id>.json`. The mode contract test checks that the pieces exist.

## Writing questions

Every question has an `id` (lowercase, digits, dashes; never change it once used, because progress is
keyed on it), one or more `categories`, and `refs` naming the vocabulary words and grammar topics it
exercises. Strength scores aggregate over `refs`, so set them carefully. Run `bun run validate` after
editing.

**Spelling.** English is American everywhere: questions, explanations, UI text and docs (recognized,
favor, canceled, labeled, program). German uses Swiss Standard spelling: `ss`, never `ß`. Typed answers
match exactly, so a mixed convention would mark correct answers wrong.

**Coverage.** Every vocabulary word has a translation flashcard (`fc-<wordId>`) and one quiz question of
each type (`quiz-mc-<wordId>`, `quiz-translate-<wordId>`, `quiz-blank-<wordId>`). Every grammar topic has
at least 3 flashcards, 6 fill-in-the-blank and 2 translation quiz questions. The workflow for keeping
this true is in [Adding vocabulary and grammar](#adding-vocabulary-and-grammar).

**Near-synonyms in typed translations.** When two words share an English meaning (jedoch/allerdings,
ferner/des Weiteren, dagegen/hingegen), give each a distinct English cue and say which cue maps to
which word in `explanation`. In fill-in hints, add a register note or a letter count.

**Question types.** A question file may declare `types` at the top, e.g. translation or fill in the
blank. When it does, every question must set `type` to one of them, and the learner can filter by type
on the setup screen. The flashcard file declares `translation`, `fill-in-the-blank`, `usage` and
`word-forms`. Add a type by adding an entry to `types`; no code change is needed.

**Flashcard shapes.** A flashcard has either `de` + `en` or `front` + `back`, never both.

- `de` + `en` is a translation card. It is directional: the learner chooses German first, English
  first, or random per card.
- `front` + `back` is a fixed card for anything else: fill in the blank, usage, word forms. It is
  always shown front first, whatever direction was chosen.

## The learner's rules

These rules come from the learner and apply to every agent, whether it works in this repository or in
the Obsidian vault (the vault's `CLAUDE.md` points here). The goal: practice the words and grammar the
learner is weak at while keeping older vocabulary and rules in memory.

The implemented quiz types and JSON examples are in [docs/quizzes.md](docs/quizzes.md). Quiz questions
live in `data/questions/quiz.json`; `type` selects multiple choice, fill in the blank, or translation.
Version 1 typed answers must match literally, including case, punctuation, accents, and all spaces.
Do not add normalization, synonyms, or AI grading without an explicit change to this requirement.

- A default quiz is 25 multiple-choice vocabulary questions and 5 grammar questions, unless the learner
  asks for something else.
- Vocabulary questions mix German to English and English to German. Each shows a full sentence using
  the word; the options are full translated sentences (German sentence with English options, and the
  reverse).
- The correct option's position must be evenly spread over the positions across a question file
  (roughly equal counts of 0, 1, 2 and 3).
- Vocabulary quizzes should be directional (implement `isDirectional` on the mode), so the learner's
  direction choice applies to them as it does to flashcards.
- Grammar questions are not restricted to multiple choice; use a variety of formats.
- Each quiz takes a random selection of vocabulary and grammar questions. Most questions in a session
  are fresh (not recently asked). Words and topics the learner struggles with come back slightly more
  often. The server's selection handles this from the progress data.
- Strength runs from -10 (very poor) through 0 (untested or guessing) to 10 (very strong). Only graded
  modes change it. The app tracks it per word and per topic in `data/progress.json`.
- When the learner asks for new words, add them to `Deutsch_Vokabular.md` in the vault with their
  translations, then import and write their questions (next section).
- When the learner asks for a new grammar theme or topic, add it to `Deutsch_Grammatik.md` with a short
  description, then import and write its questions (next section).

## Adding vocabulary and grammar

The notes are the source of truth, so new words and topics start in the vault, never in `data/`.
Adding a word or a grammar principle is not finished until it has questions in every quiz type and a
flashcard; a word without questions can never be practiced or gain strength.

### 1. Add to the notes

**Vocabulary** (`Deutsch_Vokabular.md`): add a row to the table of the right section (`## 2. Beruf &
Arbeit / Job & Workplace`) or subsection (`### 1.3 Gegensatz / Contrast`). The importer reads every
table whose first header cell is `Deutsch`; the columns are German, English, part of speech, example:

```markdown
| *die Frist / die Fristen* | deadline | Nomen f. | Wir müssen die Frist einhalten. |
```

- German in italics as in the surrounding rows; nouns with article and plural; verbs in the infinitive.
  Swiss spelling (`ss`). A `/` separates alternative spellings or the plural.
- English in American spelling. Separate senses with commas; note register in parentheses.
- Start a new section with `## <n>. <Deutsch> / <English>` (or `###` for a subsection) followed by a
  table with the same header row. The category id is `vocab-<slug of the English half>`.
- Update the `Wörter gesamt` count and the date near the top of the file.

**Grammar** (`Deutsch_Grammatik.md`): add a row to the `Inhaltsverzeichnis` table with the next
number, the title and a status (`**In Arbeit**` or `**Ausstehend**`), and a matching section
`## <n>. <title>`. The first paragraph under that heading becomes the topic description; write a short
one. A section whose first line starts with `Noch nicht begonnen` imports with an empty description.
Keep the title identical in the table and the heading; the topic id is derived from it.

### 2. Import

```bash
bun run import:notes
bun run validate
```

The import matches existing words on their German text and topics on their title, so ids and progress
survive re-imports. It reports `(<n> new)` for added words and topics and warns about entries that
have disappeared from the notes (they are kept, never deleted). Commit the regenerated
`vocabulary.json`, `grammar-topics.json` and `categories.json` together with the questions.

### 3. Write the questions

For each **new word** (`<wordId>` is the `id` in `data/vocabulary.json`, e.g. `die-frist-die-fristen`):

| File | Item | `id` | `type` |
| --- | --- | --- | --- |
| `data/questions/flashcards.json` | translation card (`de` + `en`, optional `notes` with an example) | `fc-<wordId>` | `translation` |
| `data/questions/quiz.json` | full-sentence multiple choice, both sides | `quiz-mc-<wordId>` | `multiple-choice` |
| `data/questions/quiz.json` | typed translation of a short sentence | `quiz-translate-<wordId>` | `translation` |
| `data/questions/quiz.json` | fill in the blank with an English hint in parentheses | `quiz-blank-<wordId>` | `fill-in-the-blank` |

Set `categories` to the word's categories and `refs` to `{ "words": ["<wordId>"], "topics": [] }`.
Use a different sentence in each item so each type is a separate exercise. Distractors in multiple
choice are the same sentence with the target word swapped for another word of the same kind, ideally
one from the learner's list. Pick the correct option's position so the bank stays balanced.

For each **new grammar topic** (`<topicId>` from `data/grammar-topics.json`), write at least 3
flashcards (`front` + `back`; type `usage`, `fill-in-the-blank` or `word-forms`), 6 fill-in-the-blank
quiz questions and 2 translation quiz questions that exercise the rule. Ids are `fc-g-<topic>-<desc>`,
`quiz-blank-g-<topic>-<desc>` and `quiz-translate-g-<topic>-<desc>`; `categories` is
`["grammar-<topicId>"]` and `refs` is `{ "words": [], "topics": ["<topicId>"] }`. Give fill-ins a hint
that leaves one defensible answer and an `explanation` naming the rule. Read the learner's notes and
"Eigene Notizen" for the topic first; topics marked as a weak spot get more items than the minimum.

Follow the spelling, exact-match and near-synonym rules above. For typed translations choose sentences
with one obvious rendering in each direction: no "you", no contractions, Präteritum ↔ simple past.

### 4. Check and save

```bash
bun run validate      # shapes, ids, references, four distinct options, one blank marker
bun run check         # if any code changed
```

Then try the new questions in the app (`bun run dev`), in both directions for bilingual items, and
commit on a branch or use **Back up changes**. Never reuse an id that belonged to a different question.

## Progress data

`data/progress.json` holds the session log, every answer, and strength scores. The server saves each
change atomically. Use **Back up changes** in History or Manage content, or commit and push manually,
to preserve progress outside this machine; a fresh clone loads it automatically. `LT_PROGRESS_PATH` overrides the path. Stop the app before Git operations that
change progress, manual edits, or deletion (which resets progress). Use one active checkout/server at
a time. Invalid files and external edits fail without overwriting data. See README for the workflow.
Existing SQLite data is not imported and database files are left untouched.

The backup button commits only saved progress, `categories.json`, and registered question files,
then pushes the current branch to its upstream
(or the same branch on `origin`). Other staged files stay staged. Earlier unpushed commits on the branch
are pushed too. The app never pulls or force-pushes. Git backup tests use temporary local remotes;
never test the backup by pushing the development checkout.

The History page lists every session. Repeat replays one exactly: same questions, order and directions.
Because repeats depend on question ids, never reuse a deleted question's id for a different question.

The JSON format is versioned and validated in `src/server/progress-schema.ts`. Unsupported versions
are rejected; future format changes must explicitly handle compatibility. SQLite is no longer used.

## Content editor

**Manage content** assigns questions to categories and creates, renames, nests, and deletes unused
categories. Stable category and question ids must not change. A category cannot be deleted while
questions, vocabulary, topics, or children reference it. Parent cycles are rejected.

Editor writes must validate the whole current content set, check the client's revision to prevent
lost updates, and replace one file atomically. Preserve unknown file metadata and all question fields
other than the edited category assignments. Content changes apply immediately; unsaved form edits
need a discard prompt. The editor does not change question text, answers, vocabulary, or grammar topics.
