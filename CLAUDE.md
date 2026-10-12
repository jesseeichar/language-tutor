# Language Tutor

A local web app for practising German: ungraded study tools (flashcards) and, later, graded quizzes.
It runs only in dev mode on one machine. Questions live in JSON files; progress lives in SQLite.

Read [docs/architecture.md](docs/architecture.md) before changing structure. It explains the modules, their
interfaces and the rules the architecture tests enforce.

## Source material

The learner's notes live in an Obsidian vault, outside this repo. The path is `LT_NOTES_DIR` in `.env`.

- `Deutsch_Vokabular.md`: vocabulary tables by section, plus a quiz history.
- `Deutsch_Grammatik.md`: grammar topics, with notes on past mistakes.
- PDFs in the same folder (Wo/Wohin, Akkusativ/Dativ, Artikel) are references for writing grammar questions.

`bun run import:notes` turns the notes into `data/vocabulary.json`, `data/grammar-topics.json` and the
`vocab-*` / `grammar-*` entries of `data/categories.json`. The notes are the source of truth for words and
topics; never hand-edit those three files except for categories outside the `vocab-` and `grammar-` prefixes.
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

Bun is the only runtime and package manager. Node is not installed. Run Vite and Playwright through Bun
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
   `tests/support/mock-api.ts`. Server tests use `tests/fixtures/data` and an in-memory database.
3. **Playwright test every major feature.** A major feature is anything the learner does from the UI:
   a new mode, a new screen, a change to session flow. Specs go in `tests/e2e/*.e2e.ts` and use the
   dedicated data in `tests/e2e/data`, never the real `data/`.
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
   mode definition. Set `graded: false` for a study tool. For a quiz set `graded: true`,
   `defaultPoints`, and a pure `grade(question, response)` function.
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

**Question types.** A question file may declare `types` at the top, e.g. translation or fill in the
blank. When it does, every question must set `type` to one of them, and the learner can filter by type
on the setup screen. The flashcard file declares `translation`, `fill-in-the-blank`, `usage` and
`word-forms`. Add a type by adding an entry to `types`; no code change is needed.

**Flashcard shapes.** A flashcard has either `de` + `en` or `front` + `back`, never both.

- `de` + `en` is a translation card. It is directional: the learner chooses German first, English
  first, or random per card.
- `front` + `back` is a fixed card for anything else: fill in the blank, usage, word forms. It is
  always shown front first, whatever direction was chosen.

Rules from the learner for quizzes:

- A default quiz is 25 multiple-choice vocabulary questions and 5 grammar questions.
- Vocabulary questions mix German to English and English to German. Each shows a full sentence using
  the word; the options are full translated sentences.
- The correct option's position must be evenly spread over the positions across a question file.
- Vocabulary quizzes should be directional (implement `isDirectional` on the mode), so the learner's
  direction choice applies to them as it does to flashcards.
- Grammar questions may use any format, not only multiple choice.
- Most questions in a session are fresh. Weak words and topics come back more often. The server's
  selection handles this.
- Strength runs from -10 (very poor) through 0 (untested or guessing) to 10 (very strong). Only graded
  modes change it.

## Progress data

`storage/progress.sqlite` (gitignored) holds the session log, every answer, and strength scores.
Deleting it resets all progress and the log. Back it up by copying the file while the server is stopped.

The History page lists every session. Repeat replays one exactly: same questions, order and directions.
Because repeats depend on question ids, never reuse a deleted question's id for a different question.

Schema changes go in a new migration in `src/server/migrations.ts`; never edit one that is committed.
