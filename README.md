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
