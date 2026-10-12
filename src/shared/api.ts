/** Request and response shapes for the HTTP API, shared by server and client. */
import { z } from "zod";
import type { Category, QuestionBase, QuestionType } from "./content";
import { DirectionChoiceSchema, type Direction, type DirectionChoice, type GradeResult } from "./mode";

export interface CategoryCount extends Category {
  /** Questions in this mode tagged with this category or one of its children. */
  count: number;
}

export interface QuestionTypeCount extends QuestionType {
  /** Questions of this type in the mode, across all categories. */
  count: number;
}

export interface ModeSummary {
  id: string;
  title: string;
  description: string;
  graded: boolean;
  defaultSessionSize: number;
  defaultQuestionTypes?: string[];
  questionCount: number;
  /** Only categories that have at least one question in this mode. */
  categories: CategoryCount[];
  /** Types declared in the mode's question file. Empty when the file declares none. */
  questionTypes: QuestionTypeCount[];
  /** True when at least one question can be shown in either language first. */
  directional: boolean;
}

export const CreateSessionRequestSchema = z.object({
  modeId: z.string().min(1),
  categoryIds: z.array(z.string().min(1)).min(1, "select at least one category"),
  count: z.number().int().min(1).max(10000).optional(),
  /** Restrict to these question types. Omit for all types. */
  questionTypes: z.array(z.string().min(1)).min(1, "select at least one question type").optional(),
  /** Applies to directional questions only. Defaults to random. */
  direction: DirectionChoiceSchema.optional(),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequestSchema>;

export interface SessionInfo {
  id: string;
  modeId: string;
  graded: boolean;
  categoryIds: string[];
  /** null = all question types. */
  questionTypes: string[] | null;
  /** The learner's choice. null when the mode has no directional questions. */
  direction: DirectionChoice | null;
  /** The session this one repeats, if any. */
  repeatOf: string | null;
  startedAt: string;
}

export interface CreateSessionResponse {
  session: SessionInfo;
  questions: QuestionBase[];
  /** The direction chosen for each directional question, keyed by question id. */
  directions: Record<string, Direction>;
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

/** One row of the session log. Labels are resolved from the current data; ids no longer present are shown as ids. */
export interface SessionLogEntry extends SessionSummary {
  modeTitle: string;
  finishedAt: string | null;
  categoryLabels: string[];
  /** null = all question types. */
  questionTypeLabels: string[] | null;
}

export interface ApiError {
  error: string;
  details?: string[];
}

export interface BackupProgressResponse {
  commit: string;
  remote: string;
  branch: string;
  createdCommit: boolean;
}
