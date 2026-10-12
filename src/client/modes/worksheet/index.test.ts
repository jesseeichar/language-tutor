import { expect, test } from "bun:test";
import { worksheetClient } from "./index";

test("registers the worksheet view", () => {
  expect(worksheetClient.id).toBe("worksheet");
  expect(typeof worksheetClient.QuestionView).toBe("function");
});
