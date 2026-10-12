import type { QuizQuestion, QuizResponse } from "../../../shared";
import type { ClientMode } from "../types";
import { QuizView } from "./QuizView";

export const quizClient: ClientMode<QuizQuestion, QuizResponse> = {
  id: "quiz",
  QuestionView: QuizView,
};
