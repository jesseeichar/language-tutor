# Language Tutor

A local web app for practising German with flashcards and, soon, quizzes built from my own vocabulary
and grammar notes.

## Quick start

Requires [Bun](https://bun.sh) 1.4 or later.

```bash
bun install
cp .env.example .env     # then set LT_NOTES_DIR if you want to import notes
bun run dev
```

Open http://localhost:5173.

## Documentation

- [CLAUDE.md](CLAUDE.md): commands, development rules, how to add modes and questions.
- [docs/architecture.md](docs/architecture.md): modules, interfaces and the rules the architecture tests enforce.

## Saving and restoring progress

Live progress is saved automatically in `data/progress.json`: sessions, answers, and strength scores.
The file is created when you first study. Open **History** and click **Back up progress** to commit it
and push to Git. The button shows when the backup completes and lets you retry failures. Git must be
installed on the server, with a configured author and working credentials for the remote.

The app commits only the progress file, preserving other staged and unstaged changes. It pushes the
current branch to its configured upstream, or to the same branch name on `origin` when no upstream is
set. Pushing also publishes any earlier unpushed commits on that branch. It never pulls or force-pushes.
If pushing fails after committing, the local commit stays intact and clicking the button again retries
the push without creating an identical commit. If the remote has diverged, stop the app and reconcile
the branch with Git before retrying. Avoid running Git commands while a backup is in progress.

You can also commit and push manually:

```bash
git add data/progress.json
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
