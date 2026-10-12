import { expect, test } from "bun:test";
import { quizClient } from ".";
import { QuizView } from "./QuizView";

test("registers the graded question view", () => {
  expect(quizClient.id).toBe("quiz");
  expect(quizClient.QuestionView).toBe(QuizView);
});
