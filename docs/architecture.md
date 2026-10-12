# Architecture

## Goals

- New study tools and quizzes can be added without touching the session framework.
- New questions are added by editing JSON, without restarting anything.
- Progress survives restarts and is attached to stable ids, so editing a question's text keeps its history.
- The structure stays clean as the app grows. Automated architecture tests enforce it.

## Modules

| Module | Folder | Public interface | Responsibility |
| --- | --- | --- | --- |
| shared | `src/shared` | `src/shared/index.ts` | The contract: content schemas, the mode contract, the mode registry, API types. Runs in browser and Bun alike. |
| server | `src/server` | `src/server/index.ts` | Loads and validates `data/`, selects questions, grades answers, stores progress, serves the HTTP API. `main.ts` is the process entry. |
| client | `src/client` | none (it is the app) | React UI. Generic pages plus one view per mode. |
| client modes | `src/client/modes` | `src/client/modes/index.ts` | Registry of mode views. Each mode is a sub-module with its own `index.ts`. |
| scripts | `scripts` | none (entry points) | Command-line tools: dev launcher, data validation, notes import. |
| scripts lib | `scripts/lib` | `scripts/lib/index.ts` | Pure parsing and merging of the Obsidian notes. |

Dependencies point inward to `shared`:

```
client ──► shared ◄── server ◄── scripts
                 ▲                   │
                 └───────────────────┘
```

`client` and `server` never import each other. They agree only through the types and schemas in `shared`,
and talk only over HTTP.

## Rules enforced by tests

`tests/architecture/architecture.test.ts` checks these on every run. A failing rule means the change
should be restructured, not the rule loosened.

| Rule | Why |
| --- | --- |
| Modules import only the modules the dependency table allows. | Keeps the layering above. The UI cannot reach into the database, and shared code cannot depend on either side. |
| Production code never imports test code. | Test helpers must not leak into the app. |
| Each module may use only its allowed external packages. `shared` may use only `zod`. | `shared` must run in both the browser and Bun. The client must not pull in server runtimes. |
| A folder with an `index.ts` is a module. Code outside it imports only that index. | Each module has one well-defined interface. Its internals can change freely. |
| Index files list exports by name. `export *` is not allowed. | The interface is explicit and reviewable. |
| Every module index has an interface budget (maximum public names). | Keeps modules deep: a small interface hiding a lot of implementation. |
| Non-contract modules have at least 15 lines of implementation per public name. | Catches shallow modules that expose nearly everything they contain. `shared` is exempt because it is a contract. |
| No import cycles. | Cycles blur module boundaries and make load order fragile. |
| No production file over 300 lines. | Long files are a sign a module needs splitting. |
| Every production file has a co-located unit test, apart from a short exempt list. | Every component is tested. |

`tests/architecture/modes-contract.test.ts` checks that every mode is complete: a shared definition, a client
view and a question file. Graded modes must define `grade` and points. Ungraded modes award nothing.

Interface budgets:

| Module | Budget | Reason |
| --- | --- | --- |
| `src/shared` | 40 | The contract between client and server; it is wide by nature. |
| `src/server` | 8 | Start the server, load config, load content. |
| `src/client/modes` | 2 | Look up a view; list views. |
| `src/client/modes/<mode>` | 1 | The client mode object. |
| `scripts/lib` | 8 | Notes parsing and merging. |

## Modes

A mode is defined in two halves with the same `id`:

- **Shared half** (`src/shared/modes/<id>.ts`): question schema, response schema, whether it is graded,
  default points and the `grade` function. Grading is pure and runs on the server.
- **Client half** (`src/client/modes/<id>/`): a `QuestionView` component. It receives the question,
  a `submit(response)` function and a `next()` function. It knows nothing about sessions or HTTP.

Study tools are ungraded modes. Their answers are recorded, so selection knows what was seen, but every
question is worth 0 points and strength scores do not change.

## Data

`data/` is checked into git:

- `categories.json`: selectable categories. `group` controls UI grouping. `parent` nests categories;
  selecting a parent includes all its descendants.
- `vocabulary.json`, `grammar-topics.json`: canonical words and topics with stable ids. Generated from
  the notes by `bun run import:notes`.
- `questions/<modeId>.json`: one file per mode, `{ "questions": [...] }`.

The server re-reads `data/` on every request that needs it, so edits apply immediately. Every load is
validated: schemas, unique ids, and references to categories, words and topics. Errors are collected
and reported together, by the API and by `bun run validate`.

## Session lifecycle

1. `GET /api/modes` lists modes, with question counts per category.
2. `POST /api/sessions` with a mode, one or more categories and a count. The server filters questions by
   category, picks a selection, stores the session and returns the questions.
3. `POST /api/sessions/:id/answers` once per question. The server validates the response with the mode's
   schema, grades it if the mode is graded, records the attempt and updates strengths.
4. `POST /api/sessions/:id/finish` closes the session and returns a summary.

Questions are sent to the browser with their answers. This is a single-user local app, so hiding
answers is not worth the complexity. Grading still happens on the server so that scores come from one
place.

## Selection

`src/server/selection.ts` is a pure function:

- About 60% of a session is fresh (never-seen) questions when enough exist, so a majority are new.
- Fresh questions are weighted towards weak words and topics.
- Seen questions are weighted by weakness and by how long since they were last seen.
- Sampling is weighted random without replacement, then shuffled.

## Scoring

Strength per word or topic runs from -10 to 10, starting at 0. A correct graded answer adds 1; a wrong
one subtracts 2, so a lucky guess counts for less than a real miss. Every word and topic in a question's
`refs` is updated. Rules live in `src/server/scoring.ts`.

## Storage

`bun:sqlite` at `storage/progress.sqlite`. Tables: `sessions`, `attempts` (one row per answered
question), `strengths`. Schema changes are append-only migrations in `src/server/db.ts`, tracked with
`PRAGMA user_version`.

## Testing layers

| Layer | Where | Runs with |
| --- | --- | --- |
| Unit: shared, server, scripts | co-located `*.test.ts` | `bun run test:unit` |
| Unit: React components | co-located `*.test.tsx` | `bun run test:ui` (happy-dom preload) |
| Architecture | `tests/architecture` | `bun run test:arch` |
| End to end | `tests/e2e/*.e2e.ts` | `bun run test:e2e` (Playwright, own data and database) |

Client and server unit tests run in separate processes because happy-dom replaces `fetch` and
`Response`, which the server tests need.
