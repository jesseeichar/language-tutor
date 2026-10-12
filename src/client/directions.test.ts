import { describe, expect, test } from "bun:test";
import { DIRECTION_LABELS } from "./directions";

describe("DIRECTION_LABELS", () => {
  test("names every direction choice", () => {
    expect(Object.keys(DIRECTION_LABELS).sort()).toEqual(["de-en", "en-de", "random"]);
  });
});
