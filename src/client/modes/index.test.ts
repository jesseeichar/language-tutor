import { describe, expect, test } from "bun:test";
import { clientModes, getClientMode } from ".";

describe("client mode registry", () => {
  test("finds views by mode id", () => {
    expect(getClientMode("flashcards")?.QuestionView).toBeDefined();
    expect(getClientMode("nope")).toBeUndefined();
  });
  test("ids are unique", () => {
    expect(new Set(clientModes.map((m) => m.id)).size).toBe(clientModes.length);
  });
});
