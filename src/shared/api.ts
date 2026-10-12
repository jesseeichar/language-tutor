/** Request and response shapes for the HTTP API, shared by server and client. */
import { z } from "zod";
import type { Category, QuestionBase } from "./content";
import type { GradeResult } from "./mode";

export interface CategoryCount extends Category {
  /** Questions in this mode tagged with this category or one of its children. */
  count: number;
}

export interface ModeSummary {
  id: string;
  title: string;
  description: string;
  graded: boolean;
  defaultSessionSize: number;
  questionCount: number;
  /** Only categories that have at least one question in this mode. */
  categories: CategoryCount[];
}

export const CreateSessionRequestSchema = z.object({
  modeId: z.string().min(1),
  categoryIds: z.array(z.string().min(1)).min(1, "select at least one category"),
  count: z.number().int().min(1).max(500).optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export interface SessionInfo {
  id: string;
  modeId: string;
  graded: boolean;
  categoryIds: string[];
  startedAt: string;
}

export interface CreateSessionResponse {
  session: SessionInfo;
  questions: QuestionBase[];
}

export const SubmitAnswerRequestSchema = z.object({
  questionId: z.string().min(1),
  response: z.unknown(),
});
export type SubmitAnswerRequest = z.infer<typeof SubmitAnswerRequestSchema>;

export interface SubmitAnswerResponse {
  /** null in ungraded modes. */
  grade: GradeResult | null;
  pointsAwarded: number;
  pointsPossible: number;
}

export interface SessionSummary {
  session: SessionInfo;
  totalQuestions: number;
  answered: number;
  /** null in ungraded modes. */
  correct: number | null;
  pointsAwarded: number;
  pointsPossible: number;
}

export interface ApiError {
  error: string;
  details?: string[];
}
