/**
 * HTTP API. Every mode goes through the same generic endpoints; nothing here
 * knows about flashcards or any other specific mode.
 */
import type { Server } from "bun";
import {
  CreateSessionRequestSchema,
  ContentEditSchema,
  SubmitAnswerRequestSchema,
  getMode,
  isDirectionalQuestion,
  modes,
  pointsFor,
  type ApiError,
  type CreateSessionResponse,
  type ModeSummary,
  type QuestionBase,
  type SessionLogEntry,
  type SessionSummary,
  type SubmitAnswerResponse,
} from "../shared";
import { ContentError, loadContent } from "./content";
import { ProgressStore, type StoredSession } from "./progress";
import { logEntry, summarize, toSessionInfo } from "./history";
import { selectQuestions } from "./selection";
import { assignDirections, countByCategory, filterPool } from "./session-plan";
import { projectRoot } from "./config";
import { ProgressBackup, ProgressBackupError } from "./progress-backup";
import { ContentEditor, ContentEditError } from "./content-editor";

export interface AppOptions {
  dataDir: string;
  progressPath: string | null;
  port: number;
}

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: string[],
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function handle(fn: (req: Request & { params: Record<string, string> }) => Promise<unknown>) {
  return async (req: Request & { params: Record<string, string> }): Promise<Response> => {
    try {
      return json(await fn(req));
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, details: e.details } satisfies ApiError, e.status);
      if (e instanceof ProgressBackupError) return json({ error: e.message } satisfies ApiError, e.status);
      if (e instanceof ContentEditError) return json({ error: e.message } satisfies ApiError, e.status);
      if (e instanceof ContentError) {
        return json({ error: "The question data is invalid. Run `bun run validate`.", details: e.problems } satisfies ApiError, 500);
      }
      console.error(e);
      return json({ error: (e as Error).message ?? "Internal error" } satisfies ApiError, 500);
    }
  };
}

async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON");
  }
}

export function startServer(options: AppOptions): Server<undefined> {
  const store = new ProgressStore(options.progressPath);
  const backup = new ProgressBackup(projectRoot, options.progressPath, options.progressPath === null ? undefined : options.dataDir);
  const editor = new ContentEditor(options.dataDir);
  const content = () => loadContent(options.dataDir);

  function requireSession(id: string): StoredSession {
    const session = store.getSession(id);
    if (!session) throw new HttpError(404, `No session ${id}`);
    return session;
  }

  /** Stores a new session and returns what the client needs to run it. */
  function begin(plan: Omit<StoredSession, "id" | "startedAt" | "finishedAt">, questions: QuestionBase[]): CreateSessionResponse {
    const session = store.createSession(plan);
    return { session: toSessionInfo(session), questions, directions: session.directions };
  }

  return Bun.serve({
    port: options.port,
    idleTimeout: 60,
    routes: {
      "/api/health": { GET: () => json({ ok: true }) },

      "/api/content/editor": {
        GET: handle(async () => editor.read()),
        POST: handle(async (req) => {
          if (req.headers.get("X-Language-Tutor-Edit") !== "1") throw new HttpError(403, "Use the app's content editor.");
          const parsed = ContentEditSchema.safeParse(await readBody(req));
          if (!parsed.success) throw new HttpError(400, "Invalid content edit", parsed.error.issues.map((i) => i.message));
          return editor.edit(parsed.data);
        }),
      },

      "/api/progress/backup": {
        POST: handle(async (req) => {
          // Cross-origin forms cannot send this header; cross-origin fetch requires a CORS preflight.
          if (req.headers.get("X-Language-Tutor-Backup") !== "1") throw new HttpError(403, "Use the app's Back up changes button.");
          return backup.backup();
        }),
      },

      "/api/modes": {
        GET: handle(async (): Promise<ModeSummary[]> => {
          const c = await content();
          return modes.map((mode) => {
            const questions = c.questions.get(mode.id) ?? [];
            const counts = countByCategory(questions, c.categories);
            const categories = c.categories
              .map((cat) => ({ ...cat, count: counts.get(cat.id) ?? 0 }))
              .filter((cat) => cat.count > 0);
            const questionTypes = (c.questionTypes.get(mode.id) ?? []).map((t) => ({
              ...t,
              count: questions.filter((q) => q.type === t.id).length,
            }));
            return {
              id: mode.id,
              title: mode.title,
              description: mode.description,
              graded: mode.graded,
              defaultSessionSize: mode.defaultSessionSize,
              questionCount: questions.length,
              categories,
              questionTypes,
              directional: questions.some((q) => isDirectionalQuestion(mode, q)),
            };
          });
        }),
      },

      "/api/sessions": {
        GET: handle(async (): Promise<SessionLogEntry[]> => {
          const c = await content();
          return store.listSessions().map((s) => logEntry(s, store.sessionTotals(s.id), c));
        }),
        POST: handle(async (req): Promise<CreateSessionResponse> => {
          const parsed = CreateSessionRequestSchema.safeParse(await readBody(req));
          if (!parsed.success) throw new HttpError(400, "Invalid request", parsed.error.issues.map((i) => i.message));
          const { modeId, categoryIds, questionTypes, direction = "random" } = parsed.data;
          const mode = getMode(modeId);
          if (!mode) throw new HttpError(404, `Unknown mode ${modeId}`);

          const c = await content();
          const pool = filterPool(c.questions.get(mode.id) ?? [], c.categories, { categoryIds, questionTypes });
          if (pool.length === 0) throw new HttpError(400, "No questions match the selected categories and question types");

          const questions = selectQuestions({
            questions: pool,
            count: parsed.data.count ?? mode.defaultSessionSize,
            history: store.questionHistory(mode.id),
            strengths: store.allStrengths(),
          });
          const directions = assignDirections(questions, (q) => isDirectionalQuestion(mode, q), direction);
          return begin(
            {
              modeId: mode.id,
              graded: mode.graded,
              categoryIds,
              questionTypes: questionTypes ?? null,
              direction: Object.keys(directions).length > 0 ? direction : null,
              repeatOf: null,
              questionIds: questions.map((q) => q.id),
              directions,
            },
            questions,
          );
        }),
      },

      "/api/sessions/:id/answers": {
        POST: handle(async (req): Promise<SubmitAnswerResponse> => {
          const session = requireSession(req.params.id!);
          if (session.finishedAt) throw new HttpError(409, "Session is already finished");

          const parsed = SubmitAnswerRequestSchema.safeParse(await readBody(req));
          if (!parsed.success) throw new HttpError(400, "Invalid request", parsed.error.issues.map((i) => i.message));
          const { questionId } = parsed.data;
          if (!session.questionIds.includes(questionId)) throw new HttpError(400, `Question ${questionId} is not part of this session`);
          if (store.hasAttempt(session.id, questionId)) throw new HttpError(409, `Question ${questionId} was already answered`);

          const mode = getMode(session.modeId);
          if (!mode) throw new HttpError(500, `Mode ${session.modeId} is no longer registered`);
          const question = (await content()).questions.get(mode.id)?.find((q) => q.id === questionId);
          if (!question) throw new HttpError(409, `Question ${questionId} no longer exists in data/questions/${mode.id}.json`);

          const response = mode.responseSchema.safeParse(parsed.data.response);
          if (!response.success) throw new HttpError(400, "Invalid response for this mode", response.error.issues.map((i) => i.message));

          const pointsPossible = pointsFor(mode, question);
          const grade = mode.graded ? mode.grade(question, response.data) : null;
          const pointsAwarded = grade ? grade.score * pointsPossible : 0;

          store.recordAttempt({
            sessionId: session.id,
            modeId: mode.id,
            questionId,
            response: response.data,
            correct: grade ? grade.correct : null,
            pointsAwarded,
            pointsPossible,
            direction: session.directions[questionId] ?? null,
            refs: question.refs,
          });
          return { grade, pointsAwarded, pointsPossible };
        }),
      },

      "/api/sessions/:id/finish": {
        POST: handle(async (req): Promise<SessionSummary> => {
          const session = requireSession(req.params.id!);
          store.finishSession(session.id);
          return summarize(store.getSession(session.id)!, store.sessionTotals(session.id), await content());
        }),
      },

      "/api/sessions/:id/repeat": {
        POST: handle(async (req): Promise<CreateSessionResponse> => {
          const original = requireSession(req.params.id!);
          const mode = getMode(original.modeId);
          if (!mode) throw new HttpError(409, `Mode ${original.modeId} is no longer registered`);
          // Same questions in the same order, asked the same way round. Questions deleted since are skipped.
          const byId = new Map(((await content()).questions.get(mode.id) ?? []).map((q) => [q.id, q]));
          const questions = original.questionIds.flatMap((id) => byId.get(id) ?? []);
          if (questions.length === 0) throw new HttpError(409, "None of this session's questions exist any more");
          const directions = Object.fromEntries(
            questions.flatMap((q) => (original.directions[q.id] ? [[q.id, original.directions[q.id]!]] : [])),
          );
          return begin({ ...original, questionIds: questions.map((q) => q.id), directions, repeatOf: original.id }, questions);
        }),
      },

      "/api/*": () => json({ error: "Not found" } satisfies ApiError, 404),
    },
  });
}
