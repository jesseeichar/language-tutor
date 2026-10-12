/**
 * HTTP API. Every mode goes through the same generic endpoints; nothing here
 * knows about flashcards or any other specific mode.
 */
import type { Server } from "bun";
import {
  CreateSessionRequestSchema,
  SubmitAnswerRequestSchema,
  getMode,
  isDirectionalQuestion,
  modes,
  pointsFor,
  type ApiError,
  type CreateSessionResponse,
  type ModeSummary,
  type SessionSummary,
  type SubmitAnswerResponse,
} from "../shared";
import { ContentError, loadContent } from "./content";
import { openDatabase, ProgressStore, type StoredSession } from "./db";
import { selectQuestions } from "./selection";
import { assignDirections, countByCategory, filterPool } from "./session-plan";

export interface AppOptions {
  dataDir: string;
  dbPath: string;
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

function sessionInfo(s: StoredSession) {
  return { id: s.id, modeId: s.modeId, graded: s.graded, categoryIds: s.categoryIds, startedAt: s.startedAt };
}

export function startServer(options: AppOptions): Server<undefined> {
  const store = new ProgressStore(openDatabase(options.dbPath));
  const content = () => loadContent(options.dataDir);

  function requireSession(id: string): StoredSession {
    const session = store.getSession(id);
    if (!session) throw new HttpError(404, `No session ${id}`);
    return session;
  }

  return Bun.serve({
    port: options.port,
    routes: {
      "/api/health": { GET: () => json({ ok: true }) },

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
          const session = store.createSession({
            modeId: mode.id,
            graded: mode.graded,
            categoryIds,
            questionIds: questions.map((q) => q.id),
            directions,
          });
          return { session: sessionInfo(session), questions, directions };
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
          const mode = getMode(session.modeId);
          const questions = (await content()).questions.get(session.modeId) ?? [];
          const pointsPossible = mode
            ? session.questionIds.reduce((sum, id) => {
                const q = questions.find((x) => x.id === id);
                return sum + (q ? pointsFor(mode, q) : 0);
              }, 0)
            : 0;
          const totals = store.sessionTotals(session.id);
          return {
            session: sessionInfo(session),
            totalQuestions: session.questionIds.length,
            answered: totals.answered,
            correct: session.graded ? totals.correct : null,
            pointsAwarded: totals.pointsAwarded,
            pointsPossible,
          };
        }),
      },

      "/api/*": () => json({ error: "Not found" } satisfies ApiError, 404),
    },
  });
}
