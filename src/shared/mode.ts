/**
 * The contract every study tool and quiz implements.
 *
 * A mode is defined once here in shared code (schemas, grading, points) and
 * imported by both the server, which loads, selects and grades questions,
 * and the client, which pairs it with a React view in src/client/modes.
 */
import { z } from "zod";
import type { QuestionBase } from "./content";

/** Which language a directional question is shown in first. */
export const DirectionSchema = z.enum(["de-en", "en-de"]);
export type Direction = z.infer<typeof DirectionSchema>;

/** What the learner picks for a session. "random" decides per question. */
export const DirectionChoiceSchema = z.enum(["de-en", "en-de", "random"]);
export type DirectionChoice = z.infer<typeof DirectionChoiceSchema>;

export interface GradeResult {
  correct: boolean;
  /** Fraction of the question's points earned, 0..1. Lets a mode award partial credit later. */
  score: number;
  /** Text shown after answering, e.g. the expected answer or an explanation. */
  feedback?: string;
}

/** Supplied by the server; shared modes never read credentials or perform network I/O. */
export interface GradingServices {
  translation(input: { source: string; reference: string; answer: string; targetLanguage: "German" | "English" }): Promise<GradeResult>;
}

interface ModeCommon<Q extends QuestionBase, R> {
  /** Matches the question file name: data/questions/<id>.json. */
  id: string;
  title: string;
  description: string;
  /** Validates one entry of the question file. Must extend QuestionBaseSchema. */
  questionSchema: z.ZodType<Q, any>;
  /** Human-readable summary for the content editor. Falls back to the stable id. */
  questionPreview?(question: Q): string;
  /** Validates what the client sends when the learner answers or reveals a question. */
  responseSchema: z.ZodType<R, any>;
  /** Default number of questions offered on the setup screen. */
  defaultSessionSize: number;
  /** Initial type filter. Omit to offer every type. */
  defaultQuestionTypes?: string[];
  /** Reserve a share for a subset; unused places go to the other subset. */
  sessionQuota?: { share: number; matches(question: Q): boolean };
  /**
   * Present on modes whose questions can be asked German-first or English-first.
   * Returns whether this particular question can; others are always shown one way.
   */
  isDirectional?(question: Q): boolean;
}

/** Study tools: answers are recorded so selection knows what was seen, but nothing is scored. Every question is worth 0 points. */
export interface UngradedMode<Q extends QuestionBase = QuestionBase, R = unknown> extends ModeCommon<Q, R> {
  graded: false;
}

/** Quizzes: each answer is graded and updates the strength score of the words and topics the question references. */
export interface GradedMode<Q extends QuestionBase = QuestionBase, R = unknown> extends ModeCommon<Q, R> {
  graded: true;
  /** Points for a question that does not set its own `points`. */
  defaultPoints: number;
  grade(question: Q, response: R, direction: Direction | null, services?: GradingServices): GradeResult | Promise<GradeResult>;
}

export type ModeDefinition<Q extends QuestionBase = QuestionBase, R = unknown> =
  | UngradedMode<Q, R>
  | GradedMode<Q, R>;

/** Registries hold modes with different question types side by side, hence `any`. */
export type AnyModeDefinition = ModeDefinition<any, any>;

export function isDirectionalQuestion(mode: AnyModeDefinition, question: QuestionBase): boolean {
  return mode.isDirectional?.(question) ?? false;
}

export function pointsFor(mode: AnyModeDefinition, question: QuestionBase): number {
  if (!mode.graded) return 0;
  return question.points ?? mode.defaultPoints;
}
