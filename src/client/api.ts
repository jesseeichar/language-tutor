import type {
  ApiError,
  BackupProgressResponse,
  ContentEdit,
  EditorSnapshot,
  CreateSessionRequest,
  CreateSessionResponse,
  ModeSummary,
  SessionLogEntry,
  SessionSummary,
  SubmitAnswerResponse,
} from "../shared";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
    /** HTTP status, so callers can tell a stale-revision conflict (409) from other failures. */
    public readonly status = 0,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = body as ApiError | null;
    throw new ApiRequestError(err?.error ?? `Request failed (${res.status})`, err?.details, res.status);
  }
  return body as T;
}

export const api = {
  editor: () => request<EditorSnapshot>("/api/content/editor"),
  editContent: (body: ContentEdit) => request<EditorSnapshot>("/api/content/editor", {
    method: "POST", body: JSON.stringify(body), headers: { "X-Language-Tutor-Edit": "1" },
  }),
  backupProgress: () => request<BackupProgressResponse>("/api/progress/backup", {
    method: "POST", headers: { "X-Language-Tutor-Backup": "1" },
  }),
  modes: () => request<ModeSummary[]>("/api/modes"),
  /** Questions in a mode matching the given categories and (optionally) types. */
  poolSize: (modeId: string, categoryIds: string[], questionTypes?: string[]) => {
    const params = new URLSearchParams({ categories: categoryIds.join(",") });
    if (questionTypes) params.set("types", questionTypes.join(","));
    return request<{ count: number }>(`/api/modes/${modeId}/pool?${params}`);
  },
  createSession: (body: CreateSessionRequest) =>
    request<CreateSessionResponse>("/api/sessions", { method: "POST", body: JSON.stringify(body) }),
  submitAnswer: (sessionId: string, questionId: string, response: unknown) =>
    request<SubmitAnswerResponse>(`/api/sessions/${sessionId}/answers`, {
      method: "POST",
      body: JSON.stringify({ questionId, response }),
    }),
  finishSession: (sessionId: string) =>
    request<SessionSummary>(`/api/sessions/${sessionId}/finish`, { method: "POST" }),
  sessionLog: () => request<SessionLogEntry[]>("/api/sessions"),
  repeatSession: (sessionId: string) =>
    request<CreateSessionResponse>(`/api/sessions/${sessionId}/repeat`, { method: "POST" }),
};
