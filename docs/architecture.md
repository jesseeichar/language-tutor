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
| Modules import only the modules the dependency table allows. | Keeps the layering above. The UI cannot reach into progress storage, and shared code cannot depend on either side. |
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
| `src/shared` | 40 | The contract between client and server; it is wide by nature. Export only what other modules use. |
| `src/server` | 8 | Start the server, load config, load content. |
| `src/client/modes` | 2 | Look up a view; list views. |
| `src/client/modes/<mode>` | 1 | The client mode object. |
| `scripts/lib` | 8 | Notes parsing and merging. |

## Modes

A mode is defined in two halves with the same `id`:

- **Shared half** (`src/shared/modes/<id>.ts`): question schema, response schema, whether it is graded,
  default points and the `grade` function. Grading runs on the server and can be asynchronous. Shared code delegates network grading through injected services.
- **Client half** (`src/client/modes/<id>/`): a `QuestionView` component. It receives the question,
  a `submit(response)` function and a `next()` function. It knows nothing about sessions or HTTP.

Study tools are ungraded modes. Their answers are recorded, so selection knows what was seen, but every
question is worth 0 points and strength scores do not change.

Client modes can opt into backward navigation with `allowBack`. The runner supplies `previous`
when a previous question exists and caches successful submissions for revisits. Flashcards use this
to restore revealed answers without recording another attempt. Navigation waits for pending saves;
failed saves leave the learner on the current card with a retry. Graded modes remain forward-only.

The `quiz` mode supports multiple-choice, fill-in-the-blank, and translation questions through a
discriminated `type` schema. Its client sub-module has the same one-name interface budget as
flashcards; no existing architecture limits are relaxed. Fill-in-the-blank answers use literal string equality; translations use the injected Jev grading service.
See [quizzes.md](quizzes.md) for the data format and authoring workflow.

## Data

`data/` is checked into git:

- `progress.json`: live session history, answers, and strength scores (created on first study).
- `categories.json`: selectable categories. `group` controls UI grouping. `parent` nests categories;
  selecting a parent includes all its descendants.
- `vocabulary.json`, `grammar-topics.json`: canonical words and topics with stable ids. Generated from
  the notes by `bun run import:notes`.
- `questions/<modeId>.json`: one file per mode, `{ "types": [...], "questions": [...] }`. `types` is
  optional. When present, each question names one of them in `type`, and sessions can be filtered by type.

The server re-reads content files on every request that needs them, so question edits apply immediately.
Every content load is validated: schemas, unique ids, and references to categories, words and topics. Errors are collected
and reported together, by the API and by `bun run validate`.

## Session lifecycle

1. `GET /api/modes` lists modes, with question counts per category. `GET /api/modes/:id/pool?categories=a,b&types=x`
   returns how many questions the setup screen's current filters match, so it can offer "all questions".
2. `POST /api/sessions` with a mode, one or more categories, a count, and optionally question types and
   a direction. The server filters questions by category and type, picks a selection, fixes a direction
   for each directional question, stores the session and returns the questions with their directions.
3. `POST /api/sessions/:id/answers` records one answer per question. The server validates the response,
   grades it, records the attempt and updates strengths. An identical retry returns the recorded
   result without another update; a changed answer is rejected. `answers.ts` shares pending identical requests per store/session/question and rejects conflicting ones.
   It rechecks completion and prior attempts after asynchronous grading, immediately before the atomic store update.
4. `POST /api/sessions/:id/finish` closes the session and returns a summary.

Two more endpoints make up the session log:

- `GET /api/sessions` lists up to 50 retained sessions, newest first, finished or not. Each entry has
  the learner's choices (categories, question types, direction), the result, and the session it
  repeats, if any. Labels come from the current data; anything deleted since shows as its id.
- `POST /api/sessions/:id/repeat` starts a new session with exactly the same questions, in the same
  order, asked the same way round. The new session records `repeatOf`, so the log shows it as a
  repeat. Questions deleted from the data since are skipped; if none are left, the server answers 409.

Summaries and log entries are built in `src/server/history.ts`.

Questions are sent to the browser with their answers. This is a single-user local app, so hiding
answers is not worth the complexity. Grading still happens on the server so that scores come from one
place.

## Directions

A mode can implement `isDirectional(question)` to say that a question can be asked German first or
English first. For flashcards, cards with `de` + `en` are directional and cards with `front` + `back`
are not. The learner picks German to English, English to German, or random.

The server resolves the choice when the session starts, one direction per directional question, in
`src/server/session-plan.ts`. Directions are stored with the session and with every answer, so a
session can be replayed exactly and future quizzes can track strength per direction. Views receive
the direction as a prop and never decide it themselves. Graders receive that same stored direction
as their third argument: `grade(question, response, direction, services)`. Answer requests cannot choose it.

## Selection

`src/server/selection.ts` is a pure function:

- About 60% of a session is fresh (never-seen) questions when enough exist, so a majority are new.
- Fresh questions are weighted towards weak words and topics.
- Seen questions are weighted by weakness and by how long since they were last seen.
- Sampling is weighted random without replacement, then shuffled.

Modes may provide `defaultQuestionTypes` and a `sessionQuota` predicate/share. The setup UI and API
use available default types until the learner chooses one, falling back to all if none remain in the
bank. A sole type is sent explicitly even though its picker is hidden. Selection partitions the filtered pool
by the quota, allocates the reserved share (rounding to whole questions), fills shortages from the
other pool, applies the existing freshness/weakness algorithm to each, and shuffles the result.
Quiz defaults to multiple-choice and fill-in-the-blank with one sixth reserved for questions that
reference grammar topics. With the supplied bank this produces 25 vocabulary choices and 5 grammar
blanks for a full default session. Translation can be selected alone or alongside the other types.

## AI translation grading

`src/server/jev.ts` calls TypeSafe's official `/v1/systemone` endpoint using Bun fetch, with a
server-only `TYPESAFE_API_KEY`, optional `TYPESAFE_MODEL` (default `jev-latest`), and a 15-second timeout.
The shared grading contract accepts injected services and may return a Promise; only the quiz mode
knows which question type delegates to translation grading. The server supplies translation and worksheet exercise services, while
the session framework continues to treat modes generically. Public module budgets remain unchanged.

One request asks independent Noul questions about meaning and grammar. Both probabilities must exceed
0.5 for full points; ties fail. The adapter validates responses and creates fixed feedback plus the
reference translation. Provider failures return safe retryable errors without recording attempts or
strength changes. No automatic network retry or exact-match fallback is used. Credentials and raw
provider errors never enter browser responses, logs, or progress. Learner text is sent as evaluation
data, separately from grading instructions. Tests inject fake services or transports; browser tests
never call the live provider, even when a real key is configured locally.

## Scoring

Strength per word or topic runs from -10 to 10, starting at 0. A correct graded answer adds 1; a wrong
one subtracts 2, so a lucky guess counts for less than a real miss. Every word and topic in a question's
`refs` is updated. Rules live in `src/server/scoring.ts`.
References must be unique within each word/topic array to prevent counting an item twice.
New sessions snapshot every question's point value; grading and history use this snapshot even if
the question file changes later. Repeating a session captures the current point values.

## Storage

`data/progress.json` is the live progress store, loaded at startup and saved after each mutation.
`LT_PROGRESS_PATH` overrides this path; it is independent of the content directory setting.

- `version`: format version, currently 1. Unsupported versions are rejected.
- `sessions`: in creation order, preserving questions, directions, learner choices and repeat links.
- `attempts`: in recording order, with responses, grades, points, directions and timestamps.
- `strengths`: current scores, attempt/correct counters and last-update timestamps for words and topics.

Version 1 now permits optional `sessions[].questionPoints` and `attempts[].grade` metadata. Existing
logs without these fields still load without a migration. New sessions capture point values and new
attempts persist complete grades/feedback for idempotent retries. Legacy retries return the stored
correctness and point fraction without feedback if none was saved. Legacy fully answered sessions
use recorded possible points; partially answered legacy sessions retain the previous content-based
denominator because the original values for unanswered questions were never stored.

The schema validates shapes, unique identifiers, references within the log, and counters. Historical
content identifiers do not need to exist in today's question files. Stable serialization produces
readable Git diffs. The server module no longer permits SQLite imports.

Each write validates a candidate state, writes and flushes a temporary file alongside the destination,
then renames it into place before publishing the state in memory. This makes each answer and its
strength changes a single update. A failed save leaves the previous state in place. Missing files
start empty; invalid files fail at startup without being overwritten. External changes detected
before a save block writes until restart. Simultaneous writers are unsupported.

The History and Manage content pages' **Back up changes** button calls `POST /api/progress/backup`. The server validates
saved progress, content, and Git state, commits only progress, category definitions, and registered
question files, then pushes an explicit branch refspec to the
configured upstream (or the same branch on `origin`). Unrelated staged and unstaged changes are preserved;
earlier unpushed commits on the branch are included in the push. Concurrent backups are rejected.
Git commands have a timeout and cannot prompt in the terminal. Failed pushes retain the local commit
for retry; the app never pulls or force-pushes. A custom request header prevents cross-origin forms
from triggering backups, and raw Git output is withheld because it may contain credentials.

Manual commits and pushes also work. Recovery loads the last pushed file from a fresh clone. Stop the
app before pulling, switching branches, or restoring progress, and restart afterward. Use one active
checkout/server at a time. SQLite storage and migrations have been removed; existing database files
are left untouched and are not imported.

## Testing layers

| Layer | Where | Runs with |
| --- | --- | --- |
| Unit: shared, server, scripts | co-located `*.test.ts` | `bun run test:unit` |
| Unit: React components | co-located `*.test.tsx` | `bun run test:ui` (happy-dom preload) |
| Architecture | `tests/architecture` | `bun run test:arch` |
| End to end | `tests/e2e/*.e2e.ts` | `bun run test:e2e` (Playwright, own data and JSON progress) |

Client and server unit tests run in separate processes because happy-dom replaces `fetch` and
`Response`, which the server tests need.

## Content editing

`GET /api/content/editor` returns categories, reference counts, mode-provided question previews, and
a revision of the content files. `POST /api/content/editor` accepts one category operation or one
question's category assignments with that revision. Saves are serialized, validate current content,
reject stale revisions, and atomically replace only the affected file. Unknown question metadata is
preserved. The endpoint requires the editor's custom header to prevent cross-origin form submissions.

Categories form an acyclic tree. Deletion is allowed only when no questions, words, topics, or children
reference the category. IDs stay stable through renaming and reparenting. `questionPreview` is an
optional mode capability; the editor falls back to the question id for modes without it.

The notes importer owns vocabulary and grammar topic text, but preserves existing category definitions
and adds only new ones. Categories are not removed during import because questions may still use them.
The editor handles categories and assignments, not question text or canonical vocabulary/topic edits.

Editor browser tests use copies made by `scripts/e2e-server.ts`; checked-in fixtures remain untouched.
Shared project instructions live in `AGENTS.md`, with `CLAUDE.md` referring to the same rules.

## Fixed worksheets

Modes may declare `fixedSession: true`, exposed in the mode summary. Selecting one starts a session
immediately; the server uses all questions in authored order, ignoring filters and count, with no
direction. Other modes keep the existing setup and selection behavior. Repeats retain their usual
stored-order behavior.

The `worksheet` mode treats each section as one question containing individually scored items.
Choices and constrained blanks grade locally; writing items delegate to the injected Jev exercise
service, and personal choices use completion checks. Section points equal item counts in the supplied
bank, and score is the proportion correct. Full section grades/feedback use existing progress storage;
no migration is needed. Empty refs keep worksheet practice separate from vocabulary strength.

The client worksheet module has the same one-export budget as other mode views. The shared module
keeps its 40-name budget: the thin `isDirectionalQuestion` export was removed in favor of direct use
of the existing optional mode capability, making room for the worksheet question type.

## Built app and Tailscale lifecycle

`bun run share` builds Vite assets into ignored `dist/`, validates content, and starts the API with
static asset serving on `127.0.0.1`. Static responses are restricted to real files inside `dist/`;
traversal, dotfiles, directory listings and escaping symlinks are rejected. API routes still take
precedence. The ordinary dev server keeps its existing behavior.

The sharing script owns a foreground `tailscale serve --https=<port>` child. Exiting or receiving
SIGINT/SIGTERM/SIGHUP stops that child (removing its session-owned registration) and the app. It never
resets Serve globally, enables Funnel, or logs the machine out of Tailscale. Occupied Tailscale ports
are rejected before building; an occupied local port fails before publishing. Existing local JSON
and environment configuration are reused. Unit tests inject subprocesses; static-serving tests use
temporary directories and isolated progress.

## History retention

`ProgressStore` retains the last 50 created sessions, including unfinished sessions, on load and after
updates. `progress-retention.ts` removes older sessions and their attempts after validating the input,
then the store validates and atomically saves the result. Invalid files are never repaired by pruning.
Failed writes leave existing stored state intact. Repeat links to pruned sessions become null; retained
question/direction snapshots still allow exact repetition. Late AI responses for pruned sessions return
404 without updating scores.

Lifetime strength scores and counters remain unchanged. Optional version-1 `archivedQuestionHistory`
keeps only a count and last-seen date per mode/question for removed attempts; selection combines these
with retained attempts. This avoids treating previously studied questions as new and grows with the
question bank rather than session count. Legacy files without the field remain readable. Old responses
may still exist in Git history; retention does not rewrite commits or impose a byte-size limit.
