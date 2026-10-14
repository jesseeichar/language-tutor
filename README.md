# Language Tutor

A local web app for practising German with flashcards and graded quizzes built from my own vocabulary
and grammar notes.

## Quick start

Requires [Bun](https://bun.sh) 1.4 or later.

```bash
bun install
cp .env.example .env     # then set LT_NOTES_DIR if you want to import notes
bun run dev
```

Open http://localhost:5173.

In flashcards, use **Flip** (Space) to reveal an answer, **Next** (Right Arrow) to
advance, and **Previous** (Left Arrow) to revisit earlier cards. Studied cards keep
their answers visible when revisited and are recorded only once per session.

## Flashcard lists

A list is an ordinary category with **Show in flashcard lists** turned on. Every data set starts
with an empty **Needs work** list. Under each flashcard, **+** adds the card to the list named next
to it; the icon becomes **✓** and removes the card again. The **▾** next to it opens a menu of every
list: picking one adds the card there (or removes it when already in it) and makes that list the
one **+** targets from then on. The choice is remembered in the browser. Cards can be in several lists, and a list that is the parent of other categories
also includes their cards (shown as inherited; only the direct assignment can be toggled). Adding or
removing a card changes nothing else about it and records no study.

Open **Lists** in the top bar to browse a list's cards, search them, remove direct members, and press
**Study** to open the flashcard setup with that list, all question types and all its cards selected.
To make a list, turn the toggle on for any category in **Manage content**; turning it off hides the
list again without deleting the category or its assignments.

## Share on Tailscale

With Bun dependencies installed and this machine logged into Tailscale, run:

```bash
bun run share
```

This builds the frontend, starts one server on loopback, and publishes it using foreground
[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve). Open the HTTPS URL printed by
Tailscale from another device in your tailnet. Ctrl+C, SIGTERM, or closing the terminal stops the app
and removes its temporary Serve registration. Existing Tailscale services and device membership are
preserved. The app is not published on the public internet.

The local server uses `LT_API_PORT` (default 3001); stop `bun run dev` first. The HTTPS port defaults
to 443; choose another with `LT_TAILSCALE_PORT=8443 bun run share` if that port already serves something.
The script refuses to overwrite an existing Serve/Funnel registration. Tailscale may print a one-time
link to enable HTTPS for your tailnet. Build, startup, or Serve failures stop the app as well.
A forced SIGKILL cannot run cleanup; use Ctrl+C or a normal termination signal.

The app uses the same JSON data and `.env` as local development. Everyone allowed to reach this
Tailscale endpoint can use the app, edit content, and invoke backups; it has no separate login.
Do not run another app instance against the same progress file.

## Documentation

- [AGENTS.md](AGENTS.md): shared Codex/Claude commands, coding rules, and guidance for modes and questions.
- [CLAUDE.md](CLAUDE.md): Claude entry point pointing to the shared instructions.
- [docs/architecture.md](docs/architecture.md): modules, interfaces and the rules the architecture tests enforce.
- [docs/quizzes.md](docs/quizzes.md): quiz types, Jev grading, scoring, and how to add questions with JSON examples.

## Quizzes

Open **Quiz** to practise **Multiple choice**, **Fill in the blank**, or **Translation**, individually
or together. Bilingual questions support both language directions. Translation answers are evaluated by Jev for meaning and grammar, accepting natural alternative wording.
Fill-in-the-blank answers still match exactly, including case, accents, punctuation, and spaces. Each answer shows feedback and updates
progress and strength scores. The default bank supports 25 vocabulary multiple-choice questions and
5 grammar blanks per session; select Translation to include typed translations.

The **Zeitlicher Ablauf & Verbindungswörter** worksheet starts directly from its home-screen card,
with all ten exercises in the original order and no setup. It includes the original matching, blanks,
choices, sentence writing, stories, and personal word/sentence pairs. See the
[worksheet guide](docs/worksheet.md) for grading and source details.

To enable translation and worksheet writing assessment, get an API key from [TypeSafe AI](https://console.typesafe.ai/) and add it
to the server's ignored `.env` file:

```dotenv
TYPESAFE_API_KEY=your-key
TYPESAFE_MODEL=jev-latest
```

Restart `bun run dev` after changing these values. The model setting is optional. Translation grading
sends the source sentence, reference translation, and your answer to TypeSafe's official API; the key
stays on the server. Jev returns meaning/grammar judgments; the app shows fixed feedback and a reference
translation. API failures leave answers ungraded and available to retry, without a strength penalty or
an exact-match fallback. Fixed-answer exercises and personal completion checks work without an API key.

Add questions in `data/questions/quiz.json`, following the [question authoring guide](docs/quizzes.md),
then run `bun run validate` and try them in the app.

## Saving and restoring progress

Live progress is saved automatically in `data/progress.json`: sessions, answers, and strength scores.
The last **50 sessions** are kept, including unfinished sessions, ordered by creation. Older sessions,
answers, and feedback are removed on startup and when a new session exceeds the limit. Learning
scores and compact per-question practice counts/dates are preserved. Retained sessions can still be
repeated after their original session is removed. This limits live history; earlier Git commits still
contain previously backed-up history.

The file is created when you first study. Open **History** or **Manage content** and click **Back up changes** to commit saved progress,
question files, and category definitions and push them to Git. The button shows when the backup completes and lets you retry failures. Git must be
installed on the server, with a configured author and working credentials for the remote.

The app commits only those data files, preserving other staged and unstaged changes. It pushes the
current branch to its configured upstream, or to the same branch name on `origin` when no upstream is
set. Pushing also publishes any earlier unpushed commits on that branch. It never pulls or force-pushes.
If pushing fails after committing, the local commit stays intact and clicking the button again retries
the push without creating an identical commit. If the remote has diverged, stop the app and reconcile
the branch with Git before retrying. Avoid running Git commands while a backup is in progress.

You can also commit and push manually:

```bash
git add data/progress.json data/categories.json data/questions/
git commit -m "Save study progress"
git push
```

A fresh clone loads the progress from the last pushed commit automatically. Progress that has not been
pushed is still only local. The file includes your answers and history, visible to anyone with repository access.

Use one active server/checkout at a time. Stop the app before pulling, switching branches, restoring,
or manually editing progress, then restart it. Commit and push before moving to another machine, and
pull there before starting. Resolve any Git conflict before restarting; malformed files are rejected
without being overwritten. If a file changes while the app is running, saving stops until restart.

`LT_PROGRESS_PATH` can override the path (relative paths resolve from the project root). Keep the path
inside the repository and outside ignored folders to track it with Git. The old `LT_DB_PATH` setting
is rejected; remove it from `.env`. Existing SQLite files are left untouched and are not imported.
To reset progress, stop the server and remove the JSON file; commit and push that deletion if the reset
should also apply to future clones.

## Organizing questions and categories

Open **Manage content** from the top bar. Search questions, filter by category (including its children),
and select a question to change its category assignments. Every question needs at least one category.

Use **New category** to create a category, or select one on the **Categories** tab to edit its name,
group, parent, description, and whether it is shown in flashcard lists. Only unused categories can be deleted. Changes are saved to the
existing JSON files and apply immediately; stable ids preserve study history. This editor manages
categories and assignments; question text and answers are still edited in the question files.

The notes importer preserves existing category definitions, including app edits, and adds new
categories. To save your edits remotely, use **Back up changes** after saving the forms. If another
tab or a file edit changes content before you save, reload the editor to avoid overwriting it.
