import type { ComponentType } from "react";
import type { Direction, QuestionBase, SubmitAnswerResponse } from "../../shared";

export interface QuestionViewProps<Q extends QuestionBase = QuestionBase, R = unknown> {
  question: Q;
  /** Which language to show first, for directional questions. null for all others. */
  direction: Direction | null;
  /** Records the learner's response on the server. Call at most once per question. */
  submit: (response: R) => Promise<SubmitAnswerResponse>;
  /** Moves on to the next question, or to the summary after the last one. */
  next: () => void;
  isLast: boolean;
}

/** The browser half of a mode. The shared half lives in src/shared/modes. */
export interface ClientMode<Q extends QuestionBase = QuestionBase, R = unknown> {
  /** Must match the shared mode id. */
  id: string;
  QuestionView: ComponentType<QuestionViewProps<Q, R>>;
}

/** Registries hold views for different question types side by side, hence `any`. */
export type AnyClientMode = ClientMode<any, any>;
